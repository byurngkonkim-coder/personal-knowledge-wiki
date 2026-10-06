# -*- coding: utf-8 -*-
"""Sub-Wiki 독립 웹서버 및 고도화 API 라우터 (serve.py)
======================================================
- 독립 포털(wiki_portal/) 전용 초고속 멀티스레드 웹서버.
- 로컬 Ollama bge-m3 하이브리드 벡터 검색 (/api/semantic_search, /api/vector_status).
- 시계열 의사결정 변천사 (/api/decision_tracks, /api/save_decision_track).
- Graphify 관계 자동 추출 (/api/extract_relations).
- Multi-AI (Claude, Gemini, Perplexity, Ollama) RAG Q&A 및 정본 지식 복리 축적 (/api/ai_ask, /api/save_qa_doc, /api/save_doc).
- 가용 포트 자동 탐색 (8080~8100) 및 윈도우 DNS 지연 차단 내장.
"""
import http.server
import socketserver
import webbrowser
import os
import sys
import socket
import json
import subprocess
import re
import urllib.request
import urllib.error
import urllib.parse
import math
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import threading
import glob
import shutil
import mimetypes

try:
    import numpy as np
except Exception:
    np = None

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(DIRECTORY)
ASSETS_DIR = os.path.join(DIRECTORY, "assets")

INGESTED_LOG_FILE = os.path.join(DIRECTORY, "_recent_ingested.json")
QA_HISTORY_FILE = os.path.join(DIRECTORY, "_qa_history.json")
READ_HISTORY_FILE = os.path.join(DIRECTORY, "_read_history.json")
DECISION_FILE = os.path.join(DIRECTORY, "_decision_evolution.json")
COVERAGE_FILE = os.path.join(DIRECTORY, "_chain_coverage.json")
DOC_VECTORS_FILE = os.path.join(ASSETS_DIR, "_doc_vectors.json")
DOC_CACHE_FILE = os.path.join(ASSETS_DIR, "_vector_cache.json")

SOURCE_EXTS = {'.md', '.txt', '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.hwpx', '.hwp', '.html'}

def _load_config_settings():
    """Load API keys from config/api_keys.json if present"""
    for d in [ROOT_DIR, DIRECTORY]:
        cfg_p = os.path.join(d, "config", "api_keys.json")
        if os.path.exists(cfg_p):
            try:
                with open(cfg_p, "r", encoding="utf-8") as f:
                    keys = json.load(f)
                    for k, v in keys.items():
                        if v and not os.environ.get(k):
                            os.environ[k] = str(v).strip()
            except Exception:
                pass
            break

_load_config_settings()

# ── Background Rebuild Worker (Debounced & Non-blocking) ──────────────────────
_rebuild_lock = threading.Lock()
_rebuild_pending = False

def trigger_background_rebuild():
    """Triggers build_wiki.py and build_vector_index.py in the background so HTTP APIs respond instantly (<15ms)."""
    global _rebuild_pending
    _rebuild_pending = True

    def _worker():
        global _rebuild_pending
        with _rebuild_lock:
            while _rebuild_pending:
                _rebuild_pending = False
                build_script = os.path.join(DIRECTORY, "build_wiki.py")
                if os.path.exists(build_script):
                    try:
                        env = dict(os.environ)
                        env["PYTHONUTF8"] = "1"
                        env["PYTHONIOENCODING"] = "utf-8"
                        subprocess.run([sys.executable, "-X", "utf8", build_script], cwd=DIRECTORY, capture_output=True, env=env)
                    except Exception as be:
                        print(f"Background build warning: {be}")

                vector_script = os.path.join(DIRECTORY, "build_vector_index.py")
                if os.path.exists(vector_script):
                    try:
                        env = dict(os.environ)
                        env["PYTHONUTF8"] = "1"
                        env["PYTHONIOENCODING"] = "utf-8"
                        subprocess.run([sys.executable, "-X", "utf8", vector_script], cwd=DIRECTORY, capture_output=True, env=env)
                    except Exception as ve:
                        print(f"Background vector update warning: {ve}")

    threading.Thread(target=_worker, daemon=True).start()


def sanitize_filename(name):
    clean = re.sub(r'[\r\n\t\\/*?:"<>|]', ' ', name).strip()
    clean = re.sub(r'\s+', ' ', clean)
    return clean if clean else f"지식문서_{datetime.now().strftime('%Y%m%d_%H%M%S')}"


