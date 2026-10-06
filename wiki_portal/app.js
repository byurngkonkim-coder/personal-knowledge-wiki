/**
 * OKF Wiki Portal - Knowledge Hub, Ingestion, AI Q&A, Reading History, Decision Evolution & Source Coverage Hub
 * Supports Multi-AI Q&A, Background Parallel Source Sync, Chronological Decision Lineage, and State Restoration
 */

document.addEventListener('DOMContentLoaded', () => {
  // Map for O(1) doc lookup
  const docMap = new Map();
  const rawData = window.OKF_WIKI_DATA || window.WIKI_DATA || { documents: [], categories: [], graph_edges: [], evolution_tracks: [] };
  if (!rawData.documents) rawData.documents = [];
  if (!rawData.categories) rawData.categories = [];
  if (rawData.total_docs === undefined) rawData.total_docs = rawData.documents.length;
  if (rawData.total_relations === undefined) rawData.total_relations = (rawData.graph_edges || []).length;
  rawData.documents.forEach(d => docMap.set(d.id, d));

  // Initialize state
  const defaultTabs = [{ id: 'dashboard', title: '홈 대시보드', hash: '#/', icon: 'home', closable: false }];
  const savedTabs = JSON.parse(localStorage.getItem('okf_open_tabs') || 'null');

  const state = {
    data: rawData,
    currentDoc: null,
    currentCategory: 'all',
    currentTag: null,
    currentView: 'dashboard',
    readerMode: 'single', // 'single', 'split'
    readerStyle: localStorage.getItem('okf_reader_style') || 'wiki', // 'wiki' (기본 본문형), 'guide' (Claude 학습 가이드 카드형)
    graphFocusId: null,
    searchQuery: '',
    typeFilter: 'all',
    sortOrder: 'newest',  // 2026-09-18: 기본 정렬을 생성일 내림차순으로(최근 문서 상위 노출)
    viewMode: 'grid',
    tabs: savedTabs && savedTabs.length > 0 ? savedTabs : defaultTabs,
    activeTabHash: '#/',
    bookmarks: JSON.parse(localStorage.getItem('okf_bookmarks') || '[]'),
    readHistory: JSON.parse(localStorage.getItem('okf_read_history') || '[]'),
    recentIngested: [],
    qaHistory: [],
    evolutionTracks: rawData.evolution_tracks || [],
    coverageData: {
      sync_status: "idle",
      sources_total: 0,
      canonical_total: rawData.total_docs || 0,
      coverage_pct: 100.0,
      pending_files: [],
      latest_source_file: "",
      days_since_latest: 0,
      stale_status: "fresh"
    },
    aiStatus: { claude: true, gemini: true, perplexity: true, ollama: false },
    darkMode: localStorage.getItem('okf_theme') === 'dark' || 
              (!localStorage.getItem('okf_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  };

  // Init Marked
  if (window.marked) {
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function(code, lang) {
        if (window.hljs && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return code;
      }
    });
  }

  // DOM Elements
  const appContainer = document.getElementById('app-content');
  const tabsListContainer = document.getElementById('tabs-list-container');
  const btnCloseAllTabs = document.getElementById('btn-close-all-tabs');
  const sidebarCategoryList = document.getElementById('sidebar-categories');
  const sidebarRecents = document.getElementById('sidebar-recents');
  const sidebarBookmarks = document.getElementById('sidebar-bookmarks');
  const sidebarIngested = document.getElementById('sidebar-ingested');
  const sidebarQAHistory = document.getElementById('sidebar-qa-history');
  const headerSearchInput = document.getElementById('header-search-input');
  const headerSearchClear = document.getElementById('header-search-clear');

  // 검색 결과 화면의 「💬 빠른 답」 — 같은 검색어로 AI 묻고 답하기를 빠른 답 모드로 실행(09-29)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#center-quick-answer');
    if (!b) return;
    const q = b.getAttribute('data-q') || '';
    window.location.hash = '#/qa';
    setTimeout(() => {
      const inp = document.getElementById('qa-input-query');
      const sel = document.getElementById('qa-engine-select');
      if (!inp || !sel) return;
      inp.value = q;
      sel.value = 'quick';
      document.getElementById('btn-submit-qa').click();
    }, 150);
  });
  const headerSearchKbd = document.getElementById('header-search-kbd');
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const quickSearchBtn = document.getElementById('quick-search-btn');
  const headerCoverageBtn = document.getElementById('header-coverage-btn');
  const headerCoverageText = document.getElementById('header-coverage-text');

  // Document Viewer Popup Modal Elements
  const docPopupModal = document.getElementById('doc-popup-modal');
  const docPopupTitle = document.getElementById('doc-popup-title');
  const docPopupCategory = document.getElementById('doc-popup-category');
  const docPopupType = document.getElementById('doc-popup-type');
  const docPopupIcon = document.getElementById('doc-popup-icon');
  const docPopupOpenTabBtn = document.getElementById('doc-popup-open-tab-btn');
  const docPopupCloseBtn = document.getElementById('doc-popup-close-btn');
  const docPopupDate = document.getElementById('doc-popup-date');
  const docPopupSource = document.getElementById('doc-popup-source');
  const docPopupTags = document.getElementById('doc-popup-tags');
  const docPopupBody = document.getElementById('doc-popup-body');
  const docPopupDocId = document.getElementById('doc-popup-doc-id');

  // Category Icon mapping
  const categoryMeta = {
    '전자무역 & 비즈니스': { icon: 'globe', color: 'blue', desc: '스마트무역원장, uTradeHub, 내국신용장, 구매확인서, EDIFACT' },
    'AI & 테크놀로지': { icon: 'cpu', color: 'purple', desc: 'Antigravity, Claude Code, Graphify, 하네스/루프 엔지니어링, LLM, OCR' },
    '경영 & 전략 기획': { icon: 'trending-up', color: 'emerald', desc: '맥킨지 문제해결, PMBOK, DBR, BPR/ISP 전략 프레임워크' },
    '관세행정 & 컨설팅': { icon: 'landmark', color: 'orange', desc: '관세청 국종망 BPR/ISP·EA 컨설팅 산출물, 통관·물류 현황분석' },
    '글로벌 어학 & 영어': { icon: 'languages', color: 'amber', desc: '실전 영문법, 비즈니스 무역 영어, 패턴 스피킹 트레이닝' },
    '인문·신앙 & 라이프': { icon: 'heart', color: 'pink', desc: '기독교 신학, 구약 Q&A, 인생 지혜/명언, 도수치료, 은퇴설계' },
    '생산성 & 도구': { icon: 'wrench', color: 'cyan', desc: '노션, 옵시디언, 마크다운, 파이썬, 엑셀, 파워토이 활용법' },
    '일반 지식 & 도구': { icon: 'book-open', color: 'slate', desc: '기타 보관 지식 및 다목적 참조 가이드' }
  };

  // 파일명에 '%'(예: "100% 시간 낭비")가 있으면 이미 디코딩된 경로의 재디코딩이 URIError 를 던져
  // renderReader 전체가 죽고 "문서를 찾을 수 없습니다"로 보였다(2026-09-28). 실패 시 원문 그대로 반환.
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  // ── Document Resolver: 파일명, ID, 제목 등으로 docMap 및 state에서 실제 문서 객체 탐색 ──
  function findMatchingDoc(targetPath, targetLabel) {
    if (!targetPath && !targetLabel) return null;
    const cleanPath = safeDecode((targetPath || '').trim().replace(/^file:\/\/\/?/i, ''));
    const cleanLabel = (targetLabel || '').trim();

    if (typeof docMap !== 'undefined') {
      let d = docMap.get(cleanPath) || docMap.get(cleanPath + '.md') || docMap.get(cleanPath.replace(/\.md$/i, ''));
      if (d) return d;
      d = docMap.get(cleanLabel) || docMap.get(cleanLabel + '.md') || docMap.get(cleanLabel.replace(/\.md$/i, ''));
      if (d) return d;
    }

    if (typeof state !== 'undefined' && state.data && state.data.documents) {
      const norm = (s) => (s || '').replace(/\.md$/i, '').replace(/[\s_\-\(\)\[\]\.,!?'"~`:]/g, '').toLowerCase();
      const pNorm = norm(cleanPath);
      const lNorm = norm(cleanLabel);

      for (let d of state.data.documents) {
        const idNorm = norm(d.id);
        const titleNorm = norm(d.title);
        const baseNorm = norm(d.base_name);
        const fileNorm = norm(d.filename);

        if ((pNorm && (idNorm === pNorm || titleNorm === pNorm || baseNorm === pNorm || fileNorm === pNorm)) ||
            (lNorm && (idNorm === lNorm || titleNorm === lNorm || baseNorm === lNorm || fileNorm === lNorm))) {
          return d;
        }
      }

      // 부분 일치 탐색 (길이 6 이상)
      if (pNorm && pNorm.length >= 6) {
        for (let d of state.data.documents) {
          const idNorm = norm(d.id);
          const titleNorm = norm(d.title);
          if ((idNorm && idNorm.includes(pNorm)) || (titleNorm && titleNorm.includes(pNorm))) {
            return d;
          }
        }
      }
      if (lNorm && lNorm.length >= 6) {
        for (let d of state.data.documents) {
          const idNorm = norm(d.id);
          const titleNorm = norm(d.title);
          if ((idNorm && idNorm.includes(lNorm)) || (titleNorm && titleNorm.includes(lNorm))) {
            return d;
          }
        }
      }
    }
    return null;
  }

  // ── Reference Links Normalizer (file:/// 또는 깨진 마크다운 링크 -> 지식위키 내부 원문 링크 변환) ──
  function normalizeReferenceLinks(text) {
    if (!text) return "";
    let content = text;

    // 마크다운 파서가 깨뜨리지 않도록 file:/// 링크 패턴 정규화:
    // 예: - **[[Q&A] 제목](file:///QA_경로.md)** -> - **[📄 [Q&A] 제목](#/doc/인코딩ID)**
    content = content.replace(/(-\s*\*\*)?\[+([^\]\n]+?)\]+\(file:\/\/\/?([^)\n]+)\)(\*\*)?/gi, (match, p1, label, rawPath, p2) => {
      let cleanLabel = label.trim();
      let cleanPath = safeDecode(rawPath.trim().replace(/^file:\/\/\/?/i, ''));
      
      // 라벨에 [Q&A] 등의 대괄호가 잘린 경우 복원
      if (!cleanLabel.startsWith('[') && cleanLabel.includes('Q&A]')) {
        cleanLabel = '[' + cleanLabel;
      }

      let targetDoc = findMatchingDoc(cleanPath, cleanLabel);
      let targetId = targetDoc ? targetDoc.id : cleanPath;

      let prefix = p1 || '';
      let suffix = p2 || '';
      return `${prefix}[📄 ${cleanLabel}](#/doc/${encodeURIComponent(targetId)})${suffix}`;
    });

    return content;
  }

  // ── 본문 인용 마커([1], [1, 2] 등) -> '## 근거 문서' 절의 실제 링크로 연결 (2026-09-18) ──
  // 근거 문서 절이 서버에서 붙인 "- [n] [제목](경로)" 항목을 번호로 찾아, 본문의 동일 번호 인용을
  // 같은 링크로 바꿔치기한다. 이후 marked.parse -> parseWikiLinks 를 그대로 타므로 별도 처리 불필요.
  function linkCitationMarkers(text) {
    if (!text) return text;
    const evMatch = text.match(/^##\s*근거\s*문서\s*$/m);
    if (!evMatch) return text;
    const evIdx = evMatch.index;
    const before = text.slice(0, evIdx);
    const after = text.slice(evIdx);

    const refMap = {};
    const itemRe = /^-\s*\[(\d+)\]\s*(\[[^\]]+\]\([^)]+\))/gm;
    let m;
    while ((m = itemRe.exec(after)) !== null) refMap[m[1]] = m[2];
    if (Object.keys(refMap).length === 0) return text;

    const linkedBefore = before.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (whole, nums) => {
      const parts = nums.split(',').map(s => s.trim());
      if (!parts.some(n => refMap[n])) return whole;  // 매핑 없는 숫자([15] 등 미채택 후보)는 그대로 둔다
      return parts.map(n => refMap[n] ? refMap[n].replace(/^\[[^\]]*\]/, `[${n}]`) : n).join(', ');
    });
    return linkedBefore + after;
  }

  // ── 원문 변환본 문단 재조립 (2026-09-29) ──
  // 외부 소스(hwpx·docx·html·txt 등) 변환본은 시각적 줄마다 빈 줄이 끼어 "하여 / 전자무역네트워크 / 를 …" 처럼
  // 문장 조각이 문단 하나씩으로 그려져 읽을 수 없다. 제목(#) 구간별로 판정해, 한 줄 문단이 대부분인 구간만
  // 문단·목록·소제목으로 다시 묶는다(저장 파일은 그대로, 표시만 바꾼다).
  // 제외: 슬라이드·페이지 구간(pptx/pdf 는 짧은 항목이 원래 형태), 표·코드·인용·이미 목록인 구간.
  // ponytail: 휴리스틱이라 문장 경계 오판 가능 — 정밀 재구성이 필요하면 Gemini 재구성본(_재구성.md)을 만들 것.
  const RF_END = /([.!?。…:;”"'\)]|다|요|음|함|임|됨|니다)$/;
  const RF_FIELD = /^[^\s:]{1,8}(\s+[^\s:]{1,4})?\s*:\s*\S/;
  const RF_BULLET = /^[○●◦ㅇ·•\-]\s*/;
  const RF_HEAD_SQ = /^[□■◆▶◇]\s*/;
  const RF_HEAD_NUM = /^(\d{1,2}[.)]|[Ⅰ-Ⅹ]+\.|[IVX]+\.|제\s?\d+\s?[장절조]|[가-하][.)])\s*\S/;
  const RF_PARTICLE = /^(을|를|이|가|은|는|의|에|도|로|와|과|만)$/;

  function reflowParas(paras) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push(buf); buf = ''; } };
    for (const p of paras) {
      const line = p.replace(/\s*\n\s*/g, ' ');
      if (RF_HEAD_SQ.test(line) && line.length <= 45) { flush(); out.push('### ' + line.replace(RF_HEAD_SQ, '')); continue; }
      if (RF_HEAD_NUM.test(line) && line.length <= 45 && !RF_END.test(line)) { flush(); out.push('### ' + line); continue; }
      if (RF_BULLET.test(line)) { flush(); buf = '- ' + line.replace(RF_BULLET, ''); continue; }
      if (RF_FIELD.test(line)) { flush(); out.push(line); continue; }
      if (buf && !RF_END.test(buf)) buf += (RF_PARTICLE.test(line) ? '' : ' ') + line;
      else { flush(); buf = line; }
    }
    flush();
    return out.join('\n\n');
  }

  // ppt 슬라이드 구간: 목록 표시 없이 한 줄씩 나열된 항목을 "- 항목"으로, 들여쓰기는 중첩 단계로 옮긴다.
  //  - 들여쓰기 폭은 제각각(1~70칸)이라 값 자체가 아니라 "앞 줄보다 깊어졌나"만 본다(스택).
  //  - ->·=>···○ 로 시작하는 줄은 직전 항목의 하위(결론·부연).
  //  - 긴 줄(30자↑)이 문장 끝맺음 없이 끊기고 더 들여쓴 줄이 오면 줄바꿈 잔재로 보고 앞 항목에 이어 붙인다.
  // 이미 목록·표·인용·코드가 있으면(pptx 변환본 등) 그대로 둔다.
  // ponytail: 줄바꿈 잔재 vs 하위 항목은 길이·끝맺음 휴리스틱 — 짧은 줄 뒤의 이어쓰기는 하위 항목으로 보인다.
  function listifySlide(body) {
    if (/^[ \t]*([-*] |\||>|```|#)/m.test(body)) return body;
    const MARK = /^(->|=>|→|▶|▷|※|[·•○ㅇ])\s*/;
    const out = [];
    let stack = [];      // 열린 항목들의 들여쓰기 폭
    let last = -1;       // 마지막 항목 인덱스
    let lastLevel = 0, lastIndent = 0, lastText = '';
    for (const raw of body.split('\n')) {
      if (!raw.trim()) { out.push(''); stack = []; last = -1; continue; }
      const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
      let text = raw.trim();
      const isMark = MARK.test(text);
      if (!isMark && last >= 0 && indent > lastIndent && lastText.length >= 30 && !RF_END.test(lastText)) {
        out[last] += ' ' + text; lastText += ' ' + text; continue;   // 줄바꿈 잔재
      }
      let level;
      if (isMark) {
        level = Math.min(lastLevel + 1, 3);
        text = text.replace(/^(->|=>)\s*/, '→ ').replace(/^(→|▶|▷|※|[·•○ㅇ])\s*/, (m, g) => (g === '→' ? '→ ' : g === '※' ? '※ ' : ''));
      } else {
        while (stack.length && stack[stack.length - 1] > indent) stack.pop();
        if (!stack.length || stack[stack.length - 1] < indent) stack.push(indent);
        level = Math.min(stack.length - 1, 3);
        lastLevel = level; lastIndent = indent;
      }
      last = out.push('  '.repeat(level) + '- ' + text) - 1;
      lastText = text;
    }
    return out.join('\n');
  }

  // PDF 페이지 구간(### 페이지 N): 추출 텍스트의 고정 폭 줄바꿈·장식선·쪽 번호를 정리한다.
  //  - 장식선(━━━, ───, ===)과 쪽 번호("- 3 -", 페이지 마지막 줄의 숫자만 있는 줄) 제거
  //  - "o 항목" → 목록, "□ 제목" → 소제목, 바로 뒤 "- 항목"은 하위 목록
  //  - 20자 이상 줄이 끝맺음 없이 끊기면 다음 평문 줄을 이어 붙인다(한글끼리는 공백 없이)
  // ponytail: PDF 추출이 단어 사이 공백을 잃은 문서는 복원 불가(원본 추출 한계) — 그건 OCR 재추출 대상.
  function reflowPdfPage(body) {
    const lines = body.split('\n').map(l => l.replace(/\s+$/, ''));
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length && /^[-–]?\s*\d{1,4}\s*[-–]?$/.test(lines[lines.length - 1].trim())) lines.pop();
    const out = [];
    let lastKind = '';   // 'list' | 'head' | 'text' | ''
    let listOpen = false;
    const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { blank(); lastKind = ''; listOpen = false; continue; }
      if (/^[━─═＝_—▬\-=\s]{8,}$/.test(t) || /^[-–]\s*\d{1,4}\s*[-–]$/.test(t)) { lastKind = ''; continue; }   // 머리글 뒤 장식선은 문단 경계
      let m;
      if ((m = t.match(/^[□■◆▶]\s*(.+)$/))) { blank(); out.push('#### ' + m[1]); lastKind = 'head'; listOpen = false; continue; }
      if ((m = t.match(/^[oO○ㅇ●]\s+(.+)$/))) { if (lastKind !== 'list') blank(); out.push('- ' + m[1]); lastKind = 'list'; listOpen = true; continue; }
      if (listOpen && (m = t.match(/^[-–]\s+(.+)$/))) { out.push('  - ' + m[1]); lastKind = 'list'; continue; }
      const prev = out.length ? out[out.length - 1] : '';
      const prevText = prev.replace(/^\s*-\s+/, '');
      if (lastKind !== '' && lastKind !== 'head' && prevText.length >= 20 && !RF_END.test(prevText) && !/^(#|\|)/.test(t)) {
        const a = prev.slice(-1), b = t.charAt(0);
        out[out.length - 1] = prev + (/[가-힣]/.test(a) && /[가-힣]/.test(b) ? '' : ' ') + t;
        continue;
      }
      if (lastKind === 'list') blank();
      out.push(t); lastKind = 'text'; listOpen = false;
    }
    return out.join('\n');
  }

  // xlsx 시트 표(### 시트:)의 숫자 정리: 부동소수 잡음(8790734544.280005) 제거, 큰 숫자에 천 단위 구분.
  // 코드·날짜가 깨지지 않도록 앞자리 0, 8자리 날짜(19xx/20xx)는 건드리지 않고 6자리 이상 정수만 다룬다.
  function formatSheetNumbers(text) {
    if (!/^#{2,3} 시트:/m.test(text)) return text;
    const fmt = c => {
      const v = c.trim();
      if (/^-?\d+\.\d{4,}$/.test(v)) {
        const n = parseFloat(v);
        return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('ko-KR') : String(parseFloat(n.toFixed(4)));
      }
      if (/^-?[1-9]\d{5,}$/.test(v) && !/^(19|20)\d{6}$/.test(v)) return parseInt(v, 10).toLocaleString('ko-KR');
      return c;
    };
    return text.split('\n').map(line => {
      if (!/^\s*\|.*\|\s*$/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line)) return line;
      return line.replace(/\|([^|]*)(?=\|)/g, (m, cell) => { const f = fmt(cell); return f === cell ? m : '| ' + f + ' '; });
    }).join('\n');
  }

  // 글자 깨짐(폰트 인코딩 문제로 티베트·에티오피아 문자 등이 섞인 PDF/hwpx/txt) 감지 — 표시로는 못 고치므로 경고만 띄운다.
  // 일본어 가나(぀-ヿ, 확장 ㇰ-ㇿ)와 사설영역(-, hwpx 글머리 기호 글리프)은 정상 문자 — 오탐 방지.
  const OK_CHARS = /[\u0000-\u007F가-힣ㄱ-ㆎᄀ-ᇿ一-鿿　-ヿㇰ-ㇿ- -⯿ -ÿ＀-￯\s]/g;
  function garbledBannerHtml(content) {
    const s = (content || '').slice(0, 20000).replace(/\s/g, '');
    if (s.length < 300) return '';
    const ratio = s.replace(OK_CHARS, '').length / s.length;
    if (ratio < 0.10) return '';
    return `<div class="not-prose mb-4 p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200">
      <b>⚠ 텍스트 추출이 깨진 문서입니다</b> (깨진 문자 약 ${Math.round(ratio * 100)}%). 화면에서 복구할 수 없습니다.
      PDF 는 폰트 인코딩 문제이므로 <b>OCR 재추출</b>(<code>06_스캔본_OCR처리.bat</code>), txt·htm 은 인코딩 손실(�)이므로 원본에서 <b>재변환</b>이 필요합니다. 원본 파일을 직접 여는 방법도 있습니다.</div>`;
  }

  function reflowRawConverted(text) {
    if (!text) return text;
    // 제목 줄 앞에서 구간 분리(제목은 앞 구간이 아니라 자기 구간의 첫 줄)
    return text.split(/\n(?=#{1,6}\s)/).map(sec => {
      const m = sec.match(/^(#{1,6}\s[^\n]*)\n?([\s\S]*)$/);
      const head = m ? m[1] : '';
      const body = m ? m[2] : sec;
      if (/슬라이드|slide/i.test(head)) return (head ? head + '\n\n' : '') + listifySlide(body);
      if (/페이지\s*\d+/.test(head)) return (head ? head + '\n\n' : '') + reflowPdfPage(body);
      if (/페이지|page/i.test(head)) return sec;
      // 이미 구조화: 표·코드·내용 있는 인용, 또는 붙어 있는 목록(빈 줄로 떨어진 "- 항목" 조각은 대상)
      if (/^[ \t]*(\||```|>[ \t]*\S)/m.test(body) || (body.match(/^[ \t]*[-*] .*\n[ \t]*[-*] /gm) || []).length >= 3) return sec;
      const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const single = paras.filter(p => !p.includes('\n')).length;
      if (paras.length < 5 || single / paras.length < 0.7) return sec;
      return (head ? head + '\n\n' : '') + reflowParas(paras);
    }).join('\n\n');
  }

  // Smart Markdown Cleaner
  function cleanAndStructureMarkdown(text) {
    if (!text) return "";
    let content = linkCitationMarkers(formatSheetNumbers(reflowRawConverted(text)));
    // 마크다운 테이블 전후 빈 줄 확보 (marked.js 테이블 파싱 안정성 보장)
    content = content.replace(/([^\n])\n(\|.+?\|)\n(\|[\s\-:\+\|]+?\|)/g, '$1\n\n$2\n$3');
    content = content.replace(/(\|[^\n]+?\|)\n([^\n\|])/g, '$1\n\n$2');
    
    // 연속 공백 및 서식 정돈
    content = content.replace(/(?<!\n)\s{4,}(?=[가-힣A-Za-z0-9\*\<\[■●◆#])/g, '\n\n');
    content = content.replace(/\[([^\]]+)\]\(javascript:[^\)]+\)/g, '**$1**');
    content = content.replace(/(?:\n\n|\A)\s*\*\*<([^>\n]{2,40})>\*\*\s*(?:\n|\Z)/g, '\n\n## $1\n\n');
    content = content.replace(/(?:\n\n|\A)\s*<([가-힣A-Za-z0-9\s_\-]{2,35})>\s*(?:\n|\Z)/g, '\n\n## $1\n\n');
    content = content.replace(/(?:\n\n|\A)\s*\*\*([가-힣A-Za-z0-9\s_\-\,\.\?\:\/]{2,35})\*\*\s*(?:\n|\Z)/g, '\n\n### $1\n\n');
    content = content.replace(/(?:\n\n|\A)\s*\*\*([가-힣A-Za-z0-9\s_\-]{2,25})\*\*\s+([가-힣A-Za-z0-9])/g, '\n\n### $1\n\n$2');
    content = content.replace(/(?:\n\n|\A)\s*[■●◆▶]\s*([^\n]{2,35})\s*(?:\n|\Z)/g, '\n\n### $1\n\n');
    content = content.replace(/^\s*\\\*\s+/gm, '- ');
    content = content.replace(/^\s*\*\s+(?=[^\*])/gm, '- ');
    content = content.replace(/(?:\n\n|\A)\s*\*\*(질문|Question|Q)[\.\:]?\s*([^\*]+)\*\*/g, '\n\n> 💡 **질문:** $2\n\n');
    content = content.replace(/\n{3,}/g, '\n\n');

    // 참고한 지식위키 근거(file:/// 등) 원문 링크 변환 적용
    content = normalizeReferenceLinks(content);
    return content.trim();
  }

  // ── Smart Duplicate Stripper: 본문 최상단의 중복 H1 및 Q&A 질문 인용구 제거 ──
  function stripDuplicateHeadings(text, docTitle = "", isQA = false) {
    if (!text) return "";
    let raw = text.trim();
    const cleanNorm = (str) => (str || '')
      .replace(/^\[Q&A\]\s*/i, '')
      .replace(/^[📄\s#\-]+/, '')
      .replace(/[\s_\-\(\)\[\]\.,!?'"~`:]/g, '')
      .toLowerCase();

    const targetTitleNorm = cleanNorm(docTitle);

    // 1) 본문 최상단의 첫 번째 H1 라인이 문서 제목과 일치/유사하거나 Q&A 문서인 경우 제거
    raw = raw.replace(/^\s*#\s+([^\n]+)\n*/i, (match, headingText) => {
      const headingNorm = cleanNorm(headingText);
      if (headingNorm === targetTitleNorm || 
          (headingNorm.length >= 4 && targetTitleNorm.includes(headingNorm)) || 
          (targetTitleNorm.length >= 4 && headingNorm.includes(targetTitleNorm)) ||
          isQA || (docTitle && docTitle.startsWith('[Q&A]'))) {
        return '';
      }
      return match;
    });

    // 2) Q&A 문서: 상단 H1에 이미 질문 전문이 명시되어 있으므로 본문 시작점의 중복 질문 인용구 제거
    if (isQA || (docTitle && docTitle.startsWith('[Q&A]'))) {
      raw = raw.replace(/^\s*>\s*(?:[💬💡]\s*)?\*\*질문:?\*\*\s*[^\n]+\n*/i, '');
    }

    // 3) 소스분석 헤더 압축 (한줄 요약 노출 · 출처/키워드 접힘 · 내부 frontmatter/중복 H1 제거)
    raw = condenseSourceHeader(raw, docTitle);

    return raw.trim();
  }

  // ── 소스분석 헤더 압축 (2026-09-15): 한줄 요약만 노출, 출처·키워드는 접힘, 내부 frontmatter·중복 H1 제거 ──
  function condenseSourceHeader(text, docTitle = "") {
    if (!text) return "";
    text = text.replace(/\r+\n|\r+/g, '\n');  // wiki_md 에 \r\r\n 혼재 — 반복 CR도 개행 1개로(구버전은 \r\r\n을 빈 줄로 뻥튀기해 표가 깨졌다, 2026-09-18)
    const LIMIT = 6000;
    let head = text.slice(0, LIMIT);
    const tail = text.slice(LIMIT);
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const norm = (s) => (s || '').replace(/\(Part:[^)]*\)/g, '').replace(/^[📄📚\s#\-]+/, '').replace(/[\s_\-\(\)\[\]\.,!?'"~`:]/g, '').toLowerCase();

    // 1) 본문에 섞여 들어온 내부 frontmatter(--- title: … ---) 제거
    head = head.replace(/(^|\n)---[ \t]*\n(?:[ \t]*\n)*title:[^\n]*\n[\s\S]*?\n---[ \t]*(?=\n|$)/, '$1');

    const tagIdx = head.indexOf('## 🏷 NotebookLM 자동 태그');
    if (tagIdx === -1) return head + tail;

    // 2) 태그 헤딩 앞부분: NOTE 소스 출처 블록과 구분선 회수
    let prefix = head.slice(0, tagIdx);
    let src = '';
    prefix = prefix.replace(/>\s*\[!NOTE\]\s*\n(?:[ \t]*>?[ \t]*\n)*>\s*\*\*소스 출처\*\*:\s*([^\n]*)\n?/, (m, v) => { src = v.trim(); return ''; });
    prefix = prefix.replace(/^[ \t]*---[ \t]*$/gm, '');

    // 3) 태그 섹션 본체: 다음 '## ' 헤딩 직전까지
    const after = head.slice(tagIdx);
    const nextH2 = after.slice(1).search(/\n## /);
    const secEnd = nextH2 === -1 ? after.length : nextH2 + 2;
    let section = after.slice(0, secEnd);
    let rest = after.slice(secEnd);

    let kw = '';
    let summary = '';
    section = section.replace(/^## 🏷 NotebookLM 자동 태그[^\n]*\n?/m, '');
    section = section.replace(/^\*\*키워드\*\*:?[ \t]*([^\n]*)\n?/m, (m, v) => { kw = v.trim(); return ''; });
    section = section.replace(/^\*\*한줄 요약\*\*:?[ \t]*\n(?:[ \t]*\n)*((?:>[^\n]*\n?)+)/m, (m, q) => {
      summary = q.split('\n').map(l => l.replace(/^>\s?/, '').replace(/^#+\s*/, '').trim()).filter(Boolean).join(' ');
      return '';
    });
    section = section.replace(/^[ \t]*---[ \t]*$/gm, '');
    const residual = section.trim();

    // 4) '## 📋 상세 분석' 헤딩과 이어지는 구분선·중복 H1(# 📄 제목 (Part: …)) 제거
    let part = '';
    rest = rest.replace(/^\s*## 📋 상세 분석[^\n]*\n(?:[ \t]*(?:---)?[ \t]*\n)*/, '\n');
    rest = rest.replace(/^\s*# 📄 ([^\n]*)\n/, (m, t) => {
      const pm = t.match(/\(Part:\s*([^)]*)\)/);
      if (pm) part = pm[1].trim();
      if (!docTitle || norm(t) === norm(docTitle) || norm(t).includes(norm(docTitle)) || norm(docTitle).includes(norm(t))) return '\n';
      return m;
    });

    // 5) 재조립: 한줄 요약(노출) + 접힘 메타(출처·키워드·구간)
    const items = [];
    if (src) items.push(`<span><b>출처</b> ${esc(src)}</span>`);
    if (kw) items.push(`<span><b>키워드</b> ${esc(kw)}</span>`);
    if (part && part !== '전체') items.push(`<span><b>구간</b> ${esc(part)}</span>`);
    let out = prefix.trim() ? prefix.trim() + '\n\n' : '';
    if (summary) out += `> 📌 **한줄 요약:** ${summary}\n\n`;
    if (items.length) {
      out += `<details class="src-meta my-3 text-xs text-slate-500 dark:text-slate-400"><summary class="cursor-pointer select-none font-semibold text-slate-400 hover:text-blue-600">소스 정보 (${items.length})</summary><div class="mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 flex flex-col gap-1">${items.join('')}</div></details>\n\n`;
    }
    if (residual) out += residual + '\n\n';
    out += rest.replace(/^\n+/, '');
    return out + tail;
  }

  function parseAlerts(html) {
    return html.replace(
      /<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
      (match, type, content) => {
        const t = type.toUpperCase();
        let border = 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200';
        let icon = 'info';
        if (t === 'TIP') { border = 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'; icon = 'lightbulb'; }
        if (t === 'IMPORTANT') { border = 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200'; icon = 'alert-circle'; }
        if (t === 'WARNING') { border = 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'; icon = 'alert-triangle'; }
        if (t === 'CAUTION') { border = 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'; icon = 'flame'; }

        return `
          <div class="my-4 p-4 border-l-4 rounded-r-lg ${border}">
            <div class="flex items-center gap-2 font-bold text-xs uppercase tracking-wider mb-1">
              <i data-lucide="${icon}" class="w-4 h-4"></i> ${t}
            </div>
            <div class="text-sm">${content}</div>
          </div>
        `;
      }
    );
  }

  // ── Obsidian Wikilink Parser ([[문서명]] -> Clickable Badge Link) ──
  function parseWikiLinks(html) {
    if (!html) return "";
    let res = html.replace(/\[\[(.*?)\]\]/g, (match, raw) => {
      let parts = raw.split('|');
      let target = parts[0].trim();
      let label = (parts[1] || target).trim();
      
      let targetDoc = null;
      let targetClean = target.replace(/\.md$/i, '').trim().toLowerCase();
      
      if (typeof docMap !== 'undefined') {
        targetDoc = docMap.get(target) || docMap.get(target + '.md');
      }
      
      if (!targetDoc && typeof state !== 'undefined' && state.documents) {
        for (let d of state.documents) {
          let bName = (d.base_name || d.title || d.filename || '').replace(/\.md$/i, '').trim().toLowerCase();
          let dId = (d.id || '').replace(/\.md$/i, '').trim().toLowerCase();
          if (bName === targetClean || dId === targetClean) {
            targetDoc = d;
            break;
          }
        }
      }
      
      if (targetDoc) {
        return `<a href="#/doc/${encodeURIComponent(targetDoc.id)}" class="wiki-internal-link inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-blue-50/90 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 transition-all text-[0.92em] no-underline hover:shadow-sm align-baseline mx-0.5" title="${targetDoc.title}">📄 ${label}</a>`;
      } else {
        return `<a href="#/explorer?search=${encodeURIComponent(target)}" class="wiki-internal-link inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition-all text-[0.92em] no-underline align-baseline mx-0.5" title="문서 검색: ${target}">🔍 ${label}</a>`;
      }
    });

    // ── 2차 안전망: HTML 내의 <a href="file:///..."> 태그를 내부 지식위키 원문 링크로 변환 ──
    res = res.replace(/<a\s+([^>]*?)href="file:\/\/\/?([^"]+)"([^>]*?)>([\s\S]*?)<\/a>/gi, (match, p1, rawPath, p2, inner) => {
      let cleanPath = safeDecode(rawPath.trim().replace(/^file:\/\/\/?/i, ''));
      let targetDoc = findMatchingDoc(cleanPath, inner.replace(/<[^>]+>/g, '').trim());
      let targetId = targetDoc ? targetDoc.id : cleanPath;
      let targetTitle = targetDoc ? targetDoc.title : cleanPath;
      return `<a ${p1} href="#/doc/${encodeURIComponent(targetId)}" class="wiki-internal-link inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-blue-50/90 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 transition-all text-[0.92em] no-underline hover:shadow-sm align-baseline mx-0.5" title="${targetTitle}" ${p2}>📄 ${inner}</a>`;
    });

    // ── 2.5차 안전망: 주제허브 '## 근거 문서' 절의 상대경로 링크(../../../wiki_md/<파일>) -> 내부 원문 링크 변환
    //    (2026-09-18) hub_evidence_section()이 서버에서 붙이는 링크 형식. 그대로 두면 SPA 뷰어를 우회해
    //    브라우저가 wiki_md/*.md 를 정적 파일로 그대로 받아 frontmatter·표 문법이 raw 텍스트로 노출된다.
    res = res.replace(/<a\s+([^>]*?)href="((?:\.\.\/)+wiki_md\/[^"]+)"([^>]*?)>([\s\S]*?)<\/a>/gi, (match, p1, relPath, p2, inner) => {
      let cleanPath = decodeURIComponent(relPath.replace(/^(\.\.\/)+wiki_md\//, ''));
      let targetDoc = findMatchingDoc(cleanPath, inner.replace(/<[^>]+>/g, '').trim());
      let targetId = targetDoc ? targetDoc.id : cleanPath;
      let targetTitle = targetDoc ? targetDoc.title : cleanPath;
      return `<a ${p1} href="#/doc/${encodeURIComponent(targetId)}" class="wiki-internal-link inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-blue-50/90 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 transition-all text-[0.92em] no-underline hover:shadow-sm align-baseline mx-0.5" title="${targetTitle}" ${p2}>📄 ${inner}</a>`;
    });

    // ── 3차 안전망: 마크다운 파서가 파싱하지 못하고 HTML 텍스트로 남은 [제목](file:///...) 패턴 변환 ──
    res = res.replace(/\[+([^\]\n]+?)\]+\(file:\/\/\/?([^)\n]+)\)/gi, (match, label, rawPath) => {
      let cleanLabel = label.trim();
      let cleanPath = safeDecode(rawPath.trim().replace(/^file:\/\/\/?/i, ''));
      if (!cleanLabel.startsWith('[') && cleanLabel.includes('Q&A]')) {
        cleanLabel = '[' + cleanLabel;
      }
      let targetDoc = findMatchingDoc(cleanPath, cleanLabel);
      let targetId = targetDoc ? targetDoc.id : cleanPath;
      let targetTitle = targetDoc ? targetDoc.title : cleanLabel;
      return `<a href="#/doc/${encodeURIComponent(targetId)}" class="wiki-internal-link inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-blue-50/90 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 transition-all text-[0.92em] no-underline hover:shadow-sm align-baseline mx-0.5" title="${targetTitle}">📄 ${cleanLabel}</a>`;
    });

    // ── 4차: 번호 인용 칩(📄 2)은 본문을 가리므로 위첨자 [2,5,7] 묶음으로 축소 (2026-09-28)
    //    linkCitationMarkers 가 만든 숫자 라벨 링크만 대상. 클릭(문서 이동·팝업)은 그대로 유지.
    res = res.replace(/<a ([^>]*?)class="wiki-internal-link [^"]*"([^>]*)>📄 (\d{1,3})<\/a>/g,
      '<a $1class="wiki-internal-link cite-link"$2>$3</a>');
    res = res.replace(/<a [^>]*cite-link[^>]*>\d+<\/a>(?:\s*,\s*<a [^>]*cite-link[^>]*>\d+<\/a>)*/g,
      (run) => `<sup class="cite">[${run.replace(/<\/a>\s*,\s*/g, '</a>,')}]</sup>`);

    return res;
  }

  // ── 본문 HTML 마감 처리 (2026-09-23 리더 개편) ──
  // 1) marked 가 못 푼 **굵게**: CommonMark 규칙상 `**용어(AI)**로` 처럼 닫는 ** 앞이 문장부호이고
  //    뒤가 한글이면 강조로 인정되지 않아 별표가 그대로 노출된다. 텍스트 구간에 남은 짝만 <strong> 으로.
  // 2) NotebookLM 인용 번호 [1] [2, 5-7] 를 작은 위첨자(.cite)로 눌러 본문 흐름을 살린다.
  // pre/code 블록과 태그 속성은 건드리지 않는다.
  function polishProseHtml(html) {
    if (!html) return html;
    return html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/i).map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      return chunk.split(/(<[^>]+>)/).map((part, j) => {
        if (j % 2 === 1) return part;
        return part
          .replace(/\*\*([^*\n]{1,300}?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[(\d{1,3}(?:\s*[,\-–~]\s*\d{1,3})*)\]/g, '<sup class="cite">[$1]</sup>');
      }).join('');
    }).join('');
  }

  // 문서 본문 렌더 파이프라인 단일화 — 리더·팝업·가이드카드·듀얼뷰가 같은 결과를 내도록 한 곳에서.
  function renderDocHtml(markdown) {
    const html = parseWikiLinks(parseAlerts(window.marked ? marked.parse(markdown) : markdown));
    return polishProseHtml(html).replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi, (match, p1, src, p2) =>
      `<img ${p1} src="${src}" ${p2} loading="lazy" onerror="this.onerror=null; this.style.display='none';">`);
  }

  // 팝업 안에서 연관 문서를 따라갈 때의 되돌아가기 스택 (팝업을 새로 열면 초기화)
  let docPopupStack = [];
  let docPopupCurrentId = null;
  const docPopupBackBtn = document.getElementById('doc-popup-back-btn');
  if (docPopupBackBtn) {
    docPopupBackBtn.addEventListener('click', () => {
      const prev = docPopupStack.pop();
      if (prev) openDocModal(prev, { fromPopup: true });
    });
  }

  // ── Document Viewer Popup Modal Controls ──
  async function openDocModal(docOrId, opts = {}) {
    if (!docPopupModal) return;
    if (!opts.fromPopup) docPopupStack = [];

    let targetDoc = null;
    if (docOrId && typeof docOrId === 'object') {
      targetDoc = docOrId;
    } else if (typeof docOrId === 'string') {
      const clean = decodeURIComponent(docOrId).trim();
      targetDoc = findMatchingDoc(clean, clean);
      if (!targetDoc && typeof docMap !== 'undefined') {
        targetDoc = docMap.get(clean) || docMap.get(clean + '.md') || docMap.get(clean.replace(/\.md$/i, ''));
      }
      if (!targetDoc && typeof state !== 'undefined' && state.data && state.data.documents) {
        targetDoc = state.data.documents.find(d => 
          (d.id && d.id.toLowerCase() === clean.toLowerCase()) || 
          (d.title && d.title.toLowerCase() === clean.toLowerCase())
        );
      }
      if (!targetDoc) {
        targetDoc = {
          id: clean.endsWith('.md') ? clean : (clean + '.md'),
          title: clean.replace(/\.md$/i, ''),
          category: '위키 지식 문서',
          doc_type: '정본'
        };
      }
    }

    if (!targetDoc) return;

    // 모달 열기 & 배경 스크롤 차단
    docPopupModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const displayTitle = targetDoc.title || targetDoc.id || '문서 뷰어';
    const displayCat = targetDoc.category || '일반 지식';
    const displayType = targetDoc.doc_type || '정본';
    const displayId = targetDoc.id || targetDoc.filename || '';
    docPopupCurrentId = displayId || displayTitle;
    if (docPopupBackBtn) docPopupBackBtn.classList.toggle('hidden', docPopupStack.length === 0);
    if (docPopupBody) docPopupBody.scrollTop = 0;

    if (docPopupTitle) docPopupTitle.textContent = displayTitle;
    if (docPopupCategory) docPopupCategory.textContent = displayCat;
    if (docPopupType) docPopupType.textContent = displayType;
    if (docPopupDocId) docPopupDocId.textContent = displayId;

    if (docPopupDate) {
      docPopupDate.innerHTML = `<i data-lucide="calendar" class="w-3 h-3"></i><span>${targetDoc.created || targetDoc.date || '최근'}</span>`;
    }
    if (docPopupSource) {
      docPopupSource.innerHTML = `<i data-lucide="database" class="w-3 h-3"></i><span>${targetDoc.source || '개인지식위키 지식위키'}</span>`;
    }

    if (docPopupTags) {
      const tags = targetDoc.tags || [];
      if (Array.isArray(tags) && tags.length > 0) {
        docPopupTags.innerHTML = tags.slice(0, 6).map(t => 
          `<span class="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/60 text-[10px] text-slate-600 dark:text-slate-300 font-medium">#${t}</span>`
        ).join('');
      } else {
        docPopupTags.innerHTML = '';
      }
    }

    // 전체 페이지로 열기 버튼 링크
    if (docPopupOpenTabBtn) {
      docPopupOpenTabBtn.href = `#/doc/${encodeURIComponent(displayId || displayTitle)}`;
      docPopupOpenTabBtn.onclick = () => {
        closeDocModal();
      };
    }

    // 로딩 인디케이터
    if (docPopupBody) {
      docPopupBody.innerHTML = `
        <div class="text-center py-20 space-y-3 animate-fade-in">
          <div class="w-10 h-10 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto animate-spin">
            <i data-lucide="loader-2" class="w-5 h-5"></i>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300 font-semibold">정본 지식 문서를 불러오는 중입니다...</p>
          <p class="text-[11px] text-slate-400 font-mono">${displayTitle}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }

    try {
      const loadedDoc = await ensureDocLoaded(targetDoc);
      const finalDoc = loadedDoc || targetDoc;

      if (finalDoc && finalDoc.content && finalDoc.content.trim().length > 0) {
        const isQADoc = Boolean(finalDoc.title && (finalDoc.title.startsWith('[Q&A]') || (finalDoc.source_type || '').includes('질의응답') || (finalDoc.category || '').includes('Q&A')));
        const stripped = stripDuplicateHeadings(finalDoc.content, finalDoc.title, isQADoc);
        const cleaned = cleanAndStructureMarkdown(stripped);
        const renderedHtml = renderDocHtml(cleaned);

        // 연관 지식: 리더 우측 패널과 같은 추천 목록을 팝업 하단에도 둔다 → 링크를 따라가도 같은 화면 안에서 조회
        let relatedHtml = '';
        try {
          const reco = getSmartRecommendations(finalDoc, 6);
          if (reco && reco.list && reco.list.length > 0) {
            relatedHtml = `
              <section class="not-prose mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <i data-lucide="link-2" class="w-3.5 h-3.5"></i> 연관 지식 ${reco.list.length}건
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  ${reco.list.map(({ doc: rDoc, reason }) => `
                    <a href="#/doc/${encodeURIComponent(rDoc.id)}" class="block px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition no-underline" style="text-decoration:none" title="${escapeHtml(rDoc.title)}">
                      <div class="text-[10px] text-slate-400 truncate">${escapeHtml(reason)} · ${escapeHtml(rDoc.category || '')}</div>
                      <div class="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(rDoc.title)}</div>
                    </a>`).join('')}
                </div>
              </section>`;
          }
        } catch (e) { /* 추천 실패는 본문 조회를 막지 않는다 */ }

        if (docPopupBody) {
          docPopupBody.innerHTML = renderedHtml + relatedHtml;

          // 코드 하이라이팅
          docPopupBody.querySelectorAll('pre code').forEach(el => {
            if (window.hljs) hljs.highlightElement(el);
          });

          // 팝업 안의 모든 문서 링크(본문 위키링크·연관 지식)는 같은 팝업에서 전환하고, 되돌아가기 스택에 쌓는다
          docPopupBody.querySelectorAll('a[href^="#/doc/"]').forEach(link => {
            const href = link.getAttribute('href') || '';
            link.addEventListener('click', (e) => {
              e.preventDefault();
              const nextId = decodeURIComponent(href.replace('#/doc/', '').split('?')[0]);
              if (docPopupCurrentId) docPopupStack.push(docPopupCurrentId);
              openDocModal(nextId, { fromPopup: true });
            });
          });
        }
      } else {
        if (docPopupBody) {
          docPopupBody.innerHTML = `
            <div class="text-center py-16 space-y-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800/40">
              <i data-lucide="file-text" class="w-8 h-8 text-amber-500 mx-auto"></i>
              <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">문서 내용 미리보기</h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto text-left bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                ${finalDoc.snippet || finalDoc.summary || '문서 본문 파일 내용을 불러올 수 없습니다. 위쪽 [전체 페이지로 열기] 버튼을 통해 지식위키에서 확인해주세요.'}
              </p>
            </div>
          `;
        }
      }
    } catch (err) {
      if (docPopupBody) {
        docPopupBody.innerHTML = `
          <div class="text-center py-16 space-y-3 text-rose-500">
            <i data-lucide="alert-circle" class="w-8 h-8 mx-auto"></i>
            <p class="text-xs font-semibold">문서를 불러오는 중 오류가 발생했습니다: ${err.message}</p>
          </div>
        `;
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function closeDocModal() {
    if (!docPopupModal) return;
    docPopupModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    docPopupStack = [];
  }

  window.openDocModal = openDocModal;
  window.closeDocModal = closeDocModal;

  // ── AI Q&A 참고 출처 및 인용 번호 -> 팝업 모달 링크 변환기 ──
  function formatQaReferencesWithPopups(html, sources) {
    if (!html) return "";
    let res = html;
    const srcList = sources || [];

    function findSourceByNumOrTitle(numStr, titleStr) {
      const idx = parseInt(numStr, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= srcList.length) {
        return srcList[idx - 1];
      }
      if (titleStr) {
        const cleanT = titleStr.replace(/<[^>]+>/g, '').trim();
        const found = srcList.find(s => s.title && (s.title.includes(cleanT) || cleanT.includes(s.title)));
        if (found) return found;
        return findMatchingDoc(cleanT, cleanT);
      }
      return null;
    }

    // 1단계: '참고 출처' 목록 내의 '[번호] 문서: 문서명 (카테고리)' 패턴 매칭
    // 예: • [4] 문서: KTNET 아메바경영과 교세라 아메바경영의 대조 분석 (경영 & 전략 기획)
    res = res.replace(/(?:<li[^>]*>\s*|<p>\s*)?(?:[•\*\-]\s*)?\[(\d+)\]\s*문서\s*:\s*(.+?)(?:\s*<\/li>|\s*<\/p>|$)/gim, 
      (match, num, restText) => {
        let rest = (restText || '').trim();
        let cleanCat = '';
        const catMatch = /\s*\(([^)\n\r]+)\)\s*$/.exec(rest);
        if (catMatch) {
          cleanCat = catMatch[1].replace(/<[^>]+>/g, '').trim();
          rest = rest.replace(/\s*\(([^)\n\r]+)\)\s*$/, '').trim();
        }
        const cleanTitle = rest.replace(/<[^>]+>/g, '').trim();
        if (!cleanTitle) return match;

        const matched = findSourceByNumOrTitle(num, cleanTitle);
        const docId = matched ? matched.id : cleanTitle;
        const displayTitle = matched ? matched.title : cleanTitle;
        const displayCat = cleanCat || (matched ? matched.category : '');

        return `
          <div class="my-2">
            <button type="button" 
              onclick="window.openDocModal('${encodeURIComponent(docId).replace(/'/g, "\\'")}')" 
              class="qa-ref-doc-btn group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/70 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100 text-xs font-semibold shadow-xs hover:shadow-md hover:border-purple-400 transition-all text-left cursor-pointer"
              data-doc-id="${encodeURIComponent(docId)}"
              title="${displayTitle} (클릭 시 팝업으로 열람)">
              <span class="w-5 h-5 rounded-lg bg-purple-600 text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition">${num}</span>
              <span class="font-bold text-slate-800 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">${displayTitle}</span>
              ${displayCat ? `<span class="text-[10px] font-normal px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 shrink-0">${displayCat}</span>` : ''}
              <span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 ml-1.5 shrink-0 group-hover:underline">
                <span>팝업 보기</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </span>
            </button>
          </div>
        `;
      }
    );

    // 2단계: 번호 없이 '문서: 문서명 (카테고리)' 형태로 명시된 출처도 지원
    res = res.replace(/(?:<li[^>]*>\s*|<p>\s*)?(?:[•\*\-]\s*)?문서\s*:\s*(.+?)(?:\s*<\/li>|\s*<\/p>|$)/gim,
      (match, restText) => {
        let rest = (restText || '').trim();
        let cleanCat = '';
        const catMatch = /\s*\(([^)\n\r]+)\)\s*$/.exec(rest);
        if (catMatch) {
          cleanCat = catMatch[1].replace(/<[^>]+>/g, '').trim();
          rest = rest.replace(/\s*\(([^)\n\r]+)\)\s*$/, '').trim();
        }
        const cleanTitle = rest.replace(/<[^>]+>/g, '').trim();
        if (!cleanTitle || cleanTitle.length < 3) return match;

        const matched = findSourceByNumOrTitle(null, cleanTitle);
        const docId = matched ? matched.id : cleanTitle;
        const displayTitle = matched ? matched.title : cleanTitle;
        const displayCat = cleanCat || (matched ? matched.category : '');

        return `
          <div class="my-2">
            <button type="button" 
              onclick="window.openDocModal('${encodeURIComponent(docId).replace(/'/g, "\\'")}')" 
              class="qa-ref-doc-btn group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/70 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100 text-xs font-semibold shadow-xs hover:shadow-md hover:border-purple-400 transition-all text-left cursor-pointer"
              data-doc-id="${encodeURIComponent(docId)}"
              title="${displayTitle} (클릭 시 팝업으로 열람)">
              <span class="w-5 h-5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-xs"><i data-lucide="file-text" class="w-3 h-3"></i></span>
              <span class="font-bold text-slate-800 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">${displayTitle}</span>
              ${displayCat ? `<span class="text-[10px] font-normal px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 shrink-0">${displayCat}</span>` : ''}
              <span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 ml-1.5 shrink-0 group-hover:underline">
                <span>팝업 보기</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </span>
            </button>
          </div>
        `;
      }
    );

    // 3단계: 본문 텍스트 내의 인용 번호 [1], [2], [4] 등을 상첨자 팝업 배지로 변환
    if (srcList.length > 0) {
      res = res.replace(/(<[^>]+>)|\[(\d+)\]/g, (match, tag, num) => {
        if (tag) return tag;
        const idx = parseInt(num, 10);
        if (idx >= 1 && idx <= srcList.length) {
          const s = srcList[idx - 1];
          return `<button type="button" onclick="window.openDocModal('${encodeURIComponent(s.id).replace(/'/g, "\\'")}')" class="qa-inline-ref-btn inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-100/90 dark:bg-purple-900/60 hover:bg-purple-200 dark:hover:bg-purple-800 rounded border border-purple-200 dark:border-purple-700 align-super cursor-pointer transition shadow-2xs hover:scale-110" data-doc-id="${encodeURIComponent(s.id)}" title="[${idx}] ${s.title} (클릭 시 팝업 열람)">[${idx}]</button>`;
        }
        return match;
      });
    }

    return res;
  }

  // 1. Theme Management
  function applyTheme() {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
      if (themeToggleBtn) themeToggleBtn.innerHTML = `<i data-lucide="sun" class="w-5 h-5"></i>`;
    } else {
      document.documentElement.classList.remove('dark');
      if (themeToggleBtn) themeToggleBtn.innerHTML = `<i data-lucide="moon" class="w-5 h-5"></i>`;
    }
    if (window.lucide) lucide.createIcons();
    localStorage.setItem('okf_theme', state.darkMode ? 'dark' : 'light');
    if (window.knowledgeGraphInstance) {
      window.knowledgeGraphInstance.draw();
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      applyTheme();
    });
  }

  // 2. Tab Management System
  function saveTabs() {
    localStorage.setItem('okf_open_tabs', JSON.stringify(state.tabs));
  }

  function addOrActivateTab(tabObj) {
    const existingIndex = state.tabs.findIndex(t => t.hash === tabObj.hash || (t.id && t.id === tabObj.id));
    if (existingIndex >= 0) {
      state.tabs[existingIndex].hash = tabObj.hash;
    } else {
      state.tabs.push(tabObj);
    }
    state.activeTabHash = tabObj.hash;
    saveTabs();
    renderTabsBar();
  }

  function closeTab(tabHash, e) {
    if (e) e.stopPropagation();
    const tabIndex = state.tabs.findIndex(t => t.hash === tabHash);
    if (tabIndex === -1 || !state.tabs[tabIndex].closable) return;

    const isClosingActive = (state.activeTabHash === tabHash);
    state.tabs.splice(tabIndex, 1);
    saveTabs();

    if (isClosingActive) {
      const nextTab = state.tabs[Math.max(0, tabIndex - 1)] || state.tabs[0];
      window.location.hash = nextTab ? nextTab.hash : '#/';
    } else {
      renderTabsBar();
    }
  }

  function closeAllOtherTabs() {
    state.tabs = state.tabs.filter(t => !t.closable || t.hash === state.activeTabHash);
    if (state.tabs.length === 0) {
      state.tabs = [{ id: 'dashboard', title: '홈 대시보드', hash: '#/', icon: 'home', closable: false }];
    }
    saveTabs();
    renderTabsBar();
  }

  function renderTabsBar() {
    if (!tabsListContainer) return;

    tabsListContainer.innerHTML = state.tabs.map(tab => {
      const isActive = (tab.hash === state.activeTabHash || window.location.hash === tab.hash);
      const iconName = tab.icon || 'file-text';
      
      return `
        <div class="workspace-tab ${isActive ? 'active' : ''}" data-hash="${tab.hash}" title="${tab.title}">
          <i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}"></i>
          <span class="truncate">${tab.title}</span>
          ${tab.closable !== false ? `
            <button class="tab-close-btn" data-close-hash="${tab.hash}" title="탭 닫기">
              &times;
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    tabsListContainer.querySelectorAll('.workspace-tab').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) return;
        const targetHash = el.getAttribute('data-hash');
        if (targetHash) window.location.hash = targetHash;
      });
    });

    tabsListContainer.querySelectorAll('.tab-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const closeHash = btn.getAttribute('data-close-hash');
        closeTab(closeHash, e);
      });
    });

    const activeTabEl = tabsListContainer.querySelector('.workspace-tab.active');
    if (activeTabEl) {
      activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  if (tabsListContainer) {
    tabsListContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabsListContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  if (btnCloseAllTabs) {
    btnCloseAllTabs.addEventListener('click', closeAllOtherTabs);
  }

  // 3. Navigation & Routing
  function handleRoute() {
    const rawHash = window.location.hash || '#/';

    // 목차(TOC) 등 페이지 내부 앵커(#슬러그)는 라우팅 대상이 아니다.
    // 라우트가 아닌 해시로 바뀐 것이면(브라우저가 이미 그 위치로 스크롤함) 그대로 두고 반환한다.
    // (2026-09-16) 이게 없으면 아래 scrollTo(top:0)와 else 분기의 홈 렌더링이
    // TOC 클릭의 앵커 이동을 즉시 덮어써 "초기화면으로 이동"하는 것처럼 보였다.
    if (rawHash && !rawHash.startsWith('#/')) {
      return;
    }

    window.scrollTo({ top: 0, behavior: 'instant' });

    const [hash, queryString] = rawHash.split('?');
    const urlParams = new URLSearchParams(queryString || '');
    if (urlParams.get('view') === 'split') {
      state.readerMode = 'split';
    } else {
      state.readerMode = 'single';
    }

    state.graphFocusId = urlParams.get('focus') || null;
    state.activeTabHash = rawHash;

    if (hash === '#/coverage') {
      addOrActivateTab({
        id: 'coverage',
        title: '원천 동기화·커버리지',
        hash: '#/coverage',
        icon: 'refresh-cw',
        closable: true
      });
      renderCoverageView();
    } else if (hash === '#/evolution') {
      addOrActivateTab({
        id: 'evolution',
        title: '의사결정 변천사',
        hash: '#/evolution',
        icon: 'git-commit',
        closable: true
      });
      renderEvolutionView();
    } else if (hash === '#/history') {
      addOrActivateTab({
        id: 'history',
        title: '열람 히스토리',
        hash: '#/history',
        icon: 'history',
        closable: true
      });
      renderHistoryView();
    } else if (hash === '#/qa') {
      addOrActivateTab({
        id: 'qa',
        title: 'AI 지식 묻고 답하기',
        hash: '#/qa',
        icon: 'bot',
        closable: true
      });
      renderQAView();
    } else if (hash === '#/ingest' || hash === '#/new') {
      addOrActivateTab({
        id: 'ingest',
        title: '지식 수집·등록',
        hash: '#/ingest',
        icon: 'plus-circle',
        closable: true
      });
      renderIngestView();
    } else if (hash === '#/hubs') {
      addOrActivateTab({
        id: 'hubs',
        title: '주제허브',
        hash: '#/hubs',
        icon: 'layers',
        closable: true
      });
      renderHubsView();
    } else if (hash.startsWith('#/doc/')) {
      const docId = decodeURIComponent(hash.replace('#/doc/', ''));
      let doc = docMap.get(docId);
      if (!doc && !docId.endsWith('.md')) {
        doc = docMap.get(docId + '.md');
      }
      if (!doc && docId.endsWith('.md')) {
        doc = docMap.get(docId.replace(/\.md$/, ''));
      }
      if (doc) {
        addOrActivateTab({
          id: doc.id,
          title: doc.title,
          hash: rawHash,
          icon: doc.doc_type === '재구성' ? 'sparkles' : 'file-text',
          closable: true
        });
        renderReader(doc);
      } else {
        fetchDocDynamically(docId, rawHash);
      }
    } else if (hash.startsWith('#/category/')) {
      const cat = decodeURIComponent(hash.replace('#/category/', ''));
      state.currentCategory = cat;
      state.currentTag = null;
      state.searchQuery = '';  // 직전 검색어가 남아 카테고리 목록을 좁히지 않도록
      addOrActivateTab({
        id: `cat_${cat}`,
        title: `분야: ${cat}`,
        hash: rawHash,
        icon: 'folder',
        closable: true
      });
      renderExplorer();
    } else if (hash.startsWith('#/tag/')) {
      const tag = decodeURIComponent(hash.replace('#/tag/', ''));
      state.currentTag = tag;
      state.currentCategory = 'all';
      addOrActivateTab({
        id: `tag_${tag}`,
        title: `#${tag}`,
        hash: rawHash,
        icon: 'tag',
        closable: true
      });
      renderExplorer();
    } else if (hash === '#/explorer') {
      state.currentCategory = 'all';
      state.currentTag = null;
      addOrActivateTab({
        id: 'explorer',
        title: '전체 문서 탐색',
        hash: '#/explorer',
        icon: 'compass',
        closable: true
      });
      renderExplorer();
    } else if (hash === '#/search') {
      const q = (urlParams.get('q') || '').trim();
      state.searchQuery = q;
      if (headerSearchInput && headerSearchInput.value !== q) {
        headerSearchInput.value = q;
      }
      if (headerSearchClear) {
        if (q) headerSearchClear.classList.remove('hidden');
        else headerSearchClear.classList.add('hidden');
      }
      addOrActivateTab({
        id: 'search_results',
        title: q ? `검색: "${q.length > 15 ? q.slice(0, 15) + '...' : q}"` : '지식 검색',
        hash: rawHash,
        icon: 'search',
        closable: true
      });
      renderSearchResultsView(q);
    } else if (hash === '#/graph') {
      addOrActivateTab({
        id: 'graph',
        title: state.graphFocusId ? '포커스 지식망' : 'Graphify 지식 관계망',
        hash: rawHash,
        icon: 'network',
        closable: true
      });
      renderGraphView();
    } else {
      addOrActivateTab({
        id: 'dashboard',
        title: '홈 대시보드',
        hash: '#/',
        icon: 'home',
        closable: false
      });
      renderDashboard();
    }

    renderTabsBar();
    updateSidebarActiveState();
    fetchSyncStatus();
  }

  window.addEventListener('hashchange', handleRoute);

  // ── Wiki Internal Link Click Delegator ──
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#/doc/"], a.wiki-internal-link');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#/doc/')) {
        if (window.location.hash === href) {
          e.preventDefault();
          handleRoute();
        }
      }
    }
  });

  // 4. Fetch Sync Status for Header and Dashboard
  function fetchSyncStatus() {
    fetch('/api/sync_status')
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') {
          state.coverageData = data;
          if (headerCoverageText) {
            headerCoverageText.textContent = `동기화 ${data.coverage_pct || 100}%`;
          }
          if (headerCoverageBtn) {
            if (data.sync_status === 'syncing') {
              headerCoverageBtn.className = "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/40 animate-pulse";
            } else if (data.stale_status === 'stale') {
              headerCoverageBtn.className = "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition";
            } else {
              headerCoverageBtn.className = "hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition";
            }
          }
        }
      })
      .catch(() => {});
  }

  // 5. Render Source Coverage & Sync Hub (#/coverage)
  function renderCoverageView() {
    state.currentView = 'coverage';

    fetch('/api/sync_status')
      .then(r => r.json())
      .then(data => {
        if (data) state.coverageData = data;
        renderCoverageContent();
      })
      .catch(() => {
        renderCoverageContent();
      });
  }

  function renderCoverageContent() {
    const cov = state.coverageData || {};
    const isSyncing = cov.sync_status === 'syncing';
    const isStale = cov.stale_status === 'stale';

    const html = `
      <div class="space-y-8 animate-fade-in pb-20">
        <!-- Banner Header -->
        <div class="rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-emerald-200 ${isSyncing ? 'animate-spin' : ''}"></i> Source Provenance & Incremental Coverage Hub
            </div>
            <h1 class="text-2xl md:text-3xl font-black">원천 소스 동기화 & 커버리지 허브</h1>
            <p class="text-emerald-100 text-xs md:text-sm max-w-2xl">
              <strong>NotebookLM 및 로컬 원천(sources/)</strong>의 신규 파일 유입 상태를 전수 스캔하고, <strong>정본(wiki_md/) 커버리지율</strong>을 실시간 추적하여 원클릭으로 동기화합니다.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2.5">
            <a href="/_engine/변환대시보드.html" target="_blank" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition flex items-center gap-1.5 border border-indigo-400/40" title="3단계 파이프라인 및 액션 연계형 전용 변환 대시보드 새창 열기">
              <i data-lucide="layout-dashboard" class="w-4 h-4 text-white"></i>
              <span>🎛️ 3단계 변환 대시보드 열기</span>
            </a>
            <button id="btn-trigger-full-sync" class="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition border border-white/30 flex items-center gap-1.5" title="NotebookLM 웹 원천 최신 소스 및 요약본 수집">
              <i data-lucide="download-cloud" class="w-4 h-4 text-emerald-300"></i>
              <span>1. 📥 노트북소스 가져오기</span>
            </button>
            <button id="btn-trigger-fast-sync" class="px-3.5 py-2 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs shadow-lg transition flex items-center gap-1.5" title="레거시 문서 및 미변환 소스를 마크다운 정본으로 승격변환">
              <i data-lucide="zap" class="w-4 h-4 text-emerald-600"></i>
              <span>2. ⚡ 승격변환 실행</span>
            </button>
            <button id="btn-trigger-index-sync" class="px-3.5 py-2 rounded-xl bg-blue-600/90 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg transition flex items-center gap-1.5 border border-blue-400/40" title="Ollama bge-m3 1024D 로컬 벡터 인덱싱 및 지식그래프 갱신">
              <i data-lucide="cpu" class="w-4 h-4 text-white"></i>
              <span>3. 🧠 인덱싱 실행</span>
            </button>
          </div>
        </div>

        <!-- 3 Major Metric Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <!-- Card 1: Coverage Gauge -->
          <div class="card-glass rounded-2xl p-6 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">정본 변환 커버리지</span>
              <span class="text-xl font-black text-emerald-600 dark:text-emerald-400">${cov.coverage_pct || 100}%</span>
            </div>

            <div class="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full overflow-hidden">
              <div class="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-1000" style="width: ${cov.coverage_pct || 100}%"></div>
            </div>

            <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-medium">
              <span>원천 소스: <strong>${cov.sources_total || 0}개</strong></span>
              <span>정본 위키: <strong class="text-emerald-600">${cov.canonical_total || 0}개</strong></span>
            </div>
          </div>

          <!-- Card 2: Freshness Indicator -->
          <div class="card-glass rounded-2xl p-6 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">수집 신선도 상태</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${isStale ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'} flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${isStale ? 'bg-rose-500' : 'bg-emerald-500'}"></span>
                ${isStale ? '수집 정체 (7일+)' : '정상 유입 중'}
              </span>
            </div>

            <div class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              최근 원천 유입: <strong>${cov.days_since_latest !== undefined ? `${cov.days_since_latest}일 전` : '확인 중'}</strong>
            </div>

            <p class="text-[11px] text-slate-400">
              ${isStale ? 'NotebookLM 새 요약본 가져오기 또는 수동 원천 추가가 필요합니다.' : '원천 파일들이 최신 상태로 원활히 유입되고 있습니다.'}
            </p>
          </div>

          <!-- Card 3: Latest Source File -->
          <div class="card-glass rounded-2xl p-6 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">최신 유입 원천 파일</span>
              <span class="text-[11px] text-slate-400 font-mono">${cov.latest_source_date || ''}</span>
            </div>

            <div class="font-bold text-xs text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title="${cov.latest_source_file}">
              ${cov.latest_source_file || '원천 파일 없음'}
            </div>

            <div class="pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
              <span>최근 동기화 시각:</span>
              <span class="font-mono text-slate-600 dark:text-slate-300">${cov.last_sync_time || '-'}</span>
            </div>
          </div>
        </div>

        <!-- Pipeline Diagram & Live Terminal Logs -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Left: 3-Tier Pipeline Architecture -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="layers" class="w-4 h-4 text-emerald-600"></i>
              계층 체인(Provenance) 처리 파이프라인
            </h3>

            <div class="space-y-3 text-xs">
              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-800 dark:text-slate-200">1. sources/ (원천 수신함)</div>
                  <div class="text-[11px] text-slate-400">NotebookLM 내보내기 & 실무 원천 파일 (${cov.sources_total || 0}개)</div>
                </div>
                <i data-lucide="arrow-down" class="w-4 h-4 text-slate-400"></i>
              </div>

              <div class="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                <div>
                  <div class="font-bold text-emerald-900 dark:text-emerald-200">2. wiki_md/ (개인지식위키 정본 지식)</div>
                  <div class="text-[11px] text-emerald-700 dark:text-emerald-300">표준 YAML Frontmatter & 태그 자동 승격 (${cov.canonical_total || 0}개)</div>
                </div>
                <i data-lucide="arrow-down" class="w-4 h-4 text-emerald-500"></i>
              </div>

              <div class="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                <div>
                  <div class="font-bold text-purple-900 dark:text-purple-200">3. wiki/ & wiki_data.js (지식망 & AI RAG)</div>
                  <div class="text-[11px] text-purple-700 dark:text-purple-300">Graphify 의미론적 관계선(2,026개) & 복리 축적 루프</div>
                </div>
                <span class="text-xs font-bold text-purple-600">정상 연동</span>
              </div>
            </div>
          </div>

          <!-- Right: Live Terminal Log -->
          <div class="bg-slate-950 rounded-2xl p-6 text-slate-200 font-mono text-xs shadow-inner flex flex-col justify-between space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-2 text-slate-400 font-bold">
                <span class="w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}"></span>
                <span>동기화 워커 로그 (Sync Worker Output)</span>
              </div>
              <span class="text-[10px] text-slate-500">${cov.last_sync_time || ''}</span>
            </div>

            <div id="sync-live-terminal" class="space-y-1 overflow-y-auto max-h-[190px] text-[11px] text-slate-300 pr-2 leading-relaxed">
              ${(cov.logs && cov.logs.length > 0) 
                ? cov.logs.map(l => `<div class="text-slate-300">${l}</div>`).join('') 
                : '<div class="text-slate-500">백그라운드 스캔 대기 중...</div>'}
            </div>

            <div class="pt-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
              <span>OKF Parallel Synchronization Worker v2.0</span>
              <span>Python Subprocess Non-Blocking</span>
            </div>
          </div>
        </div>

        <!-- Pending Files Section -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="clock" class="w-5 h-5 text-amber-500"></i>
              미변환 / 증분 가공 대기 원천 파일 (${(cov.pending_files || []).length}개)
            </h3>
            <span class="text-xs text-slate-400">sources/ 에는 있으나 아직 wiki_md/ 에 없는 파일</span>
          </div>

          ${(!cov.pending_files || cov.pending_files.length === 0) ? `
            <div class="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-6 text-slate-500 text-xs">
              <i data-lucide="check-circle" class="w-8 h-8 text-emerald-500 mx-auto mb-2"></i>
              <div class="font-bold text-slate-700 dark:text-slate-200">모든 원천 소스가 100% 정본화되어 대기 파일이 없습니다.</div>
              <div class="text-[11px] text-slate-400 mt-1">sources/ 폴더에 새 파일을 넣으면 자동으로 감지되어 이곳에 표시됩니다.</div>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
              ${cov.pending_files.map(pf => `
                <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs flex items-center justify-between gap-2">
                  <span class="font-mono text-slate-700 dark:text-slate-200 truncate" title="${pf}">📄 ${pf}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold shrink-0">대기</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Bind Fast Sync Button (승격변환 실행)
    const btnFastSync = document.getElementById('btn-trigger-fast-sync');
    if (btnFastSync) {
      btnFastSync.addEventListener('click', () => {
        triggerSyncProcess({ force: false });
      });
    }

    // Bind Full Sync Button (노트북소스 가져오기)
    const btnFullSync = document.getElementById('btn-trigger-full-sync');
    if (btnFullSync) {
      btnFullSync.addEventListener('click', () => {
        triggerSyncProcess({ fetch_nlm: true });
      });
    }

    // Bind Index Sync Button (인덱싱 실행)
    const btnIndexSync = document.getElementById('btn-trigger-index-sync');
    if (btnIndexSync) {
      btnIndexSync.addEventListener('click', () => {
        triggerSyncProcess({ indexing_only: true });
      });
    }
  }

  function triggerSyncProcess(options = {}) {
    let payload = {};
    if (typeof options === 'boolean') {
      payload = { fetch_nlm: options };
    } else {
      payload = options;
    }

    fetch('/api/trigger_sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      const msg = res.message || '⚡ 백그라운드 원천 동기화 및 커버리지 분석이 시작되었습니다! 화면이 실시간으로 갱신됩니다.';
      alert(msg);
      pollSyncStatus();
    })
    .catch(() => {
      alert('동기화 요청 중 오류가 발생했습니다.');
    });
  }

  function pollSyncStatus() {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      fetch('/api/sync_status')
        .then(r => r.json())
        .then(data => {
          if (data) {
            state.coverageData = data;
            if (state.currentView === 'coverage') {
              renderCoverageContent();
            }
            if (data.sync_status === 'done' || attempts > 15) {
              clearInterval(interval);
            }
          }
        })
        .catch(() => clearInterval(interval));
    }, 2000);
  }

  // 6. Record Read History Function
  function recordReadHistory(doc, viewMode = 'single') {
    if (!doc) return;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const hash = `#/doc/${encodeURIComponent(doc.id)}${viewMode === 'split' ? '?view=split' : ''}`;

    const historyEntry = {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      doc_type: doc.doc_type,
      view_mode: viewMode,
      hash: hash,
      read_at: nowStr,
      char_count: doc.char_count
    };

    state.readHistory = [historyEntry, ...state.readHistory.filter(h => h.id !== doc.id)].slice(0, 100);
    localStorage.setItem('okf_read_history', JSON.stringify(state.readHistory));

    fetch('/api/read_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...historyEntry })
    }).catch(() => {});

    renderSidebarRecents();
  }

  // 7. Render Chronological Decision Evolution View (#/evolution)
  function renderEvolutionView() {
    state.currentView = 'evolution';

    fetch('/api/decision_tracks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // 허브가 생성한 트랙(generated_at 보유)을 최신순으로 위에 둔다. 2026-09-18: append 순서 그대로
          // 두었더니 새 트랙이 6번째(스크롤 14,700px)로 밀려 "생성이 안 됐다"로 보였다.
          state.evolutionTracks = [...data].sort((a, b) =>
            (b.generated_at || '').localeCompare(a.generated_at || ''));
        }
        renderEvolutionContent(state.evolutionCategory || 'all');
      })
      .catch(() => {
        renderEvolutionContent(state.evolutionCategory || 'all');
      });
  }

  function renderEvolutionContent(activeCategory = 'all') {
    state.evolutionCategory = activeCategory;
    const tracks = state.evolutionTracks || [];
    const query = (state.evolutionSearchQuery || '').trim().toLowerCase();
    const statusFilter = state.evolutionStatusFilter || 'all';
    const viewMode = state.evolutionViewMode || 'timeline';

    // Filter tracks by category, search query, and status
    const filteredTracks = tracks.filter(t => {
      // Category match
      if (activeCategory !== 'all' && t.category !== activeCategory) return false;

      // Status match (track must have at least one matching node)
      if (statusFilter !== 'all') {
        const hasStatus = (t.nodes || []).some(n => n.status === statusFilter);
        if (!hasStatus) return false;
      }

      // Search match
      if (query) {
        const titleMatch = (t.title || '').toLowerCase().includes(query);
        const descMatch = (t.description || '').toLowerCase().includes(query);
        const nodeMatch = (t.nodes || []).some(n => {
          const nTitle = (n.title || '').toLowerCase();
          const nSummary = (n.summary || '').toLowerCase();
          const nRationale = (n.rationale || '').toLowerCase();
          const sFile = (n.source_info?.source_file || '').toLowerCase();
          const sNb = (n.source_info?.source_notebook || '').toLowerCase();
          const sType = (n.source_info?.source_type || '').toLowerCase();
          const tDriver = (n.time_analysis?.change_driver || '').toLowerCase();
          const tEvidence = (n.time_analysis?.evidence || '').toLowerCase();
          const tChanges = (n.time_analysis?.key_changes || '').toLowerCase();
          const tImpact = (n.time_analysis?.impact || '').toLowerCase();
          return nTitle.includes(query) || nSummary.includes(query) || nRationale.includes(query) ||
                 sFile.includes(query) || sNb.includes(query) || sType.includes(query) ||
                 tDriver.includes(query) || tEvidence.includes(query) || tChanges.includes(query) || tImpact.includes(query);
        });
        if (!titleMatch && !descMatch && !nodeMatch) return false;
      }

      return true;
    });

    // KPI Metrics calculation across all tracks
    const allNodes = tracks.flatMap(t => t.nodes || []);
    const totalAccepted = allNodes.filter(n => n.status === 'accepted').length;
    const totalRevised = allNodes.filter(n => n.status === 'revised').length;
    const totalSuperseded = allNodes.filter(n => n.status === 'superseded').length;
    const uniqueSources = new Set(allNodes.map(n => n.source_info?.source_file || n.doc_id).filter(Boolean)).size;

    const html = `
      <div class="space-y-8 animate-fade-in pb-20">
        <!-- Banner Header -->
        <div class="rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-700 p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="space-y-2.5 max-w-2xl">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <i data-lucide="git-commit" class="w-3.5 h-3.5 text-amber-200"></i> Decision Evolution & Source Provenance Hub
            </div>
            <h1 class="text-2xl md:text-3xl font-black tracking-tight">시계열 의사결정 변천사</h1>
            <p class="text-amber-100 text-xs md:text-sm leading-relaxed">
              시간 흐름에 따라 <strong>과거 안건이 왜 철회/대체되었고, 어떤 실측 근거와 BPR 검토를 거쳐 현재의 정본(Canonical)으로 확정되었는지</strong> 시계열 인과관계와 원천 출처(Source Provenance)를 완벽하게 추적합니다.
            </p>
          </div>

          <!-- KPI Metric Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 text-center">
            <div class="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
              <div class="text-[10px] text-amber-200 font-bold uppercase">변천 트랙</div>
              <div class="text-xl md:text-2xl font-black mt-0.5">${tracks.length}<span class="text-xs font-normal ml-0.5">개</span></div>
            </div>
            <div class="p-3 rounded-xl bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30">
              <div class="text-[10px] text-emerald-200 font-bold uppercase">현행 정본</div>
              <div class="text-xl md:text-2xl font-black mt-0.5 text-emerald-200">${totalAccepted}<span class="text-xs font-normal ml-0.5">건</span></div>
            </div>
            <div class="p-3 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/30">
              <div class="text-[10px] text-amber-200 font-bold uppercase">과도기 개정</div>
              <div class="text-xl md:text-2xl font-black mt-0.5 text-amber-200">${totalRevised}<span class="text-xs font-normal ml-0.5">건</span></div>
            </div>
            <div class="p-3 rounded-xl bg-rose-500/20 backdrop-blur-md border border-rose-400/30">
              <div class="text-[10px] text-rose-200 font-bold uppercase">대체/철회</div>
              <div class="text-xl md:text-2xl font-black mt-0.5 text-rose-200">${totalSuperseded}<span class="text-xs font-normal ml-0.5">건</span></div>
            </div>
          </div>
        </div>

        <!-- Filter & Control Toolbar -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <!-- Search Box -->
            <div class="relative flex-1 max-w-lg">
              <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
              <input type="text" id="evolution-search-input" value="${query}" placeholder="트랙명, 안건명, 출처 파일, 변천동인, 근거 키워드로 검색..." 
                     class="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition text-slate-900 dark:text-white">
              ${query ? `
                <button id="btn-clear-evolution-search" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>

            <!-- View Mode Switcher -->
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-500 dark:text-slate-400">조회 방식:</span>
              <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                <button id="btn-mode-timeline" class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${viewMode === 'timeline' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}">
                  <i data-lucide="git-commit" class="w-3.5 h-3.5"></i>
                  <span>타임라인 인과 뷰</span>
                </button>
                <button id="btn-mode-matrix" class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${viewMode === 'matrix' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}">
                  <i data-lucide="table-2" class="w-3.5 h-3.5"></i>
                  <span>시계열 비교 매트릭스</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Secondary Filter Bar: Category & Status Filters -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <!-- Category Tabs -->
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button class="evolution-cat-btn px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${activeCategory === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}" data-cat="all">
                전체 트랙 (${tracks.length})
              </button>
              ${state.data.categories.map(cat => {
                const count = tracks.filter(t => t.category === cat).length;
                if (count === 0) return '';
                return `
                  <button class="evolution-cat-btn px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${activeCategory === cat ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}" data-cat="${cat}">
                    ${cat} (${count})
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Decision Status Filter Chips -->
            <div class="flex items-center gap-1.5 shrink-0 overflow-x-auto">
              <span class="text-[11px] font-bold text-slate-400 mr-1">상태 필터:</span>
              <button class="evolution-status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${statusFilter === 'all' ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}" data-status="all">
                전체
              </button>
              <button class="evolution-status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${statusFilter === 'accepted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'}" data-status="accepted">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 현행 정본 (${totalAccepted})
              </button>
              <button class="evolution-status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${statusFilter === 'revised' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}" data-status="revised">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 과도기 개정 (${totalRevised})
              </button>
              <button class="evolution-status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${statusFilter === 'superseded' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'}" data-status="superseded">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 대체·철회 (${totalSuperseded})
              </button>
            </div>
          </div>
        </div>

        <!-- Result Content Area -->
        ${filteredTracks.length === 0 ? `
          <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
            <i data-lucide="filter-x" class="w-12 h-12 text-slate-400 mx-auto"></i>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">선택하신 조건에 부합하는 의사결정 변천 트랙이 없습니다.</h3>
            <p class="text-xs text-slate-500 max-w-md mx-auto">카테고리 필터나 검색어를 초기화하여 다른 트랙을 탐색해 보세요.</p>
            <button id="btn-reset-evolution-filters" class="mt-2 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition">
              필터 전체 초기화
            </button>
          </div>
        ` : `
          <div class="space-y-10">
            ${filteredTracks.map(track => viewMode === 'matrix' ? renderEvolutionMatrix(track) : renderTrackCard(track)).join('')}
          </div>
        `}
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Event Bindings
    // 1. Category filter
    appContainer.querySelectorAll('.evolution-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        renderEvolutionContent(cat);
      });
    });

    // 2. Status filter
    appContainer.querySelectorAll('.evolution-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.evolutionStatusFilter = btn.getAttribute('data-status');
        renderEvolutionContent(state.evolutionCategory);
      });
    });

    // 3. Search input
    const searchInput = document.getElementById('evolution-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          state.evolutionSearchQuery = searchInput.value;
          renderEvolutionContent(state.evolutionCategory);
        }
      });
      searchInput.addEventListener('input', (e) => {
        state.evolutionSearchQuery = e.target.value;
        clearTimeout(state._evSearchTimer);
        state._evSearchTimer = setTimeout(() => {
          renderEvolutionContent(state.evolutionCategory);
        }, 300);
      });
    }

    const clearSearchBtn = document.getElementById('btn-clear-evolution-search');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        state.evolutionSearchQuery = '';
        renderEvolutionContent(state.evolutionCategory);
      });
    }

    const resetBtn = document.getElementById('btn-reset-evolution-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.evolutionSearchQuery = '';
        state.evolutionStatusFilter = 'all';
        state.evolutionCategory = 'all';
        renderEvolutionContent('all');
      });
    }

    // 4. Mode Switchers
    const btnTimeline = document.getElementById('btn-mode-timeline');
    const btnMatrix = document.getElementById('btn-mode-matrix');
    if (btnTimeline) {
      btnTimeline.addEventListener('click', () => {
        state.evolutionViewMode = 'timeline';
        renderEvolutionContent(state.evolutionCategory);
      });
    }
    if (btnMatrix) {
      btnMatrix.addEventListener('click', () => {
        state.evolutionViewMode = 'matrix';
        renderEvolutionContent(state.evolutionCategory);
      });
    }

    // 5. AI Analyze Track Button (Enhanced with full context, evidence, and provenance)
    appContainer.querySelectorAll('.btn-ai-analyze-track').forEach(btn => {
      btn.addEventListener('click', () => {
        const trackId = btn.getAttribute('data-track-id');
        const track = (state.evolutionTracks || []).find(t => t.track_id === trackId);
        if (!track) return;

        let promptNodesSummary = (track.nodes || []).map((n, i) => {
          const statusTxt = n.status === 'accepted' ? '현행 정본' : (n.status === 'revised' ? '과도기 개정안' : '대체/철회');
          return `[단계 ${i + 1}] (${n.date}, ${statusTxt}) 안건: ${n.title}\n - 원본 출처: ${n.source_info?.source_file || n.doc_id} (${n.source_info?.source_notebook || '노트북LM'})\n - 변천 동인: ${n.time_analysis?.change_driver || n.rationale}\n - 판단 근거: ${n.time_analysis?.evidence || '현황 데이터'}\n - 핵심 변경: ${n.time_analysis?.key_changes || n.summary}`;
        }).join('\n\n');

        const q = `'${track.title}'(${track.category})의 의사결정 변천사에 대해 심층 브리핑해줘.\n\n아래 단계별 출처 정보와 시계열 인과관계 근거를 바탕으로:\n1. 과거 초기 결정이 왜 철회/대체되었는지 그 구체적 문제점과 촉발 동인\n2. BPR/ISP 워크숍 및 과도기 과정에서 제시된 핵심 데이터와 실측 근거\n3. 최종적으로 현재의 현행 유효 정본(Canonical)으로 채택된 핵심 사유와 파급 효과\n를 각 단계의 원본 출처를 명시하여 종합 브리핑해줘:\n\n${promptNodesSummary}`;

        window.location.hash = '#/qa';
        setTimeout(() => {
          const inp = document.getElementById('qa-input-query');
          if (inp) {
            inp.value = q;
            const submitBtn = document.getElementById('btn-submit-qa');
            if (submitBtn) submitBtn.click();
          }
        }, 150);
      });
    });

    // 6. 비교(Diff) 모드 — 3-3
    appContainer.querySelectorAll('.btn-track-diff').forEach(btn => {
      btn.addEventListener('click', () => {
        const track = (state.evolutionTracks || []).find(t => t.track_id === btn.getAttribute('data-track-id'));
        if (track) openTrackDiff(track);
      });
    });
  }

  // 7-0. 타임라인 비교(Diff) 모드 — 3-3(2026-09-21 48차). 트랙의 두 노드를 좌우 대조.
  //      본문은 /api/doc_body(T5 엔드포인트, ≤4,000자) 재사용. 문단 단위 대조: 한쪽에만 있는 문단을 색으로 표시.
  const trackDiffBodyCache = new Map();
  function diffNormPara(p) { return p.replace(/[#>*_`|\-\s]+/g, ' ').trim().toLowerCase(); }
  function splitParas(text) {
    return (text || '').split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length >= 8);
  }
  async function fetchTrackDiffBodies(ids) {
    const need = ids.filter(id => !trackDiffBodyCache.has(id));
    if (need.length) {
      try {
        const r = await fetch(`/api/doc_body?ids=${need.map(encodeURIComponent).join(',')}`);
        const j = await r.json();
        need.forEach(id => trackDiffBodyCache.set(id, (j.bodies || {})[id] || ''));
      } catch (e) { need.forEach(id => trackDiffBodyCache.set(id, '')); }
    }
    return ids.map(id => trackDiffBodyCache.get(id) || '');
  }
  function diffStatusMeta(status) {
    if (status === 'superseded') return { label: '🔴 대체·철회', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' };
    if (status === 'revised') return { label: '🟡 과도기 검토안', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
    return { label: '🟢 현행 정본', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
  }
  function renderDiffColumn(node, body, otherKeys, onlyCls) {
    const m = diffStatusMeta(node.status);
    const t = node.time_analysis || {};
    const paras = splitParas(body);
    let only = 0;
    const paraHtml = paras.map(p => {
      const isOnly = !otherKeys.has(diffNormPara(p));
      if (isOnly) only++;
      return `<p class="rounded px-2 py-1 whitespace-pre-wrap break-words ${isOnly ? onlyCls : 'text-slate-400 dark:text-slate-500'}">${escapeHtml(p)}</p>`;
    }).join('');
    return `
      <div class="min-w-0 flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="px-2 py-0.5 rounded font-bold ${m.cls}">${m.label}</span>
          <span class="font-mono text-slate-500">${escapeHtml(node.date || '')}</span>
        </div>
        <a href="#/doc/${encodeURIComponent(node.doc_id)}" class="text-sm font-bold text-slate-900 dark:text-white hover:underline">${escapeHtml(node.title || node.doc_id)}</a>
        <div class="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
          <div><strong>요약:</strong> ${escapeHtml(node.summary || '')}</div>
          ${t.key_changes ? `<div><strong>핵심 변천:</strong> ${escapeHtml(t.key_changes)}</div>` : ''}
          ${node.rationale ? `<div><strong>사유:</strong> ${escapeHtml(node.rationale)}</div>` : ''}
        </div>
        <div class="text-[10px] text-slate-400">본문 문단 ${paras.length} · 이쪽에만 ${only}${body ? '' : ' · 본문 없음(포털 서버 경유 필요)'}</div>
        <div class="text-[11px] leading-relaxed space-y-1 max-h-[50vh] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-slate-50 dark:bg-slate-900/60">${paraHtml || '<p class="text-slate-400">본문 없음</p>'}</div>
      </div>`;
  }
  async function renderTrackDiffPanes(track, leftIdx, rightIdx) {
    const panes = document.getElementById('track-diff-panes');
    if (!panes) return;
    const L = track.nodes[leftIdx], R = track.nodes[rightIdx];
    panes.innerHTML = '<div class="col-span-2 text-xs text-slate-400 py-6 text-center">본문 불러오는 중…</div>';
    const [lb, rb] = await fetchTrackDiffBodies([L.doc_id, R.doc_id]);
    const lk = new Set(splitParas(lb).map(diffNormPara)), rk = new Set(splitParas(rb).map(diffNormPara));
    panes.innerHTML = renderDiffColumn(L, lb, rk, 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200')
                    + renderDiffColumn(R, rb, lk, 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200');
  }
  function openTrackDiff(track) {
    const nodes = track.nodes || [];
    if (nodes.length < 2) return;
    let modal = document.getElementById('track-diff-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'track-diff-modal';
      modal.className = 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6';
      document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    const firstOld = Math.max(0, nodes.findIndex(n => n.status === 'superseded'));
    let lastNew = -1; nodes.forEach((n, i) => { if (n.status === 'accepted') lastNew = i; });
    if (lastNew < 0) lastNew = nodes.length - 1;
    let leftIdx = firstOld, rightIdx = lastNew === firstOld ? Math.min(firstOld + 1, nodes.length - 1) : lastNew;
    const opts = sel => nodes.map((n, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}. [${diffStatusMeta(n.status).label}] ${escapeHtml((n.title || '').slice(0, 60))}</option>`).join('');
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-700">
        <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-amber-600">비교(Diff) 모드 · ${escapeHtml(track.title)}</div>
            <div class="text-[10px] text-slate-400">좌: 과거안 / 우: 현행안. 한쪽에만 있는 문단을 색으로 표시(빨강=좌측만, 초록=우측만). 본문은 각 4,000자까지.</div>
          </div>
          <button id="track-diff-close" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-3 px-5 py-2 border-b border-slate-100 dark:border-slate-800">
          <select id="track-diff-left" class="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 min-w-0">${opts(leftIdx)}</select>
          <select id="track-diff-right" class="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 min-w-0">${opts(rightIdx)}</select>
        </div>
        <div id="track-diff-panes" class="grid grid-cols-2 gap-4 px-5 py-4 overflow-y-auto"></div>
      </div>`;
    const close = () => modal.classList.add('hidden');
    modal.querySelector('#track-diff-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    const rerender = () => renderTrackDiffPanes(track, +modal.querySelector('#track-diff-left').value, +modal.querySelector('#track-diff-right').value);
    modal.querySelector('#track-diff-left').addEventListener('change', rerender);
    modal.querySelector('#track-diff-right').addEventListener('change', rerender);
    if (window.lucide) lucide.createIcons();
    rerender();
  }

  // 7-1. Render Track Card in Chronological Timeline View
  function renderTrackCard(track) {
    const nodes = track.nodes || [];
    const statusFilter = state.evolutionStatusFilter || 'all';

    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-6">
        <!-- Track Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                ${track.category}
              </span>
              <span class="text-xs text-slate-400 font-medium">총 ${nodes.length}단계 의사결정 변천</span>
              <span class="text-xs text-slate-300 dark:text-slate-700">•</span>
              <span class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                <i data-lucide="layers" class="w-3.5 h-3.5"></i> 출처 연계 ${nodes.filter(n => n.source_info).length}개 완비
              </span>
              ${track.topic ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" title="주제허브 '${escapeHtml(track.topic)}' 생성 시 자동 작성 · v${track.version || 1} · ${escapeHtml(track.generated_at || '')}">🧩 허브 생성 v${track.version || 1}</span>` : ''}
              ${track.verification ? (() => {
                const v = track.verification, w = v.warnings || [];
                const structOk = v.files && v.dates && v.final_accepted;
                const warnN = (v.status_mismatch || 0) + w.length;  // 09-24: 내용 검증(근거 수치·변환일 날짜·Q&A·주제) 경고 포함
                const cls = !structOk ? 'bg-rose-100 text-rose-700' : warnN ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
                const tip = `파일 실재 ${v.files} · 날짜 단조 ${v.dates} · 최종 accepted ${v.final_accepted} · 상태 불일치 ${v.status_mismatch}건` + (w.length ? ' · ' + w.join(' · ') : '');
                return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}" title="${escapeHtml(tip)}">✓ 검증${warnN ? ` · 경고 ${warnN}` : ''}</span>`;
              })() : ''}
              ${track.new_candidates > 0 ? `<a href="#/hubs" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title="${escapeHtml((track.new_candidate_ids || []).join('\n'))}\n허브를 갱신하면 트랙도 다시 생성됩니다">⚠ 신규 후보 ${track.new_candidates}건</a>` : ''}
            </div>
            <h2 class="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="git-branch" class="w-5 h-5 text-amber-500"></i>
              ${track.title}
            </h2>
            <p class="text-xs text-slate-500 leading-relaxed max-w-3xl">
              ${track.description}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${nodes.length >= 2 ? `
            <button class="btn-track-diff inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs shadow transition" data-track-id="${track.track_id}" title="과거안과 현행안의 본문을 좌우로 대조">
              <i data-lucide="columns-2" class="w-4 h-4"></i>
              <span>비교(Diff)</span>
            </button>` : ''}
            <button class="btn-ai-analyze-track inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow transition" data-track-id="${track.track_id}">
              <i data-lucide="bot" class="w-4 h-4"></i>
              <span>AI 시계열 인과관계 브리핑</span>
            </button>
          </div>
        </div>

        <!-- Chronological Timeline Nodes -->
        <div class="relative pl-6 sm:pl-8 space-y-8 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          ${nodes.map((node, idx) => {
            const isMatchStatus = statusFilter === 'all' || node.status === statusFilter;
            const opacityClass = isMatchStatus ? '' : 'opacity-40 hover:opacity-100 transition';

            let badgeBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
            let dotBg = 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-900';
            let statusLabel = '🟢 현행 유효 정본 (Accepted Standard)';

            if (node.status === 'superseded') {
              badgeBg = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
              dotBg = 'bg-rose-500 ring-rose-200 dark:ring-rose-900';
              statusLabel = '🔴 과거 채택 안건 / 현재 대체·철회됨 (Superseded)';
            } else if (node.status === 'revised') {
              badgeBg = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
              dotBg = 'bg-amber-500 ring-amber-200 dark:ring-amber-900';
              statusLabel = '🟡 과도기 검토안 / 개정 프로세스 (Revised)';
            }

            const docObj = docMap.get(node.doc_id);
            const src = node.source_info || {};
            const time = node.time_analysis || {};

            return `
              <div class="relative group ${opacityClass}">
                <div class="absolute -left-6 sm:-left-8 top-1.5 w-3 h-3 rounded-full ${dotBg} ring-4 transition transform group-hover:scale-125"></div>

                <div class="card-glass rounded-xl p-5 md:p-6 space-y-4 hover:border-amber-500 dark:hover:border-amber-500 transition shadow-sm">
                  <!-- Node Top Status & Meta Header -->
                  <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded text-[11px] font-extrabold border ${badgeBg}">
                        ${statusLabel}
                      </span>
                      <span class="text-xs font-mono font-bold text-slate-500 flex items-center gap-1">
                        <i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${node.date}
                      </span>
                      ${time.phase ? `
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          ${time.phase}
                        </span>
                      ` : ''}
                    </div>

                    <span class="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded">
                      단계 ${idx + 1} / ${nodes.length}
                    </span>
                  </div>

                  <!-- Title & Summary -->
                  <div>
                    <h3 class="text-base md:text-lg font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition flex items-center gap-2">
                      <a href="#/doc/${encodeURIComponent(node.doc_id)}" class="hover:underline">
                        ${node.title}
                      </a>
                    </h3>
                    <p class="text-xs md:text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                      ${node.summary}
                    </p>
                  </div>

                  <!-- 📌 1. Provenance / Source Info Box -->
                  <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                    <div class="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                      <span class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                        <i data-lucide="folder-git-2" class="w-4 h-4"></i>
                        <span>원천 출처 정보 (Source Provenance)</span>
                      </span>
                      ${src.source_type ? `
                        <span class="text-[10px] px-2 py-0.5 rounded font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60">
                          ${src.source_type}
                        </span>
                      ` : ''}
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-600 dark:text-slate-300 text-[11px]">
                      <div>
                        <strong>원천 파일:</strong>
                        <span class="font-mono text-slate-800 dark:text-slate-200 break-all">${src.source_file || node.doc_id}</span>
                      </div>
                      ${src.source_notebook ? `
                        <div>
                          <strong>출처 노트북:</strong>
                          <span class="text-slate-800 dark:text-slate-200">${src.source_notebook}</span>
                        </div>
                      ` : ''}
                      ${docObj ? `
                        <div>
                          <strong>지식 분류:</strong>
                          <span class="text-slate-800 dark:text-slate-200">${docObj.category} (${docObj.doc_type || '일반'})</span>
                        </div>
                        <div>
                          <strong>문서 분량:</strong>
                          <span class="text-slate-800 dark:text-slate-200">약 ${docObj.char_count?.toLocaleString() || 0}자</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <!-- ⏱️ 2. Time-Series Analysis & Evidence Structured Grid -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <!-- Change Driver (변천/변경 촉발 요인) -->
                    <div class="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/70 dark:border-orange-800/50 text-xs space-y-1">
                      <div class="font-bold text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                        <i data-lucide="zap" class="w-3.5 h-3.5 text-orange-600"></i>
                        <span>변천 촉발 동인 (Change Trigger)</span>
                      </div>
                      <p class="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        ${time.change_driver || '이전 결정의 업무적 한계 및 시스템 연계 필요성에 의해 변천 추진'}
                      </p>
                    </div>

                    <!-- Evidence & Real Data (객관적 판단 근거 및 실측치) -->
                    <div class="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 text-xs space-y-1">
                      <div class="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-blue-600"></i>
                        <span>객관적 근거 및 실측치 (Evidence & Data)</span>
                      </div>
                      <p class="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        ${time.evidence || '현황 조사 및 업무 프로세스 데이터 분석 결과 반영'}
                      </p>
                    </div>

                    <!-- Key Changes from Prior Step (이전 대비 핵심 변천점) -->
                    <div class="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 text-xs space-y-1">
                      <div class="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                        <i data-lucide="git-pull-request" class="w-3.5 h-3.5 text-purple-600"></i>
                        <span>핵심 변천 내역 (Key Evolution Changes)</span>
                      </div>
                      <p class="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        ${time.key_changes || '이전 단계 대비 표준화 및 데이터 정합성 개선'}
                      </p>
                      ${time.link_from_prev ? `<p class="text-[11px] text-purple-800 dark:text-purple-300"><strong>직전 노드와의 관계:</strong> ${escapeHtml(time.link_from_prev)}</p>` : ''}
                    </div>

                    <!-- Impact & Outcome (파급 영향도 및 성과) -->
                    <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-xs space-y-1">
                      <div class="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
                        <span>파급 영향도 및 결과 (Impact & Outcome)</span>
                      </div>
                      <p class="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                        ${time.impact || '차기 프로세스 승인 및 지식위키 정본 표준화 달성'}
                      </p>
                    </div>
                  </div>

                  <!-- Decision Rationale (종합 사유) -->
                  ${node.rationale ? `
                    <div class="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <div class="font-bold flex items-center gap-1.5">
                        <i data-lucide="help-circle" class="w-3.5 h-3.5 text-amber-600"></i>
                        <span>의사결정 및 채택/대체 사유 (Decision Rationale)</span>
                      </div>
                      <div class="leading-relaxed pl-5 text-[11px]">${node.rationale}</div>
                    </div>
                  ` : ''}

                  <!-- Card Action Footer -->
                  <div class="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                    <div class="text-[10px] text-slate-400 flex items-center gap-1">
                      <i data-lucide="file-check" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>식별자: <code class="font-mono text-slate-500 dark:text-slate-400">${node.doc_id}</code></span>
                    </div>

                    <a href="#/doc/${encodeURIComponent(node.doc_id)}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-bold text-xs transition border border-blue-200 dark:border-blue-800">
                      <span>해당 지식 문서 원문 열람</span>
                      <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 7-2. Render Track in Comparison Matrix View (Table Format)
  function renderEvolutionMatrix(track) {
    const nodes = track.nodes || [];

    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
              ${track.category}
            </span>
            <h2 class="text-lg font-black text-slate-900 dark:text-white mt-1">
              ${track.title} <span class="text-xs font-normal text-slate-400">(시계열 비교 매트릭스)</span>
            </h2>
          </div>

          <button class="btn-ai-analyze-track inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow transition shrink-0" data-track-id="${track.track_id}">
            <i data-lucide="bot" class="w-4 h-4"></i>
            <span>AI 변천 인과 분석</span>
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-bold">
                <th class="p-3 w-28 shrink-0">단계 / 일자</th>
                <th class="p-3 w-32 shrink-0">의사결정 상태</th>
                <th class="p-3 min-w-[200px]">안건 및 주제</th>
                <th class="p-3 min-w-[200px]">변천 촉발 동인 (Trigger)</th>
                <th class="p-3 min-w-[220px]">판단 근거 & 실측 데이터</th>
                <th class="p-3 min-w-[200px]">핵심 변경사항 (Diff)</th>
                <th class="p-3 min-w-[180px]">원천 출처 정보</th>
                <th class="p-3 w-20 text-center">원문</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${nodes.map((n, i) => {
                let badgeColor = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200';
                let statusLabel = '🟢 현행 정본';
                if (n.status === 'superseded') {
                  badgeColor = 'text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200';
                  statusLabel = '🔴 대체·철회됨';
                } else if (n.status === 'revised') {
                  badgeColor = 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200';
                  statusLabel = '🟡 과도기 개정';
                }

                return `
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td class="p-3 font-mono">
                      <div class="font-bold text-slate-900 dark:text-white">단계 ${i + 1}</div>
                      <div class="text-[11px] text-slate-400">${n.date}</div>
                    </td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-extrabold border ${badgeColor} inline-block">
                        ${statusLabel}
                      </span>
                    </td>
                    <td class="p-3">
                      <a href="#/doc/${encodeURIComponent(n.doc_id)}" class="font-bold text-slate-900 dark:text-white hover:text-amber-600 transition block">
                        ${n.title}
                      </a>
                      <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">${n.summary}</p>
                    </td>
                    <td class="p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      ${n.time_analysis?.change_driver || n.rationale}
                    </td>
                    <td class="p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                      ${n.time_analysis?.evidence || '-'}
                    </td>
                    <td class="p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      ${n.time_analysis?.key_changes || '-'}
                    </td>
                    <td class="p-3 text-[11px]">
                      <div class="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[160px]" title="${n.source_info?.source_file || n.doc_id}">
                        ${n.source_info?.source_file || n.doc_id}
                      </div>
                      ${n.source_info?.source_notebook ? `
                        <div class="text-[10px] text-slate-400 truncate max-w-[160px]" title="${n.source_info?.source_notebook}">
                          ${n.source_info?.source_notebook}
                        </div>
                      ` : ''}
                    </td>
                    <td class="p-3 text-center">
                      <a href="#/doc/${encodeURIComponent(n.doc_id)}" class="p-1.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 inline-flex" title="원문 열람">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 8. Render Full Reading History View (#/history)
  function renderHistoryView() {
    state.currentView = 'history';

    fetch('/api/read_history')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          state.readHistory = data;
          localStorage.setItem('okf_read_history', JSON.stringify(data));
        }
        renderHistoryContent();
      })
      .catch(() => {
        renderHistoryContent();
      });
  }

  function renderHistoryContent(filterSearch = '') {
    const list = state.readHistory || [];
    
    const filtered = list.filter(item => {
      if (!filterSearch) return true;
      const q = filterSearch.toLowerCase();
      return item.title.toLowerCase().includes(q) || (item.category && item.category.toLowerCase().includes(q));
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const groups = {
      today: [],
      yesterday: [],
      pastWeek: [],
      older: []
    };

    filtered.forEach(item => {
      const itemDate = (item.read_at || '').slice(0, 10);
      if (itemDate === todayStr) {
        groups.today.push(item);
      } else if (itemDate === yesterdayStr) {
        groups.yesterday.push(item);
      } else {
        const itemD = new Date(itemDate);
        const diffDays = (new Date() - itemD) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) {
          groups.pastWeek.push(item);
        } else {
          groups.older.push(item);
        }
      }
    });

    const html = `
      <div class="space-y-8 animate-fade-in pb-20">
        <div class="rounded-2xl bg-gradient-to-r from-slate-800 via-indigo-900 to-blue-900 p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <i data-lucide="history" class="w-3.5 h-3.5 text-blue-300"></i> Reading History & State Restoration
            </div>
            <h1 class="text-2xl md:text-3xl font-black">최근 조회 문서 히스토리</h1>
            <p class="text-slate-200 text-xs md:text-sm max-w-2xl">
              조회했던 모든 문서와 당시의 <strong>화면 모드(단일/듀얼 비교 뷰)</strong>가 보존되어 있어 과거 작업 맥락으로 즉시 복귀할 수 있습니다.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button id="btn-clear-all-history" class="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> 히스토리 전체 지우기
            </button>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-4 text-xs">
            <div class="font-bold text-slate-700 dark:text-slate-200">
              총 열람 기록: <span class="text-blue-600 dark:text-blue-400 font-extrabold text-sm">${list.length}건</span>
            </div>
            <span class="text-slate-300 dark:text-slate-700">|</span>
            <div class="text-slate-500">
              오늘 조회: <span class="font-bold text-slate-800 dark:text-slate-200">${groups.today.length}건</span>
            </div>
          </div>

          <div class="relative max-w-xs w-full">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
            <input 
              type="text" 
              id="history-search-input" 
              placeholder="히스토리 내 문서 검색..." 
              value="${filterSearch}"
              class="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            >
          </div>
        </div>

        ${filtered.length === 0 ? `
          <div class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
            <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <i data-lucide="history" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-200">열람 히스토리가 없습니다.</h3>
            <p class="text-xs text-slate-500">위키 문서를 열람하면 자동으로 히스토리 타임라인에 기록됩니다.</p>
          </div>
        ` : `
          <div class="space-y-8">
            ${renderHistoryGroup('오늘 조회한 문서', groups.today)}
            ${renderHistoryGroup('어제 조회한 문서', groups.yesterday)}
            ${renderHistoryGroup('최근 7일 이내', groups.pastWeek)}
            ${renderHistoryGroup('이전 기록', groups.older)}
          </div>
        `}
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    const searchInp = document.getElementById('history-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        renderHistoryContent(e.target.value.trim());
      });
    }

    const btnClearAll = document.getElementById('btn-clear-all-history');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        if (confirm('모든 열람 히스토리를 초기화하시겠습니까?')) {
          state.readHistory = [];
          localStorage.removeItem('okf_read_history');
          fetch('/api/read_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear' })
          }).then(() => renderHistoryContent());
          renderSidebarRecents();
        }
      });
    }

    appContainer.querySelectorAll('.btn-del-history-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const docId = btn.getAttribute('data-id');
        if (docId) {
          state.readHistory = state.readHistory.filter(h => h.id !== docId);
          localStorage.setItem('okf_read_history', JSON.stringify(state.readHistory));
          fetch('/api/read_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: docId })
          }).then(() => renderHistoryContent(filterSearch));
          renderSidebarRecents();
        }
      });
    });
  }

  function renderHistoryGroup(title, items) {
    if (!items || items.length === 0) return '';

    return `
      <div class="space-y-3">
        <div class="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i>
          <span>${title} (${items.length})</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${items.map(item => {
            const timeStr = (item.read_at || '').slice(11, 16) || '';
            const isSplit = (item.view_mode === 'split' || (item.hash && item.hash.includes('view=split')));
            
            return `
              <div class="card-glass rounded-xl p-4 flex flex-col justify-between group hover:border-blue-500 dark:hover:border-blue-500 transition shadow-sm">
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded ${item.doc_type === '재구성' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}">
                        ${item.doc_type || '문서'}
                      </span>
                      <span class="text-[10px] text-slate-500">${item.category || ''}</span>
                    </div>

                    <div class="flex items-center gap-2">
                      <span class="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <i data-lucide="clock" class="w-3 h-3"></i> ${timeStr || item.read_at}
                      </span>
                      <button class="btn-del-history-item text-slate-400 hover:text-rose-500 transition p-0.5" data-id="${item.id}" title="기록 삭제">
                        &times;
                      </button>
                    </div>
                  </div>

                  <h3 class="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-2">
                    <a href="${item.hash || `#/doc/${encodeURIComponent(item.id)}`}">${item.title}</a>
                  </h3>
                </div>

                <div class="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span class="text-[10px] px-2 py-0.5 rounded-full ${isSplit ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                    ${isSplit ? '✨ 듀얼 비교 뷰 상태' : '📄 단일 리더 뷰 상태'}
                  </span>

                  <a href="${item.hash || `#/doc/${encodeURIComponent(item.id)}`}" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    <span>화면 복원 열기</span>
                    <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 9. Render AI Q&A View (#/qa)
  function renderQAView() {
    state.currentView = 'qa';

    const html = `
      <div class="space-y-8 animate-fade-in pb-20">
        <div class="rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              OKF RAG Multi-Model Intelligence
            </div>
            <h1 class="text-2xl md:text-3xl font-black">AI 지식 묻고 답하기 & 복리 축적</h1>
            <p class="text-purple-100 text-xs md:text-sm max-w-2xl">
              1,780개 내 위키 지식을 기반으로 <strong>Claude, Gemini, Perplexity</strong>에게 묻고, 도출된 통찰을 다시 <strong>개인지식위키 정본 지식으로 복리 축적</strong>합니다.
            </p>
          </div>

          <div class="flex flex-wrap gap-2 text-[11px] font-bold">
            <span class="px-2.5 py-1.5 rounded-lg bg-white/15 backdrop-blur-md text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Claude
            </span>
            <span class="px-2.5 py-1.5 rounded-lg bg-white/15 backdrop-blur-md text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Gemini
            </span>
            <span class="px-2.5 py-1.5 rounded-lg bg-white/15 backdrop-blur-md text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Perplexity
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label for="qa-input-query" class="text-xs font-bold text-slate-700 dark:text-slate-200">
                    질문 입력 (위키 지식 RAG 자동 연동)
                  </label>
                  <div class="flex items-center gap-2">
                    <button id="btn-clear-qa-query" class="hidden text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 py-1 px-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 transition shadow-sm" title="입력란을 깨끗이 비우고 새 질문 작성">
                      <i data-lucide="eraser" class="w-3.5 h-3.5"></i>
                      <span>새 질문 작성 (지우기)</span>
                    </button>
                    <span class="text-[11px] text-slate-400">Ctrl + Enter 로 즉시 질의</span>
                  </div>
                </div>
                <div class="relative">
                  <textarea 
                    id="qa-input-query" 
                    rows="3" 
                    placeholder="새로운 질문을 입력하세요... (예: 스마트무역원장의 핵심 기능과 기대 효과를 설명해줘)" 
                    class="w-full p-3.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none resize-none transition"
                  ></textarea>
                  <button id="btn-input-quick-clear" class="hidden absolute right-3 top-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition" title="내용 지우기">
                    <i data-lucide="x" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-bold text-slate-400">추천 질문:</span>
                  <button id="btn-restore-last-query" class="hidden text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold">
                    <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
                    <span>직전 질문 다시 불러오기</span>
                  </button>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button class="qa-chip text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-600 transition">
                    💡 스마트무역원장의 핵심 기능과 기대 효과는?
                  </button>
                  <button class="qa-chip text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-600 transition">
                    💡 내국신용장과 구매확인서의 주요 차이점은?
                  </button>
                  <button class="qa-chip text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-600 transition">
                    💡 하네스 엔지니어링 설계 원칙과 에이전트 연계는?
                  </button>
                </div>
              </div>

              <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold text-slate-600 dark:text-slate-300">엔진:</span>
                  <select id="qa-engine-select" class="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-purple-700 dark:text-purple-300 outline-none">
                    <option value="quick">💬 빠른 답 (근거 발췌 + Gemini, 막히면 로컬 Ollama)</option>
                    <option value="all" selected>🏆 3대 AI 동시 비교 (Claude + Gemini + Perplexity)</option>
                    <option value="claude">⚡ Claude 3.5 (Anthropic)</option>
                    <option value="gemini">✨ Gemini 3.6 Flash (Google)</option>
                    <option value="perplexity">🌐 Perplexity Sonar (웹 결합)</option>
                    <option value="ollama">💻 Ollama (로컬 프라이빗)</option>
                  </select>
                </div>

                <div class="flex items-center gap-2">
                  <button id="btn-new-qa-thread" class="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs transition flex items-center gap-1.5" title="이전 대화 맥락을 비우고 새 주제로 시작">
                    <i data-lucide="message-square-plus" class="w-4 h-4"></i>
                    <span>새 대화</span>
                  </button>
                  <button id="btn-submit-qa" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                    <span>AI에게 질의하기</span>
                  </button>
                </div>
              </div>
            </div>

            <div id="qa-thread" class="hidden card-glass rounded-2xl p-5 space-y-2"></div>

            <div id="qa-result-card" class="hidden space-y-6">
              <div id="qa-sources-panel" class="card-glass rounded-2xl p-5 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 uppercase tracking-wider">
                    <i data-lucide="book-open" class="w-4 h-4 text-blue-500"></i>
                    참고한 내부 위키 지식 근거 (Grounding Sources)
                  </h3>
                  <span id="qa-sources-count" class="text-[11px] text-slate-400 font-medium"></span>
                </div>
                <div id="qa-sources-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
              </div>

              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-6 md:p-8 shadow-sm space-y-6">
                <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    <span id="qa-answer-title" class="font-bold text-sm text-slate-900 dark:text-white">AI 종합 답변 및 분석</span>
                  </div>

                  <button id="btn-save-to-canonical" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition" title="이 질의응답을 개인지식위키 정본 지식으로 영구 저장하고 포털에 즉시 색인">
                    <i data-lucide="arrow-down-to-dot" class="w-3.5 h-3.5"></i>
                    <span>개인지식위키 정본 지식으로 복리 축적</span>
                  </button>
                </div>

                <div id="qa-answer-content" class="wiki-prose"></div>
              </div>

              <div id="qa-followups" class="hidden card-glass rounded-2xl p-5 space-y-2"></div>
            </div>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="layers" class="w-4 h-4 text-indigo-600"></i>
                AI Q&A 복리축적 이력
              </h2>
              <button id="btn-refresh-qa-history" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i> 갱신
              </button>
            </div>

            <div id="qa-history-list" class="space-y-3">
              <div class="p-6 text-center text-xs text-slate-400 card-glass rounded-xl">
                축적된 Q&A 지식 내역을 불러오는 중...
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    const qInput = document.getElementById('qa-input-query');
    const btnClear = document.getElementById('btn-clear-qa-query');
    const btnQuickClear = document.getElementById('btn-input-quick-clear');
    const btnRestore = document.getElementById('btn-restore-last-query');

    function toggleClearButtons() {
      const hasText = qInput && qInput.value.trim().length > 0;
      if (btnClear) btnClear.classList.toggle('hidden', !hasText);
      if (btnQuickClear) btnQuickClear.classList.toggle('hidden', !hasText);
    }

    function clearForNewQuestion() {
      if (qInput) {
        qInput.value = '';
        qInput.focus();
      }
      toggleClearButtons();
      if (btnRestore && state.lastQaState && state.lastQaState.query) {
        btnRestore.classList.remove('hidden');
      }
    }

    if (qInput) {
      qInput.addEventListener('input', toggleClearButtons);
    }

    if (btnClear) btnClear.addEventListener('click', clearForNewQuestion);
    if (btnQuickClear) btnQuickClear.addEventListener('click', clearForNewQuestion);

    if (btnRestore) {
      btnRestore.addEventListener('click', () => {
        if (state.lastQaState && state.lastQaState.query) {
          if (qInput) {
            qInput.value = state.lastQaState.query;
            qInput.focus();
          }
          toggleClearButtons();
          btnRestore.classList.add('hidden');
        }
      });
    }

    document.querySelectorAll('.qa-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.replace('💡', '').trim();
        if (qInput) qInput.value = text;
        toggleClearButtons();
        submitQA();
      });
    });

    if (qInput) {
      qInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          submitQA();
        }
      });
    }

    document.getElementById('btn-submit-qa').addEventListener('click', () => submitQA());
    document.getElementById('btn-new-qa-thread').addEventListener('click', () => {
      state.qaThread = [];
      state.lastQaState = null;
      try { sessionStorage.removeItem('okf_qa_thread'); sessionStorage.removeItem('okf_last_qa'); } catch (e) {}
      saveQaSeed(null);
      renderQaThread();
      const rc = document.getElementById('qa-result-card');
      if (rc) rc.classList.add('hidden');
      clearForNewQuestion();
    });
    loadAndRenderQAHistory();
    document.getElementById('btn-refresh-qa-history').addEventListener('click', loadAndRenderQAHistory);

    // [개선] 브라우저 뒤로가기/앞으로가기 등으로 복귀 시 이전 질문 및 답변 결과 자동 복원
    restoreLastQaState();

    // 저장된 대화 문서에서 「이 대화 이어가기」로 들어온 경우 새 라운드 시작
    if (state.pendingRound) {
      const p = state.pendingRound;
      state.pendingRound = null;
      startRoundFromDoc(p.doc_id, p.title);
    }
  }

  // 이어 묻기 대화 흐름 — 최신 턴은 아래 상세 카드에, 그 이전 턴만 여기 접어서 쌓는다(10-01)
  function loadQaThread() {
    if (!Array.isArray(state.qaThread)) {
      try { state.qaThread = JSON.parse(sessionStorage.getItem('okf_qa_thread') || '[]'); } catch (e) { state.qaThread = []; }
      if (!Array.isArray(state.qaThread)) state.qaThread = [];
    }
    return state.qaThread;
  }

  // 라운드 방식 — 저장된 대화에서 이어받은 요약(seed). 새 대화를 시작하면 비운다(10-01)
  function loadQaSeed() {
    if (state.qaSeed === undefined) {
      try { state.qaSeed = JSON.parse(sessionStorage.getItem('okf_qa_seed') || 'null'); } catch (e) { state.qaSeed = null; }
    }
    return state.qaSeed;
  }
  function saveQaSeed(seed) {
    state.qaSeed = seed;
    try { seed ? sessionStorage.setItem('okf_qa_seed', JSON.stringify(seed)) : sessionStorage.removeItem('okf_qa_seed'); } catch (e) {}
  }

  // 저장된 대화 문서의 「이 대화 이어가기」 → 지금 대화를 비우고, 요약 + 추천 질문을 받아 새 라운드를 연다
  async function startRoundFromDoc(docId, title) {
    state.qaThread = [];
    state.lastQaState = null;
    try { sessionStorage.removeItem('okf_qa_thread'); sessionStorage.removeItem('okf_last_qa'); } catch (e) {}
    const rc = document.getElementById('qa-result-card');
    if (rc) rc.classList.add('hidden');
    saveQaSeed({ doc_id: docId, title, summary: '', suggestions: [], loading: true });
    renderQaThread();
    let seed = { doc_id: docId, title, summary: '', suggestions: [] };
    try {
      const res = await fetch('/api/qa_continue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc_id: docId }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || res.status);
      seed = { doc_id: docId, title: d.title || title, summary: d.summary, suggestions: d.suggestions || [] };
    } catch (e) {
      seed.error = `요약을 만들지 못했습니다: ${e.message}`;
    }
    saveQaSeed(seed.summary ? seed : null);
    if (!seed.summary) { renderQaThread(); alert(seed.error); return; }
    renderQaThread();
  }

  // 대화 전체 저장 직후 안내 — 저장 문서를 찾아가지 않고 그 자리에서 다음 라운드로 넘어가게 한다
  function showRoundNotice(docId, title) {
    const box = document.getElementById('qa-thread');
    if (!box) return;
    let n = document.getElementById('qa-round-notice');
    if (!n) { n = document.createElement('div'); n.id = 'qa-round-notice'; box.appendChild(n); }
    n.className = 'rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2';
    n.innerHTML = `<span>✓ 대화를 저장했습니다. <b>현재까지 대화를 요약하고 새롭게 3턴을 계속할 수 있습니다.</b>
        (나중에 저장 문서 하단의 「이 대화 이어가기」로도 시작할 수 있습니다)</span>
      <button class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition shrink-0">요약하고 새 3턴 이어가기</button>`;
    n.querySelector('button').addEventListener('click', () => startRoundFromDoc(docId, title));
  }

  function renderQaThread() {
    const box = document.getElementById('qa-thread');
    if (!box) return;
    const prev = loadQaThread().slice(0, -1);
    const seed = loadQaSeed();
    box.classList.toggle('hidden', prev.length === 0 && !seed);
    if (!prev.length && !seed) { box.innerHTML = ''; return; }
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const btnCls = 'shrink-0 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-bold text-[11px] transition';
    const seedHtml = !seed ? '' : `
      <div class="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 px-3.5 py-2.5 space-y-2">
        <div class="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <i data-lucide="link-2" class="w-4 h-4"></i> 이어받은 대화: <a href="#/doc/${encodeURIComponent(seed.doc_id)}" class="underline">${esc(seed.title)}</a></div>
        ${seed.loading ? `<div class="text-[11px] text-slate-500">이전 라운드 요약과 추천 질문을 만드는 중…</div>` : `
        <details ${loadQaThread().length ? '' : 'open'}>
          <summary class="cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-300">이전 라운드 요약 (다음 질문들의 맥락으로 전달됨)</summary>
          <div class="wiki-prose mt-1 text-sm">${window.marked ? marked.parse(seed.summary || '') : esc(seed.summary)}</div>
        </details>
        ${!loadQaThread().length && (seed.suggestions || []).length ? `<div class="flex flex-wrap gap-1.5">` + seed.suggestions.map((q, i) => `
          <button class="qa-seed-q text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-600 transition text-left" data-idx="${i}">💡 ${esc(q)}</button>`).join('') + `</div>` : ''}`}
      </div>`;
    const total = loadQaThread().length;
    box.innerHTML = seedHtml + (!prev.length && !(seed && total) ? '' : `<div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <i data-lucide="messages-square" class="w-4 h-4 text-purple-500"></i> ${prev.length ? `이전 대화 (${prev.length}턴 — 최근 3턴이 다음 질문의 맥락으로 전달됨)` : '이번 라운드'}</span>
        <button id="btn-save-thread" class="${btnCls}" title="이번 라운드 대화 ${total}턴(아래 최신 답변 포함)${seed ? '과 이전 라운드 요약' : ''}을 정본 문서 1건으로 저장">대화 전체 저장 (${total}턴)</button>
      </div>`)
      + (total >= 3 ? `
      <div id="qa-round-notice" class="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
        💡 대화가 ${total}턴에 이르렀습니다. AI 에게는 최근 3턴만 맥락으로 전달되므로, 더 앞의 내용은 점점 빠집니다.
        <b>「대화 전체 저장」</b>을 누르면 <b>현재까지 대화를 요약하고 새롭게 3턴을 계속할 수 있습니다.</b>
      </div>` : '')
      + prev.map((t, i) => `
        <details class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 px-3.5 py-2">
          <summary class="cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">Q${i + 1}. ${esc(t.query)}
            <span class="ml-1 text-[10px] font-normal text-slate-400">${esc((t.engine || '').toUpperCase())}${t.chosen ? ' 선택' : ''}</span></summary>
          <div class="flex justify-end mt-2"><button class="qa-turn-save ${btnCls}" data-idx="${i}" title="이 질문과 답변만 정본 문서로 저장">이 턴만 저장</button></div>
          <div class="wiki-prose mt-2 text-sm">${window.marked ? marked.parse(t.answer || '') : esc(t.answer)}</div>
        </details>`).join('');
    box.querySelectorAll('.qa-turn-save').forEach(b => b.addEventListener('click', () => {
      const t = state.qaThread[+b.dataset.idx];
      onThreadSave(b, '저장', () => saveQaToWiki(t.query, t.answer, t.engine || 'AI', t.sources));
    }));
    const all = document.getElementById('btn-save-thread');
    if (all) all.addEventListener('click', () => {
      const d = buildThreadDoc(state.qaThread);
      onThreadSave(all, '대화 전체 저장', async () => {
        const s = await saveQaToWiki(d.question, d.answer, d.engine, d.sources);
        if (s && s.doc_id) showRoundNotice(s.doc_id, d.question);
        return s;
      });
    });
    box.querySelectorAll('.qa-seed-q').forEach(b => b.addEventListener('click', () => {
      const qInput = document.getElementById('qa-input-query');
      if (qInput) qInput.value = seed.suggestions[+b.dataset.idx];
      submitQA();
    }));
    if (window.lucide) lucide.createIcons();
  }

  // 답변 뒤 「이어서 물어볼 만한 질문」 — 답변 표시를 늦추지 않도록 별도 요청. 늦게 온 옛 응답은 버린다(10-01)
  let followupSeq = 0;
  async function loadFollowupSuggestions(query, answer, sources) {
    const box = document.getElementById('qa-followups');
    if (!box || !answer) { if (box) box.classList.add('hidden'); return; }
    const seq = ++followupSeq;
    const head = `<div class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <i data-lucide="message-circle-question" class="w-4 h-4 text-purple-500"></i> 이어서 물어볼 만한 질문</div>`;
    box.innerHTML = head + `<div class="text-[11px] text-slate-400">추천 질문 만드는 중…</div>`;
    box.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    let list = [];
    try {
      const res = await fetch('/api/qa_suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query, answer,
          sources: (sources || []).map(s => ({ title: s.title })),
          history: loadQaThread().slice(0, -1).slice(-3).map(t => ({ q: t.query })),
          seed_summary: (loadQaSeed() || {}).summary || ''
        })
      });
      if (res.ok) list = (await res.json()).suggestions || [];
    } catch (e) {}
    if (seq !== followupSeq) return;
    if (!list.length) { box.classList.add('hidden'); return; }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = head + `<div class="flex flex-wrap gap-1.5">` + list.map(q => `
        <button class="qa-followup text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-600 transition text-left">💡 ${esc(q)}</button>`).join('') + `</div>`;
    box.querySelectorAll('.qa-followup').forEach((b, i) => b.addEventListener('click', () => {
      const qInput = document.getElementById('qa-input-query');
      if (qInput) qInput.value = list[i];
      submitQA();
    }));
    if (window.lucide) lucide.createIcons();
  }

  // 이전 Q&A 상태 복원 함수 (뒤로가기/앞으로가기 완벽 지원)
  function restoreLastQaState() {
    renderQaThread();
    let saved = state.lastQaState;
    if (!saved) {
      try {
        const stored = sessionStorage.getItem('okf_last_qa');
        if (stored) saved = JSON.parse(stored);
      } catch (e) {}
    }

    if (saved && saved.query && saved.data) {
      const qInput = document.getElementById('qa-input-query');
      const eSelect = document.getElementById('qa-engine-select');
      const btnClear = document.getElementById('btn-clear-qa-query');
      const btnQuickClear = document.getElementById('btn-input-quick-clear');

      if (qInput) {
        qInput.value = saved.query;
        if (btnClear) btnClear.classList.remove('hidden');
        if (btnQuickClear) btnQuickClear.classList.remove('hidden');
      }
      if (eSelect && saved.engine) eSelect.value = saved.engine;
      renderQaResultCard(saved.query, saved.data.mode === 'quick' ? saved.data.engine : saved.engine, saved.data);
    }
  }

  async function submitQA() {
    const queryInput = document.getElementById('qa-input-query');
    const query = queryInput.value.trim();
    const engine = document.getElementById('qa-engine-select').value;

    if (!query) {
      alert('질문 내용을 입력해주세요.');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-qa');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>위키 RAG 검색 및 AI 분석 중...</span>`;
    if (window.lucide) lucide.createIcons();

    try {
      const res = await fetch('/api/ai_ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, engine, history: loadQaThread().slice(-3).map(t => ({ q: t.query, a: t.answer })),
          seed_summary: (loadQaSeed() || {}).summary || '', seed_title: (loadQaSeed() || {}).title || '' })
      });

      if (!res.ok) throw new Error('AI 질의 응답 실패');

      const data = await res.json();

      // 상태 저장 (브라우저 뒤로가기/앞으로가기 시 복원용)
      state.lastQaState = { query, engine, data };
      loadQaThread().push({ query, engine: data.mode === 'quick' ? data.engine : (engine === 'all' ? Object.keys(data.responses || {})[0] : engine), answer: Object.values(data.responses || {})[0] || '',
        sources: (data.sources || []).map(s => ({ id: s.id, title: s.title, category: s.category })) });
      try {
        sessionStorage.setItem('okf_last_qa', JSON.stringify(state.lastQaState));
        sessionStorage.setItem('okf_qa_thread', JSON.stringify(state.qaThread.slice(-20)));
      } catch (e) {}
      renderQaThread();

      // 빠른 답은 실제로 편집한 엔진(gemini/ollama)으로 표시·축적한다
      renderQaResultCard(query, data.mode === 'quick' ? data.engine : engine, data);

    } catch (err) {
      alert(`AI 질의 도중 오류가 발생했습니다: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>AI에게 질의하기</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }

  // 서버 verify_answer 결과 표시 — 없는 근거 번호·근거에 없는 숫자를 알린다(09-29)
  function verifyNoteHtml(v) {
    if (!v) return '';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const issues = [];
    if ((v.bad_refs || []).length) issues.push(`근거 목록에 없는 번호 ${v.bad_refs.map(n => '[' + n + ']').join(' ')}`);
    if ((v.unsupported_numbers || []).length) issues.push(`근거에서 찾지 못한 숫자 ${v.unsupported_numbers.map(esc).join(', ')}`);
    if (!issues.length) {
      return `<div class="not-prose mb-3 text-[11px] text-emerald-700 dark:text-emerald-400">✓ 근거 대조 통과 — 인용 번호 ${(v.refs || []).length}종 · 숫자 모두 근거에 있음</div>`;
    }
    return `<div class="not-prose mb-3 p-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
      ⚠ <b>근거 대조 경고</b> — ${issues.join(' · ')}. 해당 부분은 원문으로 확인하십시오.</div>`;
  }

  // Q&A 결과 렌더링 및 무이동 복리축적 핸들러
  function renderQaResultCard(query, engine, data) {
    const resultCard = document.getElementById('qa-result-card');
    const sourcesCount = document.getElementById('qa-sources-count');
    const sourcesList = document.getElementById('qa-sources-list');
    const answerContent = document.getElementById('qa-answer-content');
    if (!resultCard || !answerContent) return;

    resultCard.classList.remove('hidden');

    const sources = data.sources || [];
    sourcesCount.textContent = `총 ${sources.length}개 문서 인용`;
    if (sources.length > 0) {
      sourcesList.innerHTML = sources.map((s, idx) => `
        <div onclick="window.openDocModal('${encodeURIComponent(s.id).replace(/'/g, "\\'")}')" class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 hover:border-purple-500 hover:bg-purple-50/40 dark:hover:bg-purple-950/30 transition block group cursor-pointer shadow-xs">
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <span class="w-4 h-4 rounded-md bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-2xs">${idx + 1}</span>
              <span class="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-purple-600 truncate">
                ${s.title}
              </span>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 shrink-0 font-medium">
              ${s.category}
            </span>
            ${s.via ? `<span class="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0" title="이 근거를 찾은 경로">${[...s.via].map(c => ({ L: '키워드', S: '의미', F: '본문' }[c] || c)).join('+')}</span>` : ''}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2.5">${s.snippet}</p>
          <div class="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
            <span class="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1 group-hover:underline">
              <i data-lucide="book-open" class="w-3 h-3"></i> 팝업으로 문서 열람
            </span>
            <a href="#/doc/${encodeURIComponent(s.id)}" onclick="event.stopPropagation()" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-0.5 hover:underline text-[10px]" title="새 탭/전체 페이지로 열기">
              <span>전체 열기</span>
              <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
            </a>
          </div>
        </div>
      `).join('');
    } else {
      sourcesList.innerHTML = `<div class="text-xs text-slate-400 col-span-2">내부 위키에서 직접적으로 일치하는 문서가 없습니다.</div>`;
    }

    const responses = data.responses || {};
    let activeEngine = engine;
    let activeAnswerMarkdown = '';

    const saveBtn = document.getElementById('btn-save-to-canonical');

    function updateSaveBtnState(eng) {
      if (!saveBtn) return;
      saveBtn.disabled = false;
      saveBtn.className = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition';
      const label = eng === 'all' ? '종합' : eng.toUpperCase();
      saveBtn.innerHTML = `<i data-lucide="arrow-down-to-dot" class="w-3.5 h-3.5"></i><span>[${label}] 정본 지식으로 복리 축적</span>`;
      if (window.lucide) lucide.createIcons();
    }

    // QA 답변 내부의 링크 클릭 시 전체 이동 대신 팝업 모달로 열기 지원
    function bindQaAnswerPopupEvents(container) {
      if (!container) return;
      // .wiki-internal-link 처리
      container.querySelectorAll('.wiki-internal-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#/doc/')) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const docId = decodeURIComponent(href.replace('#/doc/', ''));
            openDocModal(docId);
          });
          link.title = (link.title ? link.title + ' ' : '') + '(클릭 시 팝업 열람)';
        }
      });
    }

    if (engine === 'all') {
      const engineKeys = Object.keys(responses);
      activeEngine = engineKeys[0] || 'all';
      activeAnswerMarkdown = responses[activeEngine] || '';

      let tabHeaders = engineKeys.map((k, idx) => `
        <button class="qa-ans-tab px-3.5 py-1.5 rounded-lg text-xs font-bold ${idx === 0 ? 'bg-purple-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'} transition" data-engine="${k}" data-target="ans-${k}">
          ${k.toUpperCase()}
        </button>
      `).join('');

      let tabPanes = engineKeys.map((k, idx) => `
        <div id="ans-${k}" class="qa-ans-pane ${idx === 0 ? '' : 'hidden'} space-y-3">
          <div class="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center justify-between">
            <span>🤖 ${k.toUpperCase()} 모델 응답</span>
            <button class="qa-pick-ans px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition" data-engine="${k}" title="이 답변을 대화 맥락으로 삼고, 다음 질문부터 ${k.toUpperCase()} 로 이어 묻기">✔ 이 답변으로 이어가기</button>
          </div>
          <div class="wiki-prose">
            ${verifyNoteHtml((data.verification || {})[k])}
            ${formatQaReferencesWithPopups(parseWikiLinks(parseAlerts(window.marked ? marked.parse(responses[k]) : responses[k])), sources)}
          </div>
        </div>
      `).join('');

      answerContent.innerHTML = `
        <div class="space-y-4">
          <div id="qa-pick-hint" class="not-prose text-[11px] text-slate-500 dark:text-slate-400"></div>
          <div class="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            ${tabHeaders}
          </div>
          ${tabPanes}
        </div>
      `;

      // 3대 동시 비교 → 사용자가 고른 답변으로 대화를 잇고, 다음 질문부터는 그 엔진 단독으로 묻는다(10-01)
      const curTurn = loadQaThread()[state.qaThread.length - 1];
      function syncPickUi() {
        const chosen = curTurn && curTurn.chosen ? curTurn.engine : '';
        const hint = document.getElementById('qa-pick-hint');
        if (hint) hint.innerHTML = chosen
          ? `✔ <b>${chosen.toUpperCase()}</b> 답변으로 대화를 이어갑니다 — 다음 질문은 ${chosen.toUpperCase()} 단독으로 묻습니다. 다시 비교하려면 엔진을 「3대 AI 동시 비교」로 바꾸십시오.`
          : `세 답변을 비교해 가장 나은 답의 「✔ 이 답변으로 이어가기」를 누르십시오. 고르지 않으면 첫 답변(${(engineKeys[0] || '').toUpperCase()})이 이어집니다.`;
        answerContent.querySelectorAll('.qa-pick-ans').forEach(b => {
          const on = b.dataset.engine === chosen;
          b.textContent = on ? '✔ 선택됨 — 이 답변으로 이어가는 중' : '✔ 이 답변으로 이어가기';
          b.className = `qa-pick-ans px-2.5 py-1 rounded-md text-[11px] font-bold transition ${on ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`;
        });
      }
      answerContent.querySelectorAll('.qa-pick-ans').forEach(b => b.addEventListener('click', () => {
        if (!curTurn) return;
        const eng = b.dataset.engine;
        Object.assign(curTurn, { engine: eng, answer: responses[eng] || '', chosen: true });
        try { sessionStorage.setItem('okf_qa_thread', JSON.stringify(state.qaThread.slice(-20))); } catch (e) {}
        const sel = document.getElementById('qa-engine-select');
        if (sel && [...sel.options].some(o => o.value === eng)) sel.value = eng;
        syncPickUi();
        loadFollowupSuggestions(query, curTurn.answer, sources);
      }));
      syncPickUi();

      updateSaveBtnState(activeEngine);
      bindQaAnswerPopupEvents(answerContent);

      // 탭 전환 시 화면 이동 없이 현재 답변과 축적 타겟만 동적 전환
      document.querySelectorAll('.qa-ans-tab').forEach(tb => {
        tb.addEventListener('click', () => {
          document.querySelectorAll('.qa-ans-tab').forEach(t => t.className = 'qa-ans-tab px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition');
          document.querySelectorAll('.qa-ans-pane').forEach(p => p.classList.add('hidden'));

          tb.className = 'qa-ans-tab px-3.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white transition';
          const targetId = tb.getAttribute('data-target');
          const eng = tb.getAttribute('data-engine');
          activeEngine = eng;
          activeAnswerMarkdown = responses[eng] || '';

          const pane = document.getElementById(targetId);
          if (pane) {
            pane.classList.remove('hidden');
            bindQaAnswerPopupEvents(pane);
          }

          updateSaveBtnState(activeEngine);
        });
      });

    } else {
      activeAnswerMarkdown = responses[engine] || Object.values(responses)[0] || '';
      const quickHead = data.mode === 'quick' ? `
        <div class="not-prose mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-xs text-purple-700 dark:text-purple-300">
          <span>💬 <b>빠른 답</b> — 발췌 근거를 ${engine === 'ollama' ? '로컬 Ollama' : 'Gemini'}가 편집</span>
          <button id="btn-qa-deep" class="px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold">자세히 보기 (보고서형)</button>
        </div>` : '';
      answerContent.innerHTML = quickHead + verifyNoteHtml((data.verification || {})[engine])
        + formatQaReferencesWithPopups(parseWikiLinks(parseAlerts(window.marked ? marked.parse(activeAnswerMarkdown) : activeAnswerMarkdown)), sources);
      updateSaveBtnState(engine);
      bindQaAnswerPopupEvents(answerContent);
      const deep = document.getElementById('btn-qa-deep');
      if (deep) deep.addEventListener('click', () => {
        document.getElementById('qa-engine-select').value = 'gemini';
        document.getElementById('btn-submit-qa').click();
      });
    }

    if (window.lucide) lucide.createIcons();

    // 3대 비교 턴은 사용자가 고른 답(없으면 첫 답)으로 후속 질문을 만든다
    const lastTurn = loadQaThread()[state.qaThread.length - 1];
    loadFollowupSuggestions(query, (engine === 'all' && lastTurn && lastTurn.chosen) ? lastTurn.answer : activeAnswerMarkdown, sources);

    // [개선 핵심] 복리 축적 클릭 시 새로고침/화면이동 없이 즉시 저장 & 현재 화면 100% 유지!
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>'${activeEngine.toUpperCase()}' 축적 저장 중...</span>`;
        if (window.lucide) lucide.createIcons();

        try {
          if (await saveQaToWiki(query, activeAnswerMarkdown, activeEngine, sources)) {
            // 1) 버튼 상태를 '축적 완료'로 변경
            saveBtn.className = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-800 text-white font-bold text-xs shadow cursor-default';
            saveBtn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-300"></i><span>[${activeEngine.toUpperCase()}] 축적 완료!</span>`;
            if (window.lucide) lucide.createIcons();

            // 3) 화면 상단 알림 배너 (토스트) 안내 (화면 이동 없음!)
            const existingBanner = document.getElementById('qa-success-banner');
            if (existingBanner) existingBanner.remove();

            const banner = document.createElement('div');
            banner.id = 'qa-success-banner';
            banner.className = 'p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between mb-4 animate-fade-in shadow-sm';
            banner.innerHTML = `
              <div class="flex items-center gap-2">
                <i data-lucide="sparkles" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"></i>
                <span><b>${activeEngine.toUpperCase()}</b> 모델의 답변이 <b>개인지식위키 정본 지식</b>으로 성공적으로 축적되었습니다! 화면 이동 없이 다른 엔진 탭을 눌러 다른 답변도 확인하거나 추가 축적하실 수 있습니다.</span>
              </div>
              <button onclick="this.parentElement.remove()" class="text-emerald-500 hover:text-emerald-700 ml-2 font-bold">&times;</button>
            `;
            const parentPanel = resultCard.querySelector('.bg-white, .dark\\:bg-slate-900');
            if (parentPanel) {
              parentPanel.insertBefore(banner, parentPanel.firstChild);
              if (window.lucide) lucide.createIcons();
            }

          } else {
            throw new Error('저장 실패');
          }
        } catch (sErr) {
          alert('저장 중 오류가 발생했습니다: ' + sErr.message);
          updateSaveBtnState(activeEngine);
        }
      };
    }
  }

  // Q&A 정본 저장 공통 — 상세 카드의 「복리 축적」·이전 턴 저장·대화 전체 저장이 같은 경로(/api/save_qa_doc)를 쓴다
  async function saveQaToWiki(question, answer, engine, sources) {
    sources = sources || [];
    const category = sources.length > 0 ? sources[0].category : 'AI & 테크놀로지';
    const saveRes = await fetch('/api/save_qa_doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, engine, sources, category })
    });
    if (!saveRes.ok) return null;
    const sData = await saveRes.json();

    // [즉시 메모리 동기화] Q&A 저장 즉시 docMap과 state에 신규 정본 등록 (화면 이동 시 100% 즉시 열람)
    const savedDocId = sData.doc_id;
    const newDoc = {
      id: savedDocId,
      title: sData.title || `[Q&A] ${question}`,
      category,
      topic: question,
      tags: ['AI질의응답', '복리축적지식'],
      content: `> 🤖 **답변 엔진:** ${engine.toUpperCase()}\n\n## 💡 AI 종합 답변 및 통찰\n\n${answer}` +
        (sources.length ? `\n\n## 🔗 참고한 위키 지식 근거 (References)\n` + sources.map(s => `- **[${s.title}](#/doc/${encodeURIComponent(s.id)})** (${s.category})`).join('\n') : ''),
      doc_type: '지식 Q&A 통찰',
      source: `OKF AI Q&A (${engine})`,
      created: new Date().toISOString().slice(0, 10),
      status: 'canonical'
    };
    docMap.set(savedDocId, newDoc);
    if (!savedDocId.endsWith('.md')) {
      docMap.set(savedDocId + '.md', newDoc);
    }
    if (state.data && state.data.documents) {
      state.data.documents = [newDoc, ...state.data.documents.filter(d => d.id !== savedDocId)];
      state.data.total_docs = state.data.documents.length;
    }
    // 사이드바 Q&A 히스토리 실시간 갱신 (화면 새로고침 없이)
    await loadAndRenderQAHistory();
    return sData;
  }

  // 대화 전체를 문서 1건으로 — 턴별 「Q/A + 그 턴의 근거」를 그대로 이어 붙인다(LLM 재요약 없음: 내용 손실·환각 방지)
  function buildThreadDoc(turns) {
    // 라운드 방식으로 이어받은 대화면 계보 링크와 이전 라운드 요약을 앞에 둔다 — 다음 라운드가 이 문서를 다시 이어받을 수 있게
    const seed = loadQaSeed();
    const seedPart = seed && seed.summary
      ? `> 이어받은 대화: [${seed.title}](#/doc/${encodeURIComponent(seed.doc_id)})\n\n### 이전 라운드 요약\n\n${seed.summary}\n\n---\n\n` : '';
    const answer = seedPart + turns.map((t, i) => {
      const refs = (t.sources || []).map((s, j) => `[${j + 1}] ${s.title}`).join(' · ');
      return `### Q${i + 1}. ${t.query}\n\n${t.answer}` + (refs ? `\n\n> 이 턴의 근거: ${refs}` : '');
    }).join('\n\n---\n\n');
    const seen = new Set();
    const sources = turns.flatMap(t => t.sources || []).filter(s => s && s.id && !seen.has(s.id) && seen.add(s.id));
    const engine = [...new Set(turns.map(t => t.engine).filter(Boolean))].join('+') || 'AI';
    return { question: `${turns[0].query} — 이어진 대화 ${turns.length}턴`, answer, engine, sources };
  }

  async function onThreadSave(btn, label, task) {
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.textContent = '저장 중...';
    try {
      if (!(await task())) throw new Error('저장 실패');
      btn.textContent = `✓ ${label} 완료`;
    } catch (e) {
      alert('저장 중 오류가 발생했습니다: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }

  async function loadAndRenderQAHistory() {
    const listContainer = document.getElementById('qa-history-list');
    try {
      const res = await fetch('/api/qa_history');
      if (res.ok) {
        const items = await res.json();
        state.qaHistory = items;
        renderSidebarQAHistory();

        if (!listContainer) return;
        if (items.length === 0) {
          listContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 card-glass rounded-xl">아직 복리 축적된 Q&A 지식이 없습니다.</div>`;
          return;
        }

        listContainer.innerHTML = items.slice(0, 15).map(item => `
          <div class="card-glass rounded-xl p-4 space-y-2 group">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                ${item.category}
              </span>
              <span class="text-[10px] text-slate-400 font-mono">${item.created_at || ''}</span>
            </div>

            <h3 class="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-purple-600 line-clamp-2">
              <a href="#/doc/${encodeURIComponent(item.id || item.filename)}">${item.title}</a>
            </h3>

            <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>엔진: ${item.engine || 'AI'}</span>
              <a href="#/doc/${encodeURIComponent(item.id || item.filename)}" class="text-purple-600 dark:text-purple-400 font-bold hover:underline">
                문서 열기 &rarr;
              </a>
            </div>
          </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
      }
    } catch (e) {
      if (listContainer) {
        listContainer.innerHTML = `<div class="p-4 text-xs text-slate-400 card-glass rounded-xl">이력을 불러오지 못했습니다.</div>`;
      }
    }
  }

  // 10-A. 주제허브 (#/hubs) — 작업지시서_20260918. 생성 폼 + 진행상황 폴링 + 목록.
  let hubPollTimer = null;
  const HUB_STAGE_LABELS = [
    ['candidate_search', '후보 검색'], ['content_generation', '콘텐츠 생성 (LLM)'],
    ['saving', '저장 · 정본화'], ['indexing', '색인 · 임베딩'], ['verifying', '검증 3종'],
    ['track_generation', '변천사 트랙 생성'],
  ];
  const HUB_VERIFY_LABELS = [['vector', '벡터 보유'], ['lexical', '어휘 시드풀'], ['semantic', '의미 유사도 ≥0.75']];
  const HUB_CATEGORY_CHOICES = ['전자무역', 'AI', '경영', '인문', '영어', '기타'];

  function renderHubsView() {
    state.currentView = 'hubs';
    if (hubPollTimer) { clearInterval(hubPollTimer); hubPollTimer = null; }

    appContainer.innerHTML = `
      <div class="space-y-8 animate-fade-in pb-20">
        <div class="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <i data-lucide="layers" class="w-3.5 h-3.5"></i> OKF Topic Hub Generator
            </div>
            <h1 class="text-2xl md:text-3xl font-black">주제허브</h1>
            <p class="text-emerald-100 text-xs md:text-sm">주제어 하나로 정본 문서를 종합한 허브 문서를 무인 생성·저장·색인·검증합니다. 색인과 임베딩까지 수 분이 걸립니다.</p>
          </div>
          <button id="btn-hub-open-form" class="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition border border-white/20 flex items-center gap-2 self-start md:self-auto">
            <i data-lucide="sparkles" class="w-4 h-4"></i> 🧩 주제허브 생성
          </button>
        </div>

        <div id="hub-form" class="hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">주제어 <span class="text-rose-500">*</span></label>
              <input type="text" id="hub-topic" maxlength="60" placeholder="예: 원산지증명서" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">카테고리 <span class="text-[11px] text-slate-400 font-normal">(비우면 자동판정)</span></label>
              <select id="hub-category" class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium outline-none">
                <option value="">자동 판정</option>
                ${HUB_CATEGORY_CHOICES.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button id="btn-hub-create" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition">
              <i data-lucide="play" class="w-4 h-4"></i><span>생성 시작</span>
            </button>
            <span id="hub-form-msg" class="text-xs text-rose-500"></span>
          </div>
        </div>

        <div id="hub-progress" class="hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm"></div>

        <div>
          <h2 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><i data-lucide="list" class="w-4 h-4"></i> 주제허브 목록</h2>
          <div id="hub-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"><p class="text-xs text-slate-400">불러오는 중…</p></div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById('btn-hub-open-form').addEventListener('click', () => {
      document.getElementById('hub-form').classList.toggle('hidden');
      document.getElementById('hub-topic').focus();
    });
    document.getElementById('btn-hub-create').addEventListener('click', hubCreate);
    document.getElementById('hub-topic').addEventListener('keydown', e => { if (e.key === 'Enter') hubCreate(); });

    hubLoadList();
    const savedJob = localStorage.getItem('okf_hub_job');
    if (savedJob) hubStartPolling(savedJob);
  }

  async function hubCreate() {
    const topic = document.getElementById('hub-topic').value.trim();
    const category = document.getElementById('hub-category').value;
    const msg = document.getElementById('hub-form-msg');
    msg.textContent = '';
    if (!topic) { msg.textContent = '주제어를 입력하십시오.'; return; }
    const btn = document.getElementById('btn-hub-create');
    btn.disabled = true;
    try {
      await hubSubmit(topic, category);
      document.getElementById('hub-form').classList.add('hidden');
    } catch (err) {
      msg.textContent = `생성 요청 실패: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  // 신규 생성과 기존 허브 갱신(재생성=교체)이 같은 API 를 탄다. 서버가 같은 주제를 찾아 교체 모드로 돈다.
  async function hubSubmit(topic, category) {
    const res = await fetch('/api/create_topic_hub', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, category })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = data.error || `HTTP ${res.status}`;
      const form = document.getElementById('hub-form');
      if (!form || form.classList.contains('hidden')) alert(`허브 생성 요청 실패: ${m}`);  // 갱신 버튼 경로(폼 닫힘)엔 표시할 곳이 없다
      throw new Error(m);
    }
    localStorage.setItem('okf_hub_job', data.job_id);
    hubStartPolling(data.job_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hubStartPolling(jobId) {
    if (hubPollTimer) clearInterval(hubPollTimer);
    const tick = async () => {
      let job;
      try {
        const res = await fetch(`/api/topic_hub_status?job_id=${encodeURIComponent(jobId)}`);
        if (res.status === 404) { localStorage.removeItem('okf_hub_job'); clearInterval(hubPollTimer); hubPollTimer = null; return; }
        job = await res.json();
      } catch (e) { return; }
      if (state.currentView !== 'hubs') { clearInterval(hubPollTimer); hubPollTimer = null; return; }
      hubRenderProgress(job);
      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(hubPollTimer); hubPollTimer = null;
        localStorage.removeItem('okf_hub_job');
        if (job.status === 'done') hubLoadList();
      }
    };
    tick();
    hubPollTimer = setInterval(tick, 1500);
  }

  function hubRenderProgress(job) {
    const box = document.getElementById('hub-progress');
    if (!box) return;
    box.classList.remove('hidden');
    const stageIdx = HUB_STAGE_LABELS.findIndex(([k]) => k === job.stage);
    const stageRows = HUB_STAGE_LABELS.map(([key, label], i) => {
      let icon = 'circle', cls = 'text-slate-300';
      if (job.stages && job.stages[key]) { icon = 'check-circle-2'; cls = 'text-emerald-500'; }
      else if (key === job.stage && job.status === 'running') { icon = 'loader-2'; cls = 'text-blue-500 animate-spin'; }
      else if (key === job.stage && job.status === 'failed') { icon = 'x-circle'; cls = 'text-rose-500'; }
      else if (key === job.stage && job.status === 'category_required') { icon = 'help-circle'; cls = 'text-amber-500'; }
      const sub = (key === job.stage && job.substage)  /* 09-24: 모든 단계 — Gemini 대기 초 표시 */ ? ` <span class="text-[10px] text-slate-400">(${escapeHtml(job.substage)})</span>` : '';
      return `<li class="flex items-center gap-2 text-xs ${i <= stageIdx ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}"><i data-lucide="${icon}" class="w-4 h-4 ${cls}"></i>${label}${sub}</li>`;
    }).join('');
    const verifyRows = HUB_VERIFY_LABELS.map(([key, label]) => {
      const v = job.verification ? job.verification[key] : null;
      const icon = v === true ? 'check-circle-2' : v === false ? 'x-circle' : 'circle';
      const cls = v === true ? 'text-emerald-500' : v === false ? 'text-rose-500' : 'text-slate-300';
      const extra = key === 'semantic' && job.verification_detail && job.verification_detail.semantic_score != null ? ` <span class="text-[10px] text-slate-400">(${job.verification_detail.semantic_score})</span>` : '';
      return `<li class="flex items-center gap-2 text-xs"><i data-lucide="${icon}" class="w-4 h-4 ${cls}"></i>${label}${extra}</li>`;
    }).join('');

    let footer = '';
    if (job.status === 'category_required') {
      footer = `
        <div class="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
          <p class="text-xs font-bold text-amber-800 dark:text-amber-200">카테고리를 자동으로 판정하지 못했습니다. 저장할 카테고리를 선택하십시오.</p>
          <div class="flex items-center gap-2">
            <select id="hub-cat-pick" class="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              ${HUB_CATEGORY_CHOICES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <button id="btn-hub-cat-submit" class="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">카테고리 확정 후 계속</button>
            <span id="hub-cat-msg" class="text-xs text-rose-500"></span>
          </div>
        </div>`;
    } else if (job.status === 'failed') {
      footer = `<div class="mt-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 font-mono whitespace-pre-wrap">실패 단계: ${escapeHtml(job.stage || '-')}\n${escapeHtml(job.error || '')}</div>`;
    } else if (job.status === 'done') {
      footer = `<div class="mt-4 flex items-center gap-3">
          <a href="#/doc/${encodeURIComponent(job.doc_id)}" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4"></i> 허브 열람</a>
          ${job.track ? `<a href="#/evolution" class="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-2"><i data-lucide="git-branch" class="w-4 h-4"></i> 변천사 ${job.track.nodes}노드</a>` : ''}
          <span class="text-[11px] text-slate-400 font-mono">${escapeHtml(job.doc_id || '')}</span>
        </div>${job.track_error ? `<div class="mt-2 text-[11px] text-rose-600">변천사 트랙 실패(허브는 정상): ${escapeHtml(job.track_error)}</div>` : ''}`;
    }
    const lastLog = (job.log || []).slice(-3).map(l => `<div>${escapeHtml(l)}</div>`).join('');
    box.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">"${escapeHtml(job.topic)}" 허브 생성 — ${escapeHtml(job.status)}${job.category ? ` · ${escapeHtml(job.category)}` : ''}</h3>
        <span class="text-[10px] font-mono text-slate-400">${escapeHtml(job.job_id.slice(0, 8))}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ul class="space-y-2">${stageRows}</ul>
        <div><p class="text-[11px] font-bold text-slate-500 mb-2">검증 3종 (규약 §5-A)</p><ul class="space-y-2">${verifyRows}</ul></div>
      </div>
      ${footer}
      <div class="mt-3 text-[10px] font-mono text-slate-400 space-y-0.5">${lastLog}</div>`;
    if (window.lucide) lucide.createIcons();

    const catBtn = document.getElementById('btn-hub-cat-submit');
    if (catBtn) catBtn.addEventListener('click', async () => {
      const category = document.getElementById('hub-cat-pick').value;
      try {
        const res = await fetch(`/api/topic_hub_job/${encodeURIComponent(job.job_id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      } catch (err) {
        document.getElementById('hub-cat-msg').textContent = `실패: ${err.message}`;
      }
    });
  }

  async function hubLoadList() {
    const el = document.getElementById('hub-list');
    if (!el) return;
    try {
      const res = await fetch('/api/topic_hubs');
      const data = await res.json();
      const hubs = data.hubs || [];
      // 다른 탭·API 로 시작된 진행 중 job 도 이 화면에서 이어서 보여준다
      if (data.running_job_id && !hubPollTimer) hubStartPolling(data.running_job_id);
      if (!hubs.length) { el.innerHTML = '<p class="text-xs text-slate-400">아직 생성된 주제허브가 없습니다.</p>'; return; }
      const badge = (ok, label) => `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}">${ok ? '✓' : '✗'} ${label}</span>`;
      const staleBadge = (h) => {
        if (h.new_candidates == null) return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">기준선 없음</span>';
        if (h.new_candidates > 0) return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title="${escapeHtml((h.new_candidate_ids || []).join('\n'))}">⚠ 신규 후보 ${h.new_candidates}건</span>`;
        return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">최신</span>';
      };
      // 09-24: 내용 검증(인용·근거 수치·연도·AI 산출물·변천 절) — 서버 hub_verify_content 결과
      const contentBadge = (h) => {
        const c = h.content_check;
        if (!c) return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">내용 미검사</span>';
        const w = c.warnings || [];
        const cls = w.length ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
        const tip = `인용 ${c.cited}/${c.listed} · 수치 원문 ${(c.numbers_in_source || []).join('/')}` + (w.length ? '\n' + w.join('\n') : '');
        return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}" title="${escapeHtml(tip)}">${w.length ? `⚠ 내용 경고 ${w.length}` : '내용 ✓'}</span>`;
      };
      el.innerHTML = hubs.map(h => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border ${h.new_candidates > 0 ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-800'} p-5 shadow-sm space-y-2">
          <div class="flex items-center justify-between gap-2">
            <a href="#/doc/${encodeURIComponent(h.doc_id)}" class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate hover:text-emerald-600">🧩 ${escapeHtml(h.topic)}</a>
            <span class="text-[10px] text-slate-400 whitespace-nowrap">v${h.version || 1} · ${escapeHtml((h.updated_at || h.created_at || '').slice(0, 10))}</span>
          </div>
          <p class="text-[11px] text-slate-500">${escapeHtml(h.category || '')} · 후보 ${h.candidates || 0}건</p>
          <div class="flex flex-wrap items-center gap-1.5">${badge(h.verification && h.verification.vector, '벡터')}${badge(h.verification && h.verification.lexical, '어휘')}${badge(h.verification && h.verification.semantic, `의미 ${h.semantic_score != null ? h.semantic_score : ''}`)}${staleBadge(h)}${contentBadge(h)}</div>
          <div class="flex items-center gap-2 pt-1">
            <a href="#/doc/${encodeURIComponent(h.doc_id)}" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200">열람</a>
            ${h.track_id ? `<a href="#/evolution" class="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-xs font-semibold text-amber-700 dark:text-amber-300">📈 변천사</a>` : ''}
            <button class="btn-hub-regen px-3 py-1.5 rounded-lg ${h.new_candidates > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-xs font-bold" data-topic="${escapeHtml(h.topic)}" data-category="${escapeHtml(h.category || '')}" title="같은 주제로 다시 생성해 이 허브를 덮어씁니다">🔄 갱신 (v${(h.version || 1) + 1})</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('.btn-hub-regen').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm(`"${btn.dataset.topic}" 허브를 다시 생성해 현재 문서를 덮어씁니다. 진행할까요?`)) return;
        hubSubmit(btn.dataset.topic, btn.dataset.category);
      }));
    } catch (e) {
      el.innerHTML = `<p class="text-xs text-rose-500">목록 조회 실패: ${escapeHtml(e.message)}</p>`;
    }
  }

  // 10. Render Ingestion View (#/ingest)
  function renderIngestView() {
    state.currentView = 'ingest';

    const html = `
      <div class="space-y-8 animate-fade-in pb-20">
        <div class="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> OKF Knowledge Ingestion Engine
            </div>
            <h1 class="text-2xl md:text-3xl font-black">지식 수집 및 스크랩 등록</h1>
            <p class="text-blue-100 text-xs md:text-sm">
              외부 조사 자료, 기사 스크랩, 실무 메모를 붙여넣으면 표준 YAML Frontmatter 및 Graphify 관계망이 자동 부착된 개인지식위키 정본 지식으로 변환·축적됩니다.
            </p>
          </div>

          <button id="btn-quick-fill-sample" class="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition border border-white/20 flex items-center gap-2 self-start md:self-auto">
            <i data-lucide="file-input" class="w-4 h-4"></i> 샘플 양식 채우기
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-5">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>문서 제목 (Title) <span class="text-rose-500">*</span></span>
                  <span class="text-[11px] text-slate-400 font-normal">미입력 시 본문 첫 줄에서 자동 추출</span>
                </label>
                <input 
                  type="text" 
                  id="ingest-title" 
                  placeholder="예: [AI 실무] 프롬프트 엔지니어링 및 루프 구조화 가이드" 
                  class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    지식 카테고리 (Category) <span class="text-rose-500">*</span>
                  </label>
                  <select id="ingest-category" class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                    ${state.data.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    문서 성격 / 유형 (Nature)
                  </label>
                  <select id="ingest-nature" class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="조사 및 스크랩 지식">조사 및 스크랩 지식</option>
                    <option value="실무 매뉴얼 및 가이드">실무 매뉴얼 및 가이드</option>
                    <option value="원문 요약 분석본">원문 요약 분석본</option>
                    <option value="비즈니스 전략 리포트">비즈니스 전략 리포트</option>
                    <option value="아이디어 및 실무 메모">아이디어 및 실무 메모</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    주제 / 핵심 요약 (Topic)
                  </label>
                  <input 
                    type="text" 
                    id="ingest-topic" 
                    placeholder="예: LLM 하네스 아키텍처 및 업무 자동화 파이프라인" 
                    class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    출처 / 원문 URL (Source)
                  </label>
                  <input 
                    type="text" 
                    id="ingest-source" 
                    placeholder="예: https://... 또는 KTNET 내부 기획서" 
                    class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-slate-700 dark:text-slate-200">
                    핵심 태그 (쉼표로 구분)
                  </label>
                  <button id="btn-auto-extract-tags" type="button" class="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> 본문 기반 태그 자동 추출
                  </button>
                </div>
                <input 
                  type="text" 
                  id="ingest-tags" 
                  placeholder="예: 전자무역, 스마트무역원장, AI에이전트, 프롬프트 (쉼표 구분)" 
                  class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                >
              </div>

              <div class="pt-2">
                <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700 mb-3">
                  <div class="flex items-center gap-2">
                    <button id="tab-btn-edit" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold transition flex items-center gap-1.5">
                      <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> 편집 (붙여넣기)
                    </button>
                    <button id="tab-btn-preview" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition flex items-center gap-1.5">
                      <i data-lucide="eye" class="w-3.5 h-3.5"></i> 실시간 미리보기
                    </button>
                  </div>
                  <span id="char-counter" class="text-xs text-slate-400 font-mono">0자</span>
                </div>

                <div id="editor-container">
                  <textarea 
                    id="ingest-content" 
                    rows="14" 
                    placeholder="수집한 조사 자료나 스크랩 텍스트, 마크다운 원문을 이곳에 복사하여 붙여넣으세요..."
                    class="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                  ></textarea>
                </div>

                <div id="preview-container" class="hidden p-6 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 min-h-[350px] max-h-[500px] overflow-y-auto wiki-prose text-xs">
                  <div class="text-slate-400 text-center py-10">본문을 입력하면 실시간으로 정본 렌더링 결과가 표시됩니다.</div>
                </div>
              </div>

              <div class="pt-4 flex items-center justify-end gap-3">
                <button id="btn-save-ingest" type="button" class="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-lg hover:shadow-xl transition flex items-center gap-2">
                  <i data-lucide="upload-cloud" class="w-4 h-4"></i>
                  <span>개인지식위키 정본 지식으로 등록 & 인덱싱</span>
                </button>
              </div>

            </div>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="clock" class="w-4 h-4 text-purple-600"></i>
                최근 등록된 지식 내역
              </h2>
              <button id="btn-refresh-history" class="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-bold">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i> 갱신
              </button>
            </div>

            <div id="recent-ingested-list" class="space-y-3">
              <div class="p-6 text-center text-xs text-slate-400 card-glass rounded-xl">
                최근 등록된 내역을 불러오는 중...
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    const tabBtnEdit = document.getElementById('tab-btn-edit');
    const tabBtnPreview = document.getElementById('tab-btn-preview');
    const editorContainer = document.getElementById('editor-container');
    const previewContainer = document.getElementById('preview-container');
    const contentTextarea = document.getElementById('ingest-content');
    const charCounter = document.getElementById('char-counter');

    contentTextarea.addEventListener('input', () => {
      charCounter.textContent = `${contentTextarea.value.length.toLocaleString()}자`;
    });

    tabBtnEdit.addEventListener('click', () => {
      tabBtnEdit.className = 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold transition flex items-center gap-1.5';
      tabBtnPreview.className = 'px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition flex items-center gap-1.5';
      editorContainer.classList.remove('hidden');
      previewContainer.classList.add('hidden');
    });

    tabBtnPreview.addEventListener('click', () => {
      tabBtnPreview.className = 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold transition flex items-center gap-1.5';
      tabBtnEdit.className = 'px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition flex items-center gap-1.5';
      editorContainer.classList.add('hidden');
      previewContainer.classList.remove('hidden');

      const raw = contentTextarea.value;
      const cleaned = cleanAndStructureMarkdown(raw);
      previewContainer.innerHTML = parseWikiLinks(parseAlerts(window.marked ? marked.parse(cleaned) : cleaned));
    });

    document.getElementById('btn-auto-extract-tags').addEventListener('click', () => {
      const text = contentTextarea.value;
      if (!text) {
        alert('본문 내용을 먼저 입력하거나 붙여넣어 주세요.');
        return;
      }
      const words = text.match(/[가-힣A-Za-z0-9_]{2,}/g) || [];
      const stopWords = new Set(['있다', '하는', '위한', '통해', '있는', '대한', '것이다', '등의', '따라', '경우', '그리고', '하지만', '또한', '수도', '이를', '우리', '모든', '에서', '으로', '로써']);
      const freq = {};
      words.forEach(w => {
        if (!stopWords.has(w) && isNaN(w) && w.length >= 2) {
          freq[w] = (freq[w] || 0) + 1;
        }
      });
      const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([w]) => w);
      
      if (topWords.length > 0) {
        const currentTags = document.getElementById('ingest-tags').value;
        const newTags = currentTags ? `${currentTags}, ${topWords.join(', ')}` : topWords.join(', ');
        document.getElementById('ingest-tags').value = newTags;
      }
    });

    document.getElementById('btn-quick-fill-sample').addEventListener('click', () => {
      document.getElementById('ingest-title').value = '[AI 실무 가이드] 하네스 엔지니어링과 멀티 에이전트 오케스트레이션';
      document.getElementById('ingest-category').value = 'AI & 테크놀로지';
      document.getElementById('ingest-nature').value = '실무 매뉴얼 및 가이드';
      document.getElementById('ingest-topic').value = 'Codex와 Claude Code 기반 멀티 에이전트 하네스 설계 원리';
      document.getElementById('ingest-source').value = '사내 기술 세미나 발표자료';
      document.getElementById('ingest-tags').value = '하네스, 멀티에이전트, Claude, LLM, 워크플로우';
      contentTextarea.value = `### 개요 및 문제의식\n거대 언어 모델(LLM)을 단일 프롬프트로만 운영할 경우 긴 컨텍스트에서의 정보 누락과 환각 현상이 빈번히 발생합니다. 이를 극복하기 위해 역할을 분할하고 상태를 제어하는 **하네스 엔지니어링(Harness Engineering)**이 필수적입니다.\n\n### 핵심 구성 요소\n1. **라우터 에이전트**: 사용자 의도를 파악하여 적절한 서브 태스크로 분기\n2. **도구 실행기(Tool Executor)**: 파일 시스템 및 API 호출을 격리된 환경에서 안전하게 수행\n3. **검증자(Verifier)**: 생성된 결과물이 정해진 제약 조건과 스키마를 만족하는지 자동 검증\n\n> [!TIP]\n> 하네스 설계 시 각 에이전트 간 통신 메시지는 가급적 표준 JSON Lines 포맷으로 구조화하는 것이 좋습니다.`;
      charCounter.textContent = `${contentTextarea.value.length.toLocaleString()}자`;
    });

    document.getElementById('btn-save-ingest').addEventListener('click', async () => {
      const title = document.getElementById('ingest-title').value.trim();
      const category = document.getElementById('ingest-category').value;
      const doc_nature = document.getElementById('ingest-nature').value;
      const topic = document.getElementById('ingest-topic').value.trim();
      const source = document.getElementById('ingest-source').value.trim();
      const tags = document.getElementById('ingest-tags').value;
      const content = contentTextarea.value.trim();

      if (!content) {
        alert('본문 내용을 입력해 주세요.');
        return;
      }

      const saveBtn = document.getElementById('btn-save-ingest');
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>등록 및 인덱싱 중...</span>`;
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch('/api/save_doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, category, doc_nature, topic, source, tags, content })
        });

        if (res.ok) {
          const data = await res.json();
          const newDoc = data.new_doc || {
            id: data.doc_id,
            title: data.title || title,
            category: category,
            topic: topic || title,
            summary: content.slice(0, 300),
            snippet: content.slice(0, 300),
            content: content,
            doc_type: doc_nature,
            tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []),
            source_type: "사용자 수집/스크랩",
            date: new Date().toISOString().slice(0, 10),
            char_count: content.length,
            reading_time: Math.max(1, Math.floor(content.length / 400))
          };

          // 1) 클라이언트 메모리에 즉시 주입 (원천 동기화/새로고침 없이 검색 가능)
          docMap.set(newDoc.id, newDoc);
          if (newDoc.id.endsWith('.md')) {
            docMap.set(newDoc.id.slice(0, -3), newDoc);
          } else {
            docMap.set(newDoc.id + '.md', newDoc);
          }

          if (state.data && Array.isArray(state.data.documents)) {
            // 중복 방지
            const existingIdx = state.data.documents.findIndex(d => d.id === newDoc.id);
            if (existingIdx >= 0) {
              state.data.documents[existingIdx] = newDoc;
            } else {
              state.data.documents.unshift(newDoc);
              state.data.total_docs = (state.data.total_docs || 0) + 1;
            }
          }

          // 2) 카테고리 카운트 갱신
          if (state.data && state.data.categories) {
            const catItem = state.data.categories.find(c => (typeof c === 'object' && c !== null ? c.name : c) === category);
            if (catItem && typeof catItem === 'object') catItem.count = (catItem.count || 0) + 1;
            renderSidebarCategories();
          }

          // 3) 최근 등록 피드 새로고침
          await loadAndRenderRecentIngestedFeed();

          // 4) 폼 초기화 (Null-safe)
          const titleInput = document.getElementById('ingest-title');
          if (titleInput) titleInput.value = '';
          const topicInput = document.getElementById('ingest-topic');
          if (topicInput) topicInput.value = '';
          const sourceInput = document.getElementById('ingest-source');
          if (sourceInput) sourceInput.value = '';
          const tagsInput = document.getElementById('ingest-tags');
          if (tagsInput) tagsInput.value = '';
          if (contentTextarea) contentTextarea.value = '';
          const counterEl = document.getElementById('char-counter') || document.getElementById('char-count');
          if (counterEl) counterEl.textContent = '0자';

          alert(`🎉 '${newDoc.title}' 지식이 개인지식위키 정본 지식으로 등록 및 즉시 인덱싱되었습니다!\n(별도의 원천 동기화 과정 없이 검색 및 열람이 즉시 가능합니다)`);

          // 5) 등록된 문서를 해시 라우팅으로 즉시 열기!
          window.location.hash = `#/doc/${encodeURIComponent(newDoc.id)}`;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `서버 저장 실패 (상태 코드: ${res.status})`);
        }
      } catch (err) {
        console.error('save_doc error:', err);
        alert(`❌ 등록 오류: ${err.message || '로컬 서버 API 통신 중 문제가 발생했습니다.'}`);
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="upload-cloud" class="w-4 h-4"></i><span>개인지식위키 정본 지식으로 등록 & 인덱싱</span>`;
        if (window.lucide) lucide.createIcons();
      }
    });

    // Helper: openDocTab
    window.openDocTab = function(docId) {
      window.location.hash = `#/doc/${encodeURIComponent(docId)}`;
    };

    loadAndRenderRecentIngestedFeed();
    document.getElementById('btn-refresh-history').addEventListener('click', loadAndRenderRecentIngestedFeed);
  }

  async function loadAndRenderRecentIngestedFeed() {
    const listContainer = document.getElementById('recent-ingested-list');
    if (!listContainer) return;

    try {
      const res = await fetch('/api/recent_ingested');
      if (res.ok) {
        const items = await res.json();
        state.recentIngested = items;
        renderSidebarIngested();

        if (items.length === 0) {
          listContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 card-glass rounded-xl">아직 새로 등록된 지식이 없습니다.</div>`;
          return;
        }

        listContainer.innerHTML = items.slice(0, 15).map(item => `
          <div class="card-glass rounded-xl p-4 space-y-2 group">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                ${item.category}
              </span>
              <span class="text-[10px] text-slate-400 font-mono">${item.created_at || ''}</span>
            </div>

            <h3 class="font-bold text-xs text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
              <a href="#/doc/${encodeURIComponent(item.id || item.filename)}">${item.title}</a>
            </h3>

            <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>${item.doc_nature || '스크랩'}</span>
              <a href="#/doc/${encodeURIComponent(item.id || item.filename)}" class="text-blue-600 dark:text-blue-400 font-bold hover:underline">
                문서 열기 &rarr;
              </a>
            </div>
          </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
      }
    } catch (e) {
      listContainer.innerHTML = `<div class="p-4 text-xs text-slate-400 card-glass rounded-xl">최근 등록 내역을 불러오지 못했습니다.</div>`;
    }
  }

  // 11. Render Dashboard View
  function renderDashboard() {
    state.currentView = 'dashboard';
    
    const hubDocs = [...state.data.documents]
      .sort((a, b) => (b.related_docs?.length || 0) - (a.related_docs?.length || 0))
      .slice(0, 6);

    const tagCounts = {};
    state.data.documents.forEach(d => {
      d.tags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);

    const totalRelations = state.data.total_relations || (state.data.graph_edges ? state.data.graph_edges.length : 0);

    const cov = state.coverageData || {};

    const html = `
      <div class="space-y-5 animate-fade-in pb-8">
        <!-- Top Hero Banner -->
        <div class="relative overflow-hidden rounded-xl bg-slate-900 dark:bg-slate-900 border border-slate-800 px-5 py-5 md:px-7 md:py-6 text-white">
          <div class="relative z-10 max-w-3xl space-y-2.5">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold uppercase tracking-wider text-blue-100">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              개인지식위키 Knowledge Engine & Multi-AI Hub
            </div>
            <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
              개인지식위키 지식 위키 포털
            </h1>
            <p class="text-slate-300 text-sm md:text-[15px] leading-relaxed font-normal">
              총 <strong>${state.data.total_docs.toLocaleString()}개 정본 문서</strong>, <strong>원천 동기화율 ${cov.coverage_pct || 100}%</strong>, 그리고 <strong>Claude·Gemini·Perplexity AI</strong>가 복리로 축적하는 지능형 지식 포털입니다.
            </p>
            
            <div class="pt-1.5 flex flex-wrap gap-2">
              <a href="#/coverage" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition text-[13px]">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                원천 동기화 & 커버리지
              </a>
              <a href="#/evolution" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold transition text-[13px]">
                <i data-lucide="git-commit" class="w-4 h-4"></i>
                의사결정 변천사 로드맵
              </a>
              <a href="#/qa" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-bold transition text-[13px]">
                <i data-lucide="bot" class="w-4 h-4"></i>
                AI 지식 묻고 답하기 (RAG)
              </a>
              <a href="#/history" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-white font-bold transition text-[13px] border border-white/20">
                <i data-lucide="history" class="w-4 h-4 text-blue-300"></i>
                열람 히스토리
              </a>
            </div>
          </div>

                  </div>

        <!-- 4 Metric Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="card-glass rounded-xl p-5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <i data-lucide="file-text" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="text-2xl font-extrabold text-slate-800 dark:text-slate-100">${state.data.total_docs.toLocaleString()}</div>
              <div class="text-xs text-slate-500 font-medium">전체 위키 문서</div>
            </div>
          </div>
          <div class="card-glass rounded-xl p-5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <i data-lucide="refresh-cw" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="text-2xl font-extrabold text-slate-800 dark:text-slate-100">${cov.coverage_pct || 100}%</div>
              <div class="text-xs text-slate-500 font-medium">원천 소스 커버리지</div>
            </div>
          </div>
          <div class="card-glass rounded-xl p-5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <i data-lucide="git-commit" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="text-2xl font-extrabold text-slate-800 dark:text-slate-100">${state.evolutionTracks.length}개 트랙</div>
              <div class="text-xs text-slate-500 font-medium">의사결정 변천사</div>
            </div>
          </div>
          <div class="card-glass rounded-xl p-5 flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <i data-lucide="network" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="text-2xl font-extrabold text-slate-800 dark:text-slate-100">${totalRelations.toLocaleString()}</div>
              <div class="text-xs text-slate-500 font-medium">Graphify 관계선</div>
            </div>
          </div>
        </div>

        <!-- Decision Evolution Showcase -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="git-commit" class="w-5 h-5 text-amber-500"></i>
              주요 의사결정 변천 로드맵 (Decision Evolution)
            </h2>
            <a href="#/evolution" class="text-sm font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              전체 변천사 보기 &rarr;
            </a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            ${state.evolutionTracks.map(tr => `
              <div class="card-glass rounded-xl p-5 flex flex-col justify-between group">
                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                      ${tr.category}
                    </span>
                    <span class="text-[11px] text-slate-400">${tr.nodes.length}단계 변천</span>
                  </div>

                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-amber-600 transition">
                      <a href="#/evolution">${tr.title}</a>
                    </h3>
                    <p class="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      ${tr.description}
                    </p>
                  </div>
                </div>

                <div class="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span> 현행 정본 확정
                  </span>
                  <a href="#/evolution" class="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
                    로드맵 열람 &rarr;
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Core Knowledge Hubs -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="share-2" class="w-5 h-5 text-purple-500"></i>
              핵심 지식 허브 노드
            </h2>
            <a href="#/graph" class="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">
              전체 관계망 탐색 &rarr;
            </a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${hubDocs.map(d => `
              <div class="card-glass rounded-xl p-5 flex flex-col justify-between group">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
                      ${d.category}
                    </span>
                    <span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
                      <i data-lucide="link-2" class="w-3 h-3"></i> ${d.related_docs?.length || 0}개 연관
                    </span>
                  </div>

                  <div>
                    <h3 class="font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-2">
                      <a href="#/doc/${encodeURIComponent(d.id)}">${d.title}</a>
                    </h3>
                    <p class="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                      ${d.summary || d.snippet}
                    </p>
                  </div>
                </div>

                <div class="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <a href="#/graph?focus=${encodeURIComponent(d.id)}" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
                    <i data-lucide="network" class="w-3.5 h-3.5"></i> 중심 관계도
                  </a>
                  <a href="#/doc/${encodeURIComponent(d.id)}" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    문서 열기 &rarr;
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Category Grid -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="grid" class="w-5 h-5 text-blue-600 dark:text-blue-400"></i>
              분야별 지식 카테고리
            </h2>
            <a href="#/explorer" class="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              전체 보기 &rarr;
            </a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${state.data.categories.map(cat => {
              const meta = categoryMeta[cat] || { icon: 'folder', color: 'blue', desc: '' };
              const docsInCat = state.data.documents.filter(d => d.category === cat);
              const previewDocs = [...docsInCat].sort(byNewest).slice(0, 3);

              return `
                <div class="card-glass rounded-xl p-6 flex flex-col justify-between group">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="w-10 h-10 rounded-lg bg-${meta.color}-500/10 text-${meta.color}-600 dark:text-${meta.color}-400 flex items-center justify-center">
                        <i data-lucide="${meta.icon}" class="w-5 h-5"></i>
                      </div>
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        ${docsInCat.length}개 문서
                      </span>
                    </div>

                    <div>
                      <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                        <a href="#/category/${encodeURIComponent(cat)}">${cat}</a>
                      </h3>
                      <p class="text-xs text-slate-500 mt-1 line-clamp-2">${meta.desc}</p>
                    </div>

                    <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      ${previewDocs.map(d => `
                        <a href="#/doc/${encodeURIComponent(d.id)}" class="block text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                          • ${d.title}
                        </a>
                      `).join('')}
                    </div>
                  </div>

                  <div class="pt-4 mt-2">
                    <a href="#/category/${encodeURIComponent(cat)}" class="inline-flex items-center gap-1.5 text-xs font-bold text-${meta.color}-600 dark:text-${meta.color}-400 hover:underline">
                      문서 목록 열람 <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  // Smart Recommendation Engine for Single Document View
  function getSmartRecommendations(currentDoc, maxCount = 6) {
    if (!currentDoc) return { seriesPrev: null, seriesNext: null, list: [] };

    const currentId = currentDoc.id;
    const currentTags = new Set((currentDoc.tags || []).map(t => t.toLowerCase()));
    const currentCat = currentDoc.category || '';
    const currentSource = (currentDoc.source || currentDoc.source_type || '').toLowerCase();
    const currentTitle = currentDoc.title || '';
    const currentFilename = currentDoc.filename || '';

    // 1. Detect Sequential Series (e.g. 01_xxx -> 02_xxx -> 03_xxx or 1차 -> 2차)
    let seriesPrev = null;
    let seriesNext = null;

    const numMatch = currentTitle.match(/^(\d+)[\._\-\s]/) || currentFilename.match(/^(\d+)[\._\-\s]/);
    if (numMatch) {
      const currentNum = parseInt(numMatch[1], 10);
      const prevNum = currentNum - 1;
      const nextNum = currentNum + 1;

      state.data.documents.forEach(d => {
        if (d.id === currentId) return;
        const dNumMatch = (d.title || '').match(/^(\d+)[\._\-\s]/) || (d.filename || '').match(/^(\d+)[\._\-\s]/);
        if (dNumMatch) {
          const dNum = parseInt(dNumMatch[1], 10);
          if (dNum === prevNum && (!seriesPrev || d.category === currentCat)) {
            seriesPrev = d;
          }
          if (dNum === nextNum && (!seriesNext || d.category === currentCat)) {
            seriesNext = d;
          }
        }
      });
    }

    // 2. Score All Other Documents for Smart Recommendations
    const scoredDocs = [];
    const relatedExplicitIds = new Set((currentDoc.related_docs || []).map(r => r.id));

    state.data.documents.forEach(doc => {
      if (doc.id === currentId) return;
      if (doc.pair_simple === currentId || doc.pair_reconstructed === currentId) return;

      let score = 0;
      let reasons = [];

      // Reason A: Graphify Explicit Relation (+100 pts)
      if (relatedExplicitIds.has(doc.id)) {
        score += 100;
        const explicitRel = currentDoc.related_docs.find(r => r.id === doc.id);
        if (explicitRel) {
          const rt = explicitRel.rel_type || '관련됨';
          if (rt.includes('모순') || rt.includes('대체')) reasons.push(`⚡ ${rt}`);
          else if (rt.includes('인과') || rt.includes('유발') || rt.includes('원인')) reasons.push(`🔥 ${rt}`);
          else if (rt.includes('선후') || rt.includes('발전') || rt.includes('후속')) reasons.push(`⏩ ${rt}`);
          else if (rt.includes('설명') || rt.includes('보완')) reasons.push(`💡 ${rt}`);
          else reasons.push(`🔗 ${rt}`);
        } else {
          reasons.push('🔗 시맨틱 연관');
        }
      }

      // Reason B: Common Tags (+20 pts per shared tag)
      if (currentTags.size > 0 && doc.tags && doc.tags.length > 0) {
        const sharedTags = doc.tags.filter(t => currentTags.has(t.toLowerCase()));
        if (sharedTags.length > 0) {
          score += sharedTags.length * 20;
          reasons.push(`🏷️ #${sharedTags[0]} 등 ${sharedTags.length}개 일치`);
        }
      }

      // Reason C: Same Source Origin (+35 pts)
      const docSource = (doc.source || doc.source_type || '').toLowerCase();
      if (currentSource && docSource && (currentSource.includes(docSource) || docSource.includes(currentSource)) && currentSource.length > 3) {
        score += 35;
        reasons.push('📚 동일 원천 출처');
      }

      // Reason D: Same Category (+10 pts)
      if (doc.category && doc.category === currentCat) {
        score += 10;
      }

      // Reason E: Title keyword overlap (+15 pts)
      const cleanTitleWords = currentTitle.replace(/[\[\]\(\)\-_,\.]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !'단계 문서 가이드 요약 분석 자료'.includes(w));
      const docTitle = doc.title || '';
      const matchedWords = cleanTitleWords.filter(w => docTitle.includes(w));
      if (matchedWords.length > 0) {
        score += matchedWords.length * 15;
        if (reasons.length === 0) {
          reasons.push(`💡 핵심어 '${matchedWords[0]}' 연관`);
        }
      }

      if (score > 0) {
        scoredDocs.push({
          doc,
          score,
          reason: reasons[0] || `💡 ${doc.category} 관련 지식`,
          sharedTags: (doc.tags || []).filter(t => currentTags.has(t.toLowerCase()))
        });
      }
    });

    scoredDocs.sort((a, b) => b.score - a.score);
    const topList = scoredDocs.slice(0, maxCount);

    return {
      seriesPrev,
      seriesNext,
      list: topList
    };
  }

  // Helper: Claude 팀의 HTML 활용법 학습 가이드 스타일 렌더러
  function renderGuideCardsHtml(markdownText, doc) {
    const norm = (markdownText || '').replace(/\r+\n|\r+/g, '\n');  // 반복 CR 정규화(2026-09-18, condenseSourceHeader와 동일 수정)
    const lines = norm.split('\n');
    const sections = [];
    let cur = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHR = /^\s*---\s*$/.test(line);
      const isMajorHeading = /^#{1,2}\s+/.test(line);

      if (isHR) {
        if (cur.length > 0) {
          sections.push(cur.join('\n').trim());
          cur = [];
        }
        continue;
      }

      if (isMajorHeading && cur.length > 0) {
        const curNonEmpty = cur.filter(l => l.trim().length > 0);
        if (curNonEmpty.length === 1 && /^#{1,2}\s+/.test(curNonEmpty[0])) {
          cur.push(line);
        } else {
          sections.push(cur.join('\n').trim());
          cur = [line];
        }
      } else {
        cur.push(line);
      }
    }
    if (cur.length > 0) {
      const rem = cur.join('\n').trim();
      if (rem) sections.push(rem);
    }

    const validSections = sections.filter(s => s.length > 0);
    if (validSections.length === 0) {
      validSections.push(markdownText || '');
    }

    const title = doc.title || '';
    const subtitle = doc.topic || doc.summary || doc.snippet || '"HTML이 새로운 마크다운이다" — 시각화와 상호작용 중심의 학습';

    let cardsHtml = `
      <div class="guide-container">
        <header class="guide-header">
          <h1>💡 ${escapeHtml(title)}</h1>
          <div class="subtitle">${polishProseHtml(escapeHtml(subtitle))}</div>
        </header>
    `;

    validSections.forEach((sec, idx) => {
      const secLines = sec.split('\n');
      let firstHeading = '';
      let bodyLines = [];
      let foundHeading = false;

      for (let j = 0; j < secLines.length; j++) {
        const l = secLines[j];
        if (!foundHeading && /^#{1,3}\s+(.+)$/.test(l)) {
          firstHeading = l.replace(/^#{1,3}\s+/, '').trim();
          foundHeading = true;
        } else {
          bodyLines.push(l);
        }
      }

      const cardTitle = firstHeading || `섹션 ${idx + 1}`;
      const cardBodyMd = bodyLines.join('\n').trim() || (foundHeading ? '' : sec);
      let parsedBody = renderDocHtml(cardBodyMd);

      // 주의/경고/조건/예외 섹션 감지 -> .warning-box 로 래핑
      const isWarningSec = /주의|경고|리스크|조건\/예외|Caution|Warning|Alert/i.test(cardTitle) ||
                           /⚠️|주의사항|필수\s*주의/.test(cardTitle) ||
                           /warning-box/.test(sec);

      let cardContent = '';
      if (isWarningSec && !parsedBody.includes('warning-box')) {
        cardContent = `
          <div class="warning-box">
            ${parsedBody}
          </div>
        `;
      } else {
        cardContent = parsedBody;
      }

      cardsHtml += `
        <!-- Section ${idx + 1} Card -->
        <div class="card guide-card">
          <h2>${escapeHtml(cardTitle)}</h2>
          <div class="guide-card-content">
            ${cardContent}
          </div>
        </div>
      `;
    });

    cardsHtml += `</div>`;
    return cardsHtml;
  }

  // 12. Render Reader View
  function renderReader(doc) {
    if (!doc) return;

    // 온디맨드 지연 로딩: 본문(content)이 없는 경량 메타데이터인 경우 실시간 비동기 인출
    if (!doc.content || typeof doc.content !== 'string' || doc.content.trim().length === 0) {
      appContainer.innerHTML = `
        <div class="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 animate-fade-in">
          <div class="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto animate-spin">
            <i data-lucide="loader-2" class="w-6 h-6"></i>
          </div>
          <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">정본 지식 문서를 불러오는 중입니다...</h2>
          <p class="text-xs text-slate-400 font-mono">${doc.title || doc.id}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      ensureDocLoaded(doc).then(loadedDoc => {
        if (loadedDoc && loadedDoc.content) {
          renderReader(loadedDoc);
        } else {
          renderNotFound(doc.id);
        }
      }).catch(() => {
        renderNotFound(doc.id);
      });
      return;
    }

    state.currentView = 'reader';
    state.currentDoc = doc;

    recordReadHistory(doc, state.readerMode);

    const isBookmarked = state.bookmarks.includes(doc.id);
    
    const pairId = doc.doc_type === '재구성' ? doc.pair_simple : doc.pair_reconstructed;
    const pairDoc = pairId ? docMap.get(pairId) : null;
    const hasPair = !!pairDoc;

    let simpleDoc = doc.doc_type === '원문요약' ? doc : (pairDoc && pairDoc.doc_type === '원문요약' ? pairDoc : null);
    let reconDoc = doc.doc_type === '재구성' ? doc : (pairDoc && pairDoc.doc_type === '재구성' ? pairDoc : null);

    if (state.readerMode === 'split' && hasPair && simpleDoc && reconDoc) {
      renderDualSplitView(simpleDoc, reconDoc, isBookmarked);
      return;
    }

    // Calculate Smart Recommendations
    const recoData = getSmartRecommendations(doc, 6);

    const isQADoc = Boolean(doc.title && (doc.title.startsWith('[Q&A]') || (doc.source_type || '').includes('질의응답') || (doc.category || '').includes('Q&A')));
    const strippedContent = stripDuplicateHeadings(doc.content, doc.title, isQADoc);
    const cleanedMarkdown = cleanAndStructureMarkdown(strippedContent);
    const isGuideStyle = state.readerStyle === 'guide';
    const renderedHtml = garbledBannerHtml(doc.content) + (isGuideStyle
      ? renderGuideCardsHtml(cleanedMarkdown, doc)
      : renderDocHtml(cleanedMarkdown));

    // Match document to decision evolution track if applicable
    let matchedTrack = null;
    let matchedNode = null;
    let matchedNodeIdx = -1;
    for (const tr of (state.evolutionTracks || [])) {
      const nIdx = (tr.nodes || []).findIndex(n => n.doc_id === doc.id || (n.source_info && n.source_info.source_file === doc.id) || (n.source_info && n.source_info.source_file === doc.filename));
      if (nIdx !== -1) {
        matchedTrack = tr;
        matchedNode = tr.nodes[nIdx];
        matchedNodeIdx = nIdx;
        break;
      }
    }

    // 이 문서가 '허브'라서 만들어진 트랙(노드가 아니라 생성 주체). 2026-09-18: 허브 문서와 변천사를
    // 잇는 링크가 문서 쪽에 없어 "변천사가 안 만들어졌다"로 보였다. 본문은 건드리지 않고 배너만 단다.
    const hubTrack = (state.evolutionTracks || []).find(t => t.hub_doc_id && t.hub_doc_id === doc.id);
    const hubTrackBannerHtml = hubTrack ? `
      <a href="#/evolution" class="flex items-center gap-3 p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition group">
        <i data-lucide="git-branch" class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0"></i>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-amber-900 dark:text-amber-200">이 주제의 시계열 의사결정 변천사 ${(hubTrack.nodes || []).length}단계</div>
          <div class="text-[11px] text-amber-700 dark:text-amber-300/80 truncate">${escapeHtml(hubTrack.title || '')}${(hubTrack.nodes || []).length ? ` · ${hubTrack.nodes[0].date} → ${hubTrack.nodes[hubTrack.nodes.length - 1].date}` : ''}</div>
        </div>
        <span class="text-[11px] font-bold text-amber-700 dark:text-amber-300 group-hover:underline shrink-0">변천사 보기 →</span>
      </a>` : '';

    let decisionBannerHtml = '';
    if (matchedTrack && matchedNode) {
      const isSuperseded = matchedNode.status === 'superseded';
      const isRevised = matchedNode.status === 'revised';
      const isAccepted = matchedNode.status === 'accepted';
      const srcInfo = matchedNode.source_info || {};
      const timeInfo = matchedNode.time_analysis || {};

      let borderTheme = isAccepted ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' :
                        (isRevised ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200' :
                        'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200');

      let iconName = isAccepted ? 'check-circle-2' : (isRevised ? 'git-commit' : 'alert-triangle');
      let statusBadge = isAccepted ? '🟢 현행 유효 정본 (Accepted)' : (isRevised ? '🟡 과도기 개정안 (Revised)' : '🔴 대체·철회됨 (Superseded)');

      const prevNode = matchedNodeIdx > 0 ? matchedTrack.nodes[matchedNodeIdx - 1] : null;
      const nextNode = matchedNodeIdx < matchedTrack.nodes.length - 1 ? matchedTrack.nodes[matchedNodeIdx + 1] : null;

      decisionBannerHtml = `
        <div class="mb-2 p-3.5 rounded-xl border ${borderTheme} space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/10">
            <div class="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
              <i data-lucide="${iconName}" class="w-4 h-4"></i>
              <span>의사결정 변천사 계보 연계 [${statusBadge}]</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">
                ${matchedTrack.title} (단계 ${matchedNodeIdx + 1}/${matchedTrack.nodes.length})
              </span>
              <span class="text-[11px] font-mono font-bold">${matchedNode.date}</span>
            </div>
          </div>

          <div class="text-xs leading-relaxed space-y-1.5">
            <p>
              ${isSuperseded ? '본 문서는 과거 제안된 초기 안건으로, <strong>실무 검토 및 BPR 과정에서 발견된 리스크 요인으로 인해 현재 최신 정본으로 대체·철회</strong>되었습니다.' :
                (isRevised ? '본 문서는 현황분석 및 프로세스 개선을 위해 작성된 <strong>과도기 개정 검토 자료</strong>입니다.' :
                '본 문서는 시계열 의사결정 프로세스를 거쳐 전산 정합 구조 및 실무 지침으로 <strong>공식 확정된 현행 정본(Canonical)</strong>입니다.')}
            </p>

            <!-- Source Provenance & Evidence in Reader Banner -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-[11px] font-normal">
              ${srcInfo.source_file ? `
                <div class="p-2 rounded-lg bg-white/60 dark:bg-black/20">
                  <strong>원천 출처:</strong> <span class="font-mono">${srcInfo.source_file}</span>
                  ${srcInfo.source_notebook ? `<span class="block text-slate-500 text-[10px]">노트북: ${srcInfo.source_notebook}</span>` : ''}
                </div>
              ` : ''}
              ${timeInfo.evidence ? `
                <div class="p-2 rounded-lg bg-white/60 dark:bg-black/20">
                  <strong>판단 근거:</strong> <span>${timeInfo.evidence}</span>
                </div>
              ` : ''}
            </div>

            ${timeInfo.change_driver || matchedNode.rationale ? `
              <div class="text-[11px] pt-1">
                <strong>변천/결정 사유:</strong> ${timeInfo.change_driver || matchedNode.rationale}
              </div>
            ` : ''}
          </div>

          <!-- Step navigation within the decision track -->
          <div class="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 dark:border-white/10 text-xs font-bold">
            <div class="flex items-center gap-3">
              ${prevNode ? `
                <a href="#/doc/${encodeURIComponent(prevNode.doc_id)}" class="hover:underline flex items-center gap-1">
                  &larr; 이전 단계: <span class="font-normal truncate max-w-[120px]">${prevNode.title}</span>
                </a>
              ` : '<span class="text-slate-400 font-normal">변천사의 첫 단계</span>'}
              ${nextNode ? `
                <a href="#/doc/${encodeURIComponent(nextNode.doc_id)}" class="hover:underline flex items-center gap-1">
                  다음 단계: <span class="font-normal truncate max-w-[120px]">${nextNode.title}</span> &rarr;
                </a>
              ` : '<span class="text-slate-400 font-normal">최종 정본 단계</span>'}
            </div>

            <a href="#/evolution" class="inline-flex items-center gap-1 hover:underline text-amber-700 dark:text-amber-300">
              <span>시계열 변천사 전체 로드맵 보기 &rarr;</span>
            </a>
          </div>
        </div>
      `;
    } else if (doc.decision_status === 'superseded') {
      decisionBannerHtml = `
        <div class="mb-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-600"></i>
              <span>의사결정 대체·철회 알림 (Superseded Record)</span>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900/60 font-bold">구버전/대체됨</span>
          </div>
          <p class="text-xs leading-relaxed">
            본 문서는 과거 제안/초안 안건으로, <strong>이후 실무 검증 및 의사결정을 거쳐 최신 정본 문서로 대체·개정</strong>되었습니다.
          </p>
          ${doc.decision_rationale ? `
            <div class="text-[11px] text-rose-700 dark:text-rose-300 font-medium pt-1 border-t border-rose-200 dark:border-rose-900">
              <strong>대체/철회 사유:</strong> ${doc.decision_rationale}
            </div>
          ` : ''}
          <div class="pt-1">
            <a href="#/evolution" class="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-300 hover:underline">
              <span>시계열 의사결정 변천사 로드맵에서 전체 맥락 확인 &rarr;</span>
            </a>
          </div>
        </div>
      `;
    } else if (doc.decision_status === 'revised') {
      decisionBannerHtml = `
        <div class="mb-2 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <i data-lucide="info" class="w-4 h-4 text-amber-600"></i>
              <span>과도기 개정 검토안 (Revised / Under Review)</span>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 font-bold">개정 검토안</span>
          </div>
          <p class="text-xs leading-relaxed">
            본 문서는 BPR/ISP 현황분석 및 프로세스 개정을 위해 작성된 과도기 검토 자료입니다.
          </p>
        </div>
      `;
    }

    // Series Navigator (Top / Bottom)
    let seriesNavHtml = '';
    if (recoData.seriesPrev || recoData.seriesNext) {
      seriesNavHtml = `
        <div class="my-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            ${recoData.seriesPrev ? `
              <a href="#/doc/${encodeURIComponent(recoData.seriesPrev.id)}" class="inline-flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 hover:underline" title="${recoData.seriesPrev.title}">
                <i data-lucide="arrow-left" class="w-4 h-4"></i>
                <span>이전 단계: <span class="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px] inline-block align-bottom">${recoData.seriesPrev.title}</span></span>
              </a>
            ` : '<span class="text-slate-400">첫 단계 문서</span>'}
          </div>

          <div class="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            📚 연속 시리즈 지식
          </div>

          <div>
            ${recoData.seriesNext ? `
              <a href="#/doc/${encodeURIComponent(recoData.seriesNext.id)}" class="inline-flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 hover:underline" title="${recoData.seriesNext.title}">
                <span>다음 단계: <span class="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px] inline-block align-bottom">${recoData.seriesNext.title}</span></span>
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </a>
            ` : '<span class="text-slate-400">마지막 단계 문서</span>'}
          </div>
        </div>
      `;
    }

    let subTabControlsHtml = '';
    if (hasPair) {
      const switchTarget = doc.doc_type === '재구성' ? doc.pair_simple : doc.pair_reconstructed;
      const switchLabel = doc.doc_type === '재구성' ? '📄 요약본으로 전환' : '✨ 재구성본으로 전환';
      const switchColor = doc.doc_type === '재구성' ? 'amber' : 'blue';

      subTabControlsHtml = `
        <button id="btn-toggle-dual-split" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition shadow-sm" title="원문 요약과 재구성본을 나란히 비교">
          <i data-lucide="columns" class="w-3.5 h-3.5"></i> 듀얼 분할 비교
        </button>
        <a href="#/doc/${encodeURIComponent(switchTarget)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-${switchColor}-500/10 text-${switchColor}-600 dark:text-${switchColor}-400 font-semibold text-xs hover:bg-${switchColor}-500/20 transition">
          ${switchLabel}
        </a>
      `;
    }

    // Bottom Smart Recommendations Section
    let bottomRecommendationsHtml = '';
    if (recoData.list && recoData.list.length > 0) {
      bottomRecommendationsHtml = `
        <div class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <i data-lucide="sparkles" class="w-5 h-5 text-indigo-500"></i>
                이 문서와 함께 읽으면 좋은 스마트 추천 지식 (${recoData.list.length}개)
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">키워드, 시맨틱 그래프 및 원천 출처 맥락을 종합 분석하여 도출한 고연관 지식입니다.</p>
            </div>
            <a href="#/graph?focus=${encodeURIComponent(doc.id)}" class="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline shrink-0">
              <i data-lucide="share-2" class="w-3.5 h-3.5"></i> 이 문서 중심 지식망 &rarr;
            </a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            ${recoData.list.map(({ doc: rDoc, reason, sharedTags }) => `
              <div class="card-glass rounded-lg p-3 flex flex-col justify-between hover:border-indigo-500 dark:hover:border-indigo-500 transition group shadow-sm">
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                      ${reason}
                    </span>
                    <span class="text-[10px] text-slate-400">${rDoc.category}</span>
                  </div>

                  <h4 class="font-bold text-xs md:text-sm text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition line-clamp-2">
                    <a href="#/doc/${encodeURIComponent(rDoc.id)}">${rDoc.title}</a>
                  </h4>

                  <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    ${rDoc.summary || rDoc.snippet}
                  </p>
                </div>

                <div class="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div class="flex flex-wrap gap-1">
                    ${(sharedTags || []).slice(0, 2).map(t => `<span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">#${t}</span>`).join('')}
                  </div>

                  <div class="flex items-center gap-2">
                    <button class="btn-ai-compare-docs text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1" data-doc-a="${doc.title}" data-doc-b="${rDoc.title}">
                      <i data-lucide="bot" class="w-3 h-3"></i> AI 연계 분석
                    </button>
                    <a href="#/doc/${encodeURIComponent(rDoc.id)}" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                      열람 &rarr;
                    </a>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    let currentToc = [];  // 2026-09-15: 정제본 기준으로 목차 생성 (doc.toc는 헤더 압축 전 원문 기준)
    if (currentToc.length === 0) {
      const tocMatches = [...cleanedMarkdown.matchAll(/^(#{1,4})\s+(.+)$/gm)];
      currentToc = tocMatches.map(m => ({
        level: m[1].length,
        title: m[2].trim(),
        slug: m[2].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
      }));
    }

    // ── TOC 정제: 목차 첫 번째 항목이 메인 제목과 동일한 경우 제외 ──
    const cleanNormForToc = (str) => (str || '').replace(/^\[Q&A\]\s*/i, '').replace(/^[📄\s#\-]+/, '').replace(/[\s_\-\(\)\[\]\.,!?'"~`:]/g, '').toLowerCase();
    const docTitleNorm = cleanNormForToc(doc.title);
    if (currentToc && currentToc.length > 0) {
      const firstTocNorm = cleanNormForToc(currentToc[0].title);
      if (currentToc[0].level === 1 && (firstTocNorm === docTitleNorm || (firstTocNorm.length >= 4 && docTitleNorm.includes(firstTocNorm)) || (docTitleNorm.length >= 4 && firstTocNorm.includes(docTitleNorm)))) {
        currentToc = currentToc.slice(1);
      }
    }

    const html = `
      <div class="flex flex-col lg:flex-row gap-5 animate-fade-in pb-8">
        <article class="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-4 md:px-8 md:py-6">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
              <a href="#/" class="hover:text-blue-600">Home</a>
              <span>/</span>
              <a href="#/category/${encodeURIComponent(doc.category)}" class="hover:text-blue-600 whitespace-nowrap">${doc.category}</a>
              <span>/</span>
              <span class="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[200px]">${doc.title}</span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              ${subTabControlsHtml}
              <!-- 뷰 스타일 스위처 (위키형 / 학습 가이드형) -->
              <div class="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                <button id="btn-style-wiki" class="px-2.5 py-1 rounded-md transition flex items-center gap-1 ${!isGuideStyle ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}" title="표준 위키 연속 본문형">
                  <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                  <span>위키형</span>
                </button>
                <button id="btn-style-guide" class="px-2.5 py-1 rounded-md transition flex items-center gap-1 ${isGuideStyle ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}" title="Claude 팀의 HTML 활용법 학습 가이드 스타일 (카드/다이어그램/주의박스)">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-500"></i>
                  <span>학습 가이드형</span>
                </button>
              </div>
              <button id="btn-resync-current-doc" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-bold hover:bg-amber-100 transition shadow-sm" title="이 문서를 원본 파일에서 다시 읽어 최신 AI 요약 및 가독성 레이아웃으로 덮어씁니다">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"></i>
                <span>재동기화</span>
              </button>
              <a href="#/evolution" class="p-2 rounded-lg border border-amber-200 dark:border-amber-800/80 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 transition" title="의사결정 변천사 로드맵">
                <i data-lucide="git-commit" class="w-4 h-4"></i>
              </a>
              <a href="#/graph?focus=${encodeURIComponent(doc.id)}" class="p-2 rounded-lg border border-purple-200 dark:border-purple-800/80 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 transition" title="이 문서 중심 지식 관계망">
                <i data-lucide="network" class="w-4 h-4"></i>
              </a>
              <button id="btn-bookmark" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition" title="북마크 토글">
                <i data-lucide="${isBookmarked ? 'bookmark-check' : 'bookmark'}" class="w-4 h-4 ${isBookmarked ? 'text-blue-600 fill-blue-600' : ''}"></i>
              </button>
              <button id="btn-copy-doc" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition" title="마크다운 원문 복사">
                <i data-lucide="copy" class="w-4 h-4"></i>
              </button>
              <button onclick="window.print()" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition" title="인쇄">
                <i data-lucide="printer" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div class="pt-3 space-y-2 ${isGuideStyle ? 'hidden' : ''}">
            ${hubTrackBannerHtml}
            ${decisionBannerHtml}

            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md text-xs font-bold ${doc.doc_type === '재구성' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}">
                ${doc.doc_type}
              </span>
              <span class="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                ${doc.category}
              </span>
              ${doc.created ? `<span class="text-xs text-slate-400"><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1"></i>${doc.created}</span>` : ''}
              <span class="text-xs text-slate-400"><i data-lucide="file-text" class="w-3.5 h-3.5 inline mr-1"></i>약 ${(doc.char_count || (doc.content || '').length).toLocaleString()}자</span>
              ${recoData.list.length > 0 ? `
                <span class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-0.5"></i>추천 연관 지식 ${recoData.list.length}개
                </span>
              ` : ''}
            </div>

            <h1 class="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-snug tracking-tight" style="text-wrap:balance">
              ${doc.title}
            </h1>

            ${(() => {
              if (!doc.topic) return '';
              const normTop = cleanNormForToc(doc.topic);
              // 제목과 주제가 거의 같거나, Q&A 문서이거나, 한쪽이 다른 쪽을 포함하면 중복 방지
              if (normTop === docTitleNorm || (normTop.length >= 4 && docTitleNorm.includes(normTop)) || (docTitleNorm.length >= 4 && normTop.includes(docTitleNorm)) || doc.title.startsWith('[Q&A]')) {
                return '';
              }
              return `
                <div class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border-l-2 border-slate-300 dark:border-slate-600 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                  <strong class="text-slate-900 dark:text-white font-semibold">주제:</strong> ${polishProseHtml(escapeHtml(doc.topic))}
                </div>
              `;
            })()}

            ${doc.tags && doc.tags.length > 0 ? `
              <div class="flex flex-wrap gap-1">
                ${doc.tags.map(t => `<a href="#/tag/${encodeURIComponent(t)}" class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600">#${t}</a>`).join('')}
              </div>
            ` : ''}
          </div>
          ${isGuideStyle && decisionBannerHtml ? `<div class="pt-4">${decisionBannerHtml}</div>` : ''}

          ${seriesNavHtml}

          <div id="wiki-body" class="${isGuideStyle ? 'guide-view-container' : 'wiki-prose'} mt-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            ${renderedHtml}
          </div>

          <!-- 첨부 위치: 본문 하단 AI 연계 분석 액션 바 -->
          <div class="mt-4 flex items-center justify-end gap-2">
            ${/^QA_/.test(doc.id || '') || /^\[Q&A\]/.test(doc.title || '') ? `
            <button id="btn-doc-continue-round" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm hover:shadow transition transform active:scale-95 cursor-pointer" title="이 대화를 요약해 맥락으로 들고, 추천 질문과 함께 새 3턴 라운드를 시작합니다">
              <i data-lucide="messages-square" class="w-4 h-4"></i>
              <span>이 대화 이어가기</span>
            </button>` : ''}
            <button id="btn-doc-ai-analysis" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm hover:shadow transition transform active:scale-95 cursor-pointer" title="현재 문서와 연관 지식을 종합하여 AI 심층 연계 분석을 수행합니다">
              <i data-lucide="bot" class="w-4 h-4"></i>
              <span>AI 연계 분석</span>
            </button>
          </div>

          ${seriesNavHtml}

          ${bottomRecommendationsHtml}
        </article>

        <!-- Right Sticky Sidebar -->
        <aside class="hidden xl:block w-64 shrink-0">
          <div class="sticky top-[6.5rem] space-y-3 max-h-[calc(100dvh-7.5rem)] overflow-y-auto pr-1">
            <!-- Table of Contents -->
            <div class="card-glass rounded-lg p-3 max-h-[45dvh] overflow-y-auto">
              <div class="flex items-center gap-2 font-bold text-xs text-slate-500 mb-2">
                <i data-lucide="list" class="w-4 h-4"></i> 목차
              </div>
              <nav class="space-y-1 text-xs" id="toc-nav">
                ${currentToc && currentToc.length > 0 ? currentToc.map(item => `
                  <a href="#${item.slug}" class="toc-item block py-1 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 truncate ${item.level === 1 ? 'font-bold' : item.level === 2 ? 'pl-2.5 font-medium' : 'pl-5 text-slate-500'}">
                    ${item.title}
                  </a>
                `).join('') : '<span class="text-slate-400">목차 항목이 없습니다.</span>'}
              </nav>
            </div>

            <!-- Smart Related Documents Recommendation Card (User Focus Area) -->
            <div class="card-glass rounded-lg p-3 text-xs space-y-2 border-indigo-200/80 dark:border-indigo-900/60 shadow-sm">
              <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <i data-lucide="sparkles" class="w-4 h-4"></i> 스마트 관련 추천 지식
                </span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 font-bold">
                  ${recoData.list.length}건
                </span>
              </div>

              ${recoData.list.length === 0 ? `
                <div class="text-[11px] text-slate-400">연관 추천 문서 분석 중...</div>
              ` : `
                <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  ${recoData.list.map(({ doc: rDoc, reason }) => `
                    <a href="#/doc/${encodeURIComponent(rDoc.id)}" class="block p-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-400 transition group" title="${rDoc.title}">
                      <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 truncate max-w-[140px]">
                          ${reason}
                        </span>
                        <span class="text-[9px] text-slate-400">${rDoc.category}</span>
                      </div>
                      <div class="font-bold text-xs text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                        ${rDoc.title}
                      </div>
                    </a>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Decision Evolution Roadmap Link -->
            <div class="card-glass rounded-lg p-3 text-xs space-y-2 border-amber-200/80 dark:border-amber-900/60 shadow-sm">
              <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <i data-lucide="git-commit" class="w-4 h-4"></i> 의사결정 변천사
                </span>
                <a href="#/evolution" class="text-amber-600 hover:underline font-bold">로드맵 &rarr;</a>
              </div>
              ${matchedTrack ? `
                <div class="space-y-1 pt-1">
                  <div class="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded inline-block">
                    ${matchedTrack.title} (단계 ${matchedNodeIdx + 1}/${matchedTrack.nodes.length})
                  </div>
                  <div class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    ${matchedNode.status === 'accepted' ? '🟢 본 문서는 현행 확정 정본 표준입니다.' : (matchedNode.status === 'revised' ? '🟡 본 문서는 BPR 과도기 개정 검토안입니다.' : '🔴 본 문서는 최신 정본으로 대체·철회된 구안건입니다.')}
                  </div>
                </div>
              ` : `
                <div class="text-slate-500 text-[11px] leading-relaxed">
                  시간 흐름에 따른 과거 안건 철회/대체 및 현행 정본 확정 이력을 추적합니다.
                </div>
              `}
            </div>

            <!-- File Meta Info -->
            <div class="card-glass rounded-lg p-3 text-xs space-y-1.5 text-slate-500">
              <div><strong>파일명:</strong> <span class="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate block">${doc.filename}</span></div>
              ${doc.source_type ? `<div><strong>출처:</strong> ${doc.source_type}</div>` : ''}
              ${doc.doc_nature ? `<div><strong>성격:</strong> ${doc.doc_nature}</div>` : ''}
            </div>
          </div>
        </aside>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Bind AI Compare Docs Buttons
    appContainer.querySelectorAll('.btn-ai-compare-docs').forEach(btn => {
      btn.addEventListener('click', () => {
        const docA = btn.getAttribute('data-doc-a');
        const docB = btn.getAttribute('data-doc-b');
        const prompt = `'${docA}' 문서와 '${docB}' 문서를 비교 분석해줘. 두 지식의 핵심 연결고리, 차이점 및 실무 적용 시너지 방안을 종합 브리핑해줘.`;
        window.location.hash = '#/qa';
        setTimeout(() => {
          const inp = document.getElementById('qa-input-query');
          if (inp) {
            inp.value = prompt;
            inp.dispatchEvent(new Event('input'));
            inp.focus();
            inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      });
    });

    // 저장된 Q&A 대화 → 새 라운드(요약 + 추천 질문). 실제 시작은 renderQAView 가 pendingRound 를 보고 한다(10-01)
    const btnContinueRound = document.getElementById('btn-doc-continue-round');
    if (btnContinueRound) {
      btnContinueRound.addEventListener('click', () => {
        state.pendingRound = { doc_id: doc.id, title: (doc.title || '').replace(/^\[Q&A\]\s*/, '') };
        window.location.hash = '#/qa';
      });
    }

    // Bind Document Bottom AI 연계 분석 Button
    const btnDocAiAnalysis = document.getElementById('btn-doc-ai-analysis');
    if (btnDocAiAnalysis) {
      btnDocAiAnalysis.addEventListener('click', () => {
        const recoList = (recoData && recoData.list) ? recoData.list : [];
        let prompt = '';
        if (recoList.length > 0) {
          const topRecos = recoList.slice(0, 3).map(r => `'${r.doc.title}'`).join(', ');
          prompt = `'${doc.title}' 문서를 기반으로, 스마트 추천된 핵심 연관 지식(${topRecos})과의 종합 AI 연계 분석을 심층 수행해줘.\n\n` +
            `1. [핵심 요약] '${doc.title}' 지식의 주요 골자 및 실무 핵심 시사점\n` +
            `2. [연계 비교] 추천된 연관 지식들과의 상호 연결고리, 공통점 및 차이점 분석\n` +
            `3. [시너지 방안] 이 지식들을 실무 및 업무 체계에 융합 적용할 때의 구체적 실행 시너지 창출 방안`;
        } else {
          prompt = `'${doc.title}' 문서의 핵심 내용을 바탕으로 위키 내 연관 지식들과의 종합 AI 연계 분석을 수행해줘.\n\n` +
            `1. [핵심 요약] '${doc.title}' 지식의 주요 골자 및 핵심 통찰 요약\n` +
            `2. [연계 고리] 위키 내 관련 지식망 및 맥락과의 유기적 연결성 분석\n` +
            `3. [실무 적용] 현업 실행 관점에서의 핵심 시사점 및 실질적 활용 가이드`;
        }

        window.location.hash = '#/qa';
        setTimeout(() => {
          const inp = document.getElementById('qa-input-query');
          if (inp) {
            inp.value = prompt;
            inp.dispatchEvent(new Event('input'));
            inp.focus();
            inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      });
    }

    const headingsInBody = appContainer.querySelectorAll('#wiki-body h1, #wiki-body h2, #wiki-body h3, #wiki-body h4');
    headingsInBody.forEach((h) => {
      const slug = h.textContent.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      h.id = slug;
    });

    const btnStyleWiki = document.getElementById('btn-style-wiki');
    if (btnStyleWiki) {
      btnStyleWiki.addEventListener('click', () => {
        state.readerStyle = 'wiki';
        localStorage.setItem('okf_reader_style', 'wiki');
        renderReader(doc);
      });
    }

    const btnStyleGuide = document.getElementById('btn-style-guide');
    if (btnStyleGuide) {
      btnStyleGuide.addEventListener('click', () => {
        state.readerStyle = 'guide';
        localStorage.setItem('okf_reader_style', 'guide');
        renderReader(doc);
      });
    }

    const btnToggleDual = document.getElementById('btn-toggle-dual-split');
    if (btnToggleDual) {
      btnToggleDual.addEventListener('click', () => {
        state.readerMode = 'split';
        recordReadHistory(doc, 'split');
        renderReader(doc);
      });
    }

    const btnBookmark = document.getElementById('btn-bookmark');
    if (btnBookmark) {
      btnBookmark.addEventListener('click', () => {
        if (state.bookmarks.includes(doc.id)) {
          state.bookmarks = state.bookmarks.filter(id => id !== doc.id);
        } else {
          state.bookmarks.push(doc.id);
        }
        localStorage.setItem('okf_bookmarks', JSON.stringify(state.bookmarks));
        renderReader(doc);
        renderSidebarBookmarks();
      });
    }

    const btnCopy = document.getElementById('btn-copy-doc');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(doc.content).then(() => {
          alert('마크다운 원문이 클립보드에 복사되었습니다.');
        });
      });
    }

    const btnResyncCurrent = document.getElementById('btn-resync-current-doc');
    if (btnResyncCurrent) {
      btnResyncCurrent.addEventListener('click', () => {
        const targetSrc = doc.source || doc.id;
        const ok = confirm(
          `🔄 [단일 문서 재동기화 (덮어쓰기)]\n\n` +
          `현재 문서('${doc.title}')를 원본 파일에서 다시 읽어,\n` +
          `최신 AI Executive Summary 및 표/도형 가독성 레이아웃으로 덮어쓰시겠습니까?`
        );
        if (ok) {
          btnResyncCurrent.disabled = true;
          btnResyncCurrent.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>재동기화 중...</span>`;
          if (window.lucide) lucide.createIcons();

          fetch('/api/trigger_sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target_file: targetSrc,
              force: true
            })
          })
          .then(r => r.json())
          .then(res => {
            alert(res.message || '문서 재동기화가 시작되었습니다. 잠시 후 자동으로 최신 내용이 갱신됩니다.');
            setTimeout(() => {
              window.location.reload();
            }, 3500);
          })
          .catch(() => {
            alert('재동기화 요청 실패');
            btnResyncCurrent.disabled = false;
          });
        }
      });
    }
  }

  // 12-1. Render Split Dual View
  function renderDualSplitView(simpleDoc, reconDoc, isBookmarked) {
    if (!simpleDoc || !reconDoc) return;
    const needSimple = !simpleDoc.content || simpleDoc.content.trim().length === 0;
    const needRecon = !reconDoc.content || reconDoc.content.trim().length === 0;

    if (needSimple || needRecon) {
      appContainer.innerHTML = `
        <div class="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 animate-fade-in">
          <div class="w-12 h-12 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto animate-spin">
            <i data-lucide="loader-2" class="w-6 h-6"></i>
          </div>
          <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">듀얼 분할 비교 문서를 준비하는 중입니다...</h2>
          <p class="text-xs text-slate-400 font-mono">${(reconDoc || simpleDoc).title}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      Promise.all([
        needSimple ? ensureDocLoaded(simpleDoc) : Promise.resolve(simpleDoc),
        needRecon ? ensureDocLoaded(reconDoc) : Promise.resolve(reconDoc)
      ]).then(([sDoc, rDoc]) => {
        renderDualSplitView(sDoc || simpleDoc, rDoc || reconDoc, isBookmarked);
      }).catch(() => {
        renderNotFound((reconDoc || simpleDoc).id);
      });
      return;
    }

    const simpleCleaned = cleanAndStructureMarkdown(stripDuplicateHeadings(simpleDoc.content, simpleDoc.title));
    const reconCleaned = cleanAndStructureMarkdown(stripDuplicateHeadings(reconDoc.content, reconDoc.title));
    let simpleHtml = renderDocHtml(simpleCleaned);
    let reconHtml = renderDocHtml(reconCleaned);

    simpleHtml = simpleHtml.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi, `<img $1 src="$2" $3 loading="lazy" onerror="this.onerror=null; this.style.display='none';">`);
    reconHtml = reconHtml.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi, `<img $1 src="$2" $3 loading="lazy" onerror="this.onerror=null; this.style.display='none';">`);

    const html = `
      <div class="space-y-4 animate-fade-in pb-20">
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center gap-1.5">
              <i data-lucide="columns" class="w-4 h-4"></i> 듀얼 분할 비교 뷰 (Split View)
            </span>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[250px] md:max-w-[450px]">
              ${reconDoc.title || simpleDoc.title}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <a href="#/evolution" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/80 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold text-xs transition">
              <i data-lucide="git-commit" class="w-3.5 h-3.5"></i> 변천사
            </a>
            <a href="#/graph?focus=${encodeURIComponent(reconDoc.id)}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/80 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold text-xs transition">
              <i data-lucide="network" class="w-3.5 h-3.5"></i> 관계도
            </a>
            <button id="btn-close-dual" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition">
              <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i> 단일 뷰로 전환
            </button>
            <button id="btn-dual-bookmark" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition" title="북마크 토글">
              <i data-lucide="${isBookmarked ? 'bookmark-check' : 'bookmark'}" class="w-4 h-4 ${isBookmarked ? 'text-blue-600 fill-blue-600' : ''}"></i>
            </button>
            <button onclick="window.print()" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition" title="인쇄">
              <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-500/30 dark:border-amber-500/20 p-6 md:p-8 shadow-sm flex flex-col">
            <div class="pb-4 mb-4 border-b border-amber-500/20 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1">
                  <i data-lucide="file-text" class="w-3.5 h-3.5"></i> 요약 (Simple)
                </span>
                <span class="text-xs text-slate-400 font-mono">${(simpleDoc.char_count / 1000).toFixed(1)}k chars</span>
              </div>
              <button id="btn-copy-simple" class="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i> 복사
              </button>
            </div>

            <h2 class="text-xl font-bold text-slate-900 dark:text-white leading-snug mb-3">
              ${simpleDoc.title}
            </h2>

            <div class="wiki-prose flex-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-2">
              ${simpleHtml}
            </div>
          </div>

          <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-blue-500/30 dark:border-blue-500/20 p-6 md:p-8 shadow-sm flex flex-col">
            <div class="pb-4 mb-4 border-b border-blue-500/20 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> 발췌·구조화 (Reconstructed)
                </span>
                <span class="text-xs text-slate-400 font-mono">${(reconDoc.char_count / 1000).toFixed(1)}k chars</span>
              </div>
              <button id="btn-copy-recon" class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i> 복사
              </button>
            </div>

            <h2 class="text-xl font-bold text-slate-900 dark:text-white leading-snug mb-3">
              ${reconDoc.title}
            </h2>

            <div class="wiki-prose flex-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-2">
              ${reconHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    document.getElementById('btn-close-dual').addEventListener('click', () => {
      state.readerMode = 'single';
      recordReadHistory(reconDoc || simpleDoc, 'single');
      renderReader(reconDoc || simpleDoc);
    });

    document.getElementById('btn-copy-simple').addEventListener('click', () => {
      navigator.clipboard.writeText(simpleDoc.content).then(() => alert('요약본 마크다운이 복사되었습니다.'));
    });
    document.getElementById('btn-copy-recon').addEventListener('click', () => {
      navigator.clipboard.writeText(reconDoc.content).then(() => alert('구조화 재구성본 마크다운이 복사되었습니다.'));
    });

    document.getElementById('btn-dual-bookmark').addEventListener('click', () => {
      const activeId = reconDoc.id;
      if (state.bookmarks.includes(activeId)) {
        state.bookmarks = state.bookmarks.filter(id => id !== activeId);
      } else {
        state.bookmarks.push(activeId);
      }
      localStorage.setItem('okf_bookmarks', JSON.stringify(state.bookmarks));
      renderDualSplitView(simpleDoc, reconDoc, state.bookmarks.includes(activeId));
      renderSidebarBookmarks();
    });
  }

  // 13. Render Explorer View
  // 생성일 내림차순. created 가 빈 문서(실측 1,901건)는 뒤로 보내고 제목순으로 안정화한다.
  function byNewest(a, b) {
    const ca = a.created || '', cb = b.created || '';
    if (ca && cb && ca !== cb) return cb.localeCompare(ca);
    if (ca !== cb) return ca ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '', 'ko');
  }

  function renderExplorer() {
    state.currentView = 'explorer';

    let filtered = state.data.documents.filter(doc => {
      if (state.currentCategory !== 'all' && doc.category !== state.currentCategory) return false;
      if (state.currentTag && !doc.tags.includes(state.currentTag)) return false;
      if (state.typeFilter !== 'all' && doc.doc_type !== state.typeFilter) return false;
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const matchTitle = doc.title.toLowerCase().includes(q);
        const matchSummary = doc.summary.toLowerCase().includes(q);
        const matchTags = (doc.tags || []).some(t => String(t).toLowerCase().includes(q));
        const matchSnippet = (doc.snippet || '').toLowerCase().includes(q);
        const matchBody = doc.content ? doc.content.toLowerCase().includes(q) : false;
        if (!matchTitle && !matchSummary && !matchTags && !matchSnippet && !matchBody) return false;
      }
      return true;
    });

    if (state.sortOrder === 'name') {
      filtered.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    } else if (state.sortOrder === 'size') {
      filtered.sort((a, b) => b.char_count - a.char_count);
    } else if (state.sortOrder === 'newest') {
      filtered.sort(byNewest);
    } else if (state.sortOrder === 'relations') {
      filtered.sort((a, b) => (b.related_docs?.length || 0) - (a.related_docs?.length || 0));
    }

    // 페이지 나누기(2026-09-29): 카테고리 전체(최대 1만 건)를 한 번에 그리면 화면이 수 초 굳는다.
    // 필터·정렬·검색이 바뀌면 1페이지로 돌아간다.
    const PAGE_SIZE = 60;
    const pageKey = [state.currentCategory, state.currentTag, state.typeFilter, state.sortOrder, state.searchQuery].join('|');
    if (state.explorerKey !== pageKey) { state.explorerKey = pageKey; state.explorerPage = 1; }
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.explorerPage = Math.min(Math.max(1, state.explorerPage || 1), totalPages);
    const pageItems = filtered.slice((state.explorerPage - 1) * PAGE_SIZE, state.explorerPage * PAGE_SIZE);
    const pageNums = [];
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || Math.abs(n - state.explorerPage) <= 2) pageNums.push(n);
      else if (pageNums[pageNums.length - 1] !== '…') pageNums.push('…');
    }
    const pagerHtml = totalPages <= 1 ? '' : `
      <div class="flex items-center justify-center gap-1 flex-wrap pt-2" id="explorer-pager">
        <button data-page="${state.explorerPage - 1}" ${state.explorerPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">이전</button>
        ${pageNums.map(n => n === '…'
          ? '<span class="px-1 text-slate-400">…</span>'
          : `<button data-page="${n}" class="min-w-[2rem] px-2 py-1.5 rounded-lg text-xs font-semibold border ${n === state.explorerPage ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${n}</button>`).join('')}
        <button data-page="${state.explorerPage + 1}" ${state.explorerPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">다음</button>
        <span class="ml-2 text-[11px] text-slate-400">${state.explorerPage} / ${totalPages} 페이지 · ${PAGE_SIZE}건씩</span>
      </div>`;

    const html = `
      <div class="space-y-6 animate-fade-in pb-16">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="compass" class="w-6 h-6 text-blue-600"></i>
              ${state.currentCategory !== 'all' ? state.currentCategory : (state.currentTag ? `#${state.currentTag} 검색 결과` : '전체 위키 문서 탐색기')}
            </h1>
            <p class="text-xs md:text-sm text-slate-500 mt-1">
              조건에 맞는 문서 총 <strong class="text-blue-600 dark:text-blue-400 font-bold">${filtered.length}</strong>개가 검색되었습니다.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select id="explorer-cat-filter" class="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">
              <option value="all" ${state.currentCategory === 'all' ? 'selected' : ''}>전체 카테고리</option>
              ${state.data.categories.map(c => `<option value="${c}" ${state.currentCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>

            <select id="explorer-type-filter" class="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">
              <option value="all" ${state.typeFilter === 'all' ? 'selected' : ''}>모든 형태 (전체)</option>
              <option value="재구성" ${state.typeFilter === '재구성' ? 'selected' : ''}>구조화 재구성본</option>
              <option value="원문요약" ${state.typeFilter === '원문요약' ? 'selected' : ''}>원문 요약본</option>
            </select>

            <select id="explorer-sort" class="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">
              <option value="name" ${state.sortOrder === 'name' ? 'selected' : ''}>가나다순 정렬</option>
              <option value="relations" ${state.sortOrder === 'relations' ? 'selected' : ''}>연관 관계 많은 순</option>
              <option value="size" ${state.sortOrder === 'size' ? 'selected' : ''}>문서 분량순</option>
              <option value="newest" ${state.sortOrder === 'newest' ? 'selected' : ''}>생성일순</option>
            </select>
          </div>
        </div>

        ${(state.currentTag || state.currentCategory !== 'all' || state.searchQuery) ? `
          <div class="flex items-center gap-2 flex-wrap text-xs">
            <span class="text-slate-400 font-medium">활성 필터:</span>
            ${state.currentCategory !== 'all' ? `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">
                카테고리: ${state.currentCategory}
                <button onclick="window.location.hash='#/explorer'" class="hover:text-blue-900">&times;</button>
              </span>
            ` : ''}
            ${state.currentTag ? `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold">
                태그: #${state.currentTag}
                <button onclick="window.location.hash='#/explorer'" class="hover:text-purple-900">&times;</button>
              </span>
            ` : ''}
            ${state.searchQuery ? `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
                검색어: "${state.searchQuery}"
                <button id="clear-search-filter" class="hover:text-amber-900">&times;</button>
              </span>
            ` : ''}
          </div>
        ` : ''}

        ${filtered.length === 0 ? `
          <div class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
            <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <i data-lucide="search-x" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-200">일치하는 문서가 없습니다.</h3>
            <p class="text-xs text-slate-500">필터 조건을 변경하거나 다른 검색어를 입력해 보세요.</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${pageItems.map(doc => `
              <div class="card-glass rounded-xl p-5 flex flex-col justify-between group">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold ${doc.doc_type === '재구성' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300'}">
                      ${doc.doc_type}
                    </span>
                    <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
                      ${doc.related_docs && doc.related_docs.length > 0 ? `
                        <span class="text-purple-600 dark:text-purple-400 font-semibold" title="Graphify 연관 관계">
                          <i data-lucide="network" class="w-3 h-3 inline"></i> ${doc.related_docs.length}
                        </span>
                        <span>•</span>
                      ` : ''}
                      <span class="font-mono">${(doc.char_count / 1000).toFixed(1)}k chars</span>
                    </div>
                  </div>

                  <div>
                    <h3 class="font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-2">
                      <a href="#/doc/${encodeURIComponent(doc.id)}">${doc.title}</a>
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      ${doc.summary || doc.snippet}
                    </p>
                  </div>
                </div>

                <div class="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div class="flex flex-wrap gap-1">
                    ${doc.tags.slice(0, 2).map(t => `<a href="#/tag/${encodeURIComponent(t)}" class="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded hover:text-blue-600">#${t}</a>`).join('')}
                  </div>
                  <div class="flex items-center gap-2">
                    ${(doc.pair_simple || doc.pair_reconstructed) ? `
                      <a href="#/doc/${encodeURIComponent(doc.id)}?view=split" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline" title="좌우 듀얼 비교 뷰로 열기">
                        듀얼 뷰
                      </a>
                    ` : ''}
                    <a href="#/doc/${encodeURIComponent(doc.id)}" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                      열기 &rarr;
                    </a>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ${pagerHtml}
        `}
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('#explorer-pager button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.explorerPage = parseInt(btn.dataset.page, 10);
        renderExplorer();
        window.scrollTo({ top: 0 });
        appContainer.scrollTop = 0;
      });
    });

    document.getElementById('explorer-cat-filter').addEventListener('change', (e) => {
      state.currentCategory = e.target.value;
      renderExplorer();
    });
    document.getElementById('explorer-type-filter').addEventListener('change', (e) => {
      state.typeFilter = e.target.value;
      renderExplorer();
    });
    document.getElementById('explorer-sort').addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      renderExplorer();
    });
    const clearBtn = document.getElementById('clear-search-filter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.searchQuery = '';
        renderExplorer();
      });
    }
  }

  // 14. Render Knowledge Graph View
  function renderGraphView() {
    state.currentView = 'graph';

    const focusedDoc = state.graphFocusId ? docMap.get(state.graphFocusId) : null;
    const totalRelations = state.data.total_relations || (state.data.graph_edges ? state.data.graph_edges.length : 0);

    const html = `
      <div class="space-y-4 animate-fade-in pb-16">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <i data-lucide="network" class="w-6 h-6 text-purple-600"></i>
              ${focusedDoc ? `[포커스] ${focusedDoc.title} 중심 지식망` : 'Graphify 지식 관계망 (Semantic Graph)'}
            </h1>
            <p class="text-xs md:text-sm text-slate-500 mt-1">
              ${focusedDoc 
                ? `해당 문서와 직접 연결된 1·2-Hop 관계망을 집중 탐색합니다.` 
                : `총 ${totalRelations.toLocaleString()}개의 의미론적 관계선(Semantic Links)으로 구성된 인터랙티브 네트워크입니다.`}
            </p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            ${focusedDoc ? `
              <a href="#/graph" class="text-xs bg-purple-600 text-white font-bold rounded-lg px-3 py-2 hover:bg-purple-700 transition flex items-center gap-1">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> 전체 지식망으로 복귀
              </a>
            ` : ''}
            <select id="graph-cat-filter" class="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">
              <option value="all">전체 분야 보기</option>
              ${state.data.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card-glass rounded-2xl p-2 relative h-[720px] overflow-hidden">
          <div id="graph-canvas-container" class="w-full h-full rounded-xl bg-slate-50 dark:bg-slate-950/60"></div>
          
          <div class="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 shadow-md">
            <div class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <i data-lucide="info" class="w-3.5 h-3.5 text-blue-500"></i> 조작 가이드
            </div>
            <div class="text-slate-500">• 마우스 휠: 확대 / 축소</div>
            <div class="text-slate-500">• 노드 드래그: 위치 고정 / 이동</div>
            <div class="text-slate-500">• 노드 호버: 연결된 문서 및 관계(Relation) 라벨 표시</div>
            <div class="text-slate-500">• 노드 클릭: 해당 위키 문서 바로 열기</div>
          </div>
        </div>
      </div>
    `;

    appContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      window.knowledgeGraphInstance = new WikiKnowledgeGraph('graph-canvas-container', (doc) => {
        window.location.hash = `#/doc/${encodeURIComponent(doc.id)}`;
      });
      window.knowledgeGraphInstance.setData(state.data, state.graphFocusId);

      document.getElementById('graph-cat-filter').addEventListener('change', (e) => {
        window.knowledgeGraphInstance.filterCategory(e.target.value);
      });
    }, 50);
  }

  // 14.4. Ensure Document Content is Loaded (온디맨드 실시간 본문 인출)
  async function ensureDocLoaded(doc) {
    if (!doc) return null;
    if (doc.content && typeof doc.content === 'string' && doc.content.trim().length > 0) {
      return doc;
    }
    const cleanId = (doc.id || doc.filename || '').replace(/^(\.\/|\/)/, '');
    const idWithMd = cleanId.endsWith('.md') ? cleanId : (cleanId + '.md');
    const idWithoutMd = cleanId.replace(/\.md$/i, '');

    const candidates = [
      `/wiki_md/${encodeURIComponent(cleanId)}`,
      `/wiki/questions/${encodeURIComponent(cleanId)}`,
      `/wiki/documents/${encodeURIComponent(cleanId)}`,
      `/wiki_md/${encodeURIComponent(idWithMd)}`,
      `/wiki/questions/${encodeURIComponent(idWithMd)}`,
      `/wiki/documents/${encodeURIComponent(idWithMd)}`,
      `/wiki_md/${cleanId}`,
      `/wiki/questions/${cleanId}`,
      `/wiki/documents/${cleanId}`
    ];

    let foundText = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const t = await res.text();
          if (t && !t.startsWith('<!DOCTYPE') && !t.startsWith('<html')) {
            foundText = t;
            break;
          }
        }
      } catch (e) {}
    }

    if (!foundText) {
      try {
        const pRes = await fetch(`/api/conversion/preview?file=${encodeURIComponent(cleanId)}`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData && pData.content) {
            foundText = pData.content;
          }
        }
      } catch (e) {}
    }

    if (!foundText) {
      return null;
    }

    let content = foundText;
    const fmMatch = foundText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
      content = fmMatch[2];
      const yamlPart = fmMatch[1];
      const tMatch = yamlPart.match(/title:\s*["']?(.*?)["']?$/m);
      if (tMatch && tMatch[1] && (!doc.title || doc.title === doc.id)) doc.title = tMatch[1].trim();
      const cMatch = yamlPart.match(/category:\s*["']?(.*?)["']?$/m);
      if (cMatch && cMatch[1] && !doc.category) doc.category = cMatch[1].trim();
      const topMatch = yamlPart.match(/topic:\s*["']?(.*?)["']?$/m);
      if (topMatch && topMatch[1] && !doc.topic) doc.topic = topMatch[1].trim();
      const sMatch = yamlPart.match(/source:\s*["']?(.*?)["']?$/m);
      if (sMatch && sMatch[1] && !doc.source) doc.source = sMatch[1].trim();
      const dtMatch = yamlPart.match(/doc_nature:\s*["']?(.*?)["']?$/m) || yamlPart.match(/doc_type:\s*["']?(.*?)["']?$/m);
      if (dtMatch && dtMatch[1] && !doc.doc_nature) doc.doc_nature = dtMatch[1].trim();
    }

    doc.content = content;
    if (!doc.char_count) doc.char_count = content.length;
    if (!doc.word_count) doc.word_count = content.split(/\s+/).length;

    if (!doc.toc || doc.toc.length === 0) {
      const headings = [];
      for (const match of content.matchAll(/^(#{1,4})\s+(.+)$/gm)) {
        const level = match[1].length;
        const hTitle = match[2].trim();
        const slug = hTitle.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        headings.push({ level, title: hTitle, slug });
      }
      doc.toc = headings;
    }

    return doc;
  }

  // 14.5. Dynamic Fallback Document Fetcher (복리 축적 및 신규 문서 온디맨드 실시간 인출)
  async function fetchDocDynamically(docId, rawHash) {
    appContainer.innerHTML = `
      <div class="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 animate-fade-in">
        <div class="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto animate-spin">
          <i data-lucide="loader-2" class="w-6 h-6"></i>
        </div>
        <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">정본 지식을 실시간으로 불러오는 중입니다...</h2>
        <p class="text-xs text-slate-400 font-mono">${docId}</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    const cleanId = docId.replace(/^(\.\/|\/)/, '');
    const idWithMd = cleanId.endsWith('.md') ? cleanId : (cleanId + '.md');
    const idWithoutMd = cleanId.replace(/\.md$/i, '');

    const candidates = [
      `/wiki_md/${encodeURIComponent(cleanId)}`,
      `/wiki/questions/${encodeURIComponent(cleanId)}`,
      `/wiki/documents/${encodeURIComponent(cleanId)}`,
      `/wiki_md/${encodeURIComponent(idWithMd)}`,
      `/wiki/questions/${encodeURIComponent(idWithMd)}`,
      `/wiki/documents/${encodeURIComponent(idWithMd)}`,
      `/wiki_md/${cleanId}`,
      `/wiki/questions/${cleanId}`,
      `/wiki/documents/${cleanId}`
    ];

    let foundText = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const t = await res.text();
          if (t && !t.startsWith('<!DOCTYPE') && !t.startsWith('<html')) {
            foundText = t;
            break;
          }
        }
      } catch (e) {}
    }

    // 2차 폴백: /api/conversion/preview
    if (!foundText) {
      try {
        const pRes = await fetch(`/api/conversion/preview?file=${encodeURIComponent(cleanId)}`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData && pData.content) {
            foundText = pData.content;
          }
        }
      } catch (e) {}
    }

    if (!foundText) {
      renderNotFound(docId);
      return;
    }

    // Frontmatter 파싱
    let title = idWithoutMd;
    let category = 'AI & 테크놀로지';
    let topic = '';
    let tags = ['복리축적지식'];
    let content = foundText;
    let source = 'OKF AI Q&A';
    let doc_type = '원문요약';

    const fmMatch = foundText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
      const yamlPart = fmMatch[1];
      content = fmMatch[2];
      
      const tMatch = yamlPart.match(/title:\s*["']?(.*?)["']?$/m);
      if (tMatch && tMatch[1]) title = tMatch[1].trim();
      
      const cMatch = yamlPart.match(/category:\s*["']?(.*?)["']?$/m);
      if (cMatch && cMatch[1]) category = cMatch[1].trim();

      const topMatch = yamlPart.match(/topic:\s*["']?(.*?)["']?$/m);
      if (topMatch && topMatch[1]) topic = topMatch[1].trim();

      const sMatch = yamlPart.match(/source:\s*["']?(.*?)["']?$/m);
      if (sMatch && sMatch[1]) source = sMatch[1].trim();

      const dtMatch = yamlPart.match(/doc_nature:\s*["']?(.*?)["']?$/m) || yamlPart.match(/doc_type:\s*["']?(.*?)["']?$/m);
      if (dtMatch && dtMatch[1]) doc_type = dtMatch[1].trim();

      const tagMatches = yamlPart.matchAll(/^\s*-\s*(.+)$/gm);
      const parsedTags = [];
      for (const tm of tagMatches) {
        if (tm[1]) parsedTags.push(tm[1].trim());
      }
      if (parsedTags.length > 0) tags = parsedTags;
    }

    const newDoc = {
      id: idWithMd,
      title: title,
      category: category,
      topic: topic || title,
      tags: tags,
      content: content,
      doc_type: doc_type,
      source: source,
      created: new Date().toISOString().slice(0, 10),
      status: 'canonical',
      // 2026-09-18: renderReader 가 doc.char_count.toLocaleString() 을 무가드로 호출한다.
      // wiki_data.js 에 아직 없는 문서(방금 생성된 허브 등)를 동적으로 열면 여기서 TypeError 로 멈췄다.
      char_count: content.length,
      reading_time: Math.max(1, Math.floor(content.length / 400))
    };

    docMap.set(cleanId, newDoc);
    docMap.set(idWithMd, newDoc);
    docMap.set(idWithoutMd, newDoc);

    if (state.data && state.data.documents) {
      state.data.documents = [newDoc, ...state.data.documents.filter(d => d.id !== cleanId && d.id !== idWithMd)];
      state.data.total_docs = state.data.documents.length;
    }

    addOrActivateTab({
      id: newDoc.id,
      title: newDoc.title,
      hash: rawHash,
      icon: 'sparkles',
      closable: true
    });
    renderReader(newDoc);
  }

  // 15. Render Not Found
  function renderNotFound(docId) {
    appContainer.innerHTML = `
      <div class="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-4">
        <div class="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <i data-lucide="alert-circle" class="w-8 h-8"></i>
        </div>
        <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">문서를 찾을 수 없습니다</h2>
        <p class="text-xs text-slate-500 font-mono">${docId}</p>
        <div class="pt-4">
          <a href="#/" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition">
            홈으로 돌아가기
          </a>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  // 16. Sidebar Categories, Recents, Bookmarks, Ingested, QA History
  function renderSidebarCategories() {
    if (sidebarCategoryList && state.data && state.data.categories) {
      sidebarCategoryList.innerHTML = state.data.categories.map(cat => {
        const catName = (typeof cat === 'object' && cat !== null) ? (cat.name || '') : cat;
        const meta = categoryMeta[catName] || { icon: 'folder' };
        const count = state.data.documents ? state.data.documents.filter(d => d.category === catName).length : 0;
        return `
          <li>
            <a href="#/category/${encodeURIComponent(catName)}" class="sidebar-cat-link flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition">
              <span class="flex items-center gap-2.5 truncate">
                <i data-lucide="${meta.icon}" class="w-4 h-4 text-slate-400"></i>
                <span class="truncate">${catName}</span>
              </span>
              <span class="text-[11px] text-slate-400">${count}</span>
            </a>
          </li>
        `;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }
  }

  function renderSidebar() {
    renderSidebarCategories();
    renderSidebarRecents();
    renderSidebarBookmarks();
    renderSidebarIngested();
    renderSidebarQAHistory();
    if (window.lucide) lucide.createIcons();
  }

  function renderSidebarRecents() {
    if (!sidebarRecents) return;
    
    const historyItems = state.readHistory && state.readHistory.length > 0
      ? state.readHistory
      : JSON.parse(localStorage.getItem('okf_read_history') || '[]');

    const recentDocs = historyItems.slice(0, 6);
    if (recentDocs.length === 0) {
      sidebarRecents.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">최근 본 문서가 없습니다.</li>`;
      return;
    }

    sidebarRecents.innerHTML = recentDocs.map(d => `
      <li>
        <a href="${d.hash || `#/doc/${encodeURIComponent(d.id)}`}" class="block px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-blue-600 truncate flex items-center justify-between" title="${d.title} (${d.read_at || ''})">
          <span class="truncate">• ${d.title}</span>
          ${(d.view_mode === 'split' || (d.hash && d.hash.includes('view=split'))) ? `
            <span class="text-[9px] px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-600 shrink-0 ml-1">듀얼</span>
          ` : ''}
        </a>
      </li>
    `).join('');
  }

  function renderSidebarQAHistory() {
    if (!sidebarQAHistory) return;
    if (state.qaHistory.length === 0) {
      fetch('/api/qa_history')
        .then(r => r.json())
        .then(data => {
          state.qaHistory = data || [];
          if (state.qaHistory.length === 0) {
            sidebarQAHistory.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">축적된 Q&A 없음</li>`;
          } else {
            sidebarQAHistory.innerHTML = state.qaHistory.slice(0, 5).map(d => `
              <li>
                <a href="#/doc/${encodeURIComponent(d.id || d.filename)}" class="block px-3 py-1.5 rounded-lg text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 truncate" title="${d.title}">
                  💬 ${d.title}
                </a>
              </li>
            `).join('');
          }
        })
        .catch(() => {
          sidebarQAHistory.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">이력 없음</li>`;
        });
      return;
    }

    sidebarQAHistory.innerHTML = state.qaHistory.slice(0, 5).map(d => `
      <li>
        <a href="#/doc/${encodeURIComponent(d.id || d.filename)}" class="block px-3 py-1.5 rounded-lg text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 truncate" title="${d.title}">
          💬 ${d.title}
        </a>
      </li>
    `).join('');
  }

  function renderSidebarIngested() {
    if (!sidebarIngested) return;
    if (state.recentIngested.length === 0) {
      fetch('/api/recent_ingested')
        .then(r => r.json())
        .then(data => {
          state.recentIngested = data || [];
          if (state.recentIngested.length === 0) {
            sidebarIngested.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">새로 등록된 지식이 없습니다.</li>`;
          } else {
            sidebarIngested.innerHTML = state.recentIngested.slice(0, 5).map(d => `
              <li>
                <a href="#/doc/${encodeURIComponent(d.id || d.filename)}" class="block px-3 py-1.5 rounded-lg text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 truncate" title="${d.title}">
                  ✨ ${d.title}
                </a>
              </li>
            `).join('');
          }
        })
        .catch(() => {
          sidebarIngested.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">최근 등록 지식 없음</li>`;
        });
      return;
    }

    sidebarIngested.innerHTML = state.recentIngested.slice(0, 5).map(d => `
      <li>
        <a href="#/doc/${encodeURIComponent(d.id || d.filename)}" class="block px-3 py-1.5 rounded-lg text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 truncate" title="${d.title}">
          ✨ ${d.title}
        </a>
      </li>
    `).join('');
  }

  function renderSidebarBookmarks() {
    if (!sidebarBookmarks) return;
    const bookmarkedDocs = state.bookmarks.map(id => docMap.get(id)).filter(Boolean);
    if (bookmarkedDocs.length === 0) {
      sidebarBookmarks.innerHTML = `<li class="text-[11px] text-slate-400 px-3 py-1">북마크된 문서가 없습니다.</li>`;
      return;
    }
    sidebarBookmarks.innerHTML = bookmarkedDocs.map(d => `
      <li>
        <a href="#/doc/${encodeURIComponent(d.id)}" class="block px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-blue-600 truncate" title="${d.title}">
          ★ ${d.title}
        </a>
      </li>
    `).join('');
  }

  function updateSidebarActiveState() {
    const hash = window.location.hash || '#/';
    document.querySelectorAll('.sidebar-nav-link').forEach(el => {
      const href = el.getAttribute('href');
      if (href === hash || (hash.startsWith('#/doc/') && href === '#/explorer')) {
        el.classList.add('bg-blue-600', 'text-white', 'font-bold');
        el.classList.remove('text-slate-600', 'dark:text-slate-400', 'text-blue-600', 'text-purple-700', 'text-emerald-600', 'text-amber-600', 'bg-blue-50/80', 'bg-purple-50/90');
      } else {
        el.classList.remove('bg-blue-600', 'text-white', 'font-bold');
      }
    });
  }

  // 17. Global Search Modal (Instant Pre-indexed Lexical + Ollama bge-m3 Semantic Hybrid Search with RRF)
  let searchDebounceTimer = null;
  let searchSeqCounter = 0;
  let activeSemanticController = null;
  let lexicalDebounceTimer = null;
  let cachedSearchIndex = null;

  // 초고속 인메모리 검색 인덱스 (3,391개 문서 메타데이터 사전 색인화: 20ms 1회 실행 후 타이핑 시 0~2ms 반응)
  function getSearchIndex() {
    const docs = state.data.documents || [];
    if (cachedSearchIndex && cachedSearchIndex.length === docs.length) {
      return cachedSearchIndex;
    }
    cachedSearchIndex = new Array(docs.length);
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      const title = (d.title || '').toLowerCase();
      const titleNoSpace = title.replace(/\s+/g, '');
      const topic = (d.topic || '').toLowerCase();
      const summary = (d.summary || '').toLowerCase();
      const snippet = (d.snippet || '').toLowerCase();
      const tags = Array.isArray(d.tags) ? d.tags.map(t => (t || '').toLowerCase()) : [];
      const tagsStr = tags.join(' ');
      
      cachedSearchIndex[i] = {
        doc: d,
        title,
        titleNoSpace,
        topic,
        summary,
        snippet,
        tagsStr,
        combined: `${title} ${topic} ${tagsStr} ${summary} ${snippet}`,
        combinedNoSpace: `${titleNoSpace}${topic.replace(/\s+/g, '')}${tagsStr.replace(/\s+/g, '')}${summary.replace(/\s+/g, '')}`
      };
    }
    return cachedSearchIndex;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openSearchModal() {
    searchModal.classList.remove('hidden');
    // 모달이 열리는 즉시 백그라운드에서 인덱스를 사전 워밍업하여 첫 키 입력 지연 원천 제거
    getSearchIndex();
    searchInput.focus();
    if (searchInput.value.trim()) {
      performSearch(searchInput.value);
    } else {
      renderSearchResultsList([], '', 'idle');
    }
  }

  // 과제 D (2026-09-21): #search-input 에 리스너가 없어 입력해도 결과가 안 나오던 결함
  if (searchInput) searchInput.addEventListener('input', () => {
    if (lexicalDebounceTimer) clearTimeout(lexicalDebounceTimer);
    lexicalDebounceTimer = setTimeout(() => performSearch(searchInput.value), 120);
  });

  function closeSearchModal() {
    searchModal.classList.add('hidden');
    searchInput.value = '';
    if (lexicalDebounceTimer) clearTimeout(lexicalDebounceTimer);
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (activeSemanticController) {
      activeSemanticController.abort();
      activeSemanticController = null;
    }
  }

  // 1단계: 사전 색인 기반 초고속 키워드 매칭 (<2ms, 대용량 본문 스캔 제거로 UI 프리징 100% 방지)
  // Base key normalizer helper: groups _재구성, _simple, _소스분석 under identical parent key
  function legacyDocBaseKey(doc) {
    if (doc.base_name) return doc.base_name.trim().toLowerCase();
    const raw = doc.filename || doc.id || '';
    return raw.replace(/\.md$/i, '').replace(/_재구성|_simple|_소스분석/g, '').trim().toLowerCase();
  }

  // >>> FOLD-KEYS (2-3 동일 원천 롤업, 2026-09-20)
  // 접기 키 = 기존 base_name 패밀리 ∪ 「파일명 줄기(__폴더 접미사 제거)가 같고 글자 수가 ±2% 이내」인 복사본.
  // Q&A 는 접지 않는다(같은 질문의 서로 다른 답변) — 대신 「동일 질문 N건」 뱃지로 알린다.
  let foldKeyMap = null;
  let qaGroupMap = null;
  let foldKeyDocs = null;
  const NON_ALNUM_RE = /[^\p{L}\p{N}]+/gu;

  function buildFoldKeys() {
    const docs = (state.data && state.data.documents) || [];
    if (foldKeyMap && foldKeyDocs === docs) return;
    foldKeyDocs = docs;

    const parent = new Map();
    const find = (x) => {
      while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
      return x;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    docs.forEach(d => parent.set(d.id, d.id));

    // 1) 기존 패밀리(base_name) 유지
    const legacy = new Map();
    // 2) 줄기 + 글자 수 ±2% 복사본
    const stems = new Map();
    for (const d of docs) {
      const lk = legacyDocBaseKey(d);
      if (legacy.has(lk)) union(legacy.get(lk), d.id); else legacy.set(lk, d.id);
      const stem = (d.base_name || '').trim().toLowerCase()
        .replace(/(_재구성|_simple|_소스분석|_원문요약)+$/, '').replace(/__.*$/, '').replace(NON_ALNUM_RE, '');
      if (!stem) continue; // 줄기가 비면 접지 않는다(무관한 문서가 한 키로 묶이는 것 방지)
      if (!stems.has(stem)) stems.set(stem, []);
      stems.get(stem).push(d);
    }
    stems.forEach(list => {
      if (list.length < 2) return;
      list.sort((a, b) => (a.char_count || 0) - (b.char_count || 0));
      const anchors = []; // [{c, id}] — 클러스터 앵커(가장 작은 멤버)
      for (const d of list) {
        const c = d.char_count || 0;
        const hit = anchors.find(m => { const mx = Math.max(c, m.c); return mx === 0 || Math.abs(c - m.c) / mx <= 0.02; });
        if (hit) union(hit.id, d.id); else anchors.push({ c, id: d.id });
      }
    });

    foldKeyMap = new Map();
    qaGroupMap = new Map();
    for (const d of docs) {
      const key = find(d.id);
      foldKeyMap.set(d.id, key);
      if (/^QA_/.test(d.filename || '') || /^'?\[Q&A\]/.test(d.title || '')) {
        const tk = (d.title || '').toLowerCase().replace(NON_ALNUM_RE, '');
        if (!tk) continue;
        if (!qaGroupMap.has(tk)) qaGroupMap.set(tk, new Set());
        qaGroupMap.get(tk).add(key);
      }
    }
  }

  function getDocBaseKey(doc) {
    if (!doc) return '';
    buildFoldKeys();
    return foldKeyMap.get(doc.id) || legacyDocBaseKey(doc);
  }

  function qaSameQuestionBadge(doc) {
    if (!doc) return '';
    buildFoldKeys();
    if (!(/^QA_/.test(doc.filename || '') || /^'?\[Q&A\]/.test(doc.title || ''))) return '';
    const set = qaGroupMap.get((doc.title || '').toLowerCase().replace(NON_ALNUM_RE, ''));
    const n = set ? set.size : 0;
    if (n < 2) return '';
    return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-medium shrink-0" title="같은 질문으로 저장된 답변이 ${n}건 있습니다 (각각 별도 카드로 표시)">🔁 동일 질문 ${n}건</span>`;
  }
  // <<< FOLD-KEYS

  // 1단계: 사전 색인 기반 초고속 키워드 매칭 (<2ms) + 동일 원천 파생본 통합(Canonical Folding)
  function computeLexicalMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const qNoSpace = q.replace(/\s+/g, '');
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    const index = getSearchIndex();
    const familyMap = new Map();

    for (let i = 0; i < index.length; i++) {
      const item = index[i];
      let score = 0;

      // 1. 제목 완전 일치 및 포함 (최고 가중치)
      if (item.title === q || item.titleNoSpace === qNoSpace) {
        score += 150;
      } else if (item.title.includes(q)) {
        score += 80;
      } else if (item.titleNoSpace.includes(qNoSpace)) {
        score += 65;
      }

      // 2. 토큰별 매칭
      for (let j = 0; j < tokens.length; j++) {
        const token = tokens[j];
        if (token.length > 1) {
          if (item.title.includes(token)) score += 35;
          if (item.topic.includes(token)) score += 20;
          if (item.tagsStr.includes(token)) score += 25;
          if (item.summary.includes(token)) score += 15;
          if (item.snippet.includes(token)) score += 8;
        }
      }

      // 3. 주제 / 태그 / 요약 / 스니펫 복합 매칭
      if (item.topic.includes(q)) score += 25;
      if (item.tagsStr.includes(q)) score += 25;
      if (item.summary.includes(q)) score += 15;
      if (item.snippet.includes(q)) score += 10;
      if (item.combinedNoSpace.includes(qNoSpace)) score += 10;

      if (score > 0) {
        const d = item.doc;
        const bKey = getDocBaseKey(d);
        if (!familyMap.has(bKey)) {
          familyMap.set(bKey, { doc: d, score: score });
        } else {
          const entry = familyMap.get(bKey);
          if (score > entry.score) {
            entry.score = score;
          }
          // 정본 우선순위: is_canonical_primary (재구성) > 원문요약 > 일반 > 소스분석
          if (d.is_canonical_primary || (d.doc_type === '재구성' && entry.doc.doc_type !== '재구성')) {
            entry.doc = d;
          }
        }
      }
    }

    // 대표 문서를 패밀리 내 가장 완성도 높은 정본으로 확정 매핑
    const matches = Array.from(familyMap.values()).map(entry => {
      let repDoc = entry.doc;
      if (!repDoc.is_canonical_primary && repDoc.variants) {
        const priId = repDoc.variants['재구성'] || repDoc.variants['원문요약'] || repDoc.variants['일반'] || repDoc.variants['소스분석'];
        if (priId && typeof docMap !== 'undefined' && docMap.get(priId)) {
          repDoc = docMap.get(priId);
        }
      }
      return { doc: repDoc, score: entry.score };
    });

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  // 검색 결과 렌더링 헬퍼 (동일 원천 중복 폴딩 + 파생본 배지 + 청킹 섹션 표시)
  // >>> T5 (2-4) 검색 결과 → Claude 프롬프트 복사 (2026-09-21)
  // 상위 3건 × 본문 ≤4,000자(/api/doc_body). AI 산출물은 과제 B 와 같이 최대 1건·1위 금지.
  let lastModalSearchItems = [];
  function isAiDerivedDoc(d) {
    return (d.doc_type === '재구성' && (d.notebook || '').startsWith('Q&A'))
      || d.source_type === 'AI 질의응답 복리축적'
      || (d.filename || d.id || '').startsWith('QA_');
  }
  function promptCopyButtonHtml(scope) {
    return `<button type="button" data-prompt-copy="${scope}" class="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-600 dark:text-slate-300 font-medium" title="상위 3건 본문(각 4,000자)을 Claude 에 붙여넣을 컨텍스트 블록으로 복사">📋 Claude 프롬프트 복사</button>`;
  }
  async function copyPromptContext(items, query, btn) {
    const picked = [];
    let aiUsed = 0;
    for (const it of items) {
      const d = it && it.doc;
      if (!d || !d.id) continue;
      if (isAiDerivedDoc(d)) {
        if (aiUsed >= 1 || picked.length === 0) continue;
        aiUsed++;
      }
      if (picked.some(p => getDocBaseKey(p) === getDocBaseKey(d) || (p.title || '') === (d.title || ''))) continue;  // 제목당 1건(서버 search_wiki_context 와 동일)
      picked.push(d);
      if (picked.length >= 3) break;
    }
    if (!picked.length) { alert('복사할 검색 결과가 없습니다.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '본문 읽는 중…'; }
    let bodies = {};
    try {
      const r = await fetch(`/api/doc_body?ids=${picked.map(d => encodeURIComponent(d.id)).join(',')}`);
      if (r.ok) bodies = (await r.json()).bodies || {};
    } catch (e) { console.warn('[PromptCopy] doc_body 실패, 요약으로 대체', e); }
    const blocks = picked.map((d, i) =>
      `[${i + 1}] 문서: ${d.title || d.id} (${d.category || '분류 없음'})\n${(bodies[d.id] || d.summary || d.snippet || '').trim()}`);
    const text = `질문: ${query}\n\n아래는 개인지식위키 지식위키에서 검색한 근거 문서 ${picked.length}건이다. 이 근거만으로 답하고, 근거에 없는 내용은 없다고 밝혀라. 답변 끝에 인용한 문서 번호를 적어라.\n\n` + blocks.join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(text);
      if (btn) btn.textContent = `✅ 복사됨 (${picked.length}건 · ${text.length.toLocaleString()}자)`;
    } catch (e) {
      alert('클립보드 복사 실패: ' + e);
      if (btn) btn.textContent = '📋 Claude 프롬프트 복사';
    } finally {
      if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = '📋 Claude 프롬프트 복사'; }, 2500);
    }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-prompt-copy]');
    if (!btn) return;
    const scope = btn.getAttribute('data-prompt-copy');
    if (scope === 'modal') copyPromptContext(lastModalSearchItems, (searchInput && searchInput.value || '').trim(), btn);
    else copyPromptContext(lastCenterSearchResults || [], (state.searchQuery || '').trim(), btn);
  });
  // <<< T5

  // 17-A0. 검색 패싯(문서 성격 3단) — 3-1 후속(2026-09-21 48차). 모달·중앙 검색뷰 공용.
  //   source    원천 규정·보고서 : doc_type 일반 + notebook 없음(사내 원문 계열)
  //   notebook  노트북 연구노트 : notebook 있음 또는 소스분석/원문요약/재구성
  //   evolution 의사결정 변천사 : evolution_tracks 노드에 등장하는 문서
  let searchFacetKind = 'all';
  let _evolutionDocIds = null;
  function evolutionDocIdSet() {
    if (!_evolutionDocIds) {
      _evolutionDocIds = new Set();
      (state.evolutionTracks || []).forEach(t => (t.nodes || []).forEach(n => { if (n.doc_id) _evolutionDocIds.add(n.doc_id); }));
    }
    return _evolutionDocIds;
  }
  function docFacetKind(doc) {
    if (!doc) return 'source';
    if (evolutionDocIdSet().has(doc.id)) return 'evolution';
    if (doc.notebook || ['소스분석', '원문요약', '재구성'].includes(doc.doc_type)) return 'notebook';
    return 'source';
  }
  const FACET_DEFS = [
    ['all', '전체', ''],
    ['source', '📄 원천 규정·보고서', '사내 원문 계열(노트북 미귀속 일반 문서)'],
    ['notebook', '📓 노트북 연구노트', 'NotebookLM 소스분석·재구성·요약본'],
    ['evolution', '🧭 의사결정 변천사', '변천사 트랙에 등장하는 안건 문서'],
  ];
  function applySearchFacet(items) {
    if (searchFacetKind === 'all') return items;
    return items.filter(it => docFacetKind(it.doc) === searchFacetKind);
  }
  function facetChipsHtml(items, scope) {
    const counts = { all: items.length, source: 0, notebook: 0, evolution: 0 };
    items.forEach(it => { counts[docFacetKind(it.doc)]++; });
    return `<div class="flex flex-wrap items-center gap-1.5" data-facet-bar="${scope}">
      ${FACET_DEFS.map(([k, label, tip]) => {
        const on = searchFacetKind === k, n = counts[k];
        const cls = on ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white'
                       : (n ? 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700' : 'bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800 cursor-not-allowed');
        return `<button type="button" data-search-facet="${k}" data-scope="${scope}" ${n || k === 'all' ? '' : 'disabled'} title="${escapeHtml(tip)}" class="text-[11px] px-2.5 py-1 rounded-lg border font-bold transition ${cls}">${label} <span class="font-mono font-normal opacity-70">${n}</span></button>`;
      }).join('')}
    </div>`;
  }
  let lastModalSearchQuery = '', lastModalSearchStatus = 'idle', lastCenterSearchQuery = '';
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-search-facet]');
    if (!chip || chip.disabled) return;
    searchFacetKind = chip.getAttribute('data-search-facet');
    if (chip.getAttribute('data-scope') === 'modal') renderSearchResultsList(lastModalSearchItems || [], lastModalSearchQuery, lastModalSearchStatus);
    else renderCenterSearchResults(lastCenterSearchResults || [], lastCenterSearchQuery, lastCenterSearchStatus);
  });

  function renderSearchResultsList(items, query, semanticStatus = 'idle') {
    lastModalSearchItems = items;
    lastModalSearchQuery = query; lastModalSearchStatus = semanticStatus;
    const allItems = items; items = applySearchFacet(items);
    if (!query) {
      searchResults.innerHTML = `
        <div class="p-8 text-center text-xs text-slate-400">
          검색어를 입력하면 실시간으로 ${state.data.total_docs.toLocaleString()}개 문서의 키워드 및 의미론적(시맨틱) 임베딩을 통합 검색합니다.
        </div>
      `;
      return;
    }

    if (items.length === 0) {
      searchResults.innerHTML = `
        ${allItems.length ? `<div class="px-3 pt-2">${facetChipsHtml(allItems, 'modal')}</div>` : ''}
        <div class="p-8 text-center text-xs text-slate-400">
          "${escapeHtml(query)}"에 일치하는 검색 결과가 없습니다.${allItems.length ? ' (선택한 문서 성격에 해당 없음)' : ''}
        </div>
      `;
      return;
    }

    // 상태 배너
    let statusBanner = '';
    if (semanticStatus === 'searching') {
      statusBanner = `
        <div class="mx-3 mt-2 mb-1 px-3 py-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/40 flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400">
          <span class="flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            키워드 즉시 표시 중 · Ollama bge-m3 시맨틱 분석 중...
          </span>
          <span class="text-[10px] text-slate-400">오타·유의어 자동 보정</span>
        </div>
      `;
    } else if (semanticStatus === 'fused') {
      statusBanner = `
        <div class="mx-3 mt-2 mb-1 px-3 py-1.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
          <span class="flex items-center gap-1.5 font-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            🎯 하이브리드 검색 융합 완료 (키워드 + Ollama bge-m3 정밀 청킹)
          </span>
          <span class="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-emerald-800 dark:text-emerald-300 font-semibold">${items.length}건 선별 (중복 100% 제거)</span>
        </div>
      `;
    }

    searchResults.innerHTML = `
      ${statusBanner}
      <div class="px-3 pt-2 flex items-center justify-between gap-2 flex-wrap">${facetChipsHtml(allItems, 'modal')}${promptCopyButtonHtml('modal')}</div>
      <div class="p-2 space-y-1.5">
        ${items.map(item => {
          const doc = item.doc;
          let badgeHtml = '';
          if (item.matchType === 'hybrid') {
            badgeHtml = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium shrink-0">🎯 하이브리드</span>`;
          } else if (item.matchType === 'semantic') {
            const pct = item.denseScore ? Math.round(item.denseScore * 100) : '';
            badgeHtml = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-medium shrink-0">💡 시맨틱 ${pct ? pct + '%' : ''}</span>`;
          } else {
            badgeHtml = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-normal shrink-0">키워드</span>`;
          }

          // 청킹 인출 매칭 섹션 표시
          let sectionSnippetHtml = '';
          if (item.matchedSection && item.matchedSection.heading) {
            sectionSnippetHtml = `
              <div class="mt-1 px-2.5 py-1 rounded-md bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/40 text-[11px] text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                <i data-lucide="crosshair" class="w-3 h-3 text-purple-600 shrink-0"></i>
                <span class="font-bold shrink-0">일치 섹션:</span>
                <span class="truncate font-semibold">${escapeHtml(item.matchedSection.heading)}</span>
              </div>
            `;
          }

          // 동일 원천 파생본 원클릭 칩 (Canonical Variant Pills)
          let variantPillsHtml = '';
          const vars = doc.variants || {};
          const reconId = vars['재구성'] || (doc.doc_type === '재구성' ? doc.id : doc.pair_reconstructed);
          const simpleId = vars['원문요약'] || (doc.doc_type === '원문요약' ? doc.id : doc.pair_simple);
          const analysisId = vars['소스분석'] || (doc.doc_type === '소스분석' ? doc.id : doc.pair_source_analysis);
          const varCount = (reconId ? 1 : 0) + (simpleId ? 1 : 0) + (analysisId ? 1 : 0);

          if (varCount > 1) {
            variantPillsHtml = `
              <div class="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/60 flex-wrap" onclick="event.stopPropagation()">
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-0.5">파생본:</span>
                ${reconId ? `
                  <a href="#/doc/${encodeURIComponent(reconId)}" onclick="document.getElementById('search-modal').classList.add('hidden')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${doc.id === reconId ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 text-slate-600 dark:text-slate-400 hover:text-purple-600'} transition" title="구조화 재구성본 열람">
                    ✨ 재구성
                  </a>
                ` : ''}
                ${simpleId ? `
                  <a href="#/doc/${encodeURIComponent(simpleId)}" onclick="document.getElementById('search-modal').classList.add('hidden')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${doc.id === simpleId ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 dark:text-slate-400 hover:text-blue-600'} transition" title="원문 요약본 열람">
                    📄 요약
                  </a>
                ` : ''}
                ${analysisId ? `
                  <a href="#/doc/${encodeURIComponent(analysisId)}" onclick="document.getElementById('search-modal').classList.add('hidden')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${doc.id === analysisId ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 text-slate-600 dark:text-slate-400 hover:text-amber-600'} transition" title="원천 소스 구조 분석 열람">
                    🔍 소스분석
                  </a>
                ` : ''}
                ${reconId && simpleId ? `
                  <a href="#/doc/${encodeURIComponent(reconId)}?view=split" onclick="document.getElementById('search-modal').classList.add('hidden')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200/60 dark:border-emerald-800/60 transition" title="재구성본과 요약본 나란히 듀얼 분할 비교">
                    ⚡ 듀얼뷰
                  </a>
                ` : ''}
              </div>
            `;
          }

          const displaySnippet = (item.matchedSection && item.matchedSection.snippet) || doc.summary || doc.snippet || '';

          return `
            <div class="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition group border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
              <a href="#/doc/${encodeURIComponent(doc.id)}" onclick="document.getElementById('search-modal').classList.add('hidden')" class="block">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      ${escapeHtml(doc.title)}
                    </span>
                    ${badgeHtml}
                    ${qaSameQuestionBadge(doc)}
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                    ${escapeHtml(doc.category || '일반')}
                  </span>
                </div>
                ${sectionSnippetHtml}
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">${escapeHtml(displaySnippet)}</p>
              </a>
              ${variantPillsHtml}
            </div>
          `;
        }).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function performSearch(query) {
    const q = query.trim();
    if (!q) {
      renderSearchResultsList([], '', 'idle');
      return;
    }

    // 1단계: 즉각 키워드 검색 (<5ms) 실행 및 초기 렌더링 (원천별 중복 제거 완결)
    const lexMatches = computeLexicalMatches(q);
    const initialItems = lexMatches.slice(0, 25).map(({ doc }, idx) => ({
      doc,
      score: 1.0 / (60 + idx + 1),
      matchType: 'lexical',
      matchedSection: null
    }));

    renderSearchResultsList(initialItems, q, 'searching');

    // 2단계: Ollama bge-m3 비동기 시맨틱 검색 (디바운스 200ms)
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (activeSemanticController) {
      activeSemanticController.abort();
      activeSemanticController = null;
    }

    const currentSeq = ++searchSeqCounter;

    searchDebounceTimer = setTimeout(async () => {
      try {
        activeSemanticController = new AbortController();
        const resp = await fetch(`/api/semantic_search?q=${encodeURIComponent(q)}&limit=25`, {
          signal: activeSemanticController.signal
        });
        if (!resp.ok) return;
        const data = await resp.json();

        // 쿼리가 바뀌었거나 다른 검색이 시작되었으면 무시
        if (currentSeq !== searchSeqCounter || searchInput.value.trim() !== q) return;

        if (data.status === 'ok' && Array.isArray(data.results) && data.results.length > 0) {
          // RRF (Reciprocal Rank Fusion) 융합 + base_name 기준 Canonical Folding
          const K_RRF = 60;
          const fusedMap = new Map();

          // 1) 키워드 랭크 등록
          lexMatches.forEach(({ doc }, idx) => {
            const rank = idx + 1;
            const bKey = getDocBaseKey(doc);
            fusedMap.set(bKey, {
              doc,
              lexRank: rank,
              denseRank: null,
              denseScore: 0,
              score: 1.0 / (K_RRF + rank),
              matchType: 'lexical',
              matchedSection: null
            });
          });

          // 2) 시맨틱 랭크 융합 (bge-m3 dense weight = 1.35)
          const DENSE_WEIGHT = 1.35;
          data.results.forEach((dense, idx) => {
            const rank = idx + 1;
            const doc = (typeof docMap !== 'undefined' && docMap.get(dense.id)) || {
              id: dense.id,
              title: dense.title,
              category: dense.category,
              summary: '',
              snippet: '',
              base_name: dense.base_name || ''
            };
            const bKey = getDocBaseKey(doc);
            const denseRrf = DENSE_WEIGHT / (K_RRF + rank);

            if (fusedMap.has(bKey)) {
              const item = fusedMap.get(bKey);
              item.denseRank = rank;
              item.denseScore = dense.score;
              item.score += denseRrf;
              item.matchType = 'hybrid';
              if (dense.matched_section) {
                item.matchedSection = dense.matched_section;
              }
              if (doc.is_canonical_primary && !item.doc.is_canonical_primary) {
                item.doc = doc;
              }
            } else {
              let repDoc = doc;
              if (!repDoc.is_canonical_primary && repDoc.variants) {
                const priId = repDoc.variants['재구성'] || repDoc.variants['원문요약'] || repDoc.variants['일반'] || repDoc.variants['소스분석'];
                if (priId && typeof docMap !== 'undefined' && docMap.get(priId)) {
                  repDoc = docMap.get(priId);
                }
              }
              fusedMap.set(bKey, {
                doc: repDoc,
                lexRank: null,
                denseRank: rank,
                denseScore: dense.score,
                score: denseRrf,
                matchType: 'semantic',
                matchedSection: dense.matched_section || null
              });
            }
          });

          const fusedList = Array.from(fusedMap.values());
          fusedList.sort((a, b) => b.score - a.score);
          renderSearchResultsList(fusedList.slice(0, 25), q, 'fused');
        } else {
          // 시맨틱 결과가 없거나 Ollama 미기동 시 키워드 검색 결과 유지
          renderSearchResultsList(initialItems, q, 'idle');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[SemanticSearch] API call error:', err);
          renderSearchResultsList(initialItems, q, 'idle');
        }
      }
    }, 450);
  }

  // 17-B. Main Frame Search Results View (가운데 메인 프레임 통합 검색 결과 전용 뷰)
  let centerSearchSeqCounter = 0;
  let activeCenterSemanticController = null;
  let centerSearchCategoryFilter = 'all';
  let centerSearchDebounceTimer = null;
  let lastCenterSearchResults = [];
  let lastCenterSearchStatus = 'idle';

  function renderSearchResultsView(query) {
    state.currentView = 'search';
    const q = (query || '').trim();

    if (!appContainer) return;

    if (!q) {
      lastCenterSearchResults = [];
      lastCenterSearchStatus = 'idle';
      appContainer.innerHTML = `
        <div class="space-y-6 animate-fade-in pb-16 max-w-5xl mx-auto">
          <div class="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 shadow-sm">
            <div class="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-inner">
              <i data-lucide="search" class="w-8 h-8"></i>
            </div>
            <h2 class="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              지식위키 실시간 통합 검색
            </h2>
            <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              상단 검색창에 키워드를 1회 입력하시면 가운데 프레임에 관련 문서 목록과 간단 요약이 즉시 펼쳐집니다.
            </p>
            <div class="pt-5 border-t border-slate-100 dark:border-slate-800 max-w-lg mx-auto">
              <div class="text-xs font-bold text-slate-400 mb-3">자주 찾는 추천 검색어:</div>
              <div class="flex flex-wrap items-center justify-center gap-2">
                ${['스마트무역원정', '물류비 절감', 'uTradeHub', 'Antigravity', '구매확인서', '맥킨지 문제해결', '내국신용장', 'EDIFACT'].map(kw => `
                  <button type="button" class="center-quick-suggest text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/60 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700/80 transition font-medium" data-kw="${escapeHtml(kw)}">
                    🔍 ${escapeHtml(kw)}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      appContainer.querySelectorAll('.center-quick-suggest').forEach(btn => {
        btn.addEventListener('click', () => {
          const kw = btn.getAttribute('data-kw');
          if (headerSearchInput) {
            headerSearchInput.value = kw;
            if (headerSearchClear) headerSearchClear.classList.remove('hidden');
            headerSearchInput.focus();
          }
          window.location.hash = `#/search?q=${encodeURIComponent(kw)}`;
        });
      });
      return;
    }

    // 기본 레이아웃 프레임 렌더링
    appContainer.innerHTML = `
      <div class="space-y-6 animate-fade-in pb-16 max-w-5xl mx-auto">
        <!-- 상단 헤더 & 검색 메타 정보 -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div class="flex items-center gap-2.5">
              <div class="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <i data-lucide="search" class="w-5 h-5"></i>
              </div>
              <div>
                <h1 class="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
                  지식위키 검색 결과
                </h1>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>검색어: <strong class="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded text-xs">"${escapeHtml(q)}"</strong></span>
                  <span id="center-search-meta-text" class="text-slate-400 font-medium">검색 중...</span>
                  ${promptCopyButtonHtml('center')}
                  <button type="button" id="center-quick-answer" data-q="${escapeHtml(q)}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold" title="검색 결과 문서에서 근거 문장을 뽑아 AI 가 짧게 답합니다">💬 빠른 답</button>
                </p>
              </div>
            </div>
          </div>

          <!-- 카테고리 필터 -->
          <div class="flex items-center gap-2 shrink-0">
            <label for="center-search-cat-filter" class="text-xs font-bold text-slate-400 shrink-0">분야:</label>
            <select id="center-search-cat-filter" class="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="all" ${centerSearchCategoryFilter === 'all' ? 'selected' : ''}>전체 분야</option>
              ${(state.data.categories || []).map(c => `<option value="${escapeHtml(c)}" ${centerSearchCategoryFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- 문서 성격 패싯 (3-1 후속) -->
        <div id="center-search-facet-bar" class="px-1"></div>

        <!-- 하이브리드 RRF 상태 배너 -->
        <div id="center-search-banner-container"></div>

        <!-- 결과 카드 목록 컨테이너 -->
        <div id="center-search-results-list" class="space-y-4">
          <div class="flex items-center justify-center py-16 text-slate-400">
            <div class="flex items-center gap-2 text-xs">
              <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
              <span>사전 색인에서 문서를 선별하고 있습니다...</span>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    const catSelect = document.getElementById('center-search-cat-filter');
    if (catSelect) {
      catSelect.addEventListener('change', (e) => {
        centerSearchCategoryFilter = e.target.value;
        renderCenterSearchResults(lastCenterSearchResults, q, lastCenterSearchStatus);
      });
    }

    executeCenterSearch(q);
  }

  function executeCenterSearch(query) {
    const q = query.trim();
    if (!q) return;
    lastCenterSearchQuery = q;

    // 1단계: 즉각 사전 색인 키워드 매칭 (<2ms)
    const lexMatches = computeLexicalMatches(q);
    const initialItems = lexMatches.slice(0, 40).map(({ doc }, idx) => ({
      doc,
      score: 1.0 / (60 + idx + 1),
      matchType: 'lexical',
      matchedSection: null
    }));

    lastCenterSearchResults = initialItems;
    lastCenterSearchStatus = 'searching';
    renderCenterSearchResults(initialItems, q, 'searching');

    // 2단계: 백그라운드 Ollama bge-m3 비동기 시맨틱 검색 융합
    if (centerSearchDebounceTimer) clearTimeout(centerSearchDebounceTimer);
    if (activeCenterSemanticController) {
      activeCenterSemanticController.abort();
      activeCenterSemanticController = null;
    }

    const currentSeq = ++centerSearchSeqCounter;

    centerSearchDebounceTimer = setTimeout(async () => {
      try {
        activeCenterSemanticController = new AbortController();
        const resp = await fetch(`/api/semantic_search?q=${encodeURIComponent(q)}&limit=30`, {
          signal: activeCenterSemanticController.signal
        });
        if (!resp.ok) return;
        const data = await resp.json();

        if (currentSeq !== centerSearchSeqCounter) return;

        if (data.status === 'ok' && Array.isArray(data.results) && data.results.length > 0) {
          const K_RRF = 60;
          const fusedMap = new Map();

          // 1) 키워드 랭크 등록
          lexMatches.forEach(({ doc }, idx) => {
            const rank = idx + 1;
            const bKey = getDocBaseKey(doc);
            fusedMap.set(bKey, {
              doc,
              lexRank: rank,
              denseRank: null,
              denseScore: 0,
              score: 1.0 / (K_RRF + rank),
              matchType: 'lexical',
              matchedSection: null
            });
          });

          // 2) 시맨틱 랭크 융합
          const DENSE_WEIGHT = 1.35;
          data.results.forEach((dense, idx) => {
            const rank = idx + 1;
            const doc = (typeof docMap !== 'undefined' && docMap.get(dense.id)) || {
              id: dense.id,
              title: dense.title,
              category: dense.category,
              summary: '',
              snippet: '',
              base_name: dense.base_name || ''
            };
            const bKey = getDocBaseKey(doc);
            const denseRrf = DENSE_WEIGHT / (K_RRF + rank);

            if (fusedMap.has(bKey)) {
              const item = fusedMap.get(bKey);
              item.denseRank = rank;
              item.denseScore = dense.score;
              item.score += denseRrf;
              item.matchType = 'hybrid';
              if (dense.matched_section) {
                item.matchedSection = dense.matched_section;
              }
              if (doc.is_canonical_primary && !item.doc.is_canonical_primary) {
                item.doc = doc;
              }
            } else {
              let repDoc = doc;
              if (!repDoc.is_canonical_primary && repDoc.variants) {
                const priId = repDoc.variants['재구성'] || repDoc.variants['원문요약'] || repDoc.variants['일반'] || repDoc.variants['소스분석'];
                if (priId && typeof docMap !== 'undefined' && docMap.get(priId)) {
                  repDoc = docMap.get(priId);
                }
              }
              fusedMap.set(bKey, {
                doc: repDoc,
                lexRank: null,
                denseRank: rank,
                denseScore: dense.score,
                score: denseRrf,
                matchType: 'semantic',
                matchedSection: dense.matched_section || null
              });
            }
          });

          const fusedList = Array.from(fusedMap.values());
          fusedList.sort((a, b) => b.score - a.score);
          lastCenterSearchResults = fusedList;
          lastCenterSearchStatus = 'fused';
          renderCenterSearchResults(fusedList.slice(0, 40), q, 'fused');
        } else {
          lastCenterSearchResults = initialItems;
          lastCenterSearchStatus = 'idle';
          renderCenterSearchResults(initialItems, q, 'idle');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[CenterSearch] Semantic search error:', err);
          renderCenterSearchResults(initialItems, q, 'idle');
        }
      }
    }, 350);
  }

  function renderCenterSearchResults(items, query, semanticStatus = 'idle') {
    const listContainer = document.getElementById('center-search-results-list');
    const bannerContainer = document.getElementById('center-search-banner-container');
    const metaText = document.getElementById('center-search-meta-text');

    if (!listContainer) return;

    // 문서 성격 패싯 + 카테고리 필터링 적용
    const facetBar = document.getElementById('center-search-facet-bar');
    if (facetBar) facetBar.innerHTML = facetChipsHtml(items, 'center');
    let filteredItems = applySearchFacet(items);
    if (centerSearchCategoryFilter !== 'all') {
      filteredItems = filteredItems.filter(it => it.doc && it.doc.category === centerSearchCategoryFilter);
    }

    // 메타 텍스트 업데이트
    if (metaText) {
      metaText.innerHTML = `총 <strong class="text-blue-600 dark:text-blue-400 font-bold">${filteredItems.length}</strong>개 문서 선별`;
    }

    // 상태 배너 업데이트
    if (bannerContainer) {
      if (semanticStatus === 'searching') {
        bannerContainer.innerHTML = `
          <div class="px-4 py-2.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/50 flex items-center justify-between text-xs text-blue-700 dark:text-blue-300">
            <span class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span>키워드 색인 즉시 표시 중 · <strong>Ollama bge-m3 시맨틱(의미론적) 정밀 청킹 분석 중...</strong></span>
            </span>
            <span class="text-[11px] text-slate-400 hidden sm:inline">유의어·오타 자동 융합</span>
          </div>
        `;
      } else if (semanticStatus === 'fused') {
        bannerContainer.innerHTML = `
          <div class="px-4 py-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="font-bold">🎯 하이브리드 검색 융합 완료</span>
              <span class="text-slate-500 dark:text-slate-400 hidden sm:inline">(키워드 + Ollama bge-m3 정밀 청킹 RRF 결합)</span>
            </span>
            <span class="text-[11px] bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md font-semibold text-emerald-800 dark:text-emerald-200">중복 100% 제거 정본</span>
          </div>
        `;
      } else {
        bannerContainer.innerHTML = '';
      }
    }

    // 결과 목록 렌더링
    if (filteredItems.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
          <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <i data-lucide="search-x" class="w-6 h-6"></i>
          </div>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-200">일치하는 검색 결과가 없습니다.</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            "${escapeHtml(query)}"에 대한 문서를 찾을 수 없습니다. 다른 검색어나 단어로 검색해 보세요.
          </p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    listContainer.innerHTML = filteredItems.map(item => {
      const doc = item.doc;
      let matchBadge = '';
      if (item.matchType === 'hybrid') {
        matchBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold shrink-0">🎯 하이브리드</span>`;
      } else if (item.matchType === 'semantic') {
        const pct = item.denseScore ? Math.round(item.denseScore * 100) : '';
        matchBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold shrink-0">💡 시맨틱 ${pct ? pct + '%' : ''}</span>`;
      } else {
        matchBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium shrink-0">키워드</span>`;
      }

      // 청킹 인출 매칭 섹션
      let sectionSnippetHtml = '';
      if (item.matchedSection && item.matchedSection.heading) {
        sectionSnippetHtml = `
          <div class="mt-2 px-3 py-1.5 rounded-lg bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
            <i data-lucide="crosshair" class="w-3.5 h-3.5 text-purple-600 shrink-0"></i>
            <span class="font-bold shrink-0">일치 섹션:</span>
            <span class="truncate font-semibold">${escapeHtml(item.matchedSection.heading)}</span>
          </div>
        `;
      }

      // 동일 원천 파생본 원클릭 칩 (Canonical Variant Pills)
      let variantPillsHtml = '';
      const vars = doc.variants || {};
      const reconId = vars['재구성'] || (doc.doc_type === '재구성' ? doc.id : doc.pair_reconstructed);
      const simpleId = vars['원문요약'] || (doc.doc_type === '원문요약' ? doc.id : doc.pair_simple);
      const analysisId = vars['소스분석'] || (doc.doc_type === '소스분석' ? doc.id : doc.pair_source_analysis);
      const varCount = (reconId ? 1 : 0) + (simpleId ? 1 : 0) + (analysisId ? 1 : 0);

      if (varCount > 1) {
        variantPillsHtml = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500 mr-0.5">파생본:</span>
            ${reconId ? `
              <a href="#/doc/${encodeURIComponent(reconId)}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${doc.id === reconId ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 text-slate-600 dark:text-slate-400 hover:text-purple-600'} transition" title="구조화 재구성본 열람">
                ✨ 재구성
              </a>
            ` : ''}
            ${simpleId ? `
              <a href="#/doc/${encodeURIComponent(simpleId)}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${doc.id === simpleId ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 dark:text-slate-400 hover:text-blue-600'} transition" title="원문 요약본 열람">
                📄 요약
              </a>
            ` : ''}
            ${analysisId ? `
              <a href="#/doc/${encodeURIComponent(analysisId)}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${doc.id === analysisId ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 text-slate-600 dark:text-slate-400 hover:text-amber-600'} transition" title="원천 소스 구조 분석 열람">
                🔍 소스분석
              </a>
            ` : ''}
          </div>
        `;
      }

      // 간단 요약 본문 (doc.summary || doc.snippet)
      const displaySnippet = (item.matchedSection && item.matchedSection.snippet) || doc.summary || doc.snippet || '요약 정보가 없습니다.';

      return `
        <div class="card-glass rounded-2xl p-5 hover:border-blue-500/40 dark:hover:border-blue-500/40 transition group flex flex-col justify-between space-y-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <!-- 상단 뱃지 행 -->
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold px-2 py-0.5 rounded ${doc.doc_type === '재구성' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}">
                  ${escapeHtml(doc.doc_type || '문서')}
                </span>
                ${matchBadge}
                ${qaSameQuestionBadge(doc)}
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-400">
                <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  ${escapeHtml(doc.category || '일반')}
                </span>
                ${doc.char_count ? `<span>• ${(doc.char_count / 1000).toFixed(1)}k자</span>` : ''}
              </div>
            </div>

            <!-- 제목 -->
            <h3 class="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
              <a href="#/doc/${encodeURIComponent(doc.id)}" class="hover:underline flex items-center gap-1.5">
                <i data-lucide="${doc.doc_type === '재구성' ? 'sparkles' : 'file-text'}" class="w-4 h-4 text-blue-500 shrink-0"></i>
                <span>${escapeHtml(doc.title)}</span>
              </a>
            </h3>

            <!-- 청킹 매칭 섹션 -->
            ${sectionSnippetHtml}

            <!-- 핵심 간단 요약 -->
            <div class="mt-3 p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
              <div class="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                <i data-lucide="align-left" class="w-3.5 h-3.5 text-blue-500"></i>
                <span>문서 요약 및 발췌</span>
              </div>
              <p class="line-clamp-3 leading-relaxed">${escapeHtml(displaySnippet)}</p>
            </div>
          </div>

          <!-- 하단 파생본 칩 & 조회 링크 -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            ${variantPillsHtml}

            <div class="flex items-center gap-2 ml-auto">
              ${(reconId && simpleId) ? `
                <a href="#/doc/${encodeURIComponent(reconId)}?view=split" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-bold transition shadow-sm" title="재구성본과 요약본 나란히 듀얼 분할 비교">
                  <i data-lucide="columns" class="w-3.5 h-3.5"></i>
                  <span>듀얼뷰</span>
                </a>
              ` : ''}
              <a href="#/doc/${encodeURIComponent(doc.id)}" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm">
                <span>문서 열람</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // 17-C. Header Search Input & Shortcut Handlers
  if (headerSearchInput) {
    headerSearchInput.addEventListener('compositionstart', () => {
      // 한글 조합 중
    });
    headerSearchInput.addEventListener('compositionend', (e) => {
      const val = e.target.value;
      if (headerSearchClear) {
        if (val.trim()) headerSearchClear.classList.remove('hidden');
        else headerSearchClear.classList.add('hidden');
      }
      if (window.location.hash.startsWith('#/search')) {
        executeCenterSearch(val);
      }
    });

    headerSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (headerSearchClear) {
        if (val.trim()) headerSearchClear.classList.remove('hidden');
        else headerSearchClear.classList.add('hidden');
      }
      if (window.location.hash.startsWith('#/search')) {
        if (centerSearchDebounceTimer) clearTimeout(centerSearchDebounceTimer);
        centerSearchDebounceTimer = setTimeout(() => {
          executeCenterSearch(val);
        }, 120);
      }
    });

    headerSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = headerSearchInput.value.trim();
        if (val) {
          window.location.hash = `#/search?q=${encodeURIComponent(val)}`;
        } else {
          window.location.hash = '#/search';
        }
      } else if (e.key === 'Escape') {
        headerSearchInput.blur();
      }
    });
  }

  if (headerSearchClear) {
    headerSearchClear.addEventListener('click', () => {
      if (headerSearchInput) {
        headerSearchInput.value = '';
        headerSearchClear.classList.add('hidden');
        headerSearchInput.focus();
        if (window.location.hash.startsWith('#/search')) {
          window.location.hash = '#/search';
        }
      }
    });
  }

  // Ctrl + K 단축키: 상단 검색창으로 즉각 포커스 및 텍스트 선택
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      // 과제 D: 모달 placeholder 가 [Ctrl + K] 를 광고하지만 openSearchModal() 호출처가 없었다
      if (searchModal && searchInput) openSearchModal();
      else if (headerSearchInput) { headerSearchInput.focus(); headerSearchInput.select(); }
    } else if (e.key === 'Escape') {
      if (document.activeElement === headerSearchInput) {
        headerSearchInput.blur();
      }
      if (docPopupModal && !docPopupModal.classList.contains('hidden')) {
        closeDocModal();
        return;
      }
      if (searchModal && !searchModal.classList.contains('hidden')) {
        closeSearchModal();
      }
    } else if (e.key === 'Backspace' && docPopupModal && !docPopupModal.classList.contains('hidden')
               && docPopupStack.length > 0 && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) {
      e.preventDefault();
      openDocModal(docPopupStack.pop(), { fromPopup: true });
    }
  });

  if (quickSearchBtn) quickSearchBtn.addEventListener('click', () => {
    if (headerSearchInput) {
      headerSearchInput.focus();
      headerSearchInput.select();
    }
  });

  if (searchModal) {
    searchModal.addEventListener('click', (e) => {
      if (e.target === searchModal) closeSearchModal();
    });
  }

  if (docPopupModal) {
    docPopupModal.addEventListener('click', (e) => {
      if (e.target === docPopupModal) closeDocModal();
    });
  }

  if (docPopupCloseBtn) {
    docPopupCloseBtn.addEventListener('click', closeDocModal);
  }

  // [개선] 상단 헤더 및 사이드바의 'AI 묻고 답하기' 버튼 클릭 시 항상 깨끗한 새 질문 입력 모드로 전환
  document.querySelectorAll('a[href="#/qa"]').forEach(link => {
    link.addEventListener('click', () => {
      setTimeout(() => {
        const qInput = document.getElementById('qa-input-query');
        const btnClear = document.getElementById('btn-clear-qa-query');
        const btnQuickClear = document.getElementById('btn-input-quick-clear');
        const btnRestore = document.getElementById('btn-restore-last-query');
        if (qInput) {
          qInput.value = '';
          qInput.focus();
        }
        if (btnClear) btnClear.classList.add('hidden');
        if (btnQuickClear) btnQuickClear.classList.add('hidden');
        if (btnRestore && state.lastQaState && state.lastQaState.query) {
          btnRestore.classList.remove('hidden');
        }
      }, 60);
    });
  });

  // Initialize
  applyTheme();
  renderSidebar();
  handleRoute();
});
