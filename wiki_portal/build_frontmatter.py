# -*- coding: utf-8 -*-
r"""
build_frontmatter.py — NotebookLM 요약본 → YAML frontmatter + 자동 태그 변환 파이프라인

동작 원칙(비파괴):
  - 원본(sources/*.md 등)은 절대 수정하지 않음. 결과는 --out 폴더에 새로 생성.
  - .md 는 기존 '# 문서 메타' 블록/'핵심 키워드'를 파싱해 frontmatter로 승격.
  - .pdf/.docx/.hwpx/.pptx/.xlsx/.html/.txt 는 markitdown→pandoc→내장변환 순으로 MD 변환 후 동일 처리.
  - 이미 '---' frontmatter가 있으면 건너뜀(재실행 안전). --force 로 덮어씀.

사용법:
  python _engine/build_frontmatter.py --in sources --out wiki_md
  python _engine/build_frontmatter.py --in sources --out wiki_md --force
  python _engine/build_frontmatter.py --in raw_docs --out wiki_md --recurse

의존성: 표준 라이브러리만으로 .md 처리 가능.
        비-MD 변환 시 markitdown(pip install markitdown[all]) 또는 pandoc 필요(선택).
"""
import os, re, sys, json, argparse, subprocess, shutil, datetime, unicodedata, threading

# ── 품질우선원칙 (2026-09-19, [1-c] 소스분석 분리 후속) ──────────────────────
# run_batch_source_query.py 가 재시도 중 남기는 미완성 표식(run_batch_source_query.py의
# INCOMPLETE_MARK 와 동일 문자열 — 두 파일이 따로 관리되므로 값이 바뀌면 양쪽 다 고칠 것).
# 종전엔 증분 스킵이 mtime 만 보고, 소스가 새로 갱신됐다는 이유만으로 미완성/축소본이
# 이미 있던 완성 정본을 덮어썼다(실측 09-19, 일일영어회화 다수건 + 09-18 '축소분' 98건).
SRC_INCOMPLETE_MARK = "<!-- 미완성: 누락 섹션"
# 실측(2026-09-19): 정상 재처리 317건의 신규/기존 비율은 0.969~0.98,
# 손으로 격리해야 했던 축소분 98건은 최대 0.942 였다. 종전 0.5 는 그 중 43건을 통과시켰다.
QUALITY_MIN_RATIO = 0.9

def _strip_fm_body(text):
    """frontmatter(--- ... ---)를 걷어낸 본문만 반환. frontmatter 가 없으면 원문 그대로."""
    if text.startswith('---'):
        m = re.match(r'^---\s*\n.*?\n---\s*\n', text, re.S)
        if m:
            return text[m.end():]
    return text

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ── AI 라우터 연동 (PPTX 등 개조식 프레젠테이션의 AI Executive Summary 생성용)
AI_ROUTER_AVAILABLE = False
engine_candidates = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "_engine"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_engine"),
]
for ed in engine_candidates:
    if os.path.exists(ed) and ed not in sys.path:
        sys.path.insert(0, ed)
try:
    import ai_router
    AI_ROUTER_AVAILABLE = True
except Exception:
    ai_router = None

# ── 메타 필드 매핑: 원본 '문서 메타' 라벨 → frontmatter 키
META_MAP = [
    ("제목",       "title"),
    ("출처 종류",   "source_type"),
    ("원문 성격",   "doc_nature"),
    ("주제",       "topic"),
    ("작성 목적",   "purpose"),
    ("대상 독자",   "audience"),
    ("핵심 키워드", "_keywords"),   # tags 로 변환
]

# ── 인용 각주 마커 제거:  [1]  [3-5]  [1, 2]  [7, 8]  등
CITE = re.compile(r'\s*\[\d+(?:\s*[-,]\s*\d+)*\]')

def strip_cite(s: str) -> str:
    return CITE.sub('', s or '').strip().rstrip('.').strip()

def yaml_escape(s: str) -> str:
    s = (s or '').replace('"', "'").strip()
    return s