def load_json_file(filepath):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_json_file(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving {filepath}: {e}")


def is_ollama_running():
    try:
        req = urllib.request.Request("http://localhost:11434/api/version", headers={"User-Agent": "SubWiki"})
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            return resp.status == 200
    except Exception:
        return False


# ── Sub-Wiki Coverage Engine ──────────────────────────────────────────────────
def compute_subwiki_coverage():
    source_files = []
    newest_mtime = 0.0
    newest_file = ''

    for root, dirs, files in os.walk(ROOT_DIR):
        if os.path.abspath(root).startswith(DIRECTORY):
            continue
        for fn in files:
            if fn.startswith('~$') or fn.startswith('.'):
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext in SOURCE_EXTS:
                fp = os.path.join(root, fn)
                rel = os.path.relpath(fp, ROOT_DIR)
                try:
                    mt = os.path.getmtime(fp)
                except OSError:
                    mt = 0
                if mt > newest_mtime:
                    newest_mtime = mt
                    newest_file = rel
                source_files.append({'name': fn, 'rel_path': rel, 'mtime': mt})

    canonical_files = {}
    for p in glob.glob(os.path.join(DIRECTORY, '*.md')):
        fn = os.path.basename(p)
        if fn.startswith('_'):
            continue
        stem = os.path.splitext(fn)[0]
        try:
            canonical_files[stem] = os.path.getmtime(p)
        except OSError:
            canonical_files[stem] = 0

    pending = []
    for sf in source_files:
        stem = os.path.splitext(sf['name'])[0]
        if stem not in canonical_files:
            pending.append(sf['rel_path'])
        elif sf['mtime'] > canonical_files[stem] + 2:
            pending.append(sf['rel_path'])

    total_src = len(source_files)
    total_can = len(canonical_files)

    if total_src > 0:
        cov_ratio = max(0.0, min(100.0, round(((total_src - len(pending)) / total_src) * 100.0, 1)))
    else:
        cov_ratio = 100.0

    days_since = 0
    if newest_mtime > 0:
        days_since = max(0, int((datetime.now().timestamp() - newest_mtime) / 86400))

    stale_status = "fresh" if days_since <= 7 else ("warning" if days_since <= 30 else "stale")

    return {
        "sync_status": "synced" if not pending else "pending",
        "sources_total": total_src,
        "canonical_total": total_can,
        "coverage_pct": cov_ratio,
        "pending_files": pending[:20],
        "latest_source_file": newest_file,
        "days_since_latest": days_since,
        "stale_status": stale_status
    }


# ── RAG Knowledge Base Search ────────────────────────────────────────────────
def search_wiki_context(query, max_results=4):
    terms = [t.lower() for t in re.findall(r'[가-힣A-Za-z0-9_]{2,}', query) if len(t) >= 2]
    # 조사 제거본도 검색어에 넣는다("구매확인서에" → "구매확인서"). 2026-09-16
    for t in list(terms):
        m = re.match(r'^(.{2,}?)(에대해서|에대해|에서|으로|에게|은|는|이|가|을|를|의|에|와|과|로|도)$', t)
        if m and m.group(1) not in terms:
            terms.append(m.group(1))
    if not terms:
        return []

    wiki_data_js = os.path.join(DIRECTORY, "assets", "wiki_data.js")
    docs = []
    if os.path.exists(wiki_data_js):
        try:
            with open(wiki_data_js, 'r', encoding='utf-8', errors='ignore') as f:
                txt = f.read()
                idx = txt.find('{')
                if idx != -1:
                    # wiki_data.js 는 2줄(OKF_WIKI_DATA … ; WIKI_FILELIST …)이라 첫 객체만 해석한다. 2026-09-16
                    data, _ = json.JSONDecoder().raw_decode(txt[idx:])
                    docs = data.get("documents", [])
        except Exception:
            docs = []

    results = []
    for doc in docs:
        score = 0
        title_lower = doc.get("title", "").lower()
        topic_lower = doc.get("topic", "").lower()
        summary_lower = doc.get("summary", "").lower()
        content_lower = doc.get("content", "").lower()
        tags = [t.lower() for t in doc.get("tags", [])]

        for t in terms:
            if t in title_lower: score += 10
            if t in topic_lower: score += 6
            if any(t in tag for tag in tags): score += 5
            if t in summary_lower: score += 4
            if t in content_lower: score += 1

        if score > 0:
            content = doc.get("content", "")
            snippet = ""
            for t in terms:
                pos = content_lower.find(t)
                if pos != -1:
                    start = max(0, pos - 120)
                    end = min(len(content), pos + 300)
                    snippet = content[start:end].strip()
                    break
            if not snippet:
                snippet = doc.get("summary") or doc.get("snippet") or content[:250]

            results.append({
                "id": doc.get("id"),
                "title": doc.get("title"),
                "category": doc.get("category"),
                "doc_type": doc.get("doc_type"),
                "score": score,
                "snippet": snippet
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:max_results]


# ── Semantic Vector Search Engine (Ollama bge-m3 + Cosine Similarity) ─────────
_vector_lock = threading.Lock()
_vector_data = None
_vector_matrix = None
_vector_mtime = 0

def load_semantic_vectors():
    global _vector_data, _vector_matrix, _vector_mtime
    target_file = None
    if os.path.exists(DOC_VECTORS_FILE):
        target_file = DOC_VECTORS_FILE
    elif os.path.exists(DOC_CACHE_FILE):
        target_file = DOC_CACHE_FILE

    if not target_file:
        return None

    try:
        mtime = os.path.getmtime(target_file)
        with _vector_lock:
            if _vector_data is None or mtime > _vector_mtime:
                with open(target_file, 'r', encoding='utf-8', errors='ignore') as f:
                    raw = json.load(f)
                    items = []
                    if "items" in raw:
                        items = raw["items"]
                    elif isinstance(raw, dict):
                        for doc_id, val in raw.items():
                            if isinstance(val, dict) and "vector" in val:
                                title = doc_id.replace(".md", "").replace("_재구성", "").replace("_simple", "")
                                items.append({
                                    "id": doc_id,
                                    "title": title,
                                    "category": "일반",
                                    "vector": val["vector"]
                                })
                    if items:
                        _vector_data = items
                        if np is not None:
                            try:
                                _vector_matrix = np.array([it["vector"] for it in items], dtype=np.float32)
                            except Exception as ne:
                                print(f"NumPy vector matrix conversion warning: {ne}")
                                _vector_matrix = None
                        _vector_mtime = mtime
                        print(f"[SemanticSearch] Sub-Wiki 로컬 벡터 인덱스 로드 완료: {len(items)}건")
        return _vector_data
    except Exception as e:
        print(f"[SemanticSearch] 벡터 로드 오류: {e}")
        return None


def semantic_search(query, top_k=25, min_score=0.35):
    items = load_semantic_vectors()
    if not items:
        return {"status": "no_index", "results": [], "message": "벡터 인덱스가 아직 빌드되지 않았습니다."}

    # 1. Query Ollama bge-m3 embedding
    q_vec = None
    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/embeddings",
            data=json.dumps({"model": "bge-m3", "prompt": query[:500]}).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_vec = data.get("embedding")
            if raw_vec and len(raw_vec) == 1024:
                norm = math.sqrt(sum(x * x for x in raw_vec))
                if norm > 0:
                    q_vec = [x / norm for x in raw_vec]
    except Exception as e:
        return {"status": "ollama_unavailable", "results": [], "error": str(e)}

    if not q_vec:
        return {"status": "embed_failed", "results": []}

    # 2. Cosine similarity calculation
    results = []
    if np is not None and _vector_matrix is not None:
        try:
            q_arr = np.array(q_vec, dtype=np.float32)
            scores = np.dot(_vector_matrix, q_arr)
            top_indices = np.argsort(scores)[::-1][:top_k]
            for rank, idx in enumerate(top_indices, 1):
                score = float(scores[idx])
                if score < min_score:
                    break
                it = items[idx]
                results.append({
                    "id": it["id"],
                    "title": it.get("title", it["id"]),
                    "category": it.get("category", "일반"),
                    "score": round(score, 4),
                    "rank": rank
                })
        except Exception as ne:
            print(f"[SemanticSearch] NumPy scoring warning: {ne}")

    if not results:
        scored = []
        for it in items:
            vec = it.get("vector")
            if not vec or len(vec) != len(q_vec):
                continue
            sim = sum(q * v for q, v in zip(q_vec, vec))
            if sim >= min_score:
                scored.append((sim, it))
        scored.sort(key=lambda x: x[0], reverse=True)
        for rank, (sim, it) in enumerate(scored[:top_k], 1):
            results.append({
                "id": it["id"],
                "title": it.get("title", it["id"]),
                "category": it.get("category", "일반"),
                "score": round(float(sim), 4),
                "rank": rank
            })

    return {
        "status": "ok",
        "total_indexed": len(items),
        "results": results
    }


# ── AI Model Invoker ────────────────────────────────────────────────────────
# 2026-09-16: 모델명이 코드에 고정돼 있어(claude-3-5-sonnet-20241022·gemini-1.5-flash, 둘 다 서비스 종료)
# HTTP 404 가 났다. 생성 시 복사된 wiki_portal/ai_config.json(본 위키와 동일)에서 읽는다.
def _ai_model(section, fallback):
    try:
        with open(os.path.join(DIRECTORY, "ai_config.json"), "r", encoding="utf-8") as f:
            return json.load(f).get(section, {}).get("default_model") or fallback
    except Exception:
        return fallback


def invoke_ai_model(engine, prompt, system_prompt):
    engine = engine.lower()

    # 1. Ollama 로컬 호출
    if engine == 'ollama' or (engine == 'auto' and is_ollama_running()):
        try:
            req_data = json.dumps({
                "model": "bge-m3" if "embed" in engine else "qwen2.5:7b",
                "prompt": f"{system_prompt}\n\n{prompt}",
                "stream": False
            }).encode('utf-8')
            req = urllib.request.Request("http://localhost:11434/api/generate", data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as response:
                res = json.loads(response.read().decode('utf-8'))
                return res.get("response", "")
        except Exception as oe:
            if engine == 'ollama':
                return f"Ollama 호출 오류: {oe}"

    # 2. Claude
    if engine in ('claude', 'auto', 'all') and os.environ.get('ANTHROPIC_API_KEY'):
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        try:
            req_data = json.dumps({
                "model": _ai_model("claude", "claude-haiku-4-5-20251001"),
                "max_tokens": 2048,
                "system": system_prompt,
                "messages": [{"role": "user", "content": prompt}]
            }).encode('utf-8')
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=req_data, headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            })
            with urllib.request.urlopen(req, timeout=40) as response:
                res = json.loads(response.read().decode('utf-8'))
                return "".join([c.get("text", "") for c in res.get("content", [])])
        except Exception as e:
            if engine == 'claude': return f"Claude 호출 오류: {e}"

    # 3. Gemini
    if engine in ('gemini', 'auto', 'all') and (os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')):
        api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{_ai_model('gemini', 'gemini-3.6-flash')}:generateContent?key={api_key}"
            req_data = json.dumps({
                "contents": [{"parts": [{"text": f"{system_prompt}\n\n{prompt}"}]}]
            }).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as response:
                res = json.loads(response.read().decode('utf-8'))
                return res["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            if engine == 'gemini': return f"Gemini 호출 오류: {e}"

    # 4. Perplexity
    if engine in ('perplexity', 'auto', 'all') and os.environ.get('PERPLEXITY_API_KEY'):
        api_key = os.environ.get('PERPLEXITY_API_KEY')
        try:
            req_data = json.dumps({
                "model": "sonar",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            }).encode('utf-8')
            req = urllib.request.Request("https://api.perplexity.ai/chat/completions", data=req_data, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            })
            with urllib.request.urlopen(req, timeout=40) as response:
                res = json.loads(response.read().decode('utf-8'))
                return res["choices"][0]["message"]["content"]
        except Exception as e:
            if engine == 'perplexity': return f"Perplexity 호출 오류: {e}"

    return "사용 가능한 AI API 키(Claude/Gemini/Perplexity) 또는 로컬 Ollama가 감지되지 않았습니다."


class SubWikiRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def address_string(self):
        # 윈도우 2초 DNS 역방향 조회 딜레이 차단
        return str(self.client_address[0])

    def end_headers(self):
        clean_path = self.path.split('?')[0]
        if any(clean_path.endswith(ext) for ext in ('.js', '.html', '.json')) or clean_path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    # ---- 보안 가드 (2026-09-29, 본 포털 wiki_portal/serve.py 와 같은 방식) ----
    # 전에는 모든 인터페이스(::)에 바인딩 + ACAO:* 라 같은 네트워크의 누구나 /files/ 로 원본 문서를 받고
    # save_doc 으로 파일을 쓸 수 있었고, 아무 웹사이트나 응답을 읽을 수 있었다.
    _LOOPBACK = ('localhost', '127.0.0.1', '::1')

    def parse_request(self):
        if not super().parse_request():
            return False
        host = (self.headers.get('Host') or '').strip()
        hostname = (host.rsplit(':', 1)[0] if host.count(':') == 1 else host).strip('[]').lower()
        origin = self.headers.get('Origin')
        try:
            origin_host = urllib.parse.urlparse(origin).hostname if origin else None
        except ValueError:
            origin_host = ''
        if (host and hostname not in self._LOOPBACK) or (origin and origin_host not in self._LOOPBACK):
            self.send_error(403, 'Forbidden')
            return False
        return True

    def send_header(self, keyword, value):
        # ACAO:* 는 가드를 통과한 루프백 Origin 으로만 좁히고, 동일출처면 보내지 않는다
        if keyword == 'Access-Control-Allow-Origin' and value == '*':
            value = (getattr(self, 'headers', None) or {}).get('Origin')
            if not value:
                return
        super().send_header(keyword, value)

    def do_GET(self):
        if self.path.startswith('/files/') or self.path.startswith('/raw/'):
            prefix = '/files/' if self.path.startswith('/files/') else '/raw/'
            parsed = urllib.parse.urlparse(self.path)
            rel_path = urllib.parse.unquote(parsed.path[len(prefix):]).strip('/\\')
            target_path = os.path.normpath(os.path.join(ROOT_DIR, rel_path))

            abs_root = os.path.abspath(ROOT_DIR)
            abs_target = os.path.abspath(target_path)
            if os.path.commonpath([os.path.normcase(abs_root), os.path.normcase(abs_target)]) != os.path.normcase(abs_root) \
                    or not os.path.exists(abs_target) or os.path.isdir(abs_target):
                self.send_error(404, "File Not Found")
                return

            ctype, _ = mimetypes.guess_type(target_path)
            if not ctype:
                ctype = 'application/octet-stream'

            try:
                fsize = os.path.getsize(target_path)
                self.send_response(200)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(fsize))
                self.send_header('Access-Control-Allow-Origin', '*')
                fn = os.path.basename(target_path)
                encoded_fn = urllib.parse.quote(fn)
                disp_mode = 'inline' if ctype.startswith(('image/', 'text/', 'application/pdf')) else 'inline'
                self.send_header('Content-Disposition', f"{disp_mode}; filename*=UTF-8''{encoded_fn}")
                self.end_headers()
                with open(target_path, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
            except Exception as e:
                try:
                    self.send_error(500, f"Error streaming file: {e}")
                except Exception:
                    pass
            return

        if self.path == '/api/recent_ingested':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            history = load_json_file(INGESTED_LOG_FILE)
            self.wfile.write(json.dumps(history, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/qa_history':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            history = load_json_file(QA_HISTORY_FILE)
            self.wfile.write(json.dumps(history, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/read_history':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            history = load_json_file(READ_HISTORY_FILE)
            self.wfile.write(json.dumps(history, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/decision_tracks':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            tracks = load_json_file(DECISION_FILE)
            self.wfile.write(json.dumps(tracks, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/sync_status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            cov_data = load_json_file(COVERAGE_FILE)
            if not cov_data or not isinstance(cov_data, dict) or not cov_data.get('sources_total'):
                cov_data = compute_subwiki_coverage()
                save_json_file(COVERAGE_FILE, cov_data)
            self.wfile.write(json.dumps(cov_data, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path.startswith('/api/semantic_search'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            query = params.get('q', [''])[0].strip()
            try:
                limit = int(params.get('limit', [25])[0])
            except Exception:
                limit = 25

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            if not query:
                self.wfile.write(json.dumps({"status": "empty_query", "results": []}, ensure_ascii=False).encode('utf-8'))
                return

            res = semantic_search(query, top_k=limit)
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/vector_status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            vectors = load_semantic_vectors()
            res = {
                "ready": bool(vectors),
                "count": len(vectors) if vectors else 0,
                "model": "bge-m3",
                "dimension": 1024,
                "numpy_accelerated": bool(np is not None and _vector_matrix is not None)
            }
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/ai_status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            vectors = load_semantic_vectors()
            status = {
                "claude": bool(os.environ.get('ANTHROPIC_API_KEY')),
                "gemini": bool(os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')),
                "perplexity": bool(os.environ.get('PERPLEXITY_API_KEY')),
                "ollama": is_ollama_running(),
                "vector_ready": bool(vectors),
                "vector_count": len(vectors) if vectors else 0
            }
            self.wfile.write(json.dumps(status, ensure_ascii=False).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        # 1. Update/Add/Clear Read History
        if self.path == '/api/read_history':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                req = json.loads(post_data.decode('utf-8'))

                action = req.get('action', 'add')
                history = load_json_file(READ_HISTORY_FILE)

                if action == 'clear':
                    history = []
                elif action == 'delete':
                    doc_id = req.get('id')
                    history = [h for h in history if h.get('id') != doc_id]
                else:
                    doc_id = req.get('id')
                    entry = {
                        "id": doc_id,
                        "title": req.get('title', doc_id),
                        "category": req.get('category', '일반'),
                        "doc_type": req.get('doc_type', '일반'),
                        "view_mode": req.get('view_mode', 'single'),
                        "hash": req.get('hash', f"#/doc/{doc_id}"),
                        "read_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        "char_count": req.get('char_count', 0)
                    }
                    history = [entry] + [h for h in history if h.get('id') != doc_id][:100]

                save_json_file(READ_HISTORY_FILE, history)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "history": history}, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        # 1-1. Save/Update Decision Evolution Track
        elif self.path == '/api/save_decision_track':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                req = json.loads(post_data.decode('utf-8'))

                track_id = req.get('track_id', '').strip() or f"track_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                title = req.get('title', '신규 의사결정 변천 트랙').strip()
                category = req.get('category', '일반 지식 & 도구').strip()
                description = req.get('description', '').strip()
                nodes = req.get('nodes', [])

                tracks = load_json_file(DECISION_FILE)
                existing_idx = next((i for i, t in enumerate(tracks) if t.get('track_id') == track_id), -1)

                track_data = {
                    "track_id": track_id,
                    "title": title,
                    "category": category,
                    "description": description,
                    "nodes": nodes
                }

                if existing_idx >= 0:
                    tracks[existing_idx] = track_data
                else:
                    tracks.append(track_data)

                save_json_file(DECISION_FILE, tracks)
                trigger_background_rebuild()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "tracks": tracks}, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        # 1-2. Trigger Graphify Entity Relation Extraction
        elif self.path == '/api/extract_relations':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                req = {}
                if content_length > 0:
                    post_data = self.rfile.read(content_length)
                    req = json.loads(post_data.decode('utf-8'))

                trigger_background_rebuild()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Sub-Wiki 지식망 릴레이션 분석 및 인덱싱이 백그라운드에서 시작되었습니다."}, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        # 2. AI RAG Ask
        elif self.path == '/api/ai_ask':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                req = json.loads(post_data.decode('utf-8'))

                query = req.get('query', '').strip()
                engine = req.get('engine', 'auto').strip().lower()

                if not query:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "질문 내용을 입력해주세요."}, ensure_ascii=False).encode('utf-8'))
                    return

                sources = search_wiki_context(query, max_results=5)
                context_blocks = []
                for i, s in enumerate(sources, 1):
                    context_blocks.append(f"[{i}] 문서: {s['title']} ({s['category']})\n발췌 내용:\n{s['snippet']}")

                context_str = "\n\n".join(context_blocks) if context_blocks else "관련된 내부 위키 문서가 검색되지 않았습니다."

                system_prompt = (
                    f"당신은 [{os.path.basename(ROOT_DIR)}] 지식 위키 포털의 전문 AI 어시스턴트입니다.\n"
                    "사용자의 질문에 대해 아래 제공된 [참고 위키 지식 베이스] 내용을 바탕으로 전문적이고 명확하며 구조화된 답변을 한국어로 작성하세요.\n"
                    "답변 시 반드시 다음 원칙을 준수하세요:\n"
                    "1. 제공된 위키 지식 근거를 우선적으로 활용하고, 핵심 용어는 굵게 표기하세요.\n"
                    "2. 개요, 핵심 내용 분석, 실무적 시사점/결론 형태로 가독성 높은 마크다운 서식을 적용하세요.\n"
                    "3. 인용된 위키 문서가 있다면 참고 출처를 명시하세요."
                )

                user_prompt = f"### [참고 위키 지식 베이스]\n{context_str}\n\n### [사용자 질문]\n{query}"

                responses = {}
                if engine == 'all':
                    engines_to_call = []
                    if is_ollama_running(): engines_to_call.append('ollama')
                    if os.environ.get('ANTHROPIC_API_KEY'): engines_to_call.append('claude')
                    if os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY'): engines_to_call.append('gemini')
                    if os.environ.get('PERPLEXITY_API_KEY'): engines_to_call.append('perplexity')
                    if not engines_to_call: engines_to_call = ['auto']

                    def call_engine(eng):
                        try:
                            return eng, invoke_ai_model(eng, user_prompt, system_prompt)
                        except Exception as ex:
                            return eng, f"오류 발생 ({eng}): {ex}"

                    with ThreadPoolExecutor(max_workers=3) as executor:
                        results = list(executor.map(call_engine, engines_to_call))
                    for eng_name, ans in results:
                        responses[eng_name] = ans
                else:
                    ans = invoke_ai_model(engine, user_prompt, system_prompt)
                    responses[engine] = ans

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                out = {
                    "query": query,
                    "engine": engine,
                    "responses": responses,
                    "sources": sources
                }
                self.wfile.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        # 3. Save QA Response to Canonical Wiki Knowledge
        elif self.path == '/api/save_qa_doc':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                req = json.loads(post_data.decode('utf-8'))

                question = req.get('question', '').strip()
                answer = req.get('answer', '').strip()
                engine_name = req.get('engine', 'AI').strip()
                sources = req.get('sources', [])
                tags = req.get('tags', ['AI질의응답', '복리축적지식'])
                category = req.get('category', 'AI & 테크놀로지')

                clean_q = sanitize_filename(question)[:45]
                raw_title = f"[Q&A] {question}"
                filename = f"QA_{clean_q}.md"
                file_path = os.path.join(DIRECTORY, filename)

                counter = 1
                while os.path.exists(file_path):
                    filename = f"QA_{clean_q}_{counter}.md"
                    file_path = os.path.join(DIRECTORY, filename)
                    counter += 1

                today_str = datetime.now().strftime('%Y-%m-%d')
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                yaml_lines = [
                    "---",
                    f'title: "{raw_title}"',
                    f'category: "{category}"',
                    f'topic: "{question}"',
                    "tags:",
                ]
                for t in tags:
                    yaml_lines.append(f"  - {t}")
                yaml_lines.append(f'source: "Sub-Wiki AI Q&A ({engine_name})"')
                yaml_lines.append(f'source_type: "AI 질의응답 복리축적"')
                yaml_lines.append(f'doc_nature: "지식 Q&A 통찰"')
                yaml_lines.append(f'created: "{today_str}"')
                yaml_lines.append(f'decision_status: "accepted"')
                yaml_lines.append(f'status: "canonical"')
                yaml_lines.append("---\n")

                body_lines = [
                    f"> 🤖 **답변 엔진:** {engine_name.upper()} · **등록 일시:** {now_str}\n\n",
                    "## 💡 AI 종합 답변 및 통찰\n",
                    answer + "\n\n",
                ]

                if sources:
                    body_lines.append("## 🔗 참고한 위키 지식 근거 (References)\n")
                    for s in sources:
                        safe_id = urllib.parse.quote(s.get('id', ''))
                        body_lines.append(f"- **[📄 {s['title']}](#/doc/{safe_id})** ({s.get('category', '')})")
                    body_lines.append("\n")

                full_content = "\n".join(yaml_lines) + "\n" + "\n".join(body_lines)

                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(full_content)

                trigger_background_rebuild()

                qa_history = load_json_file(QA_HISTORY_FILE)
                entry = {
                    "id": filename,
                    "title": raw_title,
                    "question": question,
                    "engine": engine_name,
                    "category": category,
                    "created_at": now_str,
                    "filename": filename
                }
                qa_history = [entry] + [h for h in qa_history if h.get('id') != filename][:50]
                save_json_file(QA_HISTORY_FILE, qa_history)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                res_data = {
                    "success": True,
                    "doc_id": filename,
                    "title": raw_title,
                    "message": "AI 질의응답이 Sub-Wiki 정본 지식으로 성공적으로 복리 축적되었습니다."
                }
                self.wfile.write(json.dumps(res_data, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        # 4. Save Raw Ingest Doc
        elif self.path == '/api/save_doc':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                req = json.loads(post_data.decode('utf-8'))

                raw_title = req.get('title', '').strip()
                content = req.get('content', '').strip()
                category = req.get('category', '일반 지식 & 도구').strip()
                topic = req.get('topic', '').strip()
                tags = req.get('tags', [])
                if isinstance(tags, str):
                    tags = [t.strip() for t in tags.split(',') if t.strip()]

                if not raw_title:
                    first_line = content.splitlines()[0].strip() if content else ""
                    first_line = re.sub(r'^[#\s\*\-]+', '', first_line)[:40]
                    raw_title = first_line if first_line else f"스크랩지식_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

                clean_name = sanitize_filename(raw_title)
                filename = f"{clean_name}.md"
                file_path = os.path.join(DIRECTORY, filename)

                counter = 1
                while os.path.exists(file_path):
                    filename = f"{clean_name}_{counter}.md"
                    file_path = os.path.join(DIRECTORY, filename)
                    counter += 1

                today_str = datetime.now().strftime('%Y-%m-%d')
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                def escape_yaml_str(val):
                    return str(val).replace('\\', '\\\\').replace('"', '\\"').replace('\r', '').replace('\n', ' ')

                yaml_lines = [
                    "---",
                    f'title: "{escape_yaml_str(raw_title)}"',
                    f'category: "{escape_yaml_str(category)}"',
                ]
                if topic: yaml_lines.append(f'topic: "{escape_yaml_str(topic)}"')
                if tags:
                    yaml_lines.append("tags:")
                    for t in tags: yaml_lines.append(f'  - "{escape_yaml_str(t)}"')
                else:
                    yaml_lines.append("tags: []")

                yaml_lines.append('source: "사용자 직접 수집"')
                yaml_lines.append('source_type: "사용자 수집/스크랩"')
                yaml_lines.append('doc_nature: "수집/스크랩 지식"')
                yaml_lines.append(f'created: "{today_str}"')
                yaml_lines.append('decision_status: "accepted"')
                yaml_lines.append('status: "canonical"')
                yaml_lines.append("---\n")

                full_file_content = "\n".join(yaml_lines) + "\n" + content + "\n"

                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(full_file_content)

                trigger_background_rebuild()

                ingest_history = load_json_file(INGESTED_LOG_FILE)
                entry = {
                    "id": filename,
                    "title": raw_title,
                    "category": category,
                    "tags": tags,
                    "created_at": now_str,
                    "char_count": len(content),
                    "filename": filename
                }
                ingest_history = [entry] + [h for h in ingest_history if h.get('id') != filename][:50]
                save_json_file(INGESTED_LOG_FILE, ingest_history)

                new_doc = {
                    "id": filename,
                    "title": raw_title,
                    "category": category,
                    "topic": topic or raw_title,
                    "summary": content[:300].strip() if content else "",
                    "snippet": content[:300].strip() if content else "",
                    "content": full_file_content,
                    "doc_type": "수집 지식",
                    "tags": tags,
                    "date": today_str,
                    "char_count": len(content),
                    "reading_time": max(1, len(content) // 400)
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                res_data = {
                    "success": True,
                    "doc_id": filename,
                    "title": raw_title,
                    "new_doc": new_doc,
                    "message": f"'{raw_title}' 지식이 Sub-Wiki 정본으로 등록 및 인덱싱되었습니다."
                }
                self.wfile.write(json.dumps(res_data, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                return

        super().do_POST()




def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(('127.0.0.1', port)) == 0:
            return True
    if socket.has_ipv6:
        try:
            with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s:
                if s.connect_ex(('::1', port)) == 0:
                    return True
        except Exception:
            pass
    return False


def find_available_port(start_port=8080, max_attempts=25):
    for port in range(start_port, start_port + max_attempts):
        if not is_port_in_use(port):
            return port
    return start_port


def run_server():
    os.chdir(DIRECTORY)
    port = find_available_port(8080)
    url = f"http://127.0.0.1:{port}/index.html"

    try:
        # 이 PC 에서만 접속(루프백). 같은 네트워크에 공개하지 않는다.
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), SubWikiRequestHandler)

        httpd.daemon_threads = True
        with httpd:
            folder_name = os.path.basename(ROOT_DIR) or "Sub-Wiki"
            print("=" * 60)
            print(f"  🌟 [{folder_name}] 독립 Sub-지식위키 포털 가동 중")
            print(f"  접속 주소: {url}")
            print("  서버를 종료하려면 이 창에서 Ctrl + C 를 누르세요.")
            print("=" * 60)

            # 초기 벡터 인덱스 메모리 프리로드
            load_semantic_vectors()

            webbrowser.open(url)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n서버가 안전하게 종료되었습니다.")
                httpd.server_close()
    except OSError as e:
        print(f"\n[안내] 포트 {port}가 이미 사용 중입니다. 기존 서버에 접속합니다: {url}")
        webbrowser.open(url)


if __name__ == "__main__":
    run_server()
