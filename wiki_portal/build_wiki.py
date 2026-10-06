# -*- coding: utf-8 -*-
"""Sub-Wiki 전용 지식망 & 검색 인덱스(assets/wiki_data.js) 자동 생성 엔진.
- 현재 디렉터리(wiki_portal/) 내의 모든 .md 파일을 스캔하여
- 정밀 마크다운 클리닝, 토큰/태그 추출, 카테고리 분류, 목차(TOC) 생성을 수행하고
- 시계열 의사결정 변천사(evolution_tracks) 및 Graphify 지식망 그래프를 컴파일하여
- assets/wiki_data.js 를 단독 생성합니다. (HTML5 Canvas 렌더러인 assets/graph.js 보존)
"""
import os
import glob
import re
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import urllib.parse

wiki_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(wiki_dir)
assets_dir = os.path.join(wiki_dir, "assets")
os.makedirs(assets_dir, exist_ok=True)


def norm_name(s):
    if not s:
        return ""
    s = s.replace(".md", "").replace("_재구성", "").replace("_simple", "").strip()
    s = re.sub(r'[\s_\-\(\)\[\]\.,!?"\'~`:]', '', s).lower()
    return s


# 1. Smart Markdown Cleaner & Structuring
def clean_and_structure_markdown(text):
    if not text:
        return ""
    lines = text.splitlines()
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if re.match(r'^[\|\s\-\:\+\*]+$', stripped) and len(stripped) > 1:
            continue
        if stripped.startswith('|') and stripped.endswith('|'):
            inner = re.sub(r'^\|[\s\|]*', '', stripped)
            inner = re.sub(r'[\s\|]*$', '', inner)
            inner = re.sub(r'\|\s*---\s*\|', ' ', inner)
            inner = re.sub(r'\|\s*\|\s*', ' ', inner)
            stripped = inner.strip()
        cleaned_lines.append(stripped)

    content = "\n".join(cleaned_lines)
    content = re.sub(r'(?<!\n)\s{4,}(?=[가-힣A-Za-z0-9\*\<\[■●◆#])', '\n\n', content)
    content = re.sub(r'\[([^\]]+)\]\(javascript:[^\)]+\)', r'**\1**', content)
    content = re.sub(r'(?:\n\n|\A)\s*\*\*<([^>\n]{2,40})>\*\*\s*(?:\n|\Z)', r'\n\n## \1\n\n', content)
    content = re.sub(r'(?:\n\n|\A)\s*<([가-힣A-Za-z0-9\s_\-]{2,35})>\s*(?:\n|\Z)', r'\n\n## \1\n\n', content)
    content = re.sub(r'(?:\n\n|\A)\s*\*\*([가-힣A-Za-z0-9\s_\-\,\.\?\:\/]{2,35})\*\*\s*(?:\n|\Z)', r'\n\n### \1\n\n', content)
    content = re.sub(r'(?:\n\n|\A)\s*[■●◆▶]\s*([^\n]{2,35})\s*(?:\n|\Z)', r'\n\n### \1\n\n', content)
    content = re.sub(r'^\s*\\\*\s+', '- ', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*\*\s+(?=[^\*])', '- ', content, flags=re.MULTILINE)
    content = re.sub(r'(?:\n\n|\A)\s*\*\*(질문|Question|Q)[\.\:]?\s*([^\*]+)\*\*', r'\n\n> 💡 **질문:** \2\n\n', content)
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip()


# 2. Heuristic Categorization
def classify_doc(filename, title, topic, tags, summary):
    text = (filename + " " + title + " " + topic + " " + " ".join(tags) + " " + summary).lower()
    if any(k in text for k in ["관세청", "국종망", "국가관세종합정보망", "세관", "관세행정"]):
        return "관세행정 & 컨설팅"
    if any(k in text for k in ["무역", "수출", "수입", "신용장", "구매확인서", "송장", "invoice", "ktnet", "utradehub", "관세", "물류", "edi", "b2b", "간접수출", "선하증권", "stl"]):
        return "전자무역 & 비즈니스"
    elif any(k in text for k in ["ai", "인공지능", "llm", "claude", "클로드", "gpt", "agent", "에이전트", "prompt", "프롬프트", "코딩", "python", "파이썬", "ocr", "graphify", "vector", "harness", "하네스"]):
        return "AI & 테크놀로지"
    elif any(k in text for k in ["경영", "전략", "기획", "사업", "마케팅", "조직", "리더십", "프로젝트", "보고서", "pm", "bpr", "isp", "단순화"]):
        return "경영 & 전략 기획"
    elif any(k in text for k in ["영어", "english", "어학", "grammar", "회화", "단어", "표현"]):
        return "글로벌 어학 & 영어"
    elif any(k in text for k in ["인문", "철학", "명언", "인생", "독서", "건강", "신앙", "성경", "라이프", "은퇴"]):
        return "인문·신앙 & 라이프"
    elif any(k in text for k in ["노션", "옵시디언", "엑셀", "excel", "도구", "생산성", "매뉴얼", "정리"]):
        return "생산성 & 도구"
    else:
        return "일반 지식 & 도구"


# 3. Main Scanning and Building
files = glob.glob(os.path.join(wiki_dir, "*.md"))
documents = []
doc_norm_map = {}
SYSTEM_FILES = {"_sidebar.md", "_footer.md", "_index.md", "readme.md"}

# Optional: Load relations from wiki_portal/relations/*.md if exists
relations_by_name = {}
relations_dir = os.path.join(wiki_dir, "relations")
if os.path.exists(relations_dir):
    for f in glob.glob(os.path.join(relations_dir, "*.md")):
        with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
            current_src = None
            for line in fp:
                line = line.strip()
                m_src = re.match(r'^###\s*\[(.*?)\]', line)
                if m_src:
                    raw_src = m_src.group(1).strip()
                    current_src = norm_name(raw_src)
                    if current_src not in relations_by_name:
                        relations_by_name[current_src] = []
                elif current_src and line.startswith('-'):
                    m_rel = re.match(r'^-\s*(.*?)\s*→\s*\[(.*?)\]', line)
                    if m_rel:
                        rel_type = m_rel.group(1).strip()
                        raw_target = m_rel.group(2).strip()
                        relations_by_name[current_src].append({
                            'rel': rel_type,
                            'target_raw': raw_target,
                            'target_norm': norm_name(raw_target)
                        })

for f in sorted(files):
    fname = os.path.basename(f)
    if fname.lower() in SYSTEM_FILES or fname.startswith("__"):
        continue

    try:
        with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
            raw_text = fp.read()
    except Exception:
        continue

    # Frontmatter 파싱
    title = ""
    topic = ""
    category = ""
    doc_type = "일반 문서"
    tags = []
    summary = ""
    created = ""
    decision_status = ""
    decision_date = ""
    decision_rationale = ""
    supersedes = ""
    superseded_by = ""

    body_text = raw_text
    if raw_text.startswith("---"):
        parts = raw_text.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body_text = parts[2]

            curr_key = None
            for line in fm_text.splitlines():
                if ":" in line and not line.startswith("  -") and not line.startswith("    "):
                    k, v = line.split(":", 1)
                    curr_key = k.strip()
                    val = v.strip().strip('"\'')
                    if curr_key == "title" and val: title = val
                    elif curr_key == "topic" and val: topic = val
                    elif curr_key == "category" and val: category = val
                    elif curr_key == "doc_nature" and val: doc_type = val
                    elif curr_key == "summary" and val: summary = val
                    elif curr_key == "created" and val: created = val
                    elif curr_key == "decision_status" and val: decision_status = val
                    elif curr_key == "decision_date" and val: decision_date = val
                    elif curr_key == "decision_rationale" and val: decision_rationale = val
                    elif curr_key == "supersedes" and val: supersedes = val
                    elif curr_key == "superseded_by" and val: superseded_by = val
                elif line.strip().startswith("- ") and curr_key == "tags":
                    tag_val = line.strip()[2:].strip('"\'')
                    if tag_val: tags.append(tag_val)

    if not title:
        m_h1 = re.search(r'^#\s+(.+)$', body_text, re.M)
        if m_h1:
            title = m_h1.group(1).strip()
        else:
            title = os.path.splitext(fname)[0]

    base_name = os.path.splitext(fname)[0].replace("_재구성", "").replace("_simple", "")
    norm_k = norm_name(fname)
    if norm_k not in doc_norm_map:
        doc_norm_map[norm_k] = []
    doc_norm_map[norm_k].append(fname)

    cleaned_content = clean_and_structure_markdown(body_text)

    # Heuristic Decision Status if not set
    if not decision_status:
        lower_fn = fname.lower()
        if any(k in lower_fn for k in ["리스크 요인", "폐지", "이전", "old", "v1.0", "초안"]):
            decision_status = "superseded"
        elif any(k in lower_fn for k in ["워크숍", "현황분석", "bpr", "isp", "검토안", "draft"]):
            decision_status = "revised"
        elif any(k in lower_fn for k in ["스마트무역원장", "qa_", "단순한 마인드", "가이드", "정본"]):
            decision_status = "accepted"
        else:
            decision_status = "accepted"

    if not decision_date:
        decision_date = created or "2026-09-01"

    # TOC (Table of Contents) 목차 추출
    headings = []
    clean_norm_t = norm_name(title)
    for match in re.finditer(r'^(#{1,4})\s+(.+)$', cleaned_content, re.MULTILINE):
        level = len(match.group(1))
        h_title = match.group(2).strip()
        slug = re.sub(r'[^\w\s-]', '', h_title.lower()).replace(' ', '-')
        headings.append({"level": level, "title": h_title, "slug": slug})

    # 첫 번째 목차가 제목과 동일하면 제외
    if headings and headings[0]["level"] == 1:
        if norm_name(headings[0]["title"]) == clean_norm_t:
            headings = headings[1:]

    if not summary:
        first_p = re.sub(r'^[#>\*\-\s]+', '', cleaned_content.strip())
        summary = first_p[:200].replace('\n', ' ').strip()

    if not category or category == "일반 지식 & 도구":
        # 49차(2026-09-21): 서브위키 build_frontmatter 는 폴더 판정이 없으면 "일반" 을 써 넣으므로 제목·태그 키워드로 재판정(본진 48차와 동일)
        category = classify_doc(fname, title, topic, tags, summary) or "일반 지식 & 도구"

    char_count = len(cleaned_content)
    reading_time = max(1, char_count // 500)

    doc_obj = {
        "id": fname,
        "filename": fname,
        "base_name": base_name,
        "norm_name": norm_k,
        "title": title,
        "topic": topic or title,
        "summary": summary,
        "snippet": summary,
        "tags": tags,
        "category": category,
        "doc_type": "재구성" if "_재구성" in fname else ("원문요약" if "_simple" in fname else doc_type),
        "doc_nature": doc_type,
        "source_type": "로컬 정본 지식",
        "created": created or "2026-09-04",
        "date": created or "2026-09-04",
        "decision_status": decision_status,
        "decision_date": decision_date,
        "decision_rationale": decision_rationale,
        "supersedes": supersedes,
        "superseded_by": superseded_by,
        "char_count": char_count,
        "word_count": len(cleaned_content.split()),
        "reading_time": reading_time,
        "toc": headings,
        "content": cleaned_content,
        "related_docs": []
    }
    documents.append(doc_obj)

# 4. 연관 관계 및 Graphify 지식망 그래프 매핑
doc_by_id = {d["id"]: d for d in documents}
graph_edges = []

for d in documents:
    seen_targets = set()
    src_norm = d["norm_name"]

    # 1) relations/ 폴더에 명시된 릴레이션 매핑
    rel_list = relations_by_name.get(src_norm, [])
    for rel_item in rel_list:
        t_norm = rel_item['target_norm']
        matched_targets = doc_norm_map.get(t_norm, [])
        for tid in matched_targets:
            if tid == d["id"] or tid in seen_targets:
                continue
            seen_targets.add(tid)
            target_doc = doc_by_id.get(tid)
            if target_doc:
                d["related_docs"].append({
                    "id": target_doc["id"],
                    "title": target_doc["title"],
                    "category": target_doc["category"],
                    "rel_type": rel_item['rel']
                })
                graph_edges.append({
                    "source": d["id"],
                    "target": tid,
                    "relation": rel_item['rel']
                })

    # 2) 본문 내 [[위키링크]] 매핑
    wikilinks = re.findall(r'\[\[(.*?)\]\]', d["content"])
    for wl in wikilinks:
        target_name = wl.split('|')[0].strip()
        t_norm = norm_name(target_name)
        matched_targets = doc_norm_map.get(t_norm, [])
        for tid in matched_targets:
            if tid == d["id"] or tid in seen_targets:
                continue
            seen_targets.add(tid)
            target_doc = doc_by_id.get(tid)
            if target_doc:
                d["related_docs"].append({
                    "id": target_doc["id"],
                    "title": target_doc["title"],
                    "category": target_doc["category"],
                    "rel_type": "상호 참조"
                })
                graph_edges.append({
                    "source": d["id"],
                    "target": tid,
                    "relation": "상호 참조"
                })

    # 3) 공유 태그 기반 링크 (밀도 보강)
    for other in documents:
        if other["id"] == d["id"] or other["id"] in seen_targets:
            continue
        shared_tags = set(d["tags"]).intersection(set(other["tags"]))
        if shared_tags and len(d["related_docs"]) < 6:
            seen_targets.add(other["id"])
            tag_name = list(shared_tags)[0]
            d["related_docs"].append({
                "id": other["id"],
                "title": other["title"],
                "category": other["category"],
                "rel_type": f"태그연관 (#{tag_name})"
            })
            if len(graph_edges) < 600:
                graph_edges.append({
                    "source": d["id"],
                    "target": other["id"],
                    "relation": f"#{tag_name}"
                })

# 5. Chronological Decision Evolution Tracks
evolution_tracks = []
evolution_file = os.path.join(wiki_dir, "_decision_evolution.json")
if os.path.exists(evolution_file):
    try:
        with open(evolution_file, "r", encoding="utf-8") as f:
            evolution_tracks = json.load(f)
    except Exception:
        evolution_tracks = []

# If no tracks defined, auto-construct candidate track from documents with decision lifecycle
if not evolution_tracks and len(documents) >= 2:
    decision_docs = [d for d in documents if d.get("decision_status") in ("superseded", "revised", "accepted")]
    if len(decision_docs) >= 2:
        decision_docs.sort(key=lambda x: x.get("decision_date") or x.get("created") or "2026-09-01")
        nodes = []
        for idx, dd in enumerate(decision_docs, 1):
            nodes.append({
                "date": dd.get("decision_date") or dd.get("created") or "2026-09-01",
                "status": dd.get("decision_status", "accepted"),
                "title": dd.get("title", ""),
                "doc_id": dd.get("id", ""),
                "summary": dd.get("summary", ""),
                "rationale": dd.get("decision_rationale") or f"{dd.get('title')} 의사결정 및 변천 이력",
                "source_info": {
                    "source_file": dd.get("filename", ""),
                    "source_notebook": dd.get("category", "일반"),
                    "source_type": dd.get("doc_nature", "정본 지식"),
                    "origin_path": dd.get("filename", "")
                },
                "time_analysis": {
                    "phase": f"Phase {idx}: {dd.get('title')[:30]}",
                    "change_driver": "비즈니스 및 업무 환경 변화에 따른 개정/확정",
                    "evidence": f"문서 메타데이터 및 지식베이스 정본 근거 ({dd.get('char_count')}자)",
                    "key_changes": f"상태 전환: {dd.get('decision_status')}",
                    "impact": "해당 의사결정이 서브 지식위키 정본으로 공식 반영됨"
                }
            })
        evolution_tracks.append({
            "track_id": "auto_subwiki_evolution",
            "title": f"[{os.path.basename(wiki_dir)}] 지식 의사결정 변천사",
            "category": decision_docs[0].get("category", "일반 지식 & 도구"),
            "description": "서브위키 내 문서들의 생성 및 의사결정 상태(superseded, revised, accepted) 시계열 변천 경로",
            "nodes": nodes
        })
        with open(evolution_file, "w", encoding="utf-8") as f:
            json.dump(evolution_tracks, f, ensure_ascii=False, indent=2)

# 5-1. Scan All Raw & Source Files in root_dir (스마트무역원장_위키 호환 파일 목록 및 원본 링크)
file_list = {}
ext_stats = {}
all_source_files = []

for r, dirs, fs in os.walk(root_dir):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('wiki_portal', 'wiki_md', 'node_modules', '_tools', '__pycache__', 'venv', '.venv')]
    dirs.sort()
    rel_folder = os.path.relpath(r, root_dir)
    folder_key = "루트 (최상위)" if rel_folder == "." else rel_folder.replace("\\", "/")

    folder_files = []
    for fn in sorted(fs):
        if fn.startswith('~$') or fn.startswith('.') or fn in ('01_지식위키_시작.bat', 'desktop.ini'):
            continue
        full_p = os.path.join(r, fn)
        rel_p = os.path.relpath(full_p, root_dir).replace("\\", "/")
        ext = os.path.splitext(fn)[1].lower().lstrip('.')
        ext_upper = ext.upper() if ext else "기타"

        ext_stats[ext_upper] = ext_stats.get(ext_upper, 0) + 1

        file_info = {
            "n": fn,
            "p": f"/files/{urllib.parse.quote(rel_p)}",
            "rel": rel_p,
            "ext": ext_upper,
            "size": os.path.getsize(full_p) if os.path.exists(full_p) else 0
        }
        folder_files.append(file_info)
        all_source_files.append(file_info)

    if folder_files:
        file_list[folder_key] = folder_files

# 원본 파일 매핑: 문서의 원본 파일(origin_file) 탐색 및 링크 부여
source_by_stem = {}
for sf in all_source_files:
    stem = os.path.splitext(sf["n"])[0].lower()
    source_by_stem[stem] = sf

for d in documents:
    doc_stem = os.path.splitext(d["filename"])[0]
    doc_stem_clean = doc_stem.replace("_재구성", "").replace("_simple", "").replace("_소스분석", "")

    matched_source = None
    for cand in [doc_stem, doc_stem_clean, d["title"]]:
        if not cand: continue
        c_low = cand.lower()
        if c_low in source_by_stem:
            matched_source = source_by_stem[c_low]
            break

    if matched_source:
        d["origin_file_name"] = matched_source["n"]
        d["origin_file_url"] = matched_source["p"]
        d["origin_file_ext"] = matched_source["ext"]
        d["origin_file_rel"] = matched_source["rel"]
    else:
        d["origin_file_name"] = d["filename"]
        d["origin_file_url"] = f"#/doc/{d['id']}"
        d["origin_file_ext"] = "MD"
        d["origin_file_rel"] = d["filename"]

# 6. Bundle Output to assets/wiki_data.js
categories = sorted(list(set(d["category"] for d in documents)))
all_tags = sorted(list(set(t for d in documents for t in d.get("tags", []))))

final_data = {
    "total_docs": len(documents),
    "total_relations": len(graph_edges),
    "tags_count": len(all_tags),
    "categories": categories,
    "evolution_tracks": evolution_tracks,
    "documents": documents,
    "graph_edges": graph_edges,
    "file_list": file_list,
    "file_stats": ext_stats,
    "total_source_files": len(all_source_files)
}

wiki_data_js_path = os.path.join(assets_dir, "wiki_data.js")
with open(wiki_data_js_path, "w", encoding="utf-8") as f:
    f.write("window.OKF_WIKI_DATA = window.WIKI_DATA = " + json.dumps(final_data, ensure_ascii=False) + ";\n")
    f.write("window.WIKI_FILELIST = " + json.dumps(file_list, ensure_ascii=False) + ";\n")

print(f"✅ Sub-Wiki 인덱스 빌드 완료:")
print(f"   - 총 색인 문서: {len(documents)}개")
print(f"   - 총 원본 소스 파일: {len(all_source_files)}개 (폴더 {len(file_list)}개)")
print(f"   - 지식망 그래프 엣지: {len(graph_edges)}개")
print(f"   - 의사결정 변천사 트랙: {len(evolution_tracks)}개")
print(f"   -> {wiki_data_js_path}")