def slugify_tag(s: str) -> str:
    """정규화된 태그 원형(공백 유지). 최종 슬러그는 slugify_final에서 처리."""
    s = strip_cite(s).strip()
    s = re.sub(r'\(.*?\)', '', s)          # 괄호 주석 제거: MRO 대행사(...) → MRO 대행사
    s = s.replace('/', ' ').replace('·', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def slugify_final(s: str) -> str:
    """위키/Obsidian 태그 슬러그: 공백→하이픈, 태그 금지문자 제거."""
    s = s.strip()
    s = re.sub(r'[\s]+', '-', s)                       # 공백 → 하이픈
    s = re.sub(r'[^0-9A-Za-z가-힣_\-]', '', s)          # 영문/숫자/한글/_/- 만 허용
    s = re.sub(r'-{2,}', '-', s).strip('-')            # 하이픈 중복/양끝 정리
    return s

def parse_meta_block(text: str) -> dict:
    """'# 문서 메타' 섹션의 '- 라벨: 값' 라인을 추출."""
    meta = {}
    m = re.search(r'^#\s*문서\s*메타\s*\n(.*?)(?=^#\s|\Z)', text, re.S | re.M)
    block = m.group(1) if m else text[:1500]
    for label, key in META_MAP:
        mm = re.search(rf'^-\s*\*{{0,2}}\s*{re.escape(label)}\s*\*{{0,2}}\s*:\s*\*{{0,2}}\s*(.+)$', block, re.M)
        if mm:
            meta[key] = strip_cite(mm.group(1))
    return meta

def first_h1(text: str) -> str:
    STRUCT = {"문서 메타", "한줄 요약", "핵심 지식", "요약", "개요", "목차", "위키화", "확인 필요"}
    for m in re.finditer(r'^#\s+(.+)$', text, re.M):
        t = strip_cite(m.group(1))
        if t and t not in STRUCT:
            return t
    return ""

def one_line_summary(text: str) -> str:
    # 1순위: AI Executive Summary의 핵심 요약 블록 추출 (콜론 위치, 공백, 다양한 라벨 포괄)
    m_ai = re.search(r'>\s*(?:📌|🎯)\s*\*\*(?:핵심\s*요약(?:\s*\(Executive\s*Summary\))?|Executive\s*Summary(?:\s*/\s*핵심\s*요약)?|AI[^\*:]*(?:요약|Strategy|Insight|Summary|Briefing)[^\*:]*)\s*:?\*\*:?\s*(.+)', text, re.IGNORECASE)
    if m_ai:
        return strip_cite(m_ai.group(1).strip())[:220]
    # 2순위: 기존 '# 한줄 요약' 섹션
    m = re.search(r'^#\s*한줄\s*요약\s*\n(.*?)(?=^#\s|\Z)', text, re.S | re.M)
    if m:
        body = re.sub(r'^\s*[-*]\s*', '', m.group(1).strip(), flags=re.M)
        first_l = body.split('\n')[0].strip()
        if first_l:
            return strip_cite(first_l)[:220]
    # 3순위: NotebookLM 소스 분석 템플릿의 '**한줄 요약**' 블록
    m_nlm = re.search(r'\*\*한줄\s*요약\*\*\s*\n+>\s*(.+)', text)
    if m_nlm:
        return strip_cite(m_nlm.group(1).strip())[:220]
    # 4순위: '## 📌 요약 (Executive Summary)' 섹션의 첫 문장
    m_exec = re.search(r'##\s*📌\s*요약(?:\s*\(Executive Summary\))?\s*\n+(?:[-*]\s*)?(.+)', text)
    if m_exec:
        return strip_cite(m_exec.group(1).strip())[:220]
    # 5순위: 일반 인용구 핵심 요약 (볼드 라벨 '**라벨:**' 또는 '**라벨**:' 제거 후 순수 본문만 추출)
    m_q = re.search(r'>\s*📌\s*(?:\*\*[^*]+(?::\*\*|\*\*:)\s*|\[[^\]]+\]:\s*)?([^\n]+)', text)
    if m_q:
        return strip_cite(m_q.group(1).strip())[:220]
    return ""

# ── 동의어 매핑: 변형 태그(슬러그, 소문자 비교) → 표준 태그 ──────────
#   같은 개념이 여러 표기로 흩어지는 것을 방지. 키는 소문자 슬러그, 값은 최종 표준 슬러그.
SYNONYMS = {
    "노트북lm": "NotebookLM",
    "notebooklm": "NotebookLM",
    "노트북-lm": "NotebookLM",
    "로컬lc": "내국신용장",
    "로컬-lc": "내국신용장",
    "local-lc": "내국신용장",
    "로컬-l-c": "내국신용장",
    "내국-신용장": "내국신용장",
    "구매-확인서": "구매확인서",
    "mro-대행사": "MRO-대행사",
    "mro대행사": "MRO-대행사",
    "mcp": "모델-컨텍스트-프로토콜",
    "모델-컨텍스트-프로토콜": "모델-컨텍스트-프로토콜",
    "vibe-coding": "바이브-코딩",
    "바이브코딩": "바이브-코딩",
    "ktnet": "KTNET",
    "uth": "uTradeHub",
    "utradehub": "uTradeHub",
    "stl": "스마트무역원장",
    "smart-trade-ledger": "스마트무역원장",
    "pcrlic": "구매확인서",
    "creadv": "구매확인서",
    "역발행": "구매확인서-역발행",
    "bpr": "BPR",
    "isp": "ISP",
    "po": "발주서",
    "edifact": "EDIFACT",
    "locadv": "내국신용장",
    "llm": "LLM",
    "ocr": "OCR",
    "agent": "AI에이전트",
    "ai-agent": "AI에이전트",
    "에이전트": "AI에이전트",
}

def canonicalize(slug: str) -> str:
    return SYNONYMS.get(slug.lower(), slug)

# 구조·서식용 볼드 라벨(도메인 개념이 아님) → 태그 제외
STOP_TAGS = {
    '목적', '배경', '구성', '명칭', '개요', '요약', '결론', '서론', '정의', '특징',
    '핵심', '내용', '방법', '절차', '흐름', '개념', '용어', '주요 개념', '핵심 문장',
    '프로젝트 문서셋 명칭', '대상 독자 및 소비 시스템', '문서셋 구성', '프로젝트 명칭',
    '대상 독자', '작성 목적', '한줄 요약', '핵심 지식', '문서 메타',
    # 임베디드 프롬프트/지시 템플릿 용어(도메인 개념 아님)
    '블록명', '근거 문장', '위키 연결어', '우선순위', '출력 형식', '작성 지침',
    '주의', '예시', '규칙', '단계', '항목', '필드', '값',
    # 소스분석 및 슬라이드 서식 라벨 (노이즈 방지)
    '핵심 논지', '핵심논지', '핵심-논지', '근거 및 데이터', '근거및데이터', '근거-및-데이터',
    '주요 인용', '주요인용', '주요-인용', '핵심 주장', '핵심 주장사실', '핵심-주장사실',
    '핵심-주장-사실', '개념용어', '개념-용어', '상세 분해', '상세분해', '상세-분해',
    '세부 분해', '세부분해', '세부-분해', '주요 슬라이드', '주요-슬라이드',
    '주요 슬라이드 목차 구성', '주요-슬라이드-목차-구성', '슬라이드 목차', '슬라이드-목차',
    '핵심 내용', '실행 방안', '기대 효과', '기대효과', '기대-효과', '검토 의견', '검토의견',
}

def build_tags(meta: dict, text: str, is_eng: bool = False) -> list:
    tags, seen = [], set()
    def add(t):
        t = slugify_tag(t)
        if not (t and 1 < len(t) <= 25 and t not in STOP_TAGS):
            return
        slug = canonicalize(slugify_final(t))          # ← 슬러그화 + 동의어 표준화
        if slug and slug.lower() not in seen and slug not in STOP_TAGS:
            seen.add(slug.lower()); tags.append(slug)

    # 영어 학습 컨텐츠인 경우 기본 도메인 태그 우선 주입
    if is_eng:
        for et in ["영어학습", "영어회화"]:
            add(et)
    # 0순위: AI Executive Summary 또는 소스 프롬프트의 '연결 키워드' 블록/라인
    m_sec = re.search(r'연결\s*키워드[^\n]*\n([^\n]+)', text)
    if m_sec:
        kw_line = re.sub(r'^[>\s*-]+', '', m_sec.group(1).strip()).strip('[]')
        kw_line = re.sub(r'^\*{0,2}\s*연결\s*키워드\s*\*{0,2}\s*[:：]\s*', '', kw_line)
        for kw in re.split(r'[,，、]', kw_line):
            add(kw.strip(' *`"\''))
    else:
        m_inline = re.search(r'연결\s*키워드(?:\s*\(Canonical Concepts\))?\s*[:：]\s*([^\n]+)', text)
        if m_inline:
            kw_line = m_inline.group(1).strip().strip('[]')
            kw_line = re.sub(r'^\*{0,2}\s*연결\s*키워드\s*\*{0,2}\s*[:：]\s*', '', kw_line)
            for kw in re.split(r'[,，、]', kw_line):
                add(kw.strip(' *`"\''))

    # 1순위: NotebookLM 자동 태그 블록의 '**키워드**:' 라인
    m_nlm_kw = re.search(r'\*\*키워드\*\*[:：]\s*([^\n]+)', text)
    if m_nlm_kw:
        for kw in re.split(r'[,，、]', m_nlm_kw.group(1)):
            add(kw.strip(' *`"\''))

    # 2순위: 핵심 키워드 라인 (문서 메타)
    for kw in re.split(r'[,，]', meta.get("_keywords", "")):
        add(kw)

    # 3순위(폴백): 키워드가 없으면 본문 전체에서 '2회 이상 반복'되는 볼드 용어
    #   → 도메인 개념은 반복되고, 구조 라벨(목적·배경 등)은 1회만 등장하는 성질을 이용
    if not tags:
        from collections import Counter
        cnt = Counter(slugify_tag(m) for m in re.findall(r'\*\*(.+?)\*\*', text))
        for term, c in cnt.most_common():
            if c >= 2:
                add(term)

    # 4순위(순수 텍스트/HWPX 폴백): 볼드 서식이 없는 문서의 경우 제목의 핵심 도메인 단어 추출
    if not tags:
        title_words = re.findall(r'[가-힣A-Za-z0-9]{2,}', meta.get("title", ""))
        for tw in title_words:
            add(tw)

    return tags[:12]

ENGLISH_WORD_PATTERNS = [
    r'\benglish\b', r'\bspeaking\b', r'\bgrammar\b', r'\btoeic\b',
    r'\btoefl\b', r'\bopic\b', r'\bvocabulary\b', r'\bvoca\b',
    r'\bidioms?\b', r'\bphrasal\b', r'\bconversation\b'
]
ENGLISH_HANGUL_KEYWORDS = [
    "영어", "회화", "구동사", "영작", "패턴회화", "생활영어", "영문법",
    "영어교재", "english materials", "원어민", "미국인", "외국인", "쉐도잉",
    "이디엄", "숙어", "영어단어", "영어표현", "이보영", "오성식", "토마토",
    "해커스", "시나공", "능률", "넥서스", "길벗"
]
NON_ENGLISH_TECH_KEYWORDS = [
    "anthropic", "openai", "claude", "chatgpt", "gemini", "llm", "coding",
    "프롬프트", "엔지니어링", "바이브코딩", "context engineering", "software",
    "api", "agentic", "개발자", "스타트업", "boris cherny", "erp", "무역원장",
    "notebooklm", "노트북lm", "google", "구글", "sdlc"
]

def is_english_content(path: str, text: str = "", title: str = "") -> bool:
    """파일명, 경로, 본문 내용을 종합 분석하여 영어 학습 컨텐츠인지 정밀 감지 (Anthropic 등 기술용어 오인 방지)."""
    full_path_str = (str(path) + " " + str(title)).lower()

    # 1. 기술/AI/비즈니스 키워드가 포함되어 있고, 명시적 어학 교재 표시가 없으면 일반 문서
    is_tech = any(tk in full_path_str for tk in NON_ENGLISH_TECH_KEYWORDS)
    has_explicit_study = any(hk in full_path_str for hk in ["영어회화", "영어단어", "영어문법", "패턴회화", "생활영어", "영어교재", "toeic", "toefl", "03_english materials"])
    if is_tech and not has_explicit_study:
        return False

    # 2. 한글 어학 키워드 매칭
    if any(kw in full_path_str for kw in ENGLISH_HANGUL_KEYWORDS):
        return True

    # 3. 영문 어학 키워드: 단어 경계(\b) 매칭 (Anthropic의 'opic', Advocate의 'voca' 방지)
    for pat in ENGLISH_WORD_PATTERNS:
        if re.search(pat, full_path_str):
            return True

    if text:
        sample = text[:3000].lower()
        if not is_tech:
            eng_study_cues = ["phrasal verb", "dialogue", "idiom", "grammar in use", "speaking drill", "pronunciation tip"]
            cue_matches = sum(1 for cue in eng_study_cues if cue in sample)
            if cue_matches >= 2:
                return True

    return False


# S3(2026-09-21 48차): 일반 지식 & 도구 84.7% 해소. 드라이런·근거는 _문서/작업로그.md 48차.
FOLDER_CATEGORY_MAP = {
    "05 컨설팅보고서": "관세행정 & 컨설팅",
    "업무매뉴얼": "전자무역 & 비즈니스", "업무매뉴얼_0914_0746": "전자무역 & 비즈니스",
    "교육자료": "전자무역 & 비즈니스", "무역미그": "전자무역 & 비즈니스",
    "전자무역업무분석": "전자무역 & 비즈니스", "전자무역소개 자료": "전자무역 & 비즈니스",
    "ULOCAL센터 구축(신규B2B사업)": "전자무역 & 비즈니스",
    "02_[외부]아메바경영컨설팅_위즈덤21": "경영 & 전략 기획", "raw": "경영 & 전략 기획",
    "2024KPC컨설팅": "경영 & 전략 기획",
}
NOTEBOOK_CATEGORY_KW = [
    ("전자무역 & 비즈니스", ["trade", "bpr", "isp", "peppol", "내국신용장", "구매확인서", "로컬거래", "전자문서", "비표준", "간접수출", "수출", "무역"]),
    ("경영 & 전략 기획", ["pmbok", "sales", "엠로", "브라이언트레이시", "경영", "전략", "사업"]),
    ("인문·신앙 & 라이프", ["christian", "자아", "philosoph", "인생", "명언", "신앙"]),
    ("AI & 테크놀로지", ["하네스", "안티그래비티", "antigravity", "obsidian", "llm", "frontend", "루프엔지니어링", "skill", "browser", "에이전트", "노트북lm", "agent", "mcp", "코드", "code"]),
]

def infer_folder_context(src_path: str, is_eng: bool = False) -> dict:
    """sources/ 하위 폴더 경로에서 category, project, phase, notebook 추출"""
    parts = src_path.replace('\\', '/').split('/')
    ctx = {
        "category": "일반 지식 & 도구",
        "project": "",
        "phase": "",
        "notebook": ""
    }
    if is_eng:
        ctx["category"] = "글로벌 어학 & 영어"

    if not parts or parts == ['']:
        return ctx

    top = parts[0]
    top_lower = top.lower()
    if "03_english materials" in top_lower or "영어교재" in top or "english" in top_lower or "영어" in top:
        ctx["category"] = "글로벌 어학 & 영어"
        ctx["project"] = top
        if len(parts) > 1:
            ctx["notebook"] = parts[1]
    elif "스마트무역원장" in top:
        ctx["category"] = "전자무역 & 비즈니스"
        ctx["project"] = "스마트무역원장"
        if len(parts) > 1 and any(parts[1].startswith(prefix) for prefix in ("01_", "02_", "03_", "04_", "05_")):
            ctx["phase"] = parts[1]
    elif "무역물류실무교재" in top or "전자문서분석" in top:
        ctx["category"] = "전자무역 & 비즈니스"
        ctx["project"] = top
    elif top in FOLDER_CATEGORY_MAP:          # S3(2026-09-21 48차): 최상위 폴더 매핑
        ctx["category"] = FOLDER_CATEGORY_MAP[top]
        ctx["project"] = top
    elif "경영경제 읽을거리" in top:
        ctx["category"] = "경영 & 전략 기획"
    elif "소스요약" in top:
        if len(parts) > 1:
            sub = parts[1]
            ctx["notebook"] = sub
            if any(k in sub for k in ["책서평", "독서", "인문", "성경", "뇌과학"]):
                ctx["category"] = "인문·신앙 & 라이프"
            elif any(k in sub for k in ["AI", "개발", "코딩", "Claude", "Gemini", "NotebookLM", "파이썬", "프롬프트"]):
                ctx["category"] = "AI & 테크놀로지"
            elif any(k in sub for k in ["무역", "스마트무역원장", "KTNET", "UTH", "물류"]):
                ctx["category"] = "전자무역 & 비즈니스"
            elif any(k in sub for k in ["경영", "경제", "전략", "DBR", "맥킨지", "재테크"]):
                ctx["category"] = "경영 & 전략 기획"
            elif any(k in sub for k in ["영어", "English"]):
                ctx["category"] = "글로벌 어학 & 영어"
            elif not is_eng:                   # S3: 노트북 폴더명 보강 키워드(대소문자 무시), 없으면 일반
                sub_l = sub.lower()
                ctx["category"] = "일반 지식 & 도구"
                for cat, kws in NOTEBOOK_CATEGORY_KW:
                    if any(k in sub_l for k in kws):
                        ctx["category"] = cat
                        break

    return ctx

REVISED_FILENAME_RE = re.compile(r'\(안\)|초안|검토안|협의안|draft|(?<![\d.])v0\.\d', re.IGNORECASE)

def infer_decision_meta(filename: str, text: str, created: str) -> dict:
    """파일명 및 본문 내용을 기반으로 decision_status, version 등 유추"""
    meta = {
        "decision_status": "accepted",
        "decision_date": created or "",
        "version": ""
    }

    # 1. Version extraction
    m_ver = re.search(r'(?:v|ver|version)[\s._-]*(\d+(?:\.\d+)?)', filename, re.IGNORECASE)
    if m_ver:
        meta["version"] = f"v{m_ver.group(1)}"

    # 2. Decision Status — A안(2026-09-21 48차): 본문 키워드 판정 폐지.
    #    superseded 는 명시 superseded_by 관계가 있을 때만(make_frontmatter), 자동으로는 찍지 않는다.
    #    revised 는 파일명 신호만 — 본문 키워드는 개정이력표·프로그램ID·폴더명 오탐이 전부였다(표본 21/21).
    if REVISED_FILENAME_RE.search(filename):
        meta["decision_status"] = "revised"

    return meta

def make_frontmatter(meta, tags, created, converted, src_name, summary, src_path='', folder_ctx=None, decision_meta=None, is_eng=False):
    lines = ["---"]
    raw_t = meta.get("title") or ""
    # 깔끔한 제목 정규화 (앞뒤 _, _소스분석 접미사 정리)
    clean_t = re.sub(r'_소스분석$', '', raw_t.strip(' _'))
    title = yaml_escape(clean_t if clean_t else raw_t)
    lines.append(f'title: "{title}"')

    category = "글로벌 어학 & 영어" if is_eng else (meta.get("category") or (folder_ctx.get("category") if folder_ctx else "") or "일반 지식 & 도구")
    lines.append(f'category: "{yaml_escape(category)}"')
    if is_eng:
        lines.append('type: "english_learning"')
    if folder_ctx and folder_ctx.get("project"):
        lines.append(f'project: "{yaml_escape(folder_ctx["project"])}"')
    if folder_ctx and folder_ctx.get("phase"):
        lines.append(f'phase: "{yaml_escape(folder_ctx["phase"])}"')
    if folder_ctx and folder_ctx.get("notebook"):
        lines.append(f'notebook: "{yaml_escape(folder_ctx["notebook"])}"')

    if meta.get("topic"):       lines.append(f'topic: "{yaml_escape(meta["topic"])}"')
    if meta.get("source_type"): lines.append(f'source_type: "{yaml_escape(meta["source_type"])}"')
    if meta.get("doc_nature"):  lines.append(f'doc_nature: "{yaml_escape(meta["doc_nature"])}"')
    if meta.get("purpose"):     lines.append(f'purpose: "{yaml_escape(meta["purpose"])}"')
    if meta.get("audience"):    lines.append(f'audience: "{yaml_escape(meta["audience"])}"')
    if summary:                 lines.append(f'summary: "{yaml_escape(summary)}"')

    # Decision Lifecycle Meta
    d_status = meta.get("decision_status") or (decision_meta.get("decision_status") if decision_meta else "accepted")
    if meta.get("superseded_by"):
        d_status = "superseded"
    lines.append(f'decision_status: "{d_status}"')
    ver = meta.get("version") or (decision_meta.get("version") if decision_meta else "")
    if ver:
        lines.append(f'version: "{ver}"')
    if meta.get("supersedes"):
        lines.append(f'supersedes: "{yaml_escape(meta["supersedes"])}"')
    if meta.get("superseded_by"):
        lines.append(f'superseded_by: "{yaml_escape(meta["superseded_by"])}"')

    lines.append(f'source: "{src_name}"')
    if src_path and src_path != src_name:
        lines.append(f'source_path: "{yaml_escape(src_path)}"')
    lines.append(f'created: {created}')
    lines.append(f'converted: {converted}')
    lines.append('status: canonical')
    if tags:
        lines.append('tags:')
        for t in tags:
            lines.append(f'  - {t}')
    else:
        lines.append('tags: []')
    lines.append('aliases: []')
    lines.append('---')
    return '\n'.join(lines) + '\n\n'

# ── 비-MD → MD 변환기 (내장 순수 파이썬 + Gemini Vision OCR 연동) ────────────────
def extract_docx(path: str, skip_ai: bool = False) -> str:
    import zipfile, xml.etree.ElementTree as ET
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return ""
    paras = []
    try:
        with zipfile.ZipFile(path) as z:
            if 'word/document.xml' in z.namelist():
                tree = ET.fromstring(z.read('word/document.xml'))
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                for p in tree.iterfind('.//w:p', ns):
                    texts = [t.text for t in p.iterfind('.//w:t', ns) if t.text]
                    if texts:
                        paras.append(''.join(texts))

        # 텍스트 부족 시(그림/스캔형 워드 문서): 내부 이미지 Gemini Vision OCR 자동 복원 (skip_ai=False 일 때만)
        full_text = '\n\n'.join(paras)
        core_chars = re.sub(r'[\s\d\-_/|·\.\(\)]', '', full_text)
        if not skip_ai and len(core_chars) < 50 and AI_ROUTER_AVAILABLE and ai_router and hasattr(ai_router, 'ask_gemini_vision'):
            media_files = [f for f in z.namelist() if f.startswith('word/media/') and f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            media_files.sort()
            if media_files:
                doc_title = os.path.splitext(os.path.basename(path))[0]
                print(f"  📷 [DOCX Vision OCR] '{doc_title}' 텍스트 부족({len(core_chars)}자) -> {len(media_files)}개 이미지에서 Gemini OCR 가동...", flush=True)
                ocr_blocks = []
                for idx, mf in enumerate(media_files, 1):
                    try:
                        img_bytes = z.read(mf)
                        if len(img_bytes) >= 3000:
                            ocr_txt = ai_router.ask_gemini_vision(img_bytes)
                            if ocr_txt and len(re.sub(r'\s+', '', ocr_txt)) > 15:
                                ocr_blocks.append(f"### [워드 그림 섹션 {idx}]\n\n{ocr_txt}")
                    except Exception:
                        pass
                if ocr_blocks:
                    return '\n\n'.join(ocr_blocks)
    except Exception:
        return None

    return '\n\n'.join(paras)

def extract_hwpx(path: str, skip_ai: bool = False) -> str:
    import zipfile, xml.etree.ElementTree as ET
    paras = []
    with zipfile.ZipFile(path) as z:
        for item in z.namelist():
            if item.startswith('Contents/section') and item.endswith('.xml'):
                tree = ET.fromstring(z.read(item))
                for elem in tree.iter():
                    if elem.tag.endswith('t') and elem.text:
                        paras.append(elem.text.strip())

        # 텍스트 부족 시(그림/스캔형 한글 문서): BinData/ 이미지 Gemini Vision OCR 자동 복원 (skip_ai=False 일 때만)
        full_text = '\n\n'.join(paras)
        core_chars = re.sub(r'[\s\d\-_/|·\.\(\)]', '', full_text)
        if not skip_ai and len(core_chars) < 50 and AI_ROUTER_AVAILABLE and ai_router and hasattr(ai_router, 'ask_gemini_vision'):
            bin_images = [f for f in z.namelist() if f.startswith('BinData/') and f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            bin_images.sort()
            if bin_images:
                doc_title = os.path.splitext(os.path.basename(path))[0]
                print(f"  📷 [HWPX Vision OCR] '{doc_title}' 텍스트 부족({len(core_chars)}자) -> {len(bin_images)}개 이미지에서 Gemini OCR 가동...", flush=True)
                ocr_blocks = []
                for idx, bf in enumerate(bin_images, 1):
                    try:
                        img_bytes = z.read(bf)
                        if len(img_bytes) >= 3000:
                            ocr_txt = ai_router.ask_gemini_vision(img_bytes)
                            if ocr_txt and len(re.sub(r'\s+', '', ocr_txt)) > 15:
                                ocr_blocks.append(f"### [한글 그림 섹션 {idx}]\n\n{ocr_txt}")
                    except Exception:
                        pass
                if ocr_blocks:
                    return '\n\n'.join(ocr_blocks)

    return '\n\n'.join(paras)

def extract_hwp5(path: str) -> str:
    """HWP 5.0(.hwp) 본문 텍스트 — 한글 프로그램 없이 OLE 스트림을 직접 읽는다.
    BodyText/SectionN 의 PARA_TEXT(tag 67) 레코드만 모은다. 글상자·표 안 문단도 같은 레코드 흐름에 들어 있다."""
    import olefile, zlib, struct
    if not olefile.isOleFile(path):
        raise RuntimeError('HWP 5.0 형식이 아님(HWP 3.0 이하 등)')
    with olefile.OleFileIO(path) as ole:
        flags = struct.unpack('<I', ole.openstream('FileHeader').read()[36:40])[0]
        if flags & 0x2:
            raise RuntimeError('암호가 걸린 HWP')
        if flags & 0x4:
            raise RuntimeError('배포용 HWP(본문 암호화)')
        sections = sorted((e for e in ole.listdir() if len(e) == 2 and e[0] == 'BodyText' and e[1].startswith('Section')),
                          key=lambda e: int(e[1][7:] or 0))
        paras = []
        for sec in sections:
            data = ole.openstream(sec).read()
            if flags & 0x1:
                data = zlib.decompress(data, -15)
            i = 0
            while i + 4 <= len(data):
                h = struct.unpack_from('<I', data, i)[0]
                tag, size = h & 0x3FF, (h >> 20) & 0xFFF
                i += 4
                if size == 0xFFF:
                    size = struct.unpack_from('<I', data, i)[0]
                    i += 4
                if tag == 67:   # HWPTAG_PARA_TEXT
                    buf, out, j = data[i:i + size], [], 0
                    while j + 2 <= len(buf):
                        c = struct.unpack_from('<H', buf, j)[0]
                        if c >= 32:
                            out.append(chr(c)); j += 2
                        elif c in (0, 10, 13) or 24 <= c <= 31:   # 1글자짜리 제어문자
                            out.append({10: '\n', 24: '-', 30: ' ', 31: ' '}.get(c, '')); j += 2
                        else:                                     # 인라인·확장 제어문자는 8글자(16바이트)
                            if c == 9:
                                out.append('\t')
                            j += 16
                    s = ''.join(out).strip()
                    if s:
                        paras.append(s)
                i += size
    return '\n\n'.join(paras)


def extract_ppt97(path: str) -> str:
    """PowerPoint 97~2003(.ppt) 텍스트 — PowerPoint 없이 'PowerPoint Document' 스트림을 직접 읽는다.
    COM 은 손상 파일에서 끌 수 없는 확인창을 띄워 무인 배치가 멈춘다(2026-09-22 실측).
    - 제목·본문 자리표시자 텍스트: SlideListWithText(슬라이드용 instance 0)에서 SlidePersistAtom 단위로 모은다
    - 그 밖의 글상자·표 텍스트: 각 Slide 컨테이너 안의 텍스트 원자에서 모은다
    ponytail: Slide 컨테이너를 스트림 순서로 슬라이드 번호에 맞춘다(PersistDirectory 미해석) — '빠른 저장' 파일은 순서·중복이 어긋날 수 있다."""
    import olefile, struct
    if not olefile.isOleFile(path):
        raise RuntimeError('PowerPoint 97 형식이 아님')
    with olefile.OleFileIO(path) as ole:
        if not ole.exists('PowerPoint Document'):
            raise RuntimeError('PowerPoint Document 스트림 없음(PowerPoint 95 이하 또는 암호화)')
        data = ole.openstream('PowerPoint Document').read()

    TEXT_CHARS, TEXT_BYTES = 0x0FA0, 0x0FA8
    outline, boxes = [], []          # outline[i] = 슬라이드 i 자리표시자 텍스트, boxes[k] = Slide 컨테이너 k 텍스트

    def text_of(rtype, body):
        t = body.decode('utf-16-le', 'replace') if rtype == TEXT_CHARS else body.decode('latin-1')
        return t.replace('\r', '\n').replace('\x0b', '\n').strip()

    def walk(start, end, ctx):
        i = start
        while i + 8 <= end:
            ver_inst, rtype, rlen = struct.unpack_from('<HHI', data, i)
            body_start, body_end = i + 8, min(i + 8 + rlen, end)
            if (ver_inst & 0xF) == 0xF:                       # 컨테이너
                if rtype == 0x03F8 or rtype == 0x03F0:          # MainMaster·Notes 는 건너뛴다(서식 문구·노트)
                    pass
                elif rtype == 0x0FF0:                           # SlideListWithText
                    walk(body_start, body_end, 'list' if (ver_inst >> 4) == 0 else 'skip')
                elif rtype == 0x03EE:                           # Slide
                    boxes.append([])
                    walk(body_start, body_end, 'slide')
                else:
                    walk(body_start, body_end, ctx)
            elif ctx == 'list' and rtype == 0x03F3:             # SlidePersistAtom = 다음 슬라이드 시작
                outline.append([])
            elif rtype in (TEXT_CHARS, TEXT_BYTES) and ctx in ('list', 'slide'):
                t = text_of(rtype, data[body_start:body_end])
                if t:
                    (outline[-1] if ctx == 'list' and outline else boxes[-1] if ctx == 'slide' and boxes else []).append(t)
            i = body_start + rlen
        return

    walk(0, len(data), 'top')
    parts = []
    for n in range(max(len(outline), len(boxes))):
        texts = (outline[n] if n < len(outline) else []) + (boxes[n] if n < len(boxes) else [])
        if texts:
            parts.append(f'## 슬라이드 {n + 1}\n\n' + '\n\n'.join(texts))
    return '\n\n'.join(parts)


def pdf_page_needs_ocr(page, raw_text: str) -> bool:
    """이 쪽을 OCR 할지 — 텍스트 추출이 되는 쪽은 텍스트로, 텍스트가 없고 그림이 들어 있는 쪽만 OCR(2026-09-22 사용자 규칙).
    09-18 '그리드 붕괴'(표가 한 줄씩 풀린 쪽) OCR 편입은 이 규칙으로 폐지 — 텍스트가 있으니 텍스트로 둔다.
    extract_pdf 와 _tools/ocr_queue.py 가 같은 판정을 쓴다(목록의 쪽수 = 실제 OCR 쪽수)."""
    core = re.sub(r'[\s\d\-_/|·\.\(\)\[\]]', '', raw_text)   # 숫자·기호·공백을 뺀 본문 글자
    if len(core) >= 35:
        return False
    try:
        if not page.get_images(full=True):
            return False
    except Exception:
        return False
    return not _page_is_blank(page)


def _page_is_blank(page) -> bool:
    """백지 스캔 쪽이면 True — OCR 호출 전에 걸러 비용을 아낀다.
    판정·임계값은 Raw/텍스트 정규화/01_OCR…/04_처리엔진/core/blank_detector.py 의 빠른 모드(1·2단계) 실측값 그대로:
    흰색(>=240) 99.95% 이상 → 백지 / 99.9% 이상이면 Canny 윤곽 밀도 0.05% 미만일 때 백지. 렌더 150dpi(그 도구 기본값)."""
    try:
        import numpy as np, cv2, pymupdf
        pix = page.get_pixmap(dpi=150, colorspace=pymupdf.csGRAY)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, :pix.width]
        white = float((gray >= 240).mean())
        if white >= 0.9995:
            return True
        if white < 0.999:
            return False
        return float((cv2.Canny(gray, 50, 150) > 0).mean()) < 0.0005
    except Exception:
        return False     # 판정 불가면 OCR 대상으로 둔다(누락보다 비용이 낫다)


def extract_pdf(path: str, skip_ai: bool = False) -> str:
    """PDF 텍스트 추출 + 그림/스캔 전용 슬라이드에 대한 Gemini Vision OCR 자동 복원 (NotebookLM 방식)"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    doc_title = os.path.splitext(os.path.basename(path))[0]
    
    use_fitz = False
    try:
        import fitz
        use_fitz = True
    except ImportError:
        pass

    if not use_fitz:
        try:
            import pypdf
            reader = pypdf.PdfReader(path)
            if reader.is_encrypted:
                return "> [!WARNING]\n> 본 PDF 문서는 암호(DRM)로 보호되어 있어 텍스트를 추출할 수 없습니다.\n"
            pages = []
            for i, p in enumerate(reader.pages):
                t = ''
                try:
                    t = p.extract_text() or ''
                except Exception:
                    pass
                if t.strip():
                    pages.append(f"### 페이지 {i+1}\n\n{t.strip()}")
            return '\n\n'.join(pages)
        except Exception as e:
            return f"> [!WARNING]\n> PDF 파일 읽기 실패 (암호화 또는 손상된 파일): {e}\n"

    # PyMuPDF (fitz) 초고속 지능형 파이프라인
    try:
        doc = fitz.open(path)
        if getattr(doc, "is_encrypted", False):
            if not doc.authenticate(""):
                return "> [!WARNING]\n> 본 PDF 문서는 암호(DRM)로 보호되어 있어 텍스트를 추출할 수 없습니다.\n"
    except Exception as e:
        return f"> [!WARNING]\n> PDF 파일 열기 실패 (암호화 또는 손상된 파일): {e}\n"

    total_pages = len(doc)
    page_results = [""] * total_pages
    needs_vision_ocr = []

    # 2026-09-13: 추출 정규화(공백 복원·쪽번호 제거). 순수 기하, AI·비용 0.
    # 이중분포가 아니면 모듈이 스스로 포기하고 원문을 그대로 돌려준다.
    norm_pages = None
    if os.environ.get("PDF_NORMALIZE", "1") != "0":
        try:
            import sys as _sys
            _eng = os.path.dirname(os.path.abspath(__file__))
            if _eng not in _sys.path:
                _sys.path.insert(0, _eng)
            from pdf_normalize import normalize_doc as _nrm
            norm_pages, _nst = _nrm(doc)
            if _nst.get("threshold"):
                print(f"  🔧 [{doc_title}] 공백 복원 임계 {_nst['threshold']} "
                      f"/ 쪽번호 {_nst['dropped_lines']}줄 제거", flush=True)
        except Exception as _e:
            print(f"  ⚠️ 추출 정규화 생략({type(_e).__name__}) — 원문 그대로 진행", flush=True)
            norm_pages = None

    for i, page in enumerate(doc):
        raw_text = ""
        try:
            if norm_pages is not None and i < len(norm_pages):
                raw_text = norm_pages[i] or ""
            else:
                raw_text = page.get_text() or ""
        except Exception:
            pass

        if pdf_page_needs_ocr(page, raw_text):
            needs_vision_ocr.append((i, page, raw_text.strip()))
        elif raw_text.strip():
            page_results[i] = f"### 페이지 {i+1}\n\n{raw_text.strip()}"

    ocr_count = 0
    if not skip_ai and needs_vision_ocr and AI_ROUTER_AVAILABLE and ai_router and hasattr(ai_router, 'ask_gemini_vision'):
        print(f"  📷 [{doc_title}] 총 {total_pages}p 중 {len(needs_vision_ocr)}개 이미지/스캔 페이지 감지 -> Gemini Vision OCR 가동...", flush=True)

        prompt = (
            "당신은 엔터프라이즈 비즈니스 지식 OCR 전문가입니다.\n"
            "제공된 슬라이드/문서 이미지의 모든 텍스트, 제목, 표(마크다운 표 형식 |...|), 다이어그램 흐름, 핵심 수치를 누락 없이 사람이 읽기 편한 구조화된 한국어 마크다운으로 추출하세요.\n"
            "서두 인사나 해설 없이 추출된 마크다운 본문만 출력하세요."
        )

        MAX_VISION_OCR_PAGES = 15
        if len(needs_vision_ocr) > MAX_VISION_OCR_PAGES:
            print(f"  ⚠️ [{doc_title}] 스캔 이미지가 {len(needs_vision_ocr)}개로 대용량이므로 앞부분 {MAX_VISION_OCR_PAGES}장만 정밀 OCR 복원하고 나머지는 보존합니다.", flush=True)
            for skip_idx, _, fb in needs_vision_ocr[MAX_VISION_OCR_PAGES:]:
                if fb:
                    page_results[skip_idx] = f"### 페이지 {skip_idx+1}\n\n{fb}"
                else:
                    page_results[skip_idx] = f"### 페이지 {skip_idx+1}\n\n*(대용량 스캔 페이지 — 속도 최적화 생략)*"
            target_ocr_pages = needs_vision_ocr[:MAX_VISION_OCR_PAGES]
        else:
            target_ocr_pages = needs_vision_ocr

        # 메인 스레드에서 이미지 바이트 사전 렌더링 (fitz 멀티스레드 동시접근 충돌 원천 방지)
        ocr_tasks = []
        for idx, page_obj, fallback_txt in target_ocr_pages:
            try:
                pix = page_obj.get_pixmap(dpi=110)
                img_bytes = pix.tobytes("png")
                if len(img_bytes) >= 1500:
                    ocr_tasks.append((idx, img_bytes, fallback_txt))
                else:
                    if fallback_txt:
                        page_results[idx] = f"### 페이지 {idx+1}\n\n{fallback_txt}"
            except Exception:
                if fallback_txt:
                    page_results[idx] = f"### 페이지 {idx+1}\n\n{fallback_txt}"

        def _process_ocr(task):
            idx, img_bytes, fallback_txt = task
            try:
                ocr_text = ai_router.ask_gemini_vision(img_bytes, prompt=prompt)
                if ocr_text and len(re.sub(r'\s+', '', ocr_text)) > 15:
                    return idx, ocr_text.strip()
            except Exception:
                pass
            return idx, fallback_txt

        # 병렬 비전 OCR (Rate Limit 안전성을 위해 max_workers=4)
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(_process_ocr, t) for t in ocr_tasks]
            for fut in as_completed(futures):
                idx, res_txt = fut.result()
                if res_txt:
                    page_results[idx] = f"### 페이지 {idx+1}\n\n{res_txt}"
                    ocr_count += 1
                    if ocr_count % 5 == 0 or ocr_count == len(ocr_tasks):
                        print(f"    🔍 [Gemini Vision OCR] {ocr_count}/{len(ocr_tasks)}개 이미지 페이지 복원 완료", flush=True)
    else:
        for idx, page_obj, fallback_txt in needs_vision_ocr:
            if fallback_txt:
                page_results[idx] = f"### 페이지 {idx+1}\n\n{fallback_txt}"

    doc.close()
    full_body = '\n\n'.join(p for p in page_results if p.strip())

    # 전체 페이지 종합 AI Executive Summary 자동 생성 (skip_ai=False 일 때만)
    if not skip_ai and full_body.strip() and (ocr_count > 0 or total_pages >= 3):
        exec_summary = generate_ai_summary(full_body, doc_title)
        if exec_summary:
            full_body = exec_summary + "\n\n" + full_body

    return full_body

def read_text_any(path: str) -> str:
    """텍스트 파일을 인코딩을 추정해 읽는다.

    2026-09-11 신설. 종전에는 이 저장소의 두 곳이 텍스트를 UTF-8 로 강제해서 읽고
    errors='replace' 를 걸었다 — `extract_html()`(여기) 와 `_tools/fast_converter.py`.
    cp949 로 저장된 옛 파일이 들어오면 모든 한글 바이트가 U+FFFD 로 '치환되어 저장'된다.
    되돌릴 수 없는 손실이고, 2026-09-10 대량 변환에서 실제로 5,543건이 이렇게 깨졌다
    (실측: `_logs/mojibake_survey_20260911.tsv`. 원본은 전부 온전한 cp949 였다).
    UTF-8 을 먼저 시도하므로 정상 파일의 동작은 종전과 같다.
    """
    with open(path, 'rb') as f:
        b = f.read()
    for enc in ('utf-8-sig', 'utf-8', 'cp949', 'utf-16'):
        try:
            return b.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return b.decode('utf-8', errors='replace')


def extract_html(path: str) -> str:
    import html
    text = read_text_any(path)
    text = re.sub(r'<script[\s\S]*?</script>', '', text, flags=re.I)
    text = re.sub(r'<style[\s\S]*?</style>', '', text, flags=re.I)
    text = re.sub(r'<(h[1-6])[^>]*>(.*?)</\1>', r'\n\n## \2\n\n', text, flags=re.I)
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\n\1\n\n', text, flags=re.I)
    text = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', text, flags=re.I)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text

def generate_ai_summary(text: str, title: str) -> str:
    """PPTX 등 프레젠테이션 텍스트를 분석하여 CEO 보고용 AI Executive Summary & 비즈니스 인사이트 생성
    (노트북LM 소스_프롬프트 벤치마킹: 무손실 팩트/정량데이터, 전문용어, 연결키워드 포함)"""
    if not AI_ROUTER_AVAILABLE or not ai_router:
        return ""
    
    # 텍스트가 너무 짧으면 생성 생략
    cleaned_sample = re.sub(r'\s+', ' ', text).strip()
    if len(cleaned_sample) < 60:
        return ""

    # 2026-09-14: 14,000자 캡을 200,000자로 상향(호출 모델 gemini-3.6-flash는 대용량 컨텍스트를
    # 지원하고, 무료한도는 요청 "건수" 기준이라 요청당 글자 수를 늘려도 한도 소진이 늘지 않는다).
    # char_count 분포상 문서의 95%+가 200,000자 미만이라 이 상향만으로 대다수 문서가 무손실 입력이 된다.
    # 그래도 넘는 초대형 문서(10MB급 등)는 여전히 앞/뒤 분할 + 중략 표시로 방어한다.
    prompt_text = text[:200000] if len(text) <= 200000 else text[:120000] + "\n\n... (중략) ...\n\n" + text[-40000:]
    
    # 1. prompts/pptx_요약_프롬프트.txt 로드 시도
    prompt_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts", "pptx_요약_프롬프트.txt")
    prompt = None
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, "r", encoding="utf-8") as f:
                template = f.read()
            prompt = template.replace("{{source_title}}", title).replace("{{source_text}}", prompt_text)
        except Exception:
            prompt = None

    system = (
        "당신은 엔터프라이즈 비즈니스 전략 컨설턴트이자 CEO 의사결정 보좌관입니다.\n"
        "프레젠테이션(PPTX) 슬라이드 내용에서 핵심 경영진용 보고서 형태의 [AI Executive Summary & 비즈니스 인사이트]를 작성하십시오.\n" \
        "【언어 절대 원칙】 반드시 모든 요약, 상세 설명, 불릿 포인트 내용은 100% 한국어로만 작성해야 합니다. 항목명을 영어로 임의 번역하거나 변경하지 마십시오."
    )

    if not prompt:
        prompt = f"""다음은 파워포인트(PPTX) 문서에서 추출된 내용입니다.
문서 제목: {title}

추출된 슬라이드 내용:
\"\"\"
{prompt_text}
\"\"\"

경영진(CEO/임원)이 문서의 핵심 가치와 비즈니스 추진 방향을 한눈에 파악할 수 있도록 아래 마크다운 형식에 정확히 맞추어 [AI Executive Summary & 비즈니스 인사이트]를 작성해주세요.
【출력 언어 절대 규칙】 반드시 모든 요약, 분석, 불릿 포인트 내용은 100% 한국어로만 작성하십시오. 항목명을 영어로 변경하지 마십시오.\n불필요한 인사말, 사족, 코드블록(```) 없이 오직 아래 인용구(>) 형식 블록만 출력하세요.

> ### 💡 AI Executive Summary & 비즈니스 인사이트
> 📌 **핵심 요약 (Executive Summary):** [이 문서의 핵심 비즈니스 목표와 추진 가치를 1~2문장으로 압축 요약]
>
> 🎯 **추진 배경 및 핵심 과제:**
> - [추진 배경, 당면 문제점 또는 시스템 도입 필요성]
> - [해결해야 할 핵심 병목 또는 개선 요구사항]
>
> 🚀 **핵심 추진 모델 및 실행 체계:**
> - [자동화/디지털화 프로세스, 플랫폼 연계 구조, 단계별 실행 모델]
> - [역할 분담(사용자, 운영사, 연계기관) 및 시스템 인터페이스]
>
> 📊 **핵심 정량 데이터 & 근거 (Key Figures & Metrics):**
> - [슬라이드 내의 수치, 통계, 목표 매출, 처리 건수, 절감액, 일정 등 원본 팩트 100% 보존]
> - [언급된 경우 참여 기관, 시스템명, 관련 법령 등 고유명사 명시]
>
> 💡 **주요 전문 용어 및 비즈니스 개념 (Key Terminology):**
> - **[용어/약어명]**: [해당 업무 영역에서의 정의 및 역할 1문장]
>
> 🔗 **지식위키 연결 키워드 (Canonical Concepts):**
> - **연결 키워드**: [지식위키 태그 및 문서 간 연결에 활용할 업계/학계 표준 단어 3~8개를 쉼표로 구분하여 한 줄로 출력. 예: 구매확인서, 내국신용장, OCR, uTH]
"""

    try:
        # 1순위: gemini 호출 (빠른 응답 속도 및 대용량 텍스트 요약 우수)
        res = ai_router.ask_ai(prompt, system=system, engine="gemini")
        if not res or not res.strip():
            # 2순위: claude 폴백
            res = ai_router.ask_ai(prompt, system=system, engine="claude")
        
        res = res.strip()
        if res.startswith("```"):
            lines = res.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            res = '\n'.join(lines).strip()
            
        # 모든 줄이 > 로 시작하도록 정규화
        norm_lines = []
        for line in res.split('\n'):
            line_str = line.strip()
            if not line_str:
                norm_lines.append(">")
            elif not line_str.startswith(">"):
                norm_lines.append(f"> {line_str}")
            else:
                norm_lines.append(line_str)
        return '\n'.join(norm_lines)
    except Exception as e:
        print(f"    [AI 요약 경고] {e}")
        return ""

def generate_english_learning_guide(text: str, title: str) -> str:
    """영어 학습용 문서를 분석하여 학습자 중심의 [AI 영어 학습 마스터 가이드 & 무손실 핵심 표현] 생성
    (노트북LM 영어학습_소스_프롬프트 벤치마킹: 핵심 표현, 뉘앙스, 발음팁, 실전예문, 스피킹드릴 포함)"""
    if not AI_ROUTER_AVAILABLE or not ai_router:
        return ""

    # 텍스트가 너무 짧으면 생성 생략
    cleaned_sample = re.sub(r'\s+', ' ', text).strip()
    if len(cleaned_sample) < 40:
        return ""

    # 2026-09-14: 14,000자 캡을 200,000자로 상향(호출 모델 gemini-3.6-flash는 대용량 컨텍스트를
    # 지원하고, 무료한도는 요청 "건수" 기준이라 요청당 글자 수를 늘려도 한도 소진이 늘지 않는다).
    # char_count 분포상 문서의 95%+가 200,000자 미만이라 이 상향만으로 대다수 문서가 무손실 입력이 된다.
    # 그래도 넘는 초대형 문서(10MB급 등)는 여전히 앞/뒤 분할 + 중략 표시로 방어한다.
    prompt_text = text[:200000] if len(text) <= 200000 else text[:120000] + "\n\n... (중략) ...\n\n" + text[-40000:]

    # 1. prompts/영어학습_소스_프롬프트.txt 로드 시도
    prompt_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts", "영어학습_소스_프롬프트.txt")
    template = None
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, "r", encoding="utf-8") as f:
                template = f.read()
        except Exception:
            template = None

    system = (
        "당신은 최고급 영어 교육 데이터 아키텍트(English Learning Data Architect)이자 무손실 추출 엔진입니다.\n"
        "제공된 영어 학습 텍스트에서 학습자가 가장 직관적이고 체계적으로 공부할 수 있도록 "
        "[AI 영어 학습 마스터 가이드 & 무손실 핵심 표현]을 마크다운 인용구(>) 형식으로 작성하십시오."
    )

    if template:
        prompt = (
            f"문서 제목: {title}\n\n"
            f"아래 영어 학습 컨텐츠 텍스트를 분석하여, 학습자 관점에서 가장 체계적이고 직관적으로 공부할 수 있도록 "
            f"무손실 핵심 표현, 뉘앙스, 발음 팁, 실전 예문/대화, 스피킹 드릴을 작성해주세요.\n\n"
            f"추출 가이드라인 원칙:\n{template}\n\n"
            f"분석 대상 텍스트:\n\"\"\"\n{prompt_text}\n\"\"\"\n\n"
            f"주의: 불필요한 인사말, 사족, 코드블록(```) 없이 오직 인용구(>) 블록 형태로 [AI 영어 학습 마스터 가이드]를 마크다운으로 출력하세요."
        )
    else:
        prompt = f"""다음은 영어 학습용 문서에서 추출된 내용입니다.
문서 제목: {title}

분석 대상 내용:
\"\"\"
{prompt_text}
\"\"\"

학습자가 직관적이고 체계적으로 스피킹 및 패턴을 훈련할 수 있도록 아래 마크다운 형식에 정확히 맞추어 [AI 영어 학습 마스터 가이드]를 작성해주세요.
【출력 언어 절대 규칙】 반드시 모든 요약, 분석, 불릿 포인트 내용은 100% 한국어로만 작성하십시오. 항목명을 영어로 변경하지 마십시오.\n불필요한 인사말, 사족, 코드블록(```) 없이 오직 아래 인용구(>) 형식 블록만 출력하세요.

> ### 🗣️ AI 영어 학습 마스터 가이드 & 핵심 표현 (English Study Guide)
> 📌 **핵심 요약 (Executive Summary):** [이 소스가 다루는 핵심 영어 회화/문법 테마와 학습 포인트를 1~2문장으로 요약]
>
> 🎯 **주요 학습 테마 & 목표:**
> - [다루는 영역: 예: 일상 회화, 구동사 정복, 감정 표현, 비즈니스 미팅 등]
> - [수준 및 핵심 타겟 표현 수]
>
> 📚 **무손실 핵심 표현 & 패턴 (Core Expressions):**
> - **`[영어 표현/구동사]`** : [한국어 대표 뜻]
>   - 💡 **뉘앙스**: [상황 맥락 및 원어민 실제 어감, 직역과의 차이]
>   - 🔊 **발음 팁**: [연음(Linking), 강세, 축약 발음 포인트]
>   - 📝 **실전 예문**: 🇺🇸 `[영어 예문]` ↳ 🇰🇷 [자연스러운 한국어 번역]
>
> 💬 **실전 대화 스크립트 (Dialogue):**
> > **A**: [영어 대화 문장] (한국어 해석)
> > **B**: [영어 대화 문장] (한국어 해석)
>
> 🎯 **자가 점검 스피킹 챌린지 (Self-Check Drill):**
> 1. [한국어 상황 문장] ➔ ||`[영문 정답]`||
> 2. [한국어 상황 문장] ➔ ||`[영문 정답]`||
>
> 🔗 **지식위키 연결 키워드:**
> - **연결 키워드**: [영어학습 표준 키워드 3~8개를 쉼표로 구분]
"""

    try:
        # 1순위: gemini 호출 (빠르고 긴 영어 텍스트 처리 우수)
        res = ai_router.ask_ai(prompt, system=system, engine="gemini")
        if not res or not res.strip():
            # 2순위: claude 폴백
            res = ai_router.ask_ai(prompt, system=system, engine="claude")

        res = res.strip()
        if res.startswith("```"):
            lines = res.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            res = '\n'.join(lines).strip()

        # 모든 줄이 > 로 시작하도록 정규화
        norm_lines = []
        for line in res.split('\n'):
            line_str = line.strip()
            if not line_str:
                norm_lines.append(">")
            elif not line_str.startswith(">"):
                norm_lines.append(f"> {line_str}")
            else:
                norm_lines.append(line_str)
        return '\n'.join(norm_lines)
    except Exception as e:
        print(f"    [AI 영어 가이드 경고] {e}")
        return ""

def extract_pptx(path: str, skip_ai: bool = False) -> str:
    import zipfile, xml.etree.ElementTree as ET
    ns = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'
    }
    
    slides_md = []
    all_slide_titles = []
    
    with zipfile.ZipFile(path) as z:
        slide_files = [f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
        slide_files.sort(key=lambda x: int(''.join(filter(str.isdigit, os.path.basename(x))) or 0))
        
        for idx, s_path in enumerate(slide_files, 1):
            tree = ET.fromstring(z.read(s_path))
            
            # 1. Slide Title detection
            slide_title = None
            for sp in tree.findall('.//p:sp', ns):
                ph = sp.find('.//p:nvSpPr/p:nvPr/p:ph', ns)
                if ph is not None and ph.get('type') in ('title', 'ctrTitle'):
                    runs = [t.text for t in sp.findall('.//a:t', ns) if t.text]
                    if runs:
                        slide_title = ''.join(runs).strip()
                        break
            
            # 2. Identify paragraphs inside tables to avoid duplication
            tbl_paras = set()
            tables = []
            for tbl in tree.findall('.//a:tbl', ns):
                for p in tbl.findall('.//a:p', ns):
                    tbl_paras.add(p)
                rows = []
                raw_cell_paras = []
                for tr in tbl.findall('.//a:tr', ns):
                    cells = []
                    row_p_lists = []
                    for tc in tr.findall('.//a:tc', ns):
                        p_list = []
                        for p in tc.findall('.//a:p', ns):
                            txt = ''.join(t.text for t in p.findall('.//a:t', ns) if t.text).strip()
                            if txt: p_list.append(txt)
                        c_text = ' '.join(p_list).strip()
                        cells.append(c_text.replace('|', '&#124;').replace('\n', ' '))
                        row_p_lists.append(p_list)
                    if any(cells):
                        rows.append(cells)
                        raw_cell_paras.append(row_p_lists)
                if not rows:
                    continue

                # A. 단일 컬럼(1열) 테이블 처리: 표가 아닌 지능형 배너/구조화 목록으로 변환
                if all(len(r) == 1 for r in rows):
                    items = [r[0].strip() for r in rows if r[0].strip() and r[0].strip() not in ('↓', '→', '▼', '▲', '|')]
                    if len(items) >= 2 and any(ch in ''.join(r[0] for r in rows) for ch in ('↓', '→', '▼', '▲', '➔', '=>')):
                        tables.append('\n> 🔄 **진행 프로세스 로드맵:** ' + ' ➔ '.join(items) + '\n')
                        continue
                    
                    if len(rows) == 1 and raw_cell_paras:
                        cell_p = raw_cell_paras[0][0]
                        if len(cell_p) > 1 or any(re.match(r'^[①-⑨\d\-\*]', p) for p in cell_p):
                            blk = ['\n> 📋 **주요 추진 내용 및 제도 개선안:**']
                            for p_txt in cell_p:
                                if re.match(r'^[①-⑨]', p_txt):
                                    blk.append(f'> \n> **{p_txt}**')
                                elif re.match(r'^(배경|일정|효과|목적|방안)\s*[:：]', p_txt):
                                    blk.append(f'> - **{p_txt}**')
                                else:
                                    blk.append(f'> - {p_txt}')
                            tables.append('\n'.join(blk) + '\n')
                        else:
                            tables.append(f'\n> 💡 **핵심 성과 / 지표:** {cell_p[0]}\n')
                        continue

                    blk = ['\n> 📋 **주요 항목:**']
                    for r in rows:
                        blk.append(f'> - {r[0]}')
                    tables.append('\n'.join(blk) + '\n')
                    continue

                # B. 2열 이상의 진짜 데이터 표: 완벽한 마크다운 테이블 (전후 빈 줄 보장)
                max_c = max(len(r) for r in rows)
                tbl_md = ['| ' + ' | '.join(r + [''] * (max_c - len(r))) + ' |' for r in rows]
                tbl_md.insert(1, '| ' + ' | '.join(['---'] * max_c) + ' |')
                tables.append('\n\n' + '\n'.join(tbl_md) + '\n\n')

            # 3. Normal text shapes (with coordinates for 2-column detection)
            shapes_data = []
            for sp in tree.findall('.//p:sp', ns):
                ph = sp.find('.//p:nvSpPr/p:nvPr/p:ph', ns)
                if ph is not None and ph.get('type') in ('title', 'ctrTitle'):
                    continue
                xfrm = sp.find('.//p:spPr/a:xfrm/a:off', ns)
                x = int(xfrm.get('x', 0)) if xfrm is not None else 0
                y = int(xfrm.get('y', 0)) if xfrm is not None else 0
                
                sp_paras = []
                for p in sp.findall('.//a:p', ns):
                    if p in tbl_paras:
                        continue
                    runs = [t.text for t in p.findall('.//a:t', ns) if t.text]
                    if not runs:
                        continue
                    line = ''.join(runs).strip()
                    if not line or line == slide_title or re.match(r'^-\s*\d+\s*-$', line):
                        continue
                    sp_paras.append(line)
                if sp_paras:
                    shapes_data.append((x, y, sp_paras))

            # 3-1. 좌우 2단 비교 배치(문제점 vs 개선방향 등) 감지
            xs = [s[0] for s in shapes_data if s[0] > 0]
            two_col_table = None
            if len(xs) >= 4 and (max(xs) - min(xs)) > 2500000:
                mid = (min(xs) + max(xs)) / 2
                left_shapes = sorted([s for s in shapes_data if s[0] < mid], key=lambda s: s[1])
                right_shapes = sorted([s for s in shapes_data if s[0] >= mid], key=lambda s: s[1])
                if left_shapes and right_shapes:
                    l_header = left_shapes[0][2][0] if left_shapes[0][2] else "현행 분석"
                    r_header = right_shapes[0][2][0] if right_shapes[0][2] else "개선 방향"
                    l_items = [p for s in left_shapes[1:] for p in s[2]]
                    r_items = [p for s in right_shapes[1:] for p in s[2]]
                    if l_items and r_items:
                        max_len = max(len(l_items), len(r_items))
                        cmp_rows = [f"| ⚠️ **{l_header}** | 💡 **{r_header}** |", "| --- | --- |"]
                        for i in range(max_len):
                            l_val = l_items[i] if i < len(l_items) else ""
                            r_val = r_items[i] if i < len(r_items) else ""
                            cmp_rows.append(f"| {l_val.replace('|', '&#124;')} | {r_val.replace('|', '&#124;')} |")
                        two_col_table = "\n\n" + "\n".join(cmp_rows) + "\n\n"
                        shapes_data = []

            # 3-2. 일반 단락 (y좌표 순 정렬)
            paras = []
            if shapes_data:
                shapes_data.sort(key=lambda s: s[1])
                for x, y, sp_paras in shapes_data:
                    for line in sp_paras:
                        if line in ('↓', '→', '=>', '▲', '▼'):
                            paras.append(f'  {line}')
                        elif re.match(r'^[\(<\d①-⑨●■◆▶\-]', line):
                            paras.append(f'- **{line}**' if line.startswith(('(', '<')) else f'- {line}')
                        else:
                            paras.append(f'- {line}')

            dedup = []
            for p in paras:
                if not dedup or dedup[-1] != p:
                    if p.strip() == '↓' and dedup and dedup[-1].strip() == '↓':
                        continue
                    dedup.append(p)

            header = f'### 📑 슬라이드 {idx}' + (f': {slide_title}' if slide_title else '') + '\n\n'
            body = '\n'.join(dedup) if dedup else ''
            if two_col_table:
                body += ('\n\n' if body else '') + two_col_table
            if tables:
                body += ('\n\n' if body else '') + '\n'.join(tables)
                
            # 4. Speaker Notes
            notes_file = f'ppt/notesSlides/notesSlide{idx}.xml'
            if notes_file in z.namelist():
                n_tree = ET.fromstring(z.read(notes_file))
                n_runs = [t.text for t in n_tree.findall('.//a:t', ns) if t.text]
                notes_text = ''.join(n_runs).strip()
                notes_text = re.sub(r'^\d+\s*', '', notes_text).strip()
                if notes_text:
                    body += f'\n\n> 💡 **슬라이드 해설/발표자 노트:**\n> {notes_text}\n'

            # 5. 슬라이드 텍스트 부족 시(그림/캡처형 슬라이드): 내부 이미지 Gemini Vision OCR 자동 복원 (skip_ai=False 일 때만)
            core_slide_chars = re.sub(r'[\s\d\-_/|·\.\(\)\[\]]', '', body)
            if not skip_ai and len(core_slide_chars) < 35 and AI_ROUTER_AVAILABLE and ai_router and hasattr(ai_router, 'ask_gemini_vision'):
                s_base = os.path.basename(s_path)
                s_rels_file = f'ppt/slides/_rels/{s_base}.rels'
                if s_rels_file in z.namelist():
                    try:
                        r_tree = ET.fromstring(z.read(s_rels_file))
                        r_ns = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
                        for rel in r_tree.findall('.//r:Relationship', r_ns):
                            target = rel.get('Target', '')
                            if '/image' in rel.get('Type', '') or target.lower().endswith(('.png', '.jpg', '.jpeg')):
                                clean_tgt = target.lstrip('../')
                                if not clean_tgt.startswith('ppt/'):
                                    clean_tgt = 'ppt/' + clean_tgt
                                if clean_tgt in z.namelist():
                                    img_b = z.read(clean_tgt)
                                    if len(img_b) >= 3000:
                                        ocr_res = ai_router.ask_gemini_vision(img_b)
                                        if ocr_res and len(re.sub(r'\s+', '', ocr_res)) > 15:
                                            body += ('\n\n' if body else '') + ocr_res
                                            break
                    except Exception:
                        pass
                    
            slides_md.append(header + body)
            if slide_title:
                all_slide_titles.append(f"슬라이드 {idx}: {slide_title}")
                
    overview = []
    
    # 5. AI Executive Summary & 비즈니스 인사이트 생성
    stem_title = os.path.splitext(os.path.basename(path))[0]
    slide_content_full = "\n\n".join(slides_md)
    if not skip_ai and AI_ROUTER_AVAILABLE and len(slide_content_full.strip()) > 50:
        try:
            print(f"  [AI Executive Summary 생성 중...] {stem_title}")
            ai_sum = generate_ai_summary(slide_content_full, stem_title)
            if ai_sum and ai_sum.strip():
                overview.append(ai_sum.strip())
        except Exception as e:
            print(f"  [AI 요약 경고] {stem_title}: {e}")
    elif skip_ai and len(slide_content_full.strip()) > 50:
        # 고속 모드: 슬라이드 제목 및 앞부분 텍스트 기반 지능형 즉시 요약 (0.001초 소요)
        first_slide_text = ""
        if slides_md:
            first_slide_text = re.sub(r'###\s*📑[^\n]*\n*', '', slides_md[0]).strip()
            first_slide_text = re.sub(r'[\r\n]+', ' ', first_slide_text)[:180]
        overview.append(
            f"> ### 💡 AI Executive Summary\n"
            f"> 📌 **핵심 요약:** {stem_title} — {first_slide_text or '문서 본문 참조'}\n"
        )

    if all_slide_titles:
        overview.append("> 🗂️ **주요 슬라이드 목차 구성:**\n" + "\n".join(f"> - {t}" for t in all_slide_titles) + "\n")
        
    return "\n\n---\n\n".join(overview + slides_md)

def extract_xlsx(path: str) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        if not rows or not any(any(c is not None for c in r) for r in rows):
            continue
        lines = [f"### 시트: {sheet_name}\n"]
        header_done = False
        for row in rows:
            if not any(c is not None for c in row):
                continue
            cells = [str(c).replace('\n', ' ').replace('|', '&#124;').strip() if c is not None else "" for c in row]
            while cells and cells[-1] == "":
                cells.pop()
            if not cells:
                continue
            lines.append("| " + " | ".join(cells) + " |")
            if not header_done:
                lines.append("| " + " | ".join(["---"] * len(cells)) + " |")
                header_done = True
        if header_done:
            sheets.append("\n".join(lines))
    return "\n\n".join(sheets)

def extract_xlsx_raw(path: str) -> str:
    """openpyxl 실패 시 폴백: xlsx zip 내부 XML을 직접 읽어 표로 만든다.
    (일부 파일은 손상된 명명 스타일 때문에 openpyxl 이 TypeError 로 죽는다)"""
    import zipfile, xml.etree.ElementTree as ET
    NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        # 공유 문자열
        shared = []
        if 'xl/sharedStrings.xml' in names:
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.iter(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        # 시트명 ↔ 파일 매핑
        sheet_files = []
        try:
            wb = ET.fromstring(z.read('xl/workbook.xml'))
            rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            rid2tgt = {r.get('Id'): r.get('Target') for r in rels}
            for sh in wb.iter(NS + 'sheet'):
                tgt = rid2tgt.get(sh.get(RNS + 'id'), '')
                tgt = tgt.lstrip('/')
                if not tgt.startswith('xl/'):
                    tgt = 'xl/' + tgt
                if tgt in names:
                    sheet_files.append((sh.get('name') or 'Sheet', tgt))
        except Exception:
            sheet_files = [(f.split('/')[-1], f) for f in names
                           if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]

        def col_idx(ref):
            m = re.match(r'([A-Z]+)', ref or '')
            if not m:
                return 0
            n = 0
            for ch in m.group(1):
                n = n * 26 + (ord(ch) - 64)
            return n - 1

        sheets = []
        for sname, sfile in sheet_files:
            root = ET.fromstring(z.read(sfile))
            lines, header_done = [f"### 시트: {sname}\n"], False
            for row in root.iter(NS + 'row'):
                cells, maxi = {}, -1
                for c in row.iter(NS + 'c'):
                    v = c.find(NS + 'v')
                    if c.get('t') == 'inlineStr':
                        isel = c.find(NS + 'is')
                        txt = ''.join(t.text or '' for t in isel.iter(NS + 't')) if isel is not None else ''
                    elif v is None:
                        txt = ''
                    elif c.get('t') == 's':
                        try:
                            txt = shared[int(v.text)]
                        except Exception:
                            txt = ''
                    else:
                        txt = v.text or ''
                    txt = txt.replace('\n', ' ').replace('|', '&#124;').strip()
                    i = col_idx(c.get('r'))
                    cells[i] = txt
                    if txt:
                        maxi = max(maxi, i)
                if maxi < 0:
                    continue
                vals = [cells.get(i, '') for i in range(maxi + 1)]
                lines.append("| " + " | ".join(vals) + " |")
                if not header_done:
                    lines.append("| " + " | ".join(["---"] * len(vals)) + " |")
                    header_done = True
            if header_done:
                sheets.append("\n".join(lines))
    return "\n\n".join(sheets)


# 레거시 오피스 → 파일형식변환기/md_convert.py 엔진으로 직접 변환 (2026-09-22).
# 종전 convert_legacy.py 는 원본 옆에 .docx 등 사본을 만들었다 — 외부소스 정션이면 사용자 원본 폴더에 쌓였다.
# 값은 예전 방식이 만든 형제 사본의 확장자: 그 사본이 있으면 이미 정본화된 것이므로 레거시 쪽은 건너뛴다.
LEGACY_DIRECT = {'.doc': '.docx', '.rtf': None, '.hwp': '.hwpx', '.ppt': '.pptx', '.xls': '.xlsx'}
_LEGACY_SES = None


def _legacy_session():
    """COM 개체는 만든 스레드에서만 쓰고 닫을 수 있다 → 레거시 파일은 main() 의 메인 스레드 순차 구간에서만 변환한다."""
    global _LEGACY_SES
    if _LEGACY_SES is None:
        d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '파일형식변환기')
        if d not in sys.path:
            sys.path.insert(0, d)
        import md_convert
        _LEGACY_SES = md_convert.Session()
    return _LEGACY_SES


def close_legacy_session():
    global _LEGACY_SES
    if _LEGACY_SES is not None:
        _LEGACY_SES.close()   # Office 인스턴스 종료 + %TEMP% 중간파일 폴더 삭제
        _LEGACY_SES = None


def convert_to_md(path: str, skip_ai: bool = False) -> str | None:
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.md', '.markdown', '.txt'):
        return read_text_any(path)  # 2026-09-11: UTF-8 강제 → 인코딩 추정 (cp949 소실 방지)

    if ext in LEGACY_DIRECT:
        try:
            if ext == '.hwp':
                # 한글 COM 은 보안창(자체 UI 버튼 — 자동 클릭 불가)에서 무인 배치가 멈춘다(2026-09-22 실측).
                # md_convert.conv_hwp(HTML 저장)는 글상자 본문도 놓친다 → HWP 5.0 본문을 직접 읽는다.
                md = extract_hwp5(path)
            elif ext == '.ppt':
                md = extract_ppt97(path)   # PowerPoint COM 은 손상 파일에서 확인창으로 멈춘다
            else:
                ses = _legacy_session()
                import md_convert
                from pathlib import Path
                # COM 앱은 제 작업폴더 기준으로 상대경로를 푼다 — 배치가 넘기는 'sources\…' 를 못 찾는다(09-22 실측 22건 실패)
                md = md_convert.tidy(md_convert.ENGINES[ext](Path(os.path.abspath(path)), ses))
        except Exception as e:
            print(f"  [레거시 변환 실패] {os.path.basename(path)}: {e}", flush=True)
            return None
        return md if md.strip() else None   # 빈 결과(스캔본 등)를 성공으로 세지 않는다
    
    # 0. XLSX (openpyxl → 원시 XML 폴백)
    if ext == '.xlsx':
        try:
            return extract_xlsx(path)
        except Exception:
            pass
        try:
            t = extract_xlsx_raw(path)
            if t.strip():
                return t
        except Exception:
            pass
    
    # 1. DOCX
    if ext == '.docx':
        try:
            return extract_docx(path, skip_ai=skip_ai)
        except Exception:
            pass

    # 2. HWPX
    if ext == '.hwpx':
        try:
            return extract_hwpx(path, skip_ai=skip_ai)
        except Exception:
            pass

    # 3. PPTX
    if ext == '.pptx':
        try:
            return extract_pptx(path, skip_ai=skip_ai)
        except Exception:
            pass

    # 4. PDF & EPUB (PyMuPDF 지능형 파이프라인)
    if ext in ('.pdf', '.epub'):
        try:
            return extract_pdf(path, skip_ai=skip_ai)
        except Exception:
            pass

    # 5. HTML
    if ext in ('.html', '.htm'):
        try:
            return extract_html(path)
        except Exception:
            pass

    # Fallback to markitdown or pandoc if available
    if shutil.which('markitdown'):
        r = subprocess.run(['markitdown', path], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout
    if shutil.which('pandoc'):
        return subprocess.run(['pandoc', path, '-t', 'gfm'],
                              capture_output=True, text=True,
                              encoding='utf-8', errors='replace').stdout

    return None

SCOPED_RUN = False   # --only 실행 여부. claim_out_name 의 디스크 소유자 확인을 켠다.


def claim_out_name(out_dir, stem, src_path, claimed, report):
    """출력 파일명 충돌 회피.
    같은 stem 을 먼저 차지한 파일은 기존 이름을 그대로 유지하고(기존 위키 링크 보호),
    뒤에 오는 동명 파일만 '__상위폴더명' 접미사를 붙여 별도 파일로 저장한다."""
    owner = claimed.get(stem)
    if owner is None and SCOPED_RUN:
        # 하위폴더 한정 실행(--only)에서는 claimed 가 이 폴더 것만 알므로, 디스크의 기존 정본이
        # 다른 소스 것인지 frontmatter 로 확인한다. 안 하면 다른 소스의 stem.md 를 덮어쓴다(함정 #21).
        existing = os.path.join(out_dir, stem + '.md')
        if os.path.exists(existing):
            try:
                head = open(existing, encoding='utf-8', errors='replace').read(3000)
                m = re.search(r'^source_path:\s*"?(.*?)"?\s*$', head, re.M) or re.search(r'^source:\s*"?(.*?)"?\s*$', head, re.M)
                prev = (m.group(1).strip() if m else '').replace('\\', '/')
                # src_path 는 절대경로로 들어온다. 기존 정본의 source_path 는 --in 기준 상대경로이므로
                # '절대경로가 그 상대경로로 끝나는가'로 동일 원본 여부를 판정한다.
                src_norm = os.path.abspath(src_path).replace('\\', '/')
                same = (not prev) or prev == os.path.basename(src_path) or src_norm.endswith('/' + prev.lstrip('/'))
                if not same:
                    owner = prev
            except Exception:
                pass
    if owner is None or owner == src_path:
        claimed[stem] = src_path
        return os.path.join(out_dir, stem + '.md')
    parent = os.path.basename(os.path.dirname(os.path.abspath(src_path))) or 'root'
    parent = re.sub(r'[\\/:*?"<>|]', '_', parent).strip() or 'root'
    cand, n = f'{stem}__{parent}', 2
    while claimed.get(cand) not in (None, src_path):
        cand = f'{stem}__{parent}_{n}'
        n += 1
    claimed[cand] = src_path
    report['renamed'].append({'stem': stem, 'as': cand, 'src': src_path, 'conflict_with': owner})
    return os.path.join(out_dir, cand + '.md')


def process_file(path, out_dir, force, run_date, report, claimed=None, base=None, skip_ai=False, lock=None):
    name = os.path.basename(path)
    stem = os.path.splitext(name)[0]
    if claimed is None:
        out_path = os.path.join(out_dir, stem + '.md')
    else:
        if lock:
            with lock:
                out_path = claim_out_name(out_dir, stem, path, claimed, report)
        else:
            out_path = claim_out_name(out_dir, stem, path, claimed, report)

    # 증분 최적화: force=False 이고 이미 out_path에 정상 정본이 존재하며 원본보다 최신이면 즉시 스킵
    if not force and os.path.exists(out_path):
        try:
            if os.path.getmtime(out_path) >= os.path.getmtime(path) - 1:
                with open(out_path, 'r', encoding='utf-8', errors='ignore') as f_chk:
                    head = f_chk.read(50)
                    if head.startswith('---'):
                        if lock:
                            with lock:
                                report['already_fm'].append(name)
                        else:
                            report['already_fm'].append(name)
                        return
        except Exception:
            pass

    text = convert_to_md(path, skip_ai=skip_ai)
    if text is None:
        if lock:
            with lock:
                report['skipped_noconv'].append(name)
        else:
            report['skipped_noconv'].append(name)
        return
    if not force and text.lstrip().startswith('---'):
        if lock:
            with lock:
                report['already_fm'].append(name)
        else:
            report['already_fm'].append(name)
    meta = parse_meta_block(text)
    if not meta.get('title'):
        meta['title'] = first_h1(text) or stem

    # 영어 학습 컨텐츠 자동 감지
    is_eng = is_english_content(path, text, meta['title'])

    # 영어 학습 컨텐츠인 경우: AI 마스터 가이드 생성 및 본문 최상단 주입 (skip_ai=False 일 때만)
    if not skip_ai and is_eng and AI_ROUTER_AVAILABLE and ai_router and len(re.sub(r'\s+', '', text)) >= 60:
        # 이미 노트북LM 영어학습 분석본이거나 AI 가이드가 포함되어 있는지 확인
        has_existing_guide = any(k in text for k in (
            "AI 영어 학습 마스터 가이드", "영어학습_소스_프롬프트", "상세 분석 (영어학습_소스_프롬프트",
            "## 📚 무손실 핵심 표현", "## 🎯 학습 개요", "## 📋 상세 분석 (소스_프롬프트"
        ))
        if not has_existing_guide:
            print(f"  [AI 영어학습 마스터 가이드 생성 중...] {meta['title']}")
            try:
                eng_guide = generate_english_learning_guide(text, meta['title'])
                if eng_guide and eng_guide.strip():
                    text = eng_guide.strip() + "\n\n---\n\n" + text
            except Exception as e:
                print(f"  [AI 영어학습 가이드 생성 경고] {meta['title']}: {e}")

    tags = build_tags(meta, text, is_eng=is_eng)
    summary = one_line_summary(text)
    if not summary:
        for line in text.splitlines():
            s = strip_cite(line.strip(' \t\r\n#->*•○-'))
            core = re.sub(r'[\s\d\-_/|·\.\(\)]', '', s)
            if len(core) >= 25 and not any(s.lower().startswith(k) for k in ('http', 'copyright', 'all rights', '페이지', '시트:')):
                summary = s[:220]
                break
    created = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
    try:
        src_path = os.path.relpath(path, base).replace('\\', '/') if base else name
    except Exception:
        src_path = name
    folder_ctx = infer_folder_context(src_path, is_eng=is_eng)
    decision_meta = infer_decision_meta(name, text, created)
    fm = make_frontmatter(meta, tags, created, run_date, name, summary, src_path, folder_ctx, decision_meta, is_eng=is_eng)

    # 품질우선원칙: 이미 정본이 있고 --force 가 아니면, mtime 이 아니라 품질로 덮어쓸지 판단한다.
    #  ① 새 본문이 미완성 표식을 달고 있는데 기존 정본은 아니다 → 퇴행, 덮어쓰지 않는다.
    #  ② 미완성 표식이 둘 다 없는데 새 본문이 기존의 절반 미만으로 줄었다 → 축소 퇴행, 덮어쓰지 않는다.
    #  기존 정본 자체가 이미 미완성/축소 상태였다면(개선 시도이므로) 막지 않는다.
    # 품질우선원칙(신규 파일): 정본이 없으면 비교 대상이 없어 종전엔 무조건 통과했다.
    #  09-19 일일영어회화 18건이 이 경로로 들어왔다(격리목록의 wiki_md정본존재=False).
    #  크기 비율 가드로는 못 잡는다 - 비교할 기존 파일이 아예 없기 때문이다.
    if not force and not os.path.exists(out_path) and SRC_INCOMPLETE_MARK in text:
        reason = '미완성표식(신규 - 비교할 정본 없음)'
        if lock:
            with lock:
                report.setdefault('quality_skip', []).append({'file': name, 'reason': reason})
        else:
            report.setdefault('quality_skip', []).append({'file': name, 'reason': reason})
        return

    if not force and os.path.exists(out_path):
        try:
            with open(out_path, 'r', encoding='utf-8', errors='ignore') as f_old:
                old_full = f_old.read()
            old_body = _strip_fm_body(old_full)
            new_incomplete = SRC_INCOMPLETE_MARK in text
            old_incomplete = SRC_INCOMPLETE_MARK in old_body
            new_len, old_len = len(text.strip()), len(old_body.strip())
            regressed = (not old_incomplete) and (
                (new_incomplete) or (old_len > 0 and new_len < old_len * QUALITY_MIN_RATIO)
            )
            if regressed:
                reason = '미완성표식' if new_incomplete else f'본문축소({old_len}->{new_len}자)'
                if lock:
                    with lock:
                        report.setdefault('quality_skip', []).append({'file': name, 'reason': reason})
                else:
                    report.setdefault('quality_skip', []).append({'file': name, 'reason': reason})
                return
        except Exception:
            pass

    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(fm + text.strip() + '\n')
    entry = {'file': name, 'tags': tags, 'title': meta['title']}
    if lock:
        with lock:
            report['ok'].append(entry)
    else:
        report['ok'].append(entry)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in',  dest='indir',  required=True)
    ap.add_argument('--out', dest='outdir', required=True)
    ap.add_argument('--file', dest='target_file', default=None, help='특정 단일 원본 파일만 지정하여 변환 및 덮어쓰기')
    ap.add_argument('--recurse', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--skip-ai', action='store_true', help='Ollama/Gemini AI 요약 및 Vision OCR 생략하고 초고속 휴리스틱 변환 모드 적용')
    ap.add_argument('--workers', type=int, default=4, help='멀티스레드 병렬 변환 작업자 수 (기본: 4)')
    ap.add_argument('--only', dest='only_sub', default=None,
                    help='--in 아래 이 하위폴더만 처리(예: 전자문서분석). --in 자체는 그대로 두므로 카테고리 자동판정·source_path 가 전량 실행과 동일하다')
    a = ap.parse_args()
    run_date = datetime.date.today().isoformat()
    report = {'ok': [], 'already_fm': [], 'skipped_noconv': [], 'renamed': [], 'legacy_sibling_skip': []}
    SUPPORT = ('.md', '.markdown', '.txt', '.html', '.htm', '.pdf', '.docx', '.hwpx', '.pptx', '.xlsx', '.epub', '.rtf', '.odt',
               '.doc', '.hwp', '.ppt', '.xls')

    def _has_sibling(p, ext):
        # 예전 convert_legacy 가 만든 형제 사본(.doc 옆 .docx)이 있으면 레거시 쪽은 건너뛴다.
        # 둘 다 변환하면 뒤에 오는 쪽이 'stem__폴더.md' 중복 정본이 된다(함정 #21).
        sib = LEGACY_DIRECT.get(ext)
        return bool(sib) and os.path.exists(os.path.splitext(p)[0] + sib)
    SKIP_DIRS = {'.svn', '.git', 'node_modules', '__pycache__', 'venv', '.venv', 'target', 'build', 'BinData', 'wiki_portal', 'wiki_md', '_tools'}
    files = []
    abs_out = os.path.abspath(a.outdir)

    if a.target_file:
        raw_target = a.target_file.strip(' \t\r\n\'"')
        candidates = [
            os.path.abspath(raw_target),
            os.path.join(a.indir, raw_target),
            raw_target,
        ]
        # sources/ 접두사가 중복된 경우 방지
        clean_name = re.sub(r'^[sS]ources[\\/]', '', raw_target)
        candidates.append(os.path.join(a.indir, clean_name))

        tf = None
        for c in candidates:
            if os.path.isfile(c):
                tf = c
                break

        if not tf:
            # 파일명만 추출하여 indir 하위 재귀 검색
            base_target = os.path.basename(raw_target)
            for r, dirs, fs in os.walk(a.indir):
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in SKIP_DIRS]
                if base_target in fs:
                    tf = os.path.join(r, base_target)
                    break

        if tf and os.path.isfile(tf):
            files = [tf]
            print(f"🎯 단일 파일 변환 모드: {os.path.basename(tf)} (덮어쓰기: {a.force}, 고속모드: {a.skip_ai})")
        else:
            print(f"⚠️ 대상 파일을 찾을 수 없습니다: {a.target_file}")
            return
    elif a.recurse:
        # --only: 탐색 시작점만 하위폴더로 좁힌다. base(a.indir)는 유지되어 relpath 가 전량 실행과 같다.
        #   (--in 을 하위폴더로 바꾸면 infer_folder_context 의 parts[0] 이 달라져 카테고리가 전부 '일반'으로 떨어진다 — 2026-09-13 실측)
        walk_root = a.indir
        if a.only_sub:
            walk_root = os.path.join(a.indir, a.only_sub.strip(' \t\r\n\'"\\/'))
            if not os.path.isdir(walk_root):
                print(f"⚠️ --only 대상 폴더가 없습니다: {walk_root}")
                return
            print(f"🎯 하위폴더 한정 모드: {os.path.relpath(walk_root, a.indir)}")
            global SCOPED_RUN
            SCOPED_RUN = True
        # dirs/files 를 정렬해 실행마다 같은 순서를 보장(충돌 시 '먼저 차지하는 파일'이 고정됨)
        for r, dirs, fs in os.walk(walk_root):
            # 출력 폴더, 특수/가상환경 폴더는 재귀 탐색에서 제외
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in SKIP_DIRS and os.path.abspath(os.path.join(r, d)) != abs_out]
            dirs.sort()
            for fn in sorted(fs):
                if fn.startswith('.'):
                    continue
                p = os.path.join(r, fn)
                ext = os.path.splitext(fn)[1].lower()
                if _has_sibling(p, ext):
                    report['legacy_sibling_skip'].append(os.path.relpath(p, a.indir))
                    continue
                if ext in SUPPORT:
                    files.append(p)
    else:
        for fn in sorted(os.listdir(a.indir)):
            if fn.startswith('.'):
                continue
            p = os.path.join(a.indir, fn)
            if not os.path.isfile(p):
                continue
            ext = os.path.splitext(fn)[1].lower()
            if _has_sibling(p, ext):
                report['legacy_sibling_skip'].append(fn)
                continue
            if ext in SUPPORT:
                files.append(p)

    claimed = {}
    total_files = len(files)
    done_count = 0
    lock = threading.Lock()

    def _worker_fn(p):
        nonlocal done_count
        try:
            process_file(p, a.outdir, a.force, run_date, report, claimed, a.indir, skip_ai=a.skip_ai, lock=lock)
        except Exception as e:
            with lock:
                report['skipped_noconv'].append(f"{os.path.basename(p)} (ERROR: {e})")
        with lock:
            done_count += 1
            if done_count % 25 == 0 or done_count == total_files:
                pct = round((done_count / total_files) * 100, 1) if total_files else 100
                print(f"  ⚡ [{done_count}/{total_files}] ({pct}%) 변환 진행 중...", flush=True)

    # 레거시(COM) 파일은 병렬 구간에서 빼 메인 스레드에서 Session 하나로 순차 변환한다.
    legacy = [p for p in files if os.path.splitext(p)[1].lower() in LEGACY_DIRECT]
    modern = [p for p in files if os.path.splitext(p)[1].lower() not in LEGACY_DIRECT]
    workers = max(1, a.workers)
    if workers > 1 and len(modern) > 1:
        from concurrent.futures import ThreadPoolExecutor
        print(f"🚀 멀티스레드 병렬 변환 가동 (스레드 {workers}개, 대상: {len(modern)}건, 고속모드: {a.skip_ai})...", flush=True)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(_worker_fn, modern))
    else:
        for p in modern:
            _worker_fn(p)
    if legacy:
        print(f"📎 레거시 오피스 직접 변환 {len(legacy)}건(순차, 원본 옆 사본 없음)...", flush=True)
        try:
            for p in legacy:
                _worker_fn(p)
        finally:
            close_legacy_session()

    # 리포트
    q_skip = report.get('quality_skip', [])
    print(f"변환 완료: {len(report['ok'])}건  |  기존 정본 유지: {len(report['already_fm'])}건  |  변환도구없음/오류: {len(report['skipped_noconv'])}건"
          f"  |  이름충돌 분리저장: {len(report['renamed'])}건  |  품질퇴행 거부: {len(q_skip)}건")
    if q_skip:
        print(f"[품질우선원칙] 정본보다 나쁜 재분석 {len(q_skip)}건 덮어쓰기 거부(상세는 _conversion_report.json의 quality_skip):")
        for item in q_skip[:10]:
            print(f"   - {item['file']} ({item['reason']})")
        if len(q_skip) > 10:
            print(f"   ... 외 {len(q_skip) - 10}건")
    if report['legacy_sibling_skip']:
        print(f"[안내] 레거시 {len(report['legacy_sibling_skip'])}건은 옆에 변환 사본(.docx 등)이 있어 사본 쪽으로 정본화 — 목록은 리포트의 legacy_sibling_skip")
    with open(os.path.join(a.outdir, '_conversion_report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"리포트: {os.path.join(a.outdir, '_conversion_report.json')}")

if __name__ == '__main__':
    main()
