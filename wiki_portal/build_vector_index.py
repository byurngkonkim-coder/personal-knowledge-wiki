# -*- coding: utf-8 -*-
"""Sub-Wiki 전용 Ollama bge-m3 벡터 인덱스 생성기 (build_vector_index.py)
========================================================================
- 현재 포털(wiki_portal/) 내의 모든 .md 문서를 스캔하여
  각 문서의 '제목 + 카테고리 + 태그 + 요약'을 Ollama bge-m3 로 임베딩(1024차원).
- 캐시(_vector_cache.json)를 통해 이미 임베딩된 문서는 재연산 없이 스킵(증분 업데이트).
- ThreadPoolExecutor 를 통해 초고속 병렬 추출.
- 결과물: assets/_doc_vectors.json (문서 메타 + L2 정규화 단위 벡터)
- Ollama 미실행 시에도 안전하게 빈 인덱스를 생성하여 웹 서비스가 중단되지 않습니다.
"""
import os
import sys
import json
import math
import time
import glob
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PORTAL_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(PORTAL_DIR, "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

CACHE_FILE = os.path.join(ASSETS_DIR, "_vector_cache.json")
OUTPUT_FILE = os.path.join(ASSETS_DIR, "_doc_vectors.json")

OLLAMA_URL = "http://localhost:11434/api/embeddings"
MODEL_NAME = "bge-m3"
NUM_WORKERS = 4


def is_ollama_available():
    try:
        req = urllib.request.Request("http://localhost:11434/api/version", headers={"User-Agent": "SubWiki"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def normalize_vector(vec):
    """L2 단위 벡터로 정규화 (내적 = 코사인 유사도)"""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def get_embedding(text, retries=2):
    """Ollama bge-m3 API로 단일 텍스트 임베딩 추출"""
    text = text[:1000]
    payload = json.dumps({"model": MODEL_NAME, "prompt": text}).encode("utf-8")
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                OLLAMA_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                vec = data.get("embedding")
                if vec and len(vec) == 1024:
                    return normalize_vector(vec)
        except Exception as e:
            if attempt < retries:
                time.sleep(0.4)
            else:
                return None
    return None


def load_portal_documents():
    """포털 폴더 내 마크다운 파일들의 메타데이터 수집"""
    docs = []
    files = glob.glob(os.path.join(PORTAL_DIR, "*.md"))
    system_files = {"_sidebar.md", "_footer.md", "_index.md", "readme.md"}

    for f in sorted(files):
        filename = os.path.basename(f)
        if filename.lower() in system_files or filename.startswith("__"):
            continue

        try:
            with open(f, "r", encoding="utf-8", errors="ignore") as fp:
                head = fp.read(2500)
        except Exception:
            continue

        base_name = os.path.splitext(filename)[0].replace("_재구성", "").replace("_simple", "")
        title = base_name
        category = "일반"
        tags = []
        summary = ""

        if head.startswith("---"):
            parts = head.split("---", 2)
            if len(parts) >= 3:
                fm_text = parts[1]
                for line in fm_text.splitlines():
                    if ":" in line and not line.startswith("  -") and not line.startswith("    "):
                        k, v = line.split(":", 1)
                        k = k.strip()
                        v = v.strip().strip('"\'')
                        if k == "title" and v:
                            title = v
                        elif k == "category" and v:
                            category = v
                        elif k == "summary" and v:
                            summary = v
                    elif line.strip().startswith("- ") and "tags" in fm_text:
                        tags.append(line.strip()[2:].strip('"\''))

        if not summary:
            lines = [l.strip() for l in head.splitlines() if l.strip() and not l.startswith("#") and not l.startswith("-") and not l.startswith(">") and not l.startswith("|")]
            if lines:
                summary = lines[0][:200]

        docs.append({
            "id": filename,
            "title": title,
            "category": category,
            "tags": tags,
            "summary": summary
        })

    return docs


def build_vector_index():
    print(f"==================================================")
    print(f"🚀 Sub-Wiki Ollama {MODEL_NAME} 벡터 인덱스 빌더 시작")
    print(f"==================================================")

    docs = load_portal_documents()
    total_docs = len(docs)
    print(f"총 대상 문서 수: {total_docs}건")

    if not docs:
        print("대상 문서가 없습니다.")
        return

    # Ollama 가용성 확인
    ollama_online = is_ollama_available()
    if not ollama_online:
        print("⚠️ 로컬 Ollama 서비스(http://localhost:11434)가 감지되지 않았습니다.")
        print("   안전한 기본 인덱스 구조를 생성합니다 (Ollama 실행 시 재색인 가능).")

    # 캐시 로드
    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    to_process = []
    if ollama_online:
        for d in docs:
            doc_id = d["id"]
            title = d.get("title", "")
            cat = d.get("category", "")
            tags = " ".join(d.get("tags", []))
            summary = d.get("summary", "")
            text = f"제목: {title}\n분류: {cat}\n태그: {tags}\n요약: {summary}".strip()

            cached = cache.get(doc_id)
            if cached and cached.get("hash_text") == text and cached.get("vector"):
                continue

            to_process.append((doc_id, text))

        print(f"신규/갱신 필요 문서 수: {len(to_process)}건 (캐시 적중: {total_docs - len(to_process)}건)")

        start_time = time.time()
        if to_process:
            print(f"Ollama {MODEL_NAME} 병렬 임베딩 연산 진행 중 (워커: {NUM_WORKERS}개)...")
            completed = 0
            with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
                future_to_doc = {
                    executor.submit(get_embedding, text): (doc_id, text)
                    for doc_id, text in to_process
                }
                for future in as_completed(future_to_doc):
                    doc_id, text = future_to_doc[future]
                    vec = future.result()
                    if vec:
                        cache[doc_id] = {
                            "hash_text": text,
                            "vector": vec
                        }
                    completed += 1
                    if completed % 20 == 0 or completed == len(to_process):
                        pct = (completed / len(to_process)) * 100
                        print(f"진행률: {completed}/{len(to_process)} ({pct:.1f}%)")

            # 캐시 파일 저장
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)

    # 최종 검색 서빙용 벡터 인덱스 번들 생성
    final_items = []
    for d in docs:
        doc_id = d["id"]
        cached = cache.get(doc_id)
        if cached and cached.get("vector"):
            final_items.append({
                "id": doc_id,
                "title": d.get("title", ""),
                "category": d.get("category", ""),
                "vector": cached["vector"]
            })

    output_payload = {
        "model": MODEL_NAME,
        "dimension": 1024,
        "total": len(final_items),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "items": final_items
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False)

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"✅ 벡터 인덱스 생성 완료: {len(final_items)}/{total_docs}건 색인됨 -> {OUTPUT_FILE} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    build_vector_index()
