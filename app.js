(() => {
  const localTools = window.AI_TOOLS || [];
  const localNews = window.AI_NEWS || [];
  const config = window.AI_NAVIGATOR_CONFIG || {};
  const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient);
  const supabaseClient = hasSupabaseConfig ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const state = {
    tools: localTools,
    news: localNews,
    query: '',
    category: 'all',
    priceFilter: 'all',
    koreanFilter: 'all',
    directoryQuery: '',
    directorySort: 'recommended',
    saved: new Set(JSON.parse(localStorage.getItem('ai-navigator-saved') || '[]')),
    compare: new Set(),
    weights: { fit: 40, quality: 20, cost: 15, korean: 10, speed: 5, privacy: 10 },
    user: null,
    profile: null,
    connected: Boolean(supabaseClient),
    isAdmin: false,
    authMode: 'signin',
    remoteNews: false,
    workflow: 'content',
    newsExpanded: false,
    newsQuery: '',
    newsCategory: 'all',
    templateCategory: 'all',
    promptCategory: 'all',
    savedRecipes: new Set(JSON.parse(localStorage.getItem('ai-navigator-saved-recipes') || '[]')),
    popularity: new Map(),
    popularityLive: false,
    popularityFilter: 'all',
    localPopularity: JSON.parse(localStorage.getItem('ai-navigator-popularity') || '{}'),
    updates: [],
    updatesLive: false,
    updateFilter: 'all',
    readUpdates: new Set(JSON.parse(localStorage.getItem('ai-navigator-read-updates') || '[]'))
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const toast = $('#toast');
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function setMessage(selector, message, isError = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? '#bd5a28' : '#17845d';
  }

  function showView(id = 'top') {
    const homeTargets = new Set(['top', 'popularity', 'home-more']);
    const isHome = homeTargets.has(id);
    document.querySelectorAll('.main-content > section').forEach(section => {
      const belongsToHome = section.classList.contains('hero') || ['popularity', 'home-more'].includes(section.id);
      const shouldShow = isHome ? belongsToHome : section.id === id;
      section.classList.toggle('view-hidden', !shouldShow);
    });
    document.body.dataset.view = isHome ? 'home' : id;
    const navButtons = $$('.nav-item, .mobile-nav button');
    navButtons.forEach(button => button.classList.toggle('active', button.dataset.scroll === (isHome && id === 'top' ? 'top' : id)));
  }

  function scrollToId(id) {
    const targetId = id || 'top';
    showView(targetId);
    const target = targetId === 'top' ? document.getElementById('top') : document.getElementById(targetId);
    requestAnimationFrame(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    if (location.hash !== `#${targetId}`) history.pushState(null, '', `#${targetId}`);
  }
  function saveLocalState() { localStorage.setItem('ai-navigator-saved', JSON.stringify([...state.saved])); }
  function saveLocalPopularity() { localStorage.setItem('ai-navigator-popularity', JSON.stringify(state.localPopularity)); }
  function visitorId() {
    let id = localStorage.getItem('ai-navigator-visitor');
    if (!id) { id = crypto.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('ai-navigator-visitor', id); }
    return id;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function slugify(value) {
    const slug = String(value || 'news').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
    return `${slug || 'news'}-${Date.now().toString(36)}`;
  }
  function formatDate(value) {
    if (!value) return '';
    const raw = String(value).slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}. ${match[2]}. ${match[3]}` : raw;
  }

  function updatePageDates() {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long'
    }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    if ($('#current-date')) $('#current-date').textContent = `${parts.weekday}, ${Number(parts.month)}월 ${Number(parts.day)}일`;
    if ($('#briefing-date')) $('#briefing-date').textContent = `${parts.year}. ${month}. ${day} · 5분이면 충분해요`;
  }
  function mapTool(row) {
    return {
      id: row.id, name: row.name, maker: row.maker, logo: row.logo || '✦', logoClass: row.logo_class || 'logo-blue',
      categories: row.categories || [], bestFor: row.best_for || [], keywords: row.keywords || [],
      quality: row.quality ?? 3, korean: row.korean ?? 3, speed: row.speed ?? 3, privacy: row.privacy ?? 3, ease: row.ease ?? 3, costFit: row.cost_fit ?? 3,
      price: row.price || '정보 확인 필요', priceType: row.price_type || 'unknown', freeLimit: row.free_limit || '', strengths: row.strengths || [], reason: row.reason || '업무 조건에 맞는지 직접 비교해 보세요.', description: row.description || '', officialUrl: row.official_url || '#', verifiedAt: row.verified_at || '검증일 미정', createdAt: row.created_at || null
    };
  }
  const newsArticlePathsByTitle = {
    '새로운 영상 생성 모델, 짧은 제품 영상 제작에 특화': '/news/video-product-shorts/',
    'AI를 잘 쓰는 사람은 질문보다 ‘조건’을 먼저 정한다': '/news/better-ai-prompts/',
    '반복 업무를 줄이는 AI 자동화 조합 3가지': '/news/ai-automation-workflows/',
    '회사 자료를 AI에 넣기 전 확인할 보안 체크리스트': '/news/ai-security-checklist/',
    '시장 조사를 시작할 때 검색 AI를 고르는 기준': '/news/search-ai-market-research/'
  };

  const newsBodiesByTitle = {
    '새로운 영상 생성 모델, 짧은 제품 영상 제작에 특화': `## 무엇이 달라졌나

최근 영상 생성 AI는 긴 영화보다 5~15초짜리 제품 소개 장면을 빠르게 만드는 방향으로 발전하고 있습니다. 제품 사진과 한 줄 설명을 넣으면 카메라 이동, 배경, 조명까지 포함한 초안을 만들 수 있어 작은 브랜드도 촬영 전 아이디어를 시험하기 쉬워졌습니다.

## 한 번에 완성하려 하지 마세요

한 번의 명령으로 나온 영상은 완성본보다 시안에 가깝습니다. 같은 조건으로 3개 정도를 만든 뒤 제품 모양이 유지되는지, 화면 속 글자가 깨지지 않는지, 장면 연결이 자연스러운지를 먼저 비교하는 편이 좋습니다.

## 실무에서는 이렇게 써보세요

- 제품 사진과 원하는 분위기를 준비합니다.
- 5초짜리 장면을 3가지 구도로 생성합니다.
- 가장 좋은 장면만 골라 캡컷 같은 편집 도구에서 연결합니다.
- 로고·가격·자막은 생성 영상이 아니라 편집 단계에서 넣습니다.
- 공개 전 실제 제품과 다른 모습이 없는지 확인합니다.

## 꼭 확인할 점

제품의 색상이나 형태가 바뀌면 광고 신뢰도가 떨어질 수 있습니다. 인물 얼굴, 상표, 음악을 사용할 때는 이용 약관과 상업적 사용 가능 범위도 확인해야 합니다. 영상 AI는 촬영을 완전히 대신하기보다 기획안과 짧은 홍보 시안을 빠르게 만드는 도구로 쓰는 것이 현실적입니다.`,
    'AI를 잘 쓰는 사람은 질문보다 ‘조건’을 먼저 정한다': `## 좋은 결과는 조건에서 시작합니다

AI에게 질문만 던지면 무난하지만 바로 쓰기 어려운 답이 나올 때가 많습니다. 목적, 대상, 결과 형식, 분량, 반드시 포함할 내용과 제외할 내용을 함께 알려주면 수정 횟수를 크게 줄일 수 있습니다.

## 다섯 가지 조건을 적어보세요

- 목적: 이 결과를 어디에 사용할지
- 대상: 누가 읽거나 볼지
- 형식: 표, 이메일, 보고서 등 원하는 모양
- 제한: 분량, 말투, 마감 시간
- 근거: 참고할 자료와 추측 금지 범위

예를 들어 “신제품 홍보문을 써줘”보다 “30대 직장인을 대상으로 한 인스타그램 홍보문을 150자 안으로, 과장 표현 없이 3가지 작성해줘”가 훨씬 안정적입니다.

## 정보가 부족하면 먼저 질문하게 하세요

명령 마지막에 “작업 전에 부족한 정보를 세 가지만 질문해줘”라고 덧붙이면 AI가 임의로 추측하는 일을 줄일 수 있습니다. 반복 업무라면 잘 나온 조건을 템플릿으로 저장해 다음에도 그대로 사용하세요.

## 바로 쓰는 기본 문장

“목표는 [결과]이고 대상은 [독자]입니다. [형식]으로 작성하되 [분량·톤]을 지키고 [필수 내용]을 포함하세요. 확인되지 않은 내용은 만들지 말고, 부족한 정보가 있으면 먼저 질문하세요.”`,
    '반복 업무를 줄이는 AI 자동화 조합 3가지': `## 자동화는 세 부분으로 나눕니다

반복 업무는 ‘언제 시작할지’, ‘AI가 무엇을 처리할지’, ‘결과를 어디에 보낼지’로 나누면 설계하기 쉽습니다. 처음부터 모든 일을 자동화하지 말고 매주 같은 방식으로 반복하는 한 가지 업무부터 선택하세요.

## 조합 1: 문의 접수와 분류

구글 폼이나 이메일로 문의가 들어오면 AI가 내용을 요약하고 문의 유형과 긴급도를 붙입니다. 결과는 스프레드시트나 슬랙으로 보내 담당자가 확인합니다. 답변 발송은 사람이 승인하도록 두는 것이 안전합니다.

## 조합 2: 회의록과 할 일

회의 녹음 또는 메모를 AI가 요약하고 담당자·기한이 포함된 할 일 목록으로 바꿉니다. 노션이나 프로젝트 관리 도구에 저장한 뒤 참석자가 원문과 비교해 확정합니다.

## 조합 3: 뉴스 수집과 초안

선택한 RSS의 새 글을 모아 AI가 핵심 내용을 분류·요약합니다. 관련 없는 글은 제외하고, 남은 내용으로 뉴스레터 초안을 만든 뒤 편집자가 출처를 확인하고 발행합니다.

## 실패를 줄이는 기준

개인정보나 결제처럼 위험한 단계는 자동 실행하지 말고 승인 단계를 넣으세요. 오류가 났을 때 알림을 받을 곳과 원문을 다시 확인할 수 있는 링크도 남겨야 합니다. 일주일 동안 수동으로 검토한 뒤 정확도가 충분할 때 범위를 늘리는 것이 좋습니다.`,
    '회사 자료를 AI에 넣기 전 확인할 보안 체크리스트': `## 먼저 자료의 등급을 정하세요

모든 회사 자료를 같은 방식으로 다루면 안 됩니다. 공개 자료, 내부 공유 자료, 개인정보·계약·재무 정보처럼 민감한 자료로 구분하고 민감한 내용은 승인된 기업용 도구가 아니면 입력하지 않는 것이 원칙입니다.

## 입력 전 체크리스트

- 이름, 전화번호, 고객번호 등 개인 식별 정보를 지웠는가
- 회사가 허용한 AI 서비스인가
- 입력 데이터가 모델 학습에 사용되는지 확인했는가
- 대화와 파일의 보관 기간을 설정할 수 있는가
- 필요한 사람만 접근하도록 권한을 제한했는가
- 결과를 사람이 검토한 뒤 사용하는가

## 넣지 말아야 할 자료

비밀번호와 API 키, 미공개 실적, 주민등록번호, 의료 정보, 고객 명단, 서명 전 계약서 원문은 공개형 AI에 넣지 마세요. 꼭 분석해야 한다면 식별 정보를 제거하고 회사 보안 담당자에게 먼저 확인해야 합니다.

## 결과도 다시 확인해야 합니다

AI가 만든 요약에 원문에 없는 내용이 섞이거나 중요한 조건이 빠질 수 있습니다. 중요한 의사결정에 쓰는 결과는 원문과 대조하고, 누가 어떤 도구에 어떤 자료를 사용했는지 기록을 남겨야 합니다.`,
    '시장 조사를 시작할 때 검색 AI를 고르는 기준': `## 검색 속도보다 근거가 중요합니다

시장 조사는 그럴듯한 요약보다 출처를 다시 확인할 수 있는지가 중요합니다. 검색 AI를 고를 때는 최신 자료를 찾는지, 문장별 출처가 표시되는지, 여러 관점을 함께 보여주는지부터 확인하세요.

## 다섯 가지 선택 기준

- 최신성: 최근 자료와 발표일을 구분하는가
- 출처 품질: 정부·기업·연구기관의 원문을 연결하는가
- 인용 범위: 어떤 문장을 어떤 출처가 뒷받침하는지 알 수 있는가
- 반대 근거: 서로 다른 수치나 의견을 함께 보여주는가
- 정리 기능: 표나 파일로 내보내 비교하기 쉬운가

## 발견과 검증을 나누세요

검색 AI는 관련 자료를 넓게 발견하는 데 사용하고, 중요한 숫자와 주장은 반드시 원문에서 다시 확인하세요. 블로그가 인용한 통계라면 통계를 발표한 기관의 최초 자료까지 따라가는 것이 좋습니다.

## 추천 조사 순서

먼저 넓은 질문으로 시장의 용어와 주요 회사를 찾습니다. 다음으로 기간·지역·고객군을 좁혀 검색하고, 핵심 주장마다 원문 링크와 발표일을 기록합니다. 마지막에는 확인된 사실, 추정, 아직 모르는 내용을 나눠 표로 정리하면 의사결정에 바로 사용할 수 있습니다.`
  };

  function mapNews(row) {
    return { id: row.id, label: row.label, date: formatDate(row.published_at || row.created_at || row.date), title: row.title, summary: row.summary, body: row.body || '', insight: row.insight || '', category: row.category || 'insight', source: row.source || '출처 미정', sourceUrl: row.source_url || '#', articlePath: newsArticlePathsByTitle[row.title] || '' };
  }

  function renderNewsBody(body) {
    return String(body || '').trim().split(/\n\s*\n/).filter(Boolean).map(block => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length === 1 && lines[0].startsWith('## ')) return `<h4 class="news-body-heading">${escapeHtml(lines[0].slice(3))}</h4>`;
      if (lines.length && lines.every(line => line.startsWith('- '))) return `<ul class="news-body-list">${lines.map(line => `<li>${escapeHtml(line.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${escapeHtml(lines.join(' '))}</p>`;
    }).join('');
  }

  const categoryInfo = {
    writing: { caption: '회의 기록과 긴 문서를 정리하는 데 맞는 도구예요.', label: '글쓰기·문서' },
    image: { caption: '아이디어를 시각화하고 이미지 시안을 만드는 도구예요.', label: '이미지·디자인' },
    coding: { caption: '코드를 읽고 오류를 해결하는 데 도움 되는 도구예요.', label: '코딩' },
    research: { caption: '최신 정보를 찾고 근거를 확인하는 데 맞는 도구예요.', label: '검색·리서치' },
    video: { caption: '영상 아이디어를 만들고 숏폼으로 완성하는 데 맞는 도구예요.', label: '영상' },
    design: { caption: '발표자료와 시각 결과물을 빠르게 만드는 데 맞는 도구예요.', label: '디자인' }
  };

  const toolKoreanNames = {
    chatgpt:'챗GPT', claude:'클로드', gemini:'제미나이', notebooklm:'노트북LM', perplexity:'퍼플렉시티',
    canva:'캔바 매직 스튜디오', firefly:'어도비 파이어플라이', midjourney:'미드저니', capcut:'캡컷', runway:'런웨이',
    cursor:'커서', gamma:'감마', 'notion-ai':'노션 AI', 'microsoft-copilot':'마이크로소프트 코파일럿',
    ideogram:'아이디오그램', 'leonardo-ai':'레오나르도 AI', recraft:'리크래프트', 'kling-ai':'클링 AI',
    'google-veo':'구글 비오', pika:'피카', heygen:'헤이젠', 'luma-dream-machine':'루마 드림 머신',
    genspark:'젠스파크', grok:'그록', 'github-copilot':'깃허브 코파일럿', replit:'리플릿',
    lovable:'러버블', 'bolt-new':'볼트', elevenlabs:'일레븐랩스', suno:'수노', 'zapier-ai':'재피어 AI', n8n:'엔에잇엔'
  };

  function koreanToolName(tool) {
    return toolKoreanNames[String(tool?.id)] || tool?.nameKo || '';
  }

  function displayToolName(tool) {
    const korean = koreanToolName(tool);
    return korean ? `${tool.name} (${korean})` : tool.name;
  }

  function toolLogoUrl(tool) {
    try {
      if (!tool?.officialUrl || tool.officialUrl === '#') return '';
      const domain = new URL(tool.officialUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    } catch (error) { return ''; }
  }

  function toolLogoMarkup(tool) {
    const url = toolLogoUrl(tool);
    const fallback = escapeHtml(tool.logo || String(tool.name || '?').slice(0, 1));
    return `<div class="tool-logo ${escapeHtml(tool.logoClass)}">${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span class="tool-logo-fallback" hidden>${fallback}</span>` : `<span class="tool-logo-fallback">${fallback}</span>`}</div>`;
  }

  function toolNameMarkup(tool) {
    const korean = koreanToolName(tool);
    return `<div class="tool-title">${escapeHtml(tool.name)}</div>${korean ? `<div class="tool-name-ko">${escapeHtml(korean)}</div>` : ''}`;
  }

  const officialPageChecks = new Set([
    'chatgpt','claude','gemini','notebooklm','perplexity','canva','firefly','midjourney','capcut','runway',
    'cursor','github-copilot','notion-ai','microsoft-copilot','ideogram','heygen','gamma','elevenlabs','n8n'
  ]);

  function verificationInfo(tool) {
    const checked = officialPageChecks.has(String(tool.id));
    const pending = String(tool.id) === 'kling-ai';
    return {
      checked,
      label: checked ? '공식 페이지 확인' : pending ? '공식 페이지 재확인 필요' : '정보 검증 대기',
      date: checked ? '2026. 07. 20' : '확인일 미정',
      className: checked ? 'verified' : pending ? 'pending' : 'waiting'
    };
  }

  function verificationMarkup(tool, compact = false) {
    const info = verificationInfo(tool);
    if (compact) return `<div class="card-verification ${info.className}"><i></i><span>${escapeHtml(info.label)}</span><time>${escapeHtml(info.date)}</time></div>`;
    const source = tool.officialUrl && tool.officialUrl !== '#' ? `<a href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 출처 열기 →</a>` : '<span>공식 출처 확인 중</span>';
    return `<section class="verification-panel ${info.className}">
      <div><span class="verification-icon">${info.checked ? '✓' : '!'}</span><div><strong>${escapeHtml(info.label)}</strong><small>확인일 · ${escapeHtml(info.date)}</small></div></div>
      <div class="verification-source"><small>정보 출처</small>${source}</div>
      <div class="verification-source"><small>추천 방식</small><span>작업 적합도와 5개 품질 지표의 가중 점수</span></div>
    </section>`;
  }

  const workflows = [
    {
      id: 'content', icon: '✦', label: '콘텐츠 제작', title: '아이디어에서 게시물까지',
      description: '기획, 디자인, 편집을 세 도구로 나눠 결과물의 완성도를 높여요.', time: '약 30~60분',
      tip: 'ChatGPT에서 만든 문구를 Canva에 붙여 넣고, 완성된 이미지를 CapCut 영상 소재로 활용하세요.',
      steps: [
        { toolId: 'chatgpt', role: '주제·구성·게시물 문구 만들기' },
        { toolId: 'canva', role: '카드뉴스와 썸네일 디자인' },
        { toolId: 'capcut', role: '짧은 영상과 자막으로 마무리' }
      ]
    },
    {
      id: 'research', icon: '⌕', label: '시장 조사', title: '자료 찾기에서 보고서까지',
      description: '최신 출처를 찾고, 긴 자료를 검토한 뒤 보고서로 정리해요.', time: '약 40~90분',
      tip: 'Perplexity의 출처 링크를 먼저 확인한 뒤 NotebookLM에 신뢰할 자료만 넣으면 오류를 줄일 수 있어요.',
      steps: [
        { toolId: 'perplexity', role: '최신 정보와 출처 빠르게 찾기' },
        { toolId: 'notebooklm', role: '수집한 자료를 근거 중심으로 분석' },
        { toolId: 'chatgpt', role: '결론·표·실행안이 있는 보고서 작성' }
      ]
    },
    {
      id: 'shorts', icon: '▶', label: '숏폼 영상', title: '대본에서 세로 영상까지',
      description: '짧은 대본, 영상 장면, 자막 편집 순서로 숏폼을 완성해요.', time: '약 30~80분',
      tip: '같은 인물과 분위기를 유지하도록 대본의 장면 설명을 Kling AI 프롬프트에 그대로 이어 쓰세요.',
      steps: [
        { toolId: 'chatgpt', role: '15~30초 대본과 장면표 작성' },
        { toolId: 'kling-ai', role: '세로 9:16 영상 장면 생성' },
        { toolId: 'capcut', role: '자막·음악·장면 전환 편집' }
      ]
    },
    {
      id: 'coding', icon: '⌘', label: '코딩', title: '기획에서 배포 가능한 코드까지',
      description: '요구사항을 정리하고, 코드를 작성한 뒤 오류와 품질을 점검해요.', time: '작업별 상이',
      tip: 'Cursor에는 한 번에 큰 기능을 맡기기보다 파일 하나와 완료 조건을 함께 알려주는 것이 좋아요.',
      steps: [
        { toolId: 'chatgpt', role: '요구사항·화면·완료 조건 정리' },
        { toolId: 'cursor', role: '프로젝트 안에서 코드 구현' },
        { toolId: 'github-copilot', role: '코드 보완·테스트·리뷰 지원' }
      ]
    }
  ];

  const workTemplates = [
    { id:'meeting', category:'writing', icon:'📝', title:'회의록과 할 일 정리', description:'뒤섞인 회의 메모를 결정사항과 담당자별 할 일로 정리해요.', time:'약 3분', toolIds:['chatgpt','claude','notion-ai'], prompt:`아래 회의 메모를 실무자가 바로 사용할 수 있게 정리해 주세요.

[회의 메모 붙여넣기]

다음 순서로 작성하세요.
1. 회의 목적과 핵심 결론 3줄
2. 결정된 사항
3. 할 일: 담당자 / 마감일 / 우선순위 표
4. 아직 결정되지 않은 사항
5. 다음 회의에서 확인할 질문

메모에 없는 담당자나 날짜는 추측하지 말고 '확인 필요'라고 표시하세요.` },
    { id:'blog', category:'writing', icon:'✍️', title:'블로그 초안 작성', description:'검색 독자를 고려한 제목부터 본문과 마무리 문구까지 만들어요.', time:'약 5분', toolIds:['chatgpt','claude','gemini'], prompt:`다음 조건으로 블로그 글 초안을 작성해 주세요.

주제: [글의 주제]
주요 독자: [누가 읽는지]
목적: [정보 제공/제품 소개/경험 공유]
핵심 키워드: [키워드 3개]
원하는 말투: [친근함/전문적/간결함]
분량: [예: 1,500자]

제목 후보 5개, 목차, 본문, 핵심 요약, 독자가 다음에 할 행동 순서로 작성하세요. 확인되지 않은 사실은 만들지 마세요.` },
    { id:'market', category:'research', icon:'⌕', title:'시장 조사 보고서', description:'출처가 있는 시장 정보와 경쟁사 차이를 한 번에 정리해요.', time:'약 15분', toolIds:['perplexity','chatgpt','notebooklm'], prompt:`다음 시장을 조사해 주세요.

조사 대상: [제품 또는 시장]
지역: [한국/글로벌/특정 국가]
기간: [예: 최근 1년]
조사 목적: [사업계획/마케팅/투자 검토]

시장 규모와 성장 요인, 주요 고객, 경쟁사 5곳 비교, 가격대, 기회와 위험, 실행 제안 3개를 정리하세요.
각 사실에는 출처 링크와 발표일을 표시하고, 확인된 사실과 추론을 구분하세요.` },
    { id:'pdf', category:'research', icon:'📚', title:'긴 PDF 핵심 분석', description:'긴 보고서에서 근거·결론·실행할 일만 빠르게 찾아요.', time:'약 5분', toolIds:['notebooklm','claude','chatgpt'], prompt:`첨부한 PDF만 근거로 분석해 주세요.

읽는 목적: [자료를 사용하는 목적]
특히 확인할 내용: [관심 주제]

1. 전체 내용 5줄 요약
2. 중요한 주장과 근거가 있는 페이지
3. 숫자와 통계 표
4. 실무에 적용할 수 있는 내용
5. 자료의 한계 또는 빠진 정보
6. 추가로 확인할 질문 5개

PDF에 없는 내용은 추측하지 말고 '자료에서 확인되지 않음'이라고 표시하세요.` },
    { id:'cardnews', category:'image', icon:'🎨', title:'카드뉴스 기획', description:'한 주제를 6장짜리 카드뉴스 구성과 이미지 지시문으로 바꿔요.', time:'약 8분', toolIds:['canva','chatgpt','firefly'], prompt:`다음 주제로 6장짜리 카드뉴스를 기획해 주세요.

주제: [전달할 내용]
대상: [주요 독자]
목적: [정보/홍보/교육]
브랜드 분위기: [색상과 느낌]

각 장마다 제목, 40자 이내 본문, 어울리는 이미지 설명, 강조할 단어를 작성하세요.
1장은 시선을 끄는 표지, 6장은 저장·공유·문의 중 하나의 행동을 유도하도록 구성하세요.` },
    { id:'shorts', category:'video', icon:'▶', title:'30초 쇼츠 대본', description:'첫 3초 후킹부터 장면·자막·마무리까지 구성해요.', time:'약 7분', toolIds:['chatgpt','capcut','kling-ai'], prompt:`다음 주제로 30초 세로형 쇼츠 대본을 만들어 주세요.

주제: [영상 주제]
시청자: [대상]
목표: [조회/정보/구매/팔로우]
말투: [빠르고 유쾌함/차분하고 전문적]

0~3초 후킹, 4~20초 핵심 내용, 21~27초 결론, 28~30초 행동 유도 순서로 작성하세요.
각 구간에 내레이션, 화면 장면, 큰 자막, 효과음 또는 전환을 표로 표시하세요.` },
    { id:'debug', category:'coding', icon:'⌘', title:'코딩 오류 해결', description:'오류 원인을 찾고 최소 수정과 재발 방지 테스트까지 받아요.', time:'약 10분', toolIds:['chatgpt','claude','cursor'], prompt:`다음 코드 오류를 진단해 주세요.

기대했던 동작: [정상 동작]
실제 동작: [현재 문제]
오류 메시지: [전체 오류]
실행 환경: [언어/프레임워크/버전]
관련 코드:
[코드 붙여넣기]

가능성이 높은 원인을 순서대로 설명하고, 가장 작은 수정안, 수정된 코드, 확인 테스트, 같은 문제가 다시 생기지 않게 할 방법을 제시하세요.` },
    { id:'email', category:'writing', icon:'✉️', title:'업무 이메일 작성', description:'상황에 맞는 제목과 간결하고 예의 있는 이메일을 만들어요.', time:'약 2분', toolIds:['chatgpt','claude','gemini'], prompt:`다음 상황에 맞는 업무 이메일을 작성해 주세요.

받는 사람: [상대방과 관계]
보내는 목적: [요청/안내/사과/일정 조율]
반드시 포함할 내용: [핵심 정보]
원하는 말투: [정중함/친근함/단호함]
회신 마감: [날짜 또는 없음]

제목 후보 3개와 300자 이내 본문을 작성하세요. 핵심 요청과 마감일이 한눈에 보이게 하고 과도한 수식어는 줄이세요.` }
  ];

  const promptRecipes = [
    {
      id:'japan-film', category:'photo', icon:'🎞️', badge:'최근 인기', title:'일본·1990년대 필름 감성', description:'얼굴과 구도는 유지하고 따뜻하고 불완전한 필름 사진으로 바꿔요.', time:'약 3분', tools:['ChatGPT Images','Gemini','Adobe Firefly'], needs:'인물이 선명하게 나온 원본 사진 1장', caution:'사진 속 인물의 동의를 받고, 주민등록증·주소·학교명처럼 신원을 알 수 있는 정보는 가린 뒤 업로드하세요.',
      steps:['사진을 업로드하고 아래 프롬프트를 그대로 붙여 넣으세요.','결과에서 얼굴이 달라졌다면 수정 프롬프트를 이어서 입력하세요.','인스타그램은 4:5, 카카오 프로필은 1:1로 비율만 바꿔 다시 생성하세요.'],
      prompt:`작업 유형: 첨부한 사진 편집

가장 중요한 조건:
첨부 사진 속 인물의 얼굴, 눈·코·입의 형태, 피부색, 헤어스타일, 체형, 자세와 카메라 구도는 원본과 동일하게 유지해 주세요. 다른 사람처럼 보이게 만들지 마세요.

변경할 부분:
사진 전체를 1990년대 일본 여행 중 일회용 35mm 필름 카메라로 촬영한 자연스러운 스냅사진 분위기로 변경해 주세요.

색감과 조명:
- 전체 채도를 약간 낮추고 따뜻한 크림색과 옅은 초록색 중심
- 밝은 영역에 은은한 노란빛, 검은 영역의 세부 묘사는 유지
- 늦은 오후의 부드러운 자연광
- 화면 한쪽에 매우 약한 주황색 빛 번짐
- 피부색은 원본과 최대한 동일하게 유지

필름 질감:
- 미세하고 자연스러운 필름 입자
- 가장자리의 아주 약한 흐림과 미세한 색 번짐
- 지나치게 깨끗하거나 AI로 만든 것처럼 매끄럽지 않게
- 큰 스크래치와 과도한 노이즈는 제외

결과:
세로 4:5 비율의 인스타그램 게시물. 인물의 머리와 몸이 잘리지 않도록 여백을 유지하세요.

금지:
얼굴 재생성, 눈 크기·얼굴형 변경, 플라스틱 같은 피부 보정, 주요 배경 삭제, 일본어·날짜·워터마크·가짜 로고 추가, 애니메이션 스타일 변경을 하지 마세요.`,
      fix:`원본과 결과를 비교해 인물의 정체성이 달라진 부분을 수정해 주세요. 얼굴형, 눈·코·입, 피부색, 헤어라인과 표정은 원본으로 복원하고 필름 색감과 입자만 유지하세요. 얼굴에는 추가 보정을 적용하지 마세요.`
    },
    {
      id:'figure', category:'character', icon:'🧸', badge:'공유 인기', title:'내 얼굴로 3D 피규어 만들기', description:'내 특징과 직업 소품을 살린 소장용 피규어 패키지를 만들어요.', time:'약 4분', tools:['ChatGPT Images','Gemini'], needs:'정면 얼굴과 옷이 잘 보이는 사진 1장, 넣고 싶은 소품 3개', caution:'실제 브랜드 로고와 캐릭터를 그대로 복제하지 말고, 포장에는 전화번호나 회사 기밀을 넣지 마세요.',
      steps:['사진과 함께 직업·취미·소품 세 가지를 정하세요.','대괄호 내용을 바꾼 뒤 프롬프트를 입력하세요.','얼굴이 다르거나 손가락이 이상하면 수정 프롬프트로 해당 부분만 고치세요.'],
      prompt:`첨부 사진 속 인물을 프리미엄 3D 수집용 피규어로 변환해 주세요.

인물 보존:
얼굴형, 눈·코·입, 피부색, 헤어스타일과 대표적인 표정은 원본 인물을 알아볼 수 있도록 유지하세요. 성별·나이·체형을 임의로 바꾸지 마세요.

피규어 디자인:
- 머리와 몸 비율은 1:3의 세련된 디자이너 토이
- 무광 소프트 비닐 재질, 섬세한 도색, 자연스러운 관절선
- 의상: [원하는 의상]
- 손에는 [대표 소품]
- 옆 칸 액세서리 3개: [소품1], [소품2], [소품3]
- 안정적으로 서 있는 전신 자세, 손가락과 소품은 정확하게 표현

패키지:
- 투명 창이 있는 깔끔한 수집용 박스
- 박스 제목은 정확히 “[표시할 이름]”
- 하단 작은 문구는 정확히 “[한 줄 설명]”
- 실제 회사 로고·상표·기존 캐릭터는 사용하지 않기

촬영:
정면 제품 사진, 밝은 중성 회색 스튜디오 배경, 부드러운 좌우 조명, 바닥의 약한 그림자, 선명한 패키지와 피규어, 정사각형 1:1.

금지:
얼굴 왜곡, 여분의 손가락, 액세서리 중복, 읽을 수 없는 추가 글자, 가짜 인증 마크, 워터마크를 넣지 마세요.`,
      fix:`피규어의 얼굴을 첨부 원본과 다시 맞춰 주세요. 얼굴형·눈·코·입·헤어스타일은 원본을 기준으로 복원하고, 손가락은 양손 각각 자연스러운 5개로 수정하세요. 지정한 액세서리 3개만 남기고 중복 소품과 불필요한 글자는 제거하세요.`
    },
    {
      id:'childhood-self', category:'character', icon:'🕰️', badge:'감성 인기', title:'어린 시절의 나와 현재의 나', description:'두 시기의 얼굴을 유지해 한 장면에서 만나는 감성 사진을 만들어요.', time:'약 5분', tools:['ChatGPT Images','Gemini'], needs:'어린 시절 사진 1장과 현재 사진 1장', caution:'아동 사진은 공개 범위를 신중히 정하고 이름·학교·주소가 보이는 배경은 제거하세요.',
      steps:['어린 시절 사진을 1번, 현재 사진을 2번으로 함께 업로드하세요.','두 인물의 위치와 장면을 대괄호에서 선택하세요.','얼굴이 섞이면 수정 프롬프트로 두 사람을 각각 원본에 다시 맞추세요.'],
      prompt:`첨부 이미지 1의 어린 시절 인물과 이미지 2의 현재 인물을 같은 장면에 자연스럽게 배치한 사실적인 사진을 만들어 주세요.

정체성 유지:
- 왼쪽 어린이는 이미지 1의 얼굴형, 눈·코·입, 헤어스타일, 당시 나이와 체형 유지
- 오른쪽 성인은 이미지 2의 얼굴형, 눈·코·입, 헤어스타일, 현재 나이와 체형 유지
- 두 얼굴을 섞거나 서로 닮게 새로 만들지 않기

장면:
햇빛이 부드럽게 들어오는 조용한 도서관의 나무 테이블. 어린 시절의 나는 왼쪽, 현재의 나는 오른쪽에 앉아 서로를 바라보며 편안하게 미소 짓습니다. 테이블 위에는 어린이용 그림책 한 권과 성인용 노트 한 권만 둡니다.

사진 표현:
- 다큐멘터리 사진처럼 절제되고 자연스러운 감정
- 같은 공간에서 촬영한 것처럼 조명 방향·그림자·피부색을 일치
- 50mm 렌즈, 눈높이, 허리 위가 보이는 중간 구도
- 따뜻한 자연광, 약한 필름 입자, 과도한 보정 없음
- 가로 3:2 비율, 고해상도

금지:
얼굴 합성 흔적, 나이 변경, 과장된 눈물, 손가락 오류, 추가 인물, 텍스트, 날짜, 워터마크를 넣지 마세요.`,
      fix:`두 인물의 얼굴이 섞였습니다. 왼쪽 어린이는 이미지 1만, 오른쪽 성인은 이미지 2만 기준으로 얼굴형·눈·코·입·나이를 각각 복원하세요. 배경·자세·조명은 그대로 두고 얼굴 정체성만 수정하세요.`
    },
    {
      id:'kakao-profile', category:'profile', icon:'💬', badge:'실용 인기', title:'자연스러운 카톡 프로필 사진', description:'원형 크롭에서도 얼굴과 분위기가 잘 보이는 1:1 프로필을 만들어요.', time:'약 3분', tools:['ChatGPT Images','Gemini','Adobe Firefly'], needs:'얼굴이 선명하고 해상도가 충분한 사진 1장', caution:'타인의 사진을 허락 없이 사용하지 말고, 회사 출입증·차량번호·집 위치는 보이지 않게 하세요.',
      steps:['프로필로 쓸 사진을 업로드하세요.','배경 색상과 옷은 대괄호에서 원하는 내용으로 바꾸세요.','결과를 내려받아 카카오톡 원형 미리보기에서 얼굴이 잘리지 않는지 확인하세요.'],
      prompt:`첨부 사진을 카카오톡 프로필에 적합한 자연스러운 정사각형 인물 사진으로 편집해 주세요.

반드시 유지:
얼굴형, 눈·코·입, 피부색, 헤어라인, 나이, 표정과 개인의 특징을 원본 그대로 유지하세요. 얼굴을 새로 생성하거나 과도하게 미화하지 마세요.

구도:
- 1:1 정사각형
- 머리 위부터 가슴 윗부분까지 보이는 단정한 구도
- 얼굴은 화면 중앙보다 아주 약간 위
- 카카오톡에서 원형으로 잘려도 머리·턱·어깨가 잘리지 않도록 핵심 요소를 중앙 70% 안에 배치
- 가장자리에는 충분한 빈 공간

배경과 조명:
- 배경: [따뜻한 크림색 / 연한 회색 / 흐린 야외]
- 창가에서 들어오는 부드러운 자연광
- 얼굴 양쪽 밝기 차이가 크지 않게
- 피부의 모공과 질감은 자연스럽게 유지
- 눈 밑과 잡티는 아주 약하게만 정리

의상:
원본 의상을 유지하거나 [원하는 단정한 의상]으로 변경하되 목과 어깨의 형태는 자연스럽게 연결하세요.

금지:
얼굴형 축소, 눈 확대, 코·턱 성형, 지나친 피부 보정, 치아 변경, 배경 속 글자·로고·타인 추가, 워터마크를 하지 마세요.`,
      fix:`카카오톡 원형 크롭 안전 영역에 맞게 구도만 수정해 주세요. 얼굴과 어깨 크기를 10% 줄여 중앙에 배치하고 사방 여백을 늘리세요. 얼굴·표정·피부색·의상·배경 스타일은 현재 결과 그대로 유지하세요.`
    },
    {
      id:'movie-poster', category:'creative', icon:'🎬', badge:'콘텐츠 인기', title:'내 사진으로 영화 포스터', description:'내 얼굴을 유지해 분위기 있는 독립 영화 포스터를 만들어요.', time:'약 5분', tools:['ChatGPT Images','Gemini','Adobe Firefly'], needs:'상반신 또는 전신 사진 1장, 영화 제목과 장르', caution:'실제 영화·배우·제작사 로고를 모방하지 말고 직접 만든 제목과 문구만 사용하세요.',
      steps:['사진과 장르, 제목, 한 줄 문구를 준비하세요.','대괄호의 텍스트를 정확하게 입력하세요.','글자가 틀리면 이미지 전체를 다시 만들지 말고 텍스트 영역만 수정하세요.'],
      prompt:`첨부 사진 속 인물을 주인공으로 한 독창적인 영화 포스터를 만들어 주세요.

인물:
얼굴형, 눈·코·입, 피부색, 헤어스타일과 체형을 원본과 동일하게 유지하세요. 다른 배우처럼 바꾸지 마세요.

영화 설정:
- 장르: [로맨스 / 미스터리 / 성장 드라마 / SF]
- 배경: [원하는 장소와 시간대]
- 감정: [차분함 / 긴장감 / 희망 / 쓸쓸함]
- 인물은 화면 중앙에서 약간 벗어난 위치, 시선은 [카메라 / 화면 밖]
- 배경과 인물의 빛 방향을 일치

시각 표현:
극장용 독립 영화 포스터, 절제된 색 보정, 섬세한 필름 입자, 명암이 분명한 영화 조명, 인물과 배경 사이의 자연스러운 깊이, 세로 2:3 비율.

포스터 글자:
- 큰 제목은 정확히 “[영화 제목]”
- 작은 문구는 정확히 “[한 줄 문구]”
- 하단에는 추가 이름이나 가짜 제작진을 넣지 않기
- 글자가 정확하지 않으면 해당 글자 영역을 비워 두기

금지:
기존 영화 포스터 복제, 실제 제작사·스트리밍 로고, 평론가 가짜 인용, 가짜 수상 마크, 얼굴 변경, 여분의 인물, 워터마크를 넣지 마세요.`,
      fix:`이미지와 인물은 그대로 유지하고 포스터의 글자만 수정해 주세요. 큰 제목은 정확히 “[영화 제목]”, 작은 문구는 정확히 “[한 줄 문구]”로 표시하고 그 외 모든 글자·로고·수상 마크는 삭제하세요.`
    },
    {
      id:'product-photo', category:'business', icon:'🛍️', badge:'판매 실용', title:'쇼핑몰 제품 사진 만들기', description:'제품 형태와 라벨을 보존한 깔끔한 상세페이지 대표 사진을 만들어요.', time:'약 4분', tools:['Adobe Firefly','ChatGPT Images','Gemini'], needs:'정면 제품 사진 1장과 원하는 배경·판매 채널', caution:'제품의 실제 크기·색상·성분·효능을 왜곡하면 안 됩니다. 생성 결과는 실제 제품과 비교한 뒤 사용하세요.',
      steps:['제품 전체와 라벨이 선명하게 나온 사진을 업로드하세요.','배경과 쇼핑몰 비율을 선택해 프롬프트를 입력하세요.','라벨 글자나 제품 형태가 달라지면 수정 프롬프트로 제품만 복원하세요.'],
      prompt:`첨부한 실제 제품을 온라인 쇼핑몰의 대표 제품 사진으로 편집해 주세요.

제품 보존이 최우선:
제품의 모양, 비율, 크기, 재질, 색상, 뚜껑, 로고, 라벨 배치와 포장 구조를 원본과 동일하게 유지하세요. 라벨의 글자를 새로 만들거나 제품 기능을 추가하지 마세요.

촬영 구성:
- 제품 1개를 정면에서 촬영한 중앙 구도
- 배경: [순백색 / 따뜻한 베이지 / 브랜드 색상의 옅은 그라데이션]
- 카메라는 제품 높이와 같은 눈높이
- 85mm 제품 촬영 렌즈 느낌
- 좌우의 큰 소프트박스 조명
- 제품 아래에 약하고 자연스러운 접지 그림자
- 반사 재질은 형태가 보일 정도의 얇은 하이라이트만 표현
- 제품 주변에 판매와 무관한 소품을 추가하지 않기

출력:
- 쇼핑몰 대표 이미지용 1:1 정사각형
- 제품이 화면의 약 70%를 차지
- 사방에 동일한 여백
- 흰 배경 선택 시 완전한 #FFFFFF
- 선명한 가장자리와 실제와 가까운 색

금지:
제품 형태 변경, 라벨 재작성, 가짜 인증 마크, 과장된 크기, 내용물 추가, 새로운 효능 문구, 워터마크, 사람 손, 관련 없는 장식을 넣지 마세요.`,
      fix:`배경과 조명은 유지하고 제품만 첨부 원본과 다시 일치시켜 주세요. 용기 비율·뚜껑·색상·라벨 위치·로고 형태를 원본으로 복원하세요. 읽을 수 없는 라벨 글자를 새로 만들지 말고 원본 라벨 이미지를 그대로 보존하세요.`
    },

    {
        "id": "travel-color",
        "category": "photo",
        "icon": "🌿",
        "badge": "여행 인기",
        "title": "여행 사진 청량 색감 보정",
        "description": "하늘과 피부색은 자연스럽게 유지하면서 맑고 시원한 여행 사진으로 보정해요.",
        "time": "약 3분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "인물과 배경이 모두 선명한 여행 사진 1장",
        "caution": "실제 장소의 표지판·문화재·사람을 임의로 지우거나 바꿔 사실을 왜곡하지 마세요.",
        "steps": [
            "사진을 올리고 여행지와 원하는 계절감을 적으세요.",
            "프롬프트를 붙여 넣고 인물 보존 여부를 확인하세요.",
            "피부색이 달라지면 수정문으로 색감만 다시 조정하세요."
        ],
        "prompt": "첨부 여행 사진을 자연스럽고 청량한 여행 매거진 색감으로 보정해 주세요.\n\n유지할 것:\n인물의 얼굴·체형·자세·의상, 장소의 구조, 표지판과 물체 위치, 원래 촬영 구도는 바꾸지 마세요.\n\n보정:\n- 하늘은 실제 구름과 밝기를 유지한 맑은 파란색\n- 식물은 형광색이 아닌 자연스러운 초록색\n- 그림자 속 디테일을 약하게 복원하고 밝은 부분은 날아가지 않게\n- 피부색은 원본과 동일하게, 얼굴 보정은 하지 않기\n- 전체 대비는 약간만 높이고 공기감 있는 색상\n- [봄의 부드러움 / 여름의 청량함 / 가을의 따뜻함] 중 선택\n\n출력:\n원본 비율과 해상도 유지. 관광 안내판의 글자와 실제 지형을 보존하세요.\n\n금지:\n가짜 구름·건물·행인 추가, 얼굴 변경, 과도한 HDR, 형광색, 날짜·로고·워터마크 추가를 하지 마세요.",
        "fix": "사람과 장소는 현재 결과 그대로 유지하고 색상만 다시 조정하세요. 피부색을 원본으로 복원하고 하늘과 식물의 채도를 15% 낮춰 자연스러운 여행 사진으로 수정하세요."
    },
    {
        "id": "food-photo",
        "category": "photo",
        "icon": "🍽️",
        "badge": "SNS 인기",
        "title": "음식 사진 맛있게 보정",
        "description": "음식의 실제 모양은 유지하고 조명과 색감만 정돈해 먹음직스럽게 보여줘요.",
        "time": "약 3분",
        "tools": [
            "ChatGPT Images",
            "Adobe Firefly",
            "Gemini"
        ],
        "needs": "음식 전체가 보이는 원본 사진 1장",
        "caution": "양·재료·토핑을 실제와 다르게 추가하면 메뉴 광고에 사용하지 마세요.",
        "steps": [
            "음식 사진을 업로드하세요.",
            "사용 채널과 원하는 배경 분위기를 선택하세요.",
            "재료가 바뀌었다면 수정문으로 원본 음식만 복원하세요."
        ],
        "prompt": "첨부 음식 사진을 실제 메뉴와 동일한 상태로 유지하면서 전문 푸드 사진처럼 보정해 주세요.\n\n절대 변경하지 말 것:\n음식의 양, 재료, 토핑 개수, 접시 모양, 식기의 위치와 테이블 구도.\n\n조명과 색:\n- 창가에서 들어오는 부드러운 측면광\n- 음식의 질감이 보이는 작은 하이라이트\n- 흰색 접시는 중성 흰색, 채소와 고기는 실제에 가까운 색\n- 노출은 약간 밝게, 그림자는 부드럽게\n- 배경은 현재 모습을 유지하되 시선을 방해하는 작은 얼룩만 정리\n\n출력:\n[인스타그램 4:5 / 배달앱 1:1 / 블로그 3:2], 음식이 잘리지 않게 여백 유지.\n\n금지:\n새 토핑·김·증기·소스 추가, 음식 크기 확대, 접시 교체, 가짜 메뉴 글자, 과도한 채도와 플라스틱 질감을 넣지 마세요.",
        "fix": "조명과 배경은 유지하고 음식의 형태·양·재료·토핑을 첨부 원본과 정확히 일치시켜 주세요. 새로 생긴 재료와 과장된 윤기를 제거하세요."
    },
    {
        "id": "photo-restore",
        "category": "photo",
        "icon": "🖼️",
        "badge": "추억 복원",
        "title": "오래된 가족사진 자연 복원",
        "description": "얼굴과 시대적 특징을 바꾸지 않고 훼손·먼지·색바램만 복원해요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Adobe Firefly",
            "Gemini"
        ],
        "needs": "가능한 한 높은 해상도로 촬영하거나 스캔한 사진",
        "caution": "복원은 실제 모습을 추정할 수 있으므로 원본을 따로 보관하고 결과를 역사 기록으로 단정하지 마세요.",
        "steps": [
            "사진을 평평하게 스캔해 올리세요.",
            "복원 범위와 흑백·컬러 유지 여부를 정하세요.",
            "얼굴이 달라지면 수정문으로 훼손 부분만 최소 수정하세요."
        ],
        "prompt": "첨부한 오래된 사진을 보존 복원 방식으로 정리해 주세요.\n\n최우선:\n모든 인물의 얼굴형·표정·나이·헤어스타일·의상, 배경과 촬영 시대의 특징을 그대로 유지하세요. 보이지 않는 얼굴 부분을 상상해서 새로 만들지 마세요.\n\n복원 범위:\n- 먼지, 작은 긁힘, 접힌 자국과 얼룩만 제거\n- 흐릿한 윤곽은 원본에 존재하는 정보 범위에서만 선명하게\n- 과도한 피부 보정 없이 종이 사진의 자연스러운 질감 유지\n- [흑백 유지 / 원래 색상만 복원] 중 선택\n- 잘린 가장자리를 임의로 확장하지 않기\n\n출력:\n원본 비율, 인쇄 가능한 고해상도. 원본의 입자와 명암을 자연스럽게 유지하세요.\n\n금지:\n인물 미화, 젊게 만들기, 현대 의상·배경 추가, 얼굴 재생성, 임의 컬러화, 글자·워터마크 추가를 하지 마세요.",
        "fix": "복원 전 원본과 얼굴을 다시 비교하세요. 인물의 눈·코·입·표정·나이를 원본으로 되돌리고 긁힘과 먼지 제거만 유지하세요."
    },
    {
        "id": "resume-headshot",
        "category": "profile",
        "icon": "👔",
        "badge": "취업 실용",
        "title": "이력서용 자연스러운 프로필",
        "description": "과한 미화 없이 단정하고 신뢰감 있는 취업 프로필 사진을 만들어요.",
        "time": "약 4분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "정면 얼굴과 어깨가 선명한 사진 1장",
        "caution": "공식 신분증 사진으로 사용하지 말고 채용 과정에서 외모를 오해하게 할 정도로 수정하지 마세요.",
        "steps": [
            "밝고 정면에 가까운 사진을 업로드하세요.",
            "직무와 원하는 의상 색을 입력하세요.",
            "얼굴이 바뀌면 수정문으로 원본 특징을 복원하세요."
        ],
        "prompt": "첨부 사진을 이력서와 회사 소개에 사용할 자연스러운 프로필 사진으로 편집해 주세요.\n\n인물 보존:\n얼굴형, 눈·코·입, 피부색, 헤어라인, 나이와 체형은 원본과 동일하게 유지하세요. 성형 효과나 과도한 미화를 하지 마세요.\n\n촬영:\n- 머리 위부터 가슴 윗부분까지 보이는 세로 4:5\n- 정면에 가까운 시선, 자연스럽고 작은 미소\n- 배경은 밝은 중성 회색 단색\n- 큰 창문 같은 부드러운 정면광과 약한 보조광\n- 피부 질감은 유지하고 일시적인 작은 잡티만 약하게 정리\n- 의상은 [네이비 재킷 / 흰 셔츠 / 단정한 니트], 로고 없음\n\n금지:\n얼굴 축소, 눈 확대, 코·턱 변경, 치아 재생성, 헤어스타일 대폭 변경, 과도한 배경 흐림, 회사 로고·글자·워터마크를 넣지 마세요.",
        "fix": "의상과 배경은 유지하고 얼굴을 첨부 원본과 다시 일치시켜 주세요. 눈·코·입·얼굴형·피부색·나이는 원본으로 복원하고 피부 보정을 절반으로 줄이세요."
    },
    {
        "id": "studio-profile",
        "category": "profile",
        "icon": "✨",
        "badge": "브랜딩 인기",
        "title": "전문가 SNS 프로필",
        "description": "강사·프리랜서·창작자를 위한 깔끔한 개인 브랜딩 사진을 만들어요.",
        "time": "약 4분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "얼굴과 상반신이 선명한 사진, 직업과 대표 색상",
        "caution": "실제 자격·회사·수상 경력을 암시하는 소품이나 로고를 허위로 넣지 마세요.",
        "steps": [
            "사진과 직업, 브랜드 색을 준비하세요.",
            "대괄호를 바꿔 프롬프트를 입력하세요.",
            "원형 프로필 미리보기에서 잘림을 확인하세요."
        ],
        "prompt": "첨부 인물을 [강사 / 디자이너 / 개발자 / 작가]의 전문적인 SNS 프로필 사진으로 편집해 주세요.\n\n유지:\n얼굴·피부색·헤어스타일·나이·체형·표정의 개인 특징은 원본 그대로 유지하세요.\n\n연출:\n- 1:1 정사각형, 원형 크롭 안전 영역 중앙 70% 안에 얼굴과 어깨 배치\n- 단순한 [브랜드 색상]의 아주 옅은 그라데이션 배경\n- 카메라 높이는 눈높이, 85mm 인물 사진 느낌\n- 부드러운 정면광, 한쪽 가장자리에 약한 윤곽광\n- 의상은 직업에 맞는 단정한 무지 옷\n- 신뢰감 있고 편안한 표정, 과장된 포즈 없음\n\n금지:\n가짜 사무실·자격증·회사 로고·텍스트 추가, 얼굴 미화, 치아·눈·턱 변경, 과도한 피부 보정, 워터마크를 넣지 마세요.",
        "fix": "배경·조명·의상은 유지하고 얼굴과 헤어라인을 원본으로 복원하세요. 얼굴 크기를 8% 줄여 원형 크롭에서 머리와 어깨가 잘리지 않게 여백을 늘리세요."
    },
    {
        "id": "sticker-pack",
        "category": "character",
        "icon": "😊",
        "badge": "메신저 인기",
        "title": "내 표정 스티커 6종",
        "description": "한 사람의 특징을 일관되게 유지한 메신저용 감정 스티커 세트를 만들어요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Gemini"
        ],
        "needs": "얼굴과 헤어스타일이 선명한 사진, 원하는 표정 6개",
        "caution": "타인의 얼굴·유명 캐릭터·브랜드 로고를 허가 없이 사용하지 마세요.",
        "steps": [
            "사진과 표정 6개를 준비하세요.",
            "스타일과 짧은 문구를 입력하세요.",
            "얼굴과 의상이 제각각이면 수정문으로 통일하세요."
        ],
        "prompt": "첨부 인물을 바탕으로 동일한 캐릭터의 메신저 스티커 6개를 한 장에 만들어 주세요.\n\n캐릭터 일관성:\n얼굴형, 헤어스타일, 안경·점 같은 특징과 의상 색을 모든 칸에서 동일하게 유지하세요. 특정 기존 캐릭터 스타일을 복제하지 마세요.\n\n구성:\n2열×3행의 균일한 격자, 각 칸에 한 캐릭터만 배치.\n1. 기쁨 “[좋아!]”\n2. 감사 “[고마워]”\n3. 응원 “[할 수 있어]”\n4. 당황 “[잠깐만]”\n5. 피곤 “[퇴근…]”\n6. 축하 “[축하해!]”\n\n표현:\n깨끗한 독창적 2D 벡터 느낌, 두꺼운 외곽선, 단순한 색, 투명 배경, 표정과 손동작이 명확하게. 문구는 지정한 한글만 정확히 표시하세요.\n\n금지:\n추가 글자, 캐릭터 중복, 손가락 오류, 칸 밖 잘림, 워터마크와 기존 캐릭터 모방을 하지 마세요.",
        "fix": "여섯 칸의 캐릭터 얼굴·헤어스타일·의상 색을 첫 번째 칸과 동일하게 통일하세요. 지정한 한글 문구 외의 글자는 모두 제거하고 격자 밖 잘린 요소를 안쪽으로 이동하세요."
    },
    {
        "id": "pet-story",
        "category": "character",
        "icon": "🐾",
        "badge": "반려동물 인기",
        "title": "반려동물 동화책 장면",
        "description": "반려동물의 실제 무늬와 특징을 살려 따뜻한 동화책 한 장면을 만들어요.",
        "time": "약 4분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "반려동물의 얼굴과 몸 무늬가 잘 보이는 사진",
        "caution": "목걸이에 적힌 전화번호나 주소가 보이지 않도록 가린 뒤 업로드하세요.",
        "steps": [
            "반려동물 사진과 장면을 준비하세요.",
            "특징을 대괄호에 구체적으로 적으세요.",
            "무늬가 달라지면 수정문으로 원본에 맞추세요."
        ],
        "prompt": "첨부한 반려동물을 주인공으로 한 독창적인 어린이 동화책 장면을 만들어 주세요.\n\n동물 보존:\n종, 얼굴형, 귀 모양, 눈 색, 털 색과 고유한 무늬, 꼬리 길이와 체형을 원본과 동일하게 유지하세요.\n\n장면:\n[작은 숲의 우체국 / 비 오는 날 창가 / 별빛 아래 캠핑]에서 반려동물이 [편지를 배달 / 창밖을 구경 / 작은 등불을 바라봄] 하는 순간.\n따뜻한 손그림 수채화와 색연필 질감, 부드러운 형태, 차분한 색, 어린이 책에 맞는 편안한 분위기. 가로 4:3, 가장자리 여백 충분히.\n\n금지:\n기존 동화 캐릭터 모방, 사람처럼 과도한 신체 변형, 무늬 변경, 여분의 다리·꼬리, 목걸이 전화번호, 글자·로고·워터마크를 넣지 마세요.",
        "fix": "배경과 그림 스타일은 유지하고 반려동물의 얼굴·귀·눈 색·털 무늬·꼬리를 첨부 원본과 일치시켜 주세요. 여분의 다리와 장식은 제거하세요."
    },
    {
        "id": "youtube-thumbnail",
        "category": "creative",
        "icon": "▶️",
        "badge": "크리에이터 인기",
        "title": "유튜브 썸네일 시안",
        "description": "작은 화면에서도 주제와 인물이 또렷한 유튜브 썸네일을 만들어요.",
        "time": "약 4분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "인물 또는 제품 사진, 영상 주제, 핵심 문구 5~8자",
        "caution": "실제 내용과 다른 표정·성과·가격을 과장하거나 타 채널 디자인을 복제하지 마세요.",
        "steps": [
            "영상 주제와 사진, 짧은 문구를 준비하세요.",
            "레이아웃을 선택해 생성하세요.",
            "글자가 틀리면 배경은 유지하고 글자만 수정하세요."
        ],
        "prompt": "첨부 사진을 활용해 유튜브 영상 “[영상 주제]”의 독창적인 썸네일을 제작해 주세요.\n\n레이아웃:\n- 16:9, 1280×720 비율\n- 인물 또는 제품은 오른쪽 45%, 핵심 문구는 왼쪽\n- 모바일에서도 구분되는 단순한 배경과 강한 명암\n- 얼굴·제품 형태와 실제 색상은 원본 그대로 유지\n- 시선이 핵심 문구 방향으로 이어지게 배치\n\n텍스트:\n큰 문구는 정확히 “[5~8자의 핵심 문구]” 한 줄만. 굵고 읽기 쉬운 한글, 배경과 충분한 대비. 추가 글자와 숫자는 넣지 마세요.\n\n금지:\n과장된 충격 표정, 빨간 화살표 남용, 거짓 수치, 타 채널 로고·디자인 복제, 얼굴 변경, 워터마크를 넣지 마세요.",
        "fix": "인물과 배경은 유지하고 글자 영역만 수정하세요. 문구를 정확히 “[핵심 문구]”로 표시하고 다른 글자는 삭제하세요. 모바일 미리보기에서도 읽히도록 글자 크기와 대비를 높이세요."
    },
    {
        "id": "shorts-storyboard",
        "category": "creative",
        "icon": "📱",
        "badge": "숏폼 실용",
        "title": "15초 쇼츠 스토리보드",
        "description": "제품이나 서비스를 5개 장면으로 나눈 세로 영상 제작 시안을 만들어요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Runway"
        ],
        "needs": "제품 사진, 대상 고객, 핵심 장점 한 가지",
        "caution": "실제 제품에 없는 기능이나 전후 효과를 만들지 마세요.",
        "steps": [
            "제품 사진과 핵심 장점을 정하세요.",
            "5장면 보드를 생성해 제품 일관성을 확인하세요.",
            "각 장면을 영상 AI에 따로 입력해 제작하세요."
        ],
        "prompt": "첨부 제품을 홍보하는 15초 세로 쇼츠의 5장면 스토리보드를 한 장으로 만들어 주세요.\n\n제품 보존:\n모양, 색상, 크기 비율, 포장과 라벨 위치를 모든 장면에서 동일하게 유지하세요.\n\n장면:\n1. 0~2초: [고객 문제]가 보이는 상황\n2. 2~5초: 제품이 자연스럽게 등장\n3. 5~9초: [핵심 장점]을 실제 사용 장면으로 설명\n4. 9~12초: 사용 후 편리해진 상황\n5. 12~15초: 제품과 단순한 마무리 화면\n\n형식:\n9:16 세로 프레임 5개를 왼쪽에서 오른쪽으로 배열. 카메라 구도·행동·조명 메모를 각 칸 아래 짧게 표시. 인물과 제품이 장면마다 일관되게.\n\n금지:\n허위 전후 비교, 실제에 없는 기능, 라벨 변형, 과도한 효과, 경쟁사 로고, 워터마크를 넣지 마세요.",
        "fix": "다섯 장면의 제품 모양·색상·라벨·크기를 첫 장면 기준으로 통일하세요. 핵심 장점과 무관한 효과와 읽을 수 없는 글자는 제거하고 9:16 구도를 유지하세요."
    },
    {
        "id": "room-makeover",
        "category": "creative",
        "icon": "🛋️",
        "badge": "인테리어 인기",
        "title": "내 방 인테리어 시안",
        "description": "방 구조는 그대로 유지하며 가구와 색상만 바꾼 현실적인 인테리어 시안을 만들어요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "방 전체가 보이는 사진, 유지할 가구와 예산 범위",
        "caution": "공사 가능 여부와 실제 치수는 전문가에게 확인하고 생성 이미지를 설계도로 사용하지 마세요.",
        "steps": [
            "방 사진과 유지할 요소를 적으세요.",
            "스타일·색상·예산을 선택하세요.",
            "창문이나 문 위치가 바뀌면 수정문으로 구조를 복원하세요."
        ],
        "prompt": "첨부한 방 사진의 구조를 유지한 현실적인 인테리어 변경 시안을 만들어 주세요.\n\n절대 유지:\n벽·천장·바닥의 경계, 창문·문·콘센트 위치, 방 크기와 카메라 시점. [유지할 가구]도 그대로 두세요.\n\n변경:\n스타일은 [따뜻한 미니멀 / 내추럴 우드 / 차분한 모던].\n벽 색은 [색상], 커튼과 침구는 같은 계열의 낮은 채도.\n추가 가구는 실제 통로를 막지 않는 작은 수납장과 조명만.\n기존 자연광 방향과 그림자를 맞추고 실제 재료 질감으로 표현하세요.\n\n출력:\n원본과 동일한 비율·시점, 현실적으로 구매 가능한 가구 크기.\n\n금지:\n창문·문 이동, 방 크기 확장, 구조 변경, 가구 겹침, 비현실적 조명, 사람·글자·워터마크 추가를 하지 마세요.",
        "fix": "스타일과 색상은 유지하고 방의 벽·창문·문·바닥 경계와 카메라 시점을 원본으로 복원하세요. 통로를 막거나 겹친 가구는 제거하세요."
    },
    {
        "id": "product-lifestyle",
        "category": "business",
        "icon": "☕",
        "badge": "광고 실용",
        "title": "제품 라이프스타일 광고",
        "description": "제품 자체는 그대로 두고 실제 사용 장면에 자연스럽게 배치해요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Adobe Firefly",
            "Gemini"
        ],
        "needs": "제품 누끼 또는 정면 사진, 사용 장소와 고객",
        "caution": "제품의 실제 기능·크기·효능과 다른 장면을 광고에 사용하지 마세요.",
        "steps": [
            "제품 사진과 사용 상황을 준비하세요.",
            "고객·장소·시간대를 대괄호에 입력하세요.",
            "제품 변형이 있으면 수정문으로 원본을 복원하세요."
        ],
        "prompt": "첨부 제품을 실제 생활 속 사용 장면에 자연스럽게 배치한 광고 이미지를 만들어 주세요.\n\n제품 불변 조건:\n모양, 비율, 재질, 실제 색상, 로고와 라벨 위치를 원본과 동일하게 유지하세요. 제품 크기는 주변 물체와 현실적인 비율로 표현하세요.\n\n장면:\n[아침의 밝은 주방 / 정돈된 업무 책상 / 햇빛 드는 욕실]에서 [대상 고객]이 제품을 사용하는 순간.\n제품은 화면의 중심이지만 과도하게 크지 않게.\n50mm 광고 사진, 부드러운 자연광, 실제 접지 그림자와 반사, 깔끔하지만 생활감 있는 배경.\n출력은 [인스타 4:5 / 배너 16:9].\n\n금지:\n제품 기능 과장, 라벨 재작성, 제품 형태 변경, 가짜 후기·인증·가격, 경쟁사 로고, 여분의 손가락과 워터마크를 넣지 마세요.",
        "fix": "장면과 조명은 유지하고 제품의 형태·색상·라벨·크기 비율을 첨부 원본으로 복원하세요. 제품과 손이 닿는 부분의 겹침과 그림자를 자연스럽게 수정하세요."
    },
    {
        "id": "flatlay",
        "category": "business",
        "icon": "📦",
        "badge": "쇼핑몰 인기",
        "title": "브랜드 플랫레이 촬영",
        "description": "여러 제품을 일정한 조명과 간격으로 정리한 쇼핑몰용 상단 촬영 이미지를 만들어요.",
        "time": "약 4분",
        "tools": [
            "Adobe Firefly",
            "ChatGPT Images",
            "Gemini"
        ],
        "needs": "각 제품의 정면 사진, 브랜드 색상, 사용할 소품",
        "caution": "실제 구성품과 다른 제품이나 사은품을 추가하지 마세요.",
        "steps": [
            "제품 사진을 모두 업로드하고 번호를 붙이세요.",
            "배치와 배경색을 선택하세요.",
            "누락·중복 제품이 있으면 수정문으로 개수만 바로잡으세요."
        ],
        "prompt": "첨부한 제품 [1, 2, 3]을 모두 사용해 정돈된 플랫레이 제품 사진을 만들어 주세요.\n\n제품 보존:\n각 제품의 모양·색상·라벨·크기 비율을 원본과 동일하게 유지하고 제품을 누락하거나 복제하지 마세요.\n\n구성:\n- 카메라는 정확한 수직 상단 시점\n- 배경은 [밝은 베이지 / 순백색 / 옅은 브랜드 색]\n- 제품 사이 간격은 일정하고 가장자리에 충분한 여백\n- 소품은 [작은 잎 / 천 조각 / 무소품] 중 하나만, 제품을 가리지 않게\n- 크고 부드러운 확산광, 한 방향의 약한 그림자\n- 1:1 정사각형, 상세페이지 대표 이미지\n\n금지:\n추가 제품·사은품 생성, 라벨 변경, 제품 겹침, 과도한 장식, 가짜 로고·글자·워터마크를 넣지 마세요.",
        "fix": "배경과 조명은 유지하고 첨부한 제품의 개수·모양·색상·라벨을 다시 확인하세요. 누락된 제품은 원본 그대로 복원하고 중복 제품과 불필요한 소품은 제거하세요."
    },
    {
        "id": "cafe-menu",
        "category": "business",
        "icon": "🧾",
        "badge": "소상공인 실용",
        "title": "카페 신메뉴 홍보 포스터",
        "description": "메뉴 사진과 가격을 명확하게 보여주는 매장·SNS용 포스터를 만들어요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "메뉴 사진, 정확한 메뉴명·가격·판매 기간",
        "caution": "알레르기·원산지·효능 정보를 임의로 만들지 말고 가격과 기간을 반드시 검수하세요.",
        "steps": [
            "사진과 확정된 문구를 준비하세요.",
            "글자 수를 줄여 프롬프트를 입력하세요.",
            "출력 후 메뉴명·가격·기간을 한 글자씩 확인하세요."
        ],
        "prompt": "첨부 메뉴 사진을 사용해 카페 신메뉴 홍보 포스터를 만들어 주세요.\n\n사진:\n메뉴의 실제 색·크기·용기·토핑을 원본과 동일하게 유지하세요. 배경은 [크림색 / 짙은 초록 / 연한 분홍]의 단순한 색면, 메뉴 주변 여백을 충분히 둡니다.\n\n레이아웃:\n세로 4:5. 상단 제목, 중앙 메뉴 사진, 하단 메뉴명·가격·기간의 명확한 3단 구조.\n\n표시할 글자:\n- 제목: “[신메뉴 출시]”\n- 메뉴명: “[정확한 메뉴명]”\n- 가격: “[정확한 가격]”\n- 기간: “[판매 기간]”\n위 네 문구만 정확히 표시하고 다른 글자는 넣지 마세요. 읽기 쉬운 한글과 높은 대비를 사용하세요.\n\n금지:\n재료·토핑 추가, 가짜 할인율·효능·후기, 로고 임의 생성, 메뉴 형태 변경, 작은 장식 글자와 워터마크를 넣지 마세요.",
        "fix": "메뉴 사진과 레이아웃은 유지하고 글자만 수정하세요. 제목·메뉴명·가격·기간을 입력한 문구와 한 글자씩 정확히 맞추고 그 외 모든 글자를 삭제하세요."
    },
    {
        "id": "instagram-card",
        "category": "creative",
        "icon": "📚",
        "badge": "콘텐츠 실용",
        "title": "인스타 카드뉴스 표지",
        "description": "긴 문장을 줄이고 핵심 주제가 바로 읽히는 카드뉴스 표지를 만들어요.",
        "time": "약 4분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "주제, 핵심 제목 12자 이내, 브랜드 색상",
        "caution": "통계·의학·금융 정보는 출처 없이 표지에 단정적으로 표시하지 마세요.",
        "steps": [
            "제목을 12자 이내로 줄이세요.",
            "브랜드 색과 상징 이미지를 선택하세요.",
            "글자가 틀리면 수정문으로 텍스트만 다시 생성하세요."
        ],
        "prompt": "인스타그램 카드뉴스의 첫 장 표지를 제작해 주세요.\n\n주제: [카드뉴스 주제]\n표시할 제목: “[12자 이내 핵심 제목]”\n\n디자인:\n- 4:5 세로 비율\n- 제목이 화면 중심에서 가장 먼저 읽히는 구조\n- [브랜드 색상]을 주색으로, 보조색은 한 가지\n- 주제를 설명하는 단순한 독창적 아이콘 또는 기하학 도형 1개\n- 모바일에서 읽기 쉬운 굵은 한글, 충분한 글자 간격과 대비\n- 가장자리 10%는 안전 여백\n- 작은 본문과 장식은 최소화\n\n텍스트:\n지정한 제목만 정확히 표시하고 임의의 영문·숫자·로고는 넣지 마세요.\n\n금지:\n복잡한 배경, 읽기 어려운 작은 글자, 타 브랜드 디자인 복제, 출처 없는 통계, 워터마크를 넣지 마세요.",
        "fix": "색상과 도형은 유지하고 표지 제목을 정확히 “[핵심 제목]”으로 수정하세요. 다른 글자는 모두 제거하고 제목을 중앙 안전 영역 안에서 더 크게 표시하세요."
    },
    {
        "id": "virtual-outfit",
        "category": "profile",
        "icon": "👗",
        "badge": "스타일 실용",
        "title": "옷 색상·스타일 미리보기",
        "description": "얼굴과 체형은 유지하고 지정한 의상만 바꿔 코디를 미리 확인해요.",
        "time": "약 5분",
        "tools": [
            "ChatGPT Images",
            "Gemini",
            "Adobe Firefly"
        ],
        "needs": "전신 또는 상반신 사진, 참고할 의상 사진이나 설명",
        "caution": "생성 결과는 실제 핏·원단·색상과 다를 수 있으므로 구매 판단의 참고용으로만 사용하세요.",
        "steps": [
            "내 사진과 의상 참고 이미지를 함께 올리세요.",
            "바꿀 의상과 유지할 부분을 정확히 적으세요.",
            "체형이 바뀌면 수정문으로 원본 비율을 복원하세요."
        ],
        "prompt": "이미지 1의 인물에게 이미지 2의 의상만 자연스럽게 적용해 주세요.\n\n반드시 유지:\n이미지 1 인물의 얼굴, 헤어스타일, 피부색, 키·체형·팔과 다리 비율, 자세, 배경, 카메라 구도와 조명.\n\n변경할 부분:\n현재 의상만 이미지 2의 상의·하의로 교체하세요. 원단의 질감, 색, 칼라·소매·단추·주름 구조를 참고 이미지에 맞추고 몸의 자세와 중력에 맞게 자연스럽게 표현하세요. 신발과 액세서리는 [유지 / 제거].\n\n출력:\n원본 비율과 해상도, 실제 착용 사진처럼 자연스러운 옷 경계와 그림자.\n\n금지:\n체형 보정, 허리·다리 길이 변경, 얼굴 변경, 피부 노출 증가, 새 액세서리·로고·글자·워터마크 추가를 하지 마세요.",
        "fix": "의상 디자인은 유지하고 인물의 얼굴·체형·자세·손·배경을 이미지 1로 복원하세요. 옷과 목·손목·허리 경계의 겹침과 그림자만 자연스럽게 수정하세요."
    }

  ];

  function classifyQuery(value) {
    const normalized = String(value || '').toLowerCase();
    const rules = [
      ['coding', /코딩|코드|개발|오류|버그|프로그램|리팩터링|디버깅/],
      ['video', /영상|쇼츠|릴스|유튜브|자막|편집|애니메이션/],
      ['image', /이미지|사진|디자인|썸네일|그림|비주얼|카드뉴스/],
      ['research', /검색|조사|시장|뉴스|자료|출처|최신/],
      ['writing', /회의|회의록|정리|문서|pdf|논문|대본|글쓰기|번역|요약/]
    ];
    return rules.find(([, pattern]) => pattern.test(normalized))?.[0] || null;
  }

  function scoreTool(tool, query, category) {
    const normalized = String(query || '').toLowerCase();
    const keywordHits = (tool.keywords || []).reduce((score, keyword) => score + (normalized.includes(String(keyword).toLowerCase()) ? 1 : 0), 0);
    const fit = category ? Math.min(5, (tool.categories.includes(category) ? 3 : 0) + Math.min(2, keywordHits)) : Math.min(5, 3 + Math.min(2, keywordHits));
    const total = Math.round((fit / 5) * state.weights.fit + (tool.quality / 5) * state.weights.quality + (tool.costFit / 5) * state.weights.cost + (tool.korean / 5) * state.weights.korean + (tool.speed / 5) * state.weights.speed + (tool.privacy / 5) * state.weights.privacy);
    return { ...tool, fit, total: Math.max(51, Math.min(99, total)) };
  }

  function rankTools(query = state.query, category = classifyQuery(query)) {
    return state.tools.map(tool => scoreTool(tool, query, category)).sort((a, b) => b.total - a.total || b.quality - a.quality);
  }

  function toolCard(tool, index, recommendation = false) {
    const saved = state.saved.has(tool.id);
    const tags = (recommendation ? tool.strengths : tool.bestFor.slice(0, 3)).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    const match = recommendation ? `<div class="match"><div class="match-bar"><i style="width:${tool.total}%"></i></div><span class="match-score">${tool.total}% 적합</span></div>` : '';
    const reasonItems = recommendation ? [tool.reason, ...(tool.strengths || tool.bestFor || []).slice(0, 2).map(item => `${item}에 강해요`)].filter(Boolean).slice(0, 3) : [];
    const reason = recommendation ? `<div class="recommend-reason"><strong>추천 이유</strong><ul>${reasonItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
    const accessLabel = tool.priceType === 'free' ? '무료' : tool.priceType === 'freemium' ? '무료 플랜 있음' : tool.priceType === 'paid' ? '유료' : '요금 확인 필요';
    const priceInfo = recommendation ? `<div class="recommend-facts"><div><span>이용 조건</span><strong>${escapeHtml(accessLabel)}</strong></div><div><span>현재 요금</span><strong>${escapeHtml(tool.price || '확인 필요')}</strong></div>${tool.freeLimit ? `<p>무료 범위 · ${escapeHtml(tool.freeLimit)}</p>` : ''}</div>` : '';
    return `<article class="recommend-card" data-tool-id="${escapeHtml(tool.id)}">
      ${recommendation ? `<span class="rank">${String(index + 1).padStart(2, '0')}</span>` : ''}
      <div class="tool-head">${toolLogoMarkup(tool)}<div>${toolNameMarkup(tool)}<div class="tool-maker">${escapeHtml(tool.maker)}${deepToolProfiles[String(tool.id)] ? '<span class="deep-card-badge">심층 정보 · 예시</span>' : ''}</div></div></div>
      ${match}${reason}<div class="tag-row">${tags}</div>
      ${priceInfo}${verificationMarkup(tool, true)}
      <div class="card-footer">${recommendation ? '' : `<span class="price">${escapeHtml(tool.price)}</span>`}<div class="card-actions"><button class="compare-btn ${state.compare.has(tool.id) ? 'selected' : ''}" data-compare="${escapeHtml(tool.id)}">${state.compare.has(tool.id) ? '✓ 비교중' : '+ 비교'}</button><button class="save-btn ${saved ? 'saved' : ''}" data-save="${escapeHtml(tool.id)}" aria-label="${saved ? '저장 취소' : '저장'}">${saved ? '♥ 저장됨' : '♡ 저장'}</button><button class="detail-btn" data-detail="${escapeHtml(tool.id)}">상세 보기</button></div></div>
    </article>`;
  }

  function diagnosisScore(tool, answers) {
    const category = tool.categories.includes(answers.goal) ? 35 : 0;
    const quality = (Number(tool.quality) / 5) * 15;
    const easeTarget = answers.level === 'beginner' ? 5 : answers.level === 'intermediate' ? 4 : 3;
    const ease = Math.max(0, 15 - Math.abs(easeTarget - Number(tool.ease)) * 5);
    let budget = (Number(tool.costFit) / 5) * 15;
    if (answers.budget === 'free') budget = tool.priceType === 'free' ? 15 : tool.priceType === 'freemium' ? 12 : 2;
    if (answers.budget === 'any') budget = (Number(tool.quality) / 5) * 15;
    const korean = Math.max(0, 10 - Math.max(0, Number(answers.korean) - Number(tool.korean)) * 4);
    const privacy = Math.max(0, 10 - Math.max(0, Number(answers.privacy) - Number(tool.privacy)) * 4);
    return Math.max(51, Math.min(99, Math.round(category + quality + ease + budget + korean + privacy)));
  }

  function isFreeEligible(tool) {
    if (tool.priceType === 'free') return true;
    if (tool.priceType !== 'freemium') return false;
    return !/체험|trial/i.test(`${tool.price || ''} ${tool.freeLimit || ''}`);
  }

  function diagnosisConstraintMatch(tool, answers, strict = true) {
    if (!tool.categories.includes(answers.goal)) return false;
    if (answers.budget === 'free' && !isFreeEligible(tool)) return false;

    const koreanWanted = Number(answers.korean);
    const privacyWanted = Number(answers.privacy);
    const koreanMinimum = koreanWanted >= 5 ? (strict ? 5 : 4) : koreanWanted >= 4 ? (strict ? 4 : 3) : 3;
    const privacyMinimum = privacyWanted >= 5 ? (strict ? 5 : 4) : privacyWanted >= 4 ? (strict ? 4 : 3) : 3;
    if (Number(tool.korean) < koreanMinimum || Number(tool.privacy) < privacyMinimum) return false;
    if (answers.level === 'beginner' && Number(tool.ease) < (strict ? 4 : 3)) return false;
    return true;
  }

  function diagnosisReason(tool, answers, relaxed = false) {
    const strengths = (tool.strengths || tool.bestFor || []).slice(0, 2).join('·');
    const parts = [];
    if (answers.budget === 'free') parts.push(tool.priceType === 'free' ? '무료로 사용할 수 있어요' : `무료 범위로 시작할 수 있어요${tool.freeLimit ? ` (${tool.freeLimit})` : ''}`);
    else if (answers.budget === 'value') parts.push('가격 대비 활용도가 좋은 편이에요');
    else parts.push('결과물 품질을 우선해 골랐어요');
    if (strengths) parts.push(`${strengths} 업무에 잘 맞아요`);
    if (Number(answers.korean) >= 4) parts.push(`한국어 품질 ${tool.korean}/5`);
    if (Number(answers.privacy) >= 4) parts.push(`보안 기준 ${tool.privacy}/5`);
    if (relaxed) parts.push('일부 선호 조건은 가장 가까운 수준으로 적용했어요');
    return parts.join(' · ');
  }

  function runDiagnosis(answers) {
    const levelLabel = answers.level === 'beginner' ? '초보자' : answers.level === 'intermediate' ? '경험자' : '능숙한 사용자';
    const budgetLabel = answers.budget === 'free' ? '무료 필수' : answers.budget === 'value' ? '가격 대비 효율' : '성능 우선';
    const strictTools = state.tools.filter(tool => diagnosisConstraintMatch(tool, answers, true));
    const relaxedTools = state.tools.filter(tool => !strictTools.includes(tool) && diagnosisConstraintMatch(tool, answers, false));
    const candidates = [...strictTools.map(tool => ({ tool, relaxed: false })), ...relaxedTools.map(tool => ({ tool, relaxed: true }))]
      .map(({ tool, relaxed }) => ({ ...tool, total: diagnosisScore(tool, answers), reason: diagnosisReason(tool, answers, relaxed), relaxed }))
      .sort((a, b) => Number(a.relaxed) - Number(b.relaxed) || b.total - a.total || b.quality - a.quality)
      .slice(0, 3);

    $('#diagnosis-title').textContent = candidates.length
      ? `${displayToolName(candidates[0])}를 가장 먼저 추천해요`
      : '선택한 필수 조건을 만족하는 AI가 아직 없어요';
    const relaxedCount = candidates.filter(tool => tool.relaxed).length;
    $('#diagnosis-caption').textContent = candidates.length
      ? `${levelLabel} · ${budgetLabel} · 한국어·보안 필수 조건을 먼저 적용해 ${candidates.length}개를 골랐어요.${relaxedCount ? ` 이 중 ${relaxedCount}개는 가까운 조건의 대안입니다.` : ''}`
      : '무료·업무 분야 조건은 유지한 채 한국어 또는 보안 기준을 한 단계 낮춰 다시 선택해 보세요.';
    $('#diagnosis-grid').innerHTML = candidates.map((tool, index) => toolCard(tool, index, true)).join('');
    $('#diagnosis-result').hidden = false;
    bindCardActions();
    setTimeout(() => $('#diagnosis-result').scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function renderRecommendations(query = state.query) {
    const context = classifyQuery(query);
    const ranked = rankTools(query, context).slice(0, 3);
    $('#recommend-caption').textContent = context ? categoryInfo[context].caption : '콘텐츠 제작에 자주 쓰이는 도구를 골라봤어요.';
    $('#recommend-grid').innerHTML = ranked.map((tool, index) => toolCard(tool, index, true)).join('');
    $('#empty-recommend').style.display = ranked.length ? 'none' : 'block';
    bindCardActions();
  }

  function renderTemplates() {
    const filtered = state.templateCategory === 'all' ? workTemplates : workTemplates.filter(item => item.category === state.templateCategory);
    $('#template-grid').innerHTML = filtered.map(item => {
      const names = item.toolIds.map(id => { const tool = state.tools.find(entry => String(entry.id) === id); return tool ? displayToolName(tool) : id; }).join(' · ');
      return `<article class="template-card">
        <div class="template-top"><span class="template-icon">${item.icon}</span><span class="template-time">${escapeHtml(item.time)}</span></div>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
        <div class="template-tools">추천 AI · ${escapeHtml(names)}</div>
        <button class="template-open" type="button" data-template="${escapeHtml(item.id)}">템플릿 열기 →</button>
      </article>`;
    }).join('');
    $$('#template-grid [data-template]').forEach(button => button.addEventListener('click', () => openTemplate(button.dataset.template)));
  }

  function openTemplate(id) {
    const item = workTemplates.find(template => template.id === id);
    if (!item) return;
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = item.title;
    $('#modal-kicker').textContent = `${item.time} · 바로 복사해서 사용하는 업무 템플릿`;
    const tools = item.toolIds.map(toolId => {
      const tool = state.tools.find(entry => String(entry.id) === toolId);
      return tool ? `<button class="template-tool-link" type="button" data-detail="${escapeHtml(tool.id)}">${escapeHtml(tool.name)} 상세 보기</button>` : '';
    }).join('');
    $('#modal-body').innerHTML = `<p class="tool-detail-intro">${escapeHtml(item.description)}</p>
      <section class="tool-detail-section"><h4>추천 AI</h4><div class="template-modal-tools">${tools}</div></section>
      <section class="tool-detail-section"><h4>복사해서 바로 사용하세요</h4>
        <div class="prompt-box"><button class="prompt-copy-btn" type="button" data-copy-template>템플릿 복사</button><pre>${escapeHtml(item.prompt)}</pre></div>
        <p class="prompt-help">[대괄호] 안의 내용만 내 업무에 맞게 바꾸면 됩니다.</p>
      </section>`;
    $('#modal').classList.add('open');
    $('[data-copy-template]')?.addEventListener('click', () => copyPrompt(item.prompt));
    bindCardActions();
  }

  function bindTemplates() {
    $$('[data-template-filter]').forEach(button => button.addEventListener('click', () => {
      state.templateCategory = button.dataset.templateFilter;
      $$('[data-template-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderTemplates();
    }));
  }

  function savePromptRecipes() {
    localStorage.setItem('ai-navigator-saved-recipes', JSON.stringify([...state.savedRecipes]));
  }

  function renderPromptRecipes() {
    const filtered = state.promptCategory === 'all' ? promptRecipes : promptRecipes.filter(item => item.category === state.promptCategory);
    $('#prompt-recipe-grid').innerHTML = filtered.map(item => {
      const saved = state.savedRecipes.has(item.id);
      return `<article class="prompt-recipe-card prompt-visual-${escapeHtml(item.category)}">
        <div class="prompt-recipe-visual"><img src="/assets/prompt-previews/${escapeHtml(item.id)}.webp" alt="${escapeHtml(item.title)} 프롬프트 AI 생성 결과 예시" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span class="prompt-preview-fallback" hidden><b>${escapeHtml(item.icon)}</b><small>결과 예시 준비 중</small></span><span class="prompt-preview-label">AI 생성 예시</span><span class="prompt-recipe-badge">${escapeHtml(item.badge)}</span></div>
        <div class="prompt-recipe-content"><div class="prompt-recipe-meta"><span>${escapeHtml(item.time)}</span><span>${escapeHtml(item.tools[0])}</span></div>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
        <div class="prompt-recipe-actions"><button type="button" class="prompt-recipe-open" data-prompt-open="${escapeHtml(item.id)}">레시피 보기 →</button><button type="button" class="prompt-recipe-save ${saved ? 'saved' : ''}" data-prompt-save="${escapeHtml(item.id)}" aria-label="${saved ? '레시피 저장 취소' : '레시피 저장'}">${saved ? '♥' : '♡'}</button></div></div>
      </article>`;
    }).join('');
    $('#prompt-recipe-count').textContent = filtered.length;
    bindPromptRecipeActions();
  }

  function openPromptRecipe(id) {
    const item = promptRecipes.find(recipe => recipe.id === id);
    if (!item) return;
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = item.title;
    $('#modal-kicker').textContent = `${item.badge} · ${item.time} · 편집팀 검수 레시피`;
    $('#modal-body').innerHTML = `<div class="recipe-modal">
      <p class="tool-detail-intro">${escapeHtml(item.description)}</p>
      <section class="recipe-compare" aria-label="원본과 AI 결과 비교">
        <div class="recipe-compare-head"><div><strong>내 사진과 결과 예시 비교</strong><span>사진은 서버에 전송되지 않고 이 화면에서만 보여요.</span></div><label class="recipe-upload-btn">내 원본 선택<input type="file" accept="image/*" data-recipe-original /></label></div>
        <div class="recipe-compare-grid">
          <div class="recipe-original-preview"><div class="recipe-original-empty" data-original-empty><b>＋</b><strong>내 원본 사진</strong><span>${escapeHtml(item.needs)}</span></div><img data-original-image alt="사용자가 선택한 원본 미리보기" hidden /><span class="recipe-compare-label">원본 · 내 사진</span></div>
          <figure class="recipe-result-preview"><a href="/assets/prompt-previews/${escapeHtml(item.id)}.webp" target="_blank" rel="noreferrer"><img src="/assets/prompt-previews/${escapeHtml(item.id)}.webp" alt="${escapeHtml(item.title)} 프롬프트 AI 생성 결과 예시" onerror="this.hidden=true;this.parentElement.nextElementSibling.hidden=false" /></a><span class="recipe-preview-fallback" hidden><b>${escapeHtml(item.icon)}</b><small>전용 결과 예시 준비 중</small></span><span class="recipe-compare-label">결과 · AI 생성 예시</span></figure>
        </div>
        <p class="recipe-compare-note">오른쪽은 이 레시피의 분위기를 보여주는 샘플입니다. 실제 결과는 원본 사진과 사용하는 AI 모델에 따라 달라질 수 있어요.</p>
      </section>
      <div class="recipe-tool-row">${item.tools.map(tool => `<span>${escapeHtml(tool)}</span>`).join('')}</div>
      <section class="tool-detail-section"><h4>준비물</h4><p>${escapeHtml(item.needs)}</p></section>
      <section class="tool-detail-section"><h4>사용 순서</h4><ol class="recipe-steps">${item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section>
      <section class="tool-detail-section"><h4>복사해서 사용하세요</h4><div class="prompt-box recipe-prompt-box"><button class="prompt-copy-btn" type="button" data-copy-recipe>전체 프롬프트 복사</button><pre>${escapeHtml(item.prompt)}</pre></div><p class="prompt-help">[대괄호] 부분만 원하는 내용으로 바꾸세요. 한 번에 여러 조건을 바꾸기보다 첫 결과를 본 뒤 한 항목씩 수정하면 안정적입니다.</p></section>
      <section class="tool-detail-section"><h4>결과가 이상할 때</h4><div class="recipe-fix"><p>${escapeHtml(item.fix)}</p><button type="button" data-copy-fix>수정 프롬프트 복사</button></div></section>
      <div class="recipe-caution"><strong>개인정보·권리 주의</strong><p>${escapeHtml(item.caution)}</p></div>
      <div class="recipe-modal-actions"><button type="button" class="primary-btn" data-share-recipe>친구에게 공유</button><button type="button" class="secondary-btn" data-prompt-save="${escapeHtml(item.id)}">${state.savedRecipes.has(item.id) ? '저장 취소' : '레시피 저장'}</button></div>
    </div>`;
    $('#modal').classList.add('open');
    $('[data-copy-recipe]')?.addEventListener('click', () => copyPrompt(item.prompt));
    $('[data-copy-fix]')?.addEventListener('click', () => copyPrompt(item.fix));
    $('[data-share-recipe]')?.addEventListener('click', () => sharePromptRecipe(item));
    $('#modal-body [data-prompt-save]')?.addEventListener('click', event => togglePromptRecipe(item.id, event.currentTarget));
    $('[data-recipe-original]')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return showToast('이미지 파일을 선택해 주세요.');
      const image = $('[data-original-image]');
      const empty = $('[data-original-empty]');
      if (!image || !empty) return;
      const url = URL.createObjectURL(file);
      image.onload = () => URL.revokeObjectURL(url);
      image.src = url;
      image.hidden = false;
      empty.hidden = true;
      showToast('내 사진을 결과 예시 옆에 표시했어요.');
    });
  }

  function togglePromptRecipe(id, button) {
    if (state.savedRecipes.has(id)) state.savedRecipes.delete(id); else state.savedRecipes.add(id);
    savePromptRecipes();
    if (button) button.textContent = state.savedRecipes.has(id) ? '저장 취소' : '레시피 저장';
    renderPromptRecipes();
    showToast(state.savedRecipes.has(id) ? '프롬프트 레시피를 저장했어요.' : '저장을 취소했어요.');
  }

  async function sharePromptRecipe(item) {
    const data = { title: `${item.title} — AI 네비게이터`, text: item.description, url: `https://ai-navigator-ebon.vercel.app/?recipe=${encodeURIComponent(item.id)}#prompts` };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); showToast('레시피 주소를 복사했어요.'); }
    } catch (error) { if (error?.name !== 'AbortError') showToast('공유하지 못했어요. 다시 시도해 주세요.'); }
  }

  function bindPromptRecipeActions() {
    $$('[data-prompt-open]').forEach(button => button.addEventListener('click', () => openPromptRecipe(button.dataset.promptOpen)));
    $$('#prompt-recipe-grid [data-prompt-save]').forEach(button => button.addEventListener('click', event => togglePromptRecipe(button.dataset.promptSave, event.currentTarget)));
  }

  function bindPromptRecipes() {
    $$('[data-prompt-filter]').forEach(button => button.addEventListener('click', () => {
      state.promptCategory = button.dataset.promptFilter;
      $$('[data-prompt-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderPromptRecipes();
    }));
  }

  function popularityScore(tool) {
    const remote = state.popularity.get(String(tool.id));
    if (state.popularityLive && remote) return Number(remote.score) || 0;
    const local = state.localPopularity[tool.id] || {};
    return (Number(local.views) || 0) + (Number(local.saves) || 0) * 3 + (Number(local.compares) || 0) * 2;
  }

  function renderPopularity() {
    const statsRows = state.popularityLive ? [...state.popularity.values()] : Object.values(state.localPopularity);
    const totalActions = statsRows.reduce((sum, row) => sum + (Number(row.views) || 0) + (Number(row.saves) || 0) + (Number(row.compares) || 0), 0);
    const establishedRanking = state.popularityLive && totalActions >= 100;
    let tools = [...state.tools];
    if (state.popularityFilter === 'free') tools = tools.filter(tool => tool.priceType === 'free' || tool.priceType === 'freemium');
    if (state.popularityFilter === 'korean') tools = tools.filter(tool => Number(tool.korean) >= 4);
    if (state.popularityFilter === 'beginner') tools = tools.filter(tool => Number(tool.ease) >= 4);
    if (state.popularityLive && !establishedRanking && totalActions > 0) tools = tools.filter(tool => popularityScore(tool) > 0);
    tools.sort((a, b) => popularityScore(b) - popularityScore(a) || b.quality - a.quality || b.costFit - a.costFit);
    const ranked = tools.slice(0, 5);

    $('#popularity-title').textContent = establishedRanking ? '인기 AI 순위' : '최근 방문자가 확인한 AI';
    $('#popularity-all-label').textContent = establishedRanking ? '종합 인기' : '최근 관심';
    $('#popularity-status').textContent = state.popularityLive
      ? establishedRanking ? '최근 30일 실제 이용 데이터' : `초기 이용 데이터 · 활동 ${totalActions}건`
      : '이 브라우저의 이용 기록';
    $('#popularity-status').classList.toggle('live', state.popularityLive);
    $('#popularity-caption').textContent = establishedRanking
      ? '상세 조회·저장·비교 선택을 개인정보 없이 합산했어요.'
      : '아직 표본이 적어 인기 순위가 아닌 최근 조회·저장·비교 현황으로 보여드려요.';
    $('#popularity-note').textContent = establishedRanking
      ? '한 사용자의 같은 도구·행동은 하루에 한 번만 전체 순위에 반영합니다.'
      : '활동 기록이 100건 이상 쌓이면 최근 30일 인기 순위로 자동 전환됩니다. 같은 사용자의 반복 행동은 하루 한 번만 반영합니다.';

    $('#popularity-list').innerHTML = ranked.length ? ranked.map((tool, index) => {
      const stats = state.popularity.get(String(tool.id)) || {};
      const local = state.localPopularity[tool.id] || {};
      const views = state.popularityLive ? Number(stats.views) || 0 : Number(local.views) || 0;
      const saves = state.popularityLive ? Number(stats.saves) || 0 : Number(local.saves) || 0;
      const compares = state.popularityLive ? Number(stats.compares) || 0 : Number(local.compares) || 0;
      return `<article class="popularity-row">
        <span class="popularity-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
        ${toolLogoMarkup(tool)}
        <div class="popularity-copy"><strong>${escapeHtml(tool.name)}</strong>${koreanToolName(tool) ? `<em>${escapeHtml(koreanToolName(tool))}</em>` : ''}<small>${escapeHtml(tool.bestFor.slice(0, 2).join(' · '))}</small></div>
        <div class="popularity-metrics">${state.popularityLive || popularityScore(tool) > 0 ? `<span>조회 ${views}</span><span>저장 ${saves}</span><span>비교 ${compares}</span>` : '<span>이용 기록 없음</span>'}</div>
        <button class="detail-btn" type="button" data-detail="${escapeHtml(tool.id)}">상세 보기</button>
      </article>`;
    }).join('') : '<div class="empty" style="display:block">이 조건에는 아직 이용 기록이 없어요. 다른 조건을 선택해 보세요.</div>';
    bindCardActions();
  }

  async function loadPopularity() {
    if (!supabaseClient) { renderPopularity(); return; }
    try {
      const { data, error } = await supabaseClient.rpc('get_tool_popularity');
      if (error) throw error;
      state.popularity = new Map((data || []).map(row => [String(row.tool_id), row]));
      state.popularityLive = true;
    } catch (error) {
      state.popularityLive = false;
    }
    renderPopularity();
  }

  async function recordToolEvent(toolId, eventType) {
    const key = String(toolId);
    const metric = eventType === 'view' ? 'views' : eventType === 'save' ? 'saves' : 'compares';
    state.localPopularity[key] = state.localPopularity[key] || { views: 0, saves: 0, compares: 0 };
    state.localPopularity[key][metric] = (Number(state.localPopularity[key][metric]) || 0) + 1;
    saveLocalPopularity();
    renderPopularity();
    if (!supabaseClient) return;
    try {
      await supabaseClient.rpc('record_tool_event', { p_tool_id: key, p_event_type: eventType, p_visitor_id: visitorId() });
    } catch (error) { /* 로컬 집계는 유지합니다. */ }
  }

  function bindPopularity() {
    $$('[data-popularity-filter]').forEach(button => button.addEventListener('click', () => {
      state.popularityFilter = button.dataset.popularityFilter;
      $$('[data-popularity-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderPopularity();
    }));
  }

  const updateTypes = {
    new_tool: { icon:'✦', label:'신규 AI', className:'new' },
    price_change: { icon:'₩', label:'가격 변경', className:'price' },
    free_limit_change: { icon:'◎', label:'무료 범위', className:'free' }
  };

  function updateDate(value) {
    if (!value) return '날짜 미정';
    return new Intl.DateTimeFormat('ko-KR', { month:'numeric', day:'numeric' }).format(new Date(value));
  }

  function fallbackToolUpdates() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return state.tools.filter(tool => tool.createdAt && new Date(tool.createdAt).getTime() >= cutoff).map(tool => ({
      id: `new-${tool.id}`, tool_id: tool.id, update_type:'new_tool',
      title: `새 AI 등록 · ${tool.name}`,
      summary:'가격·한국어·난이도 정보를 확인하고 비교해 보세요.',
      old_value:null, new_value:tool.price, created_at:tool.createdAt
    }));
  }

  function renderUpdates() {
    let updates = [...state.updates];
    if (state.updateFilter === 'saved') updates = updates.filter(item => state.saved.has(item.tool_id));
    if (state.updateFilter === 'price') updates = updates.filter(item => item.update_type === 'price_change' || item.update_type === 'free_limit_change');
    if (state.updateFilter === 'new') updates = updates.filter(item => item.update_type === 'new_tool');
    updates.sort((a, b) => {
      const unread = Number(!state.readUpdates.has(String(b.id))) - Number(!state.readUpdates.has(String(a.id)));
      if (unread) return unread;
      const saved = Number(state.saved.has(b.tool_id)) - Number(state.saved.has(a.tool_id));
      return saved || new Date(b.created_at) - new Date(a.created_at);
    });
    const unreadCount = state.updates.filter(item => !state.readUpdates.has(String(item.id))).length;
    $('#update-count').textContent = unreadCount > 99 ? '99+' : unreadCount;
    $('#update-count').hidden = unreadCount === 0;
    $('#updates-status').textContent = state.updatesLive ? '자동 변경 감지 중' : '신규 등록 정보 표시 중';
    $('#updates-status').classList.toggle('live', state.updatesLive);
    $('#updates-list').innerHTML = updates.map(item => {
      const tool = state.tools.find(entry => String(entry.id) === String(item.tool_id));
      const meta = updateTypes[item.update_type] || updateTypes.new_tool;
      const unread = !state.readUpdates.has(String(item.id));
      const change = item.old_value || item.new_value ? `<div class="update-change">${item.old_value ? `<del>${escapeHtml(item.old_value)}</del><b>→</b>` : ''}<strong>${escapeHtml(item.new_value || '새 정보 확인')}</strong></div>` : '';
      return `<article class="update-item ${unread ? 'unread' : ''}" data-update-id="${escapeHtml(item.id)}">
        <span class="update-icon ${meta.className}">${meta.icon}</span>
        <div class="update-copy"><div class="update-meta"><span>${meta.label}</span><time>${updateDate(item.created_at)}</time>${state.saved.has(item.tool_id) ? '<em>저장한 AI</em>' : ''}</div>
          <h3>${escapeHtml(item.title || (tool ? displayToolName(tool) : 'AI 업데이트'))}</h3>
          <p>${escapeHtml(item.summary || '변경된 내용을 확인해 보세요.')}</p>${change}
        </div>
        <div class="update-actions">${tool ? `<button type="button" data-update-tool="${escapeHtml(tool.id)}">상세 보기</button>` : ''}${unread ? `<button type="button" class="read-btn" data-mark-update="${escapeHtml(item.id)}">읽음</button>` : ''}</div>
      </article>`;
    }).join('');
    $('#empty-updates').style.display = updates.length ? 'none' : 'block';
    $$('#updates-list [data-mark-update]').forEach(button => button.addEventListener('click', () => markUpdateRead(button.dataset.markUpdate)));
    $$('#updates-list [data-update-tool]').forEach(button => button.addEventListener('click', () => {
      const update = button.closest('[data-update-id]');
      if (update) markUpdateRead(update.dataset.updateId, false);
      const tool = state.tools.find(item => String(item.id) === String(button.dataset.updateTool));
      if (tool) openTool(tool);
    }));
  }

  function saveReadUpdates() {
    localStorage.setItem('ai-navigator-read-updates', JSON.stringify([...state.readUpdates].slice(-200)));
  }

  function markUpdateRead(id, rerender = true) {
    state.readUpdates.add(String(id));
    saveReadUpdates();
    if (rerender) renderUpdates();
  }

  async function loadToolUpdates() {
    state.updatesLive = false;
    state.updates = [];
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.from('tool_updates').select('*').order('created_at', { ascending:false }).limit(50);
        if (error) throw error;
        state.updates = data || [];
        state.updatesLive = true;
      } catch (error) { state.updatesLive = false; }
    }
    if (!state.updates.length) state.updates = fallbackToolUpdates();
    renderUpdates();
  }

  function bindUpdates() {
    $$('[data-update-filter]').forEach(button => button.addEventListener('click', () => {
      state.updateFilter = button.dataset.updateFilter;
      $$('[data-update-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderUpdates();
    }));
    $('#mark-all-updates').addEventListener('click', () => {
      state.updates.forEach(item => state.readUpdates.add(String(item.id)));
      saveReadUpdates(); renderUpdates(); showToast('업데이트를 모두 읽음 처리했어요.');
    });
  }

  function renderSaved() {
    const savedTools = state.tools.filter(tool => state.saved.has(tool.id));
    $('#saved-grid').innerHTML = savedTools.map((tool, index) => toolCard(tool, index)).join('');
    $('#saved-count').textContent = savedTools.length;
    $('#saved-caption').textContent = state.user
      ? `${savedTools.length}개 저장됨 · 계정에 안전하게 동기화됩니다.`
      : `${savedTools.length}개 저장됨 · 현재 브라우저에 저장됩니다.`;
    $('#empty-saved').style.display = savedTools.length ? 'none' : 'block';
    bindCardActions();
  }

  function renderWorkflow() {
    const workflow = workflows.find(item => item.id === state.workflow) || workflows[0];
    $('#workflow-tabs').innerHTML = workflows.map(item => `<button class="workflow-tab ${item.id === workflow.id ? 'active' : ''}" type="button" role="tab" aria-selected="${item.id === workflow.id}" data-workflow="${escapeHtml(item.id)}">${escapeHtml(item.icon)}&nbsp; ${escapeHtml(item.label)}</button>`).join('');
    const steps = workflow.steps.map((step, index) => {
      const tool = state.tools.find(item => String(item.id) === String(step.toolId));
      const name = tool?.name || step.toolId;
      const korean = tool ? koreanToolName(tool) : '';
      return `<button class="workflow-step" type="button" data-detail="${escapeHtml(step.toolId)}">
        <span class="workflow-number">STEP ${index + 1}</span>
        <span class="workflow-tool">${escapeHtml(name)}</span>${korean ? `<span class="workflow-tool-ko">${escapeHtml(korean)}</span>` : ''}
        <span class="workflow-role">${escapeHtml(step.role)}</span>
      </button>`;
    }).join('');
    $('#workflow-result').innerHTML = `<article class="workflow-card">
      <div class="workflow-summary"><div><h3>${escapeHtml(workflow.title)}</h3><p>${escapeHtml(workflow.description)}</p></div><span class="workflow-time">${escapeHtml(workflow.time)}</span></div>
      <div class="workflow-steps">${steps}</div>
      <p class="workflow-tip"><strong>사용 팁</strong> · ${escapeHtml(workflow.tip)}</p>
    </article>`;
    bindCardActions();
    $$('#workflow-tabs [data-workflow]').forEach(button => button.addEventListener('click', () => {
      state.workflow = button.dataset.workflow;
      renderWorkflow();
    }));
  }

  function directoryRecommendationScore(tool) {
    return Number(tool.quality) * 4 + Number(tool.ease) * 2 + Number(tool.korean) * 2 + Number(tool.costFit) + Number(tool.privacy);
  }

  function renderDirectory() {
    const query = state.directoryQuery.trim().toLowerCase();
    let filtered = state.category === 'all' ? [...state.tools] : state.tools.filter(tool => tool.categories.includes(state.category));
    if (state.priceFilter === 'free') filtered = filtered.filter(tool => isFreeEligible(tool));
    if (state.priceFilter === 'paid') filtered = filtered.filter(tool => tool.priceType === 'paid');
    if (state.koreanFilter !== 'all') filtered = filtered.filter(tool => Number(tool.korean) >= Number(state.koreanFilter));
    if (query) {
      filtered = filtered.filter(tool => {
        const searchable = [
          tool.name, koreanToolName(tool), tool.maker, tool.description, tool.reason, tool.price, tool.freeLimit,
          ...(tool.categories || []), ...(tool.bestFor || []), ...(tool.keywords || []), ...(tool.strengths || [])
        ].join(' ').toLowerCase();
        return query.split(/\s+/).filter(Boolean).every(word => searchable.includes(word));
      });
    }

    const recommended = (a, b) => directoryRecommendationScore(b) - directoryRecommendationScore(a) || b.quality - a.quality || a.name.localeCompare(b.name);
    if (state.directorySort === 'free') filtered.sort((a, b) => Number(!isFreeEligible(a)) - Number(!isFreeEligible(b)) || b.costFit - a.costFit || recommended(a, b));
    else if (state.directorySort === 'korean') filtered.sort((a, b) => b.korean - a.korean || recommended(a, b));
    else if (state.directorySort === 'beginner') filtered.sort((a, b) => b.ease - a.ease || recommended(a, b));
    else if (state.directorySort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else filtered.sort(recommended);

    $('#directory-grid').innerHTML = filtered.map((tool, index) => toolCard(tool, index)).join('');
    $('#filter-count').textContent = filtered.length;
    $('#empty-directory').textContent = query
      ? `“${state.directoryQuery.trim()}” 검색 결과가 없어요. 더 짧은 단어나 다른 업무 표현으로 검색해 보세요.`
      : '선택한 조건에 맞는 AI 도구가 없어요. 필터를 초기화하거나 조건을 낮춰보세요.';
    $('#empty-directory').style.display = filtered.length ? 'none' : 'block';
    bindCardActions();
  }

  function newsItem(item, archive = false) {
    const articlePath = item.articlePath || newsArticlePathsByTitle[item.title] || '';
    const href = articlePath || '#';
    return `<a href="${escapeHtml(href)}" class="news-item ${archive ? 'news-archive-card' : ''}" data-news-id="${escapeHtml(item.id)}" ${articlePath ? `data-news-path="${escapeHtml(articlePath)}"` : ''}>
      <div class="news-meta"><span>${escapeHtml(item.label)}</span>${item.date ? `<time>${escapeHtml(item.date)}</time>` : ''}</div>
      <p class="news-title">${escapeHtml(item.title)}</p>
      <p class="news-summary">${escapeHtml(item.summary)}</p>
      ${archive ? '<span class="news-read">기사 전체 읽기 →</span>' : ''}
    </a>`;
  }

  function renderNews() {
    const query = state.newsQuery.trim().toLowerCase();
    const filtered = state.news.filter(item => {
      const categoryMatch = state.newsCategory === 'all' || item.category === state.newsCategory;
      const text = `${item.title} ${item.summary} ${item.insight} ${item.source}`.toLowerCase();
      return categoryMatch && (!query || text.includes(query));
    });
    $('#news-list').innerHTML = state.news.slice(0, 3).map(item => newsItem(item)).join('');
    $('#news-archive-grid').innerHTML = filtered.map(item => newsItem(item, true)).join('');
    $('#news-result-count').textContent = filtered.length;
    $('#empty-news').style.display = filtered.length ? 'none' : 'block';
    $('#news-archive').hidden = !state.newsExpanded;
    $('#news-toggle').textContent = state.newsExpanded ? '간단히 보기 ↑' : `전체 뉴스 ${state.news.length}개 →`;
    $('.demo-badge').textContent = state.remoteNews ? '편집 콘텐츠' : '예시 콘텐츠';
    $('.demo-badge').classList.toggle('connected', state.remoteNews);
    bindNewsActions();
  }

  function bindNewsActions() {
    $$('.news-item').forEach(item => {
      if (item.dataset.bound) return;
      item.dataset.bound = 'true';
      item.addEventListener('click', event => {
        if (item.dataset.newsPath) return;
        event.preventDefault();
        const itemData = state.news.find(entry => String(entry.id) === String(item.dataset.newsId));
        if (itemData) openNews(itemData);
      });
    });
  }

  function bindNewsExplorer() {
    $('#news-toggle').addEventListener('click', () => {
      state.newsExpanded = !state.newsExpanded;
      renderNews();
      if (state.newsExpanded) setTimeout(() => $('#news-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    });
    $('#news-search').addEventListener('input', event => {
      state.newsQuery = event.target.value;
      renderNews();
    });
    $('#news-category').addEventListener('change', event => {
      state.newsCategory = event.target.value;
      renderNews();
    });
    $('#news-reset').addEventListener('click', () => {
      state.newsQuery = '';
      state.newsCategory = 'all';
      $('#news-search').value = '';
      $('#news-category').value = 'all';
      renderNews();
    });
  }

  function openNews(item) {
    const body = item.body || newsBodiesByTitle[item.title] || '';
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = item.title;
    $('#modal-kicker').textContent = item.date ? `${item.label} · ${item.date}` : item.label;
    $('#modal-body').innerHTML = `<article class="news-article"><p class="news-lead">${escapeHtml(item.summary)}</p>${body ? `<div class="news-article-body"><h4 class="news-section-title">전체 본문</h4>${renderNewsBody(body)}</div>` : '<p class="news-missing-body">이 기사의 전체 본문은 현재 작성 중입니다.</p>'}<aside class="news-insight-box"><h4>왜 중요한가</h4><p>${escapeHtml(item.insight)}</p></aside><div class="news-source-box"><h4>출처</h4><p>${escapeHtml(item.source)}</p>${item.sourceUrl !== '#' ? `<a class="modal-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">원문 출처 열기 →</a>` : ''}</div>${!state.remoteNews ? '<p class="demo-note">현재 뉴스는 화면 검증을 위한 데모 콘텐츠입니다. Supabase를 연결하면 관리자 검수 후 발행된 뉴스가 표시됩니다.</p>' : ''}</article>`;
    $('#modal').classList.add('open');
  }

  function difficultyLabel(value) {
    if (Number(value) >= 5) return '매우 쉬움';
    if (Number(value) >= 4) return '쉬움';
    if (Number(value) >= 3) return '보통';
    return '어려움';
  }

  function toolLimitations(tool) {
    const items = [];
    if (tool.priceType === 'paid') items.push('무료 사용 범위가 매우 제한적이거나 유료 구독이 필요할 수 있어요.');
    else if (tool.priceType === 'freemium') items.push('무료 플랜에는 사용 횟수·크레딧·일부 기능 제한이 있을 수 있어요.');
    if (Number(tool.korean) <= 3) items.push('한국어 명령과 결과 품질이 영어 사용보다 불안정할 수 있어요.');
    if (Number(tool.privacy) <= 3) items.push('민감한 개인정보나 회사 기밀 자료는 입력하지 않는 편이 안전해요.');
    if (Number(tool.ease) <= 3) items.push('처음 사용할 때 기능과 설정을 익히는 시간이 필요할 수 있어요.');
    if (!items.length) items.push('가격과 제공 기능이 자주 바뀌므로 사용 전 공식 페이지 확인이 필요해요.');
    return items.slice(0, 3);
  }

  function detailList(items, className) {
    return `<ul class="tool-detail-list ${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  function starterPrompt(tool) {
    const prompts = {
      general: `당신은 실무 전문 AI입니다.
목표: [완성하고 싶은 결과]
대상: [누가 볼 것인지]
조건: [분량·톤·반드시 포함할 내용]
제외: 추측, 과장, 확인되지 않은 정보
먼저 필요한 정보를 3개만 질문한 뒤, 바로 사용할 수 있는 완성본과 개선안 2가지를 제시해 주세요.`,
      research: `다음 주제를 조사해 주세요: [조사 주제]
목적: [조사 결과를 사용할 곳]
기간과 범위: [예: 최근 1년, 한국 시장]
반드시 출처 링크와 발표일을 표시하고, 확인된 사실과 추론을 구분해 주세요.
마지막에 핵심 결론 5개, 반대 근거, 추가 확인이 필요한 항목을 정리해 주세요.`,
      document: `첨부한 자료만 근거로 다음 작업을 수행해 주세요.
목적: [요약/강의안/회의록/질의응답]
대상: [독자 또는 청중]
분량: [원하는 길이]
결과를 핵심 요약, 중요 근거, 실행할 일, 확인이 필요한 내용 순서로 정리하고 자료에 없는 내용은 만들어내지 마세요.`,
      image: `[주제와 인물]을 중심으로 [사용 목적] 이미지를 만들어 주세요.
스타일: [실사/일러스트/미니멀]
구도: [클로즈업/전신/제품 중심]
조명과 색감: [원하는 분위기]
비율: [1:1/9:16/16:9]
유지할 요소: [얼굴·의상·로고 등]
제외: 글자 깨짐, 왜곡된 손, 과도한 보정, 불필요한 배경 요소`,
      video: `[주제 또는 첨부 이미지]로 [길이]초 영상을 만들어 주세요.
장면: [인물과 행동]
카메라: [고정/천천히 줌/좌우 이동]
분위기: [시네마틱/밝고 경쾌함/자연스러움]
비율: 세로 9:16
유지: 얼굴, 의상, 배경의 일관성
제외: 갑작스러운 장면 전환, 인물 왜곡, 손가락 오류, 화면 속 임의의 글자`,
      avatar: `다음 내용을 자연스럽게 설명하는 AI 발표 영상을 만들어 주세요.
대본: [발표 내용]
발표자: [연령대·성별·분위기]
언어와 말투: 한국어, 또렷하고 친근하게
화면 비율: [9:16/16:9]
자막: 핵심 문장만 간결하게
입 모양과 음성을 자연스럽게 맞추고 과장된 표정은 제외해 주세요.`,
      coding: `다음 기능을 구현해 주세요: [원하는 기능]
환경: [사용 언어·프레임워크]
현재 상태: [기존 코드 또는 오류]
완료 조건: [사용자가 할 수 있어야 하는 행동]
기존 기능을 깨뜨리지 말고, 먼저 원인을 설명한 뒤 최소한의 변경으로 구현해 주세요.
수정 파일과 테스트 방법, 예상되는 부작용도 함께 알려 주세요.`,
      automation: `다음 반복 업무를 자동화하고 싶습니다: [현재 반복 업무]
입력: [어디에서 어떤 데이터가 들어오는지]
처리: [분류·요약·변환 등]
출력: [어디에 무엇을 저장하거나 전송할지]
실패 시 처리 방법과 개인정보 보호 조건까지 포함해 가장 단순한 워크플로부터 설계해 주세요.`,
      voice: `다음 대본을 자연스러운 한국어 음성으로 만들어 주세요.
용도: [광고/강의/묵상/영상 내레이션]
목소리: [연령대·성별·분위기]
속도: [느리게/보통/빠르게]
감정: [차분함/설렘/신뢰감]
강조할 문장: [문장]
과장된 연기와 부자연스러운 호흡은 제외해 주세요.`,
      music: `다음 조건으로 음악을 만들어 주세요.
용도: [영상 BGM/노래/행사]
장르: [장르]
분위기: [감정]
템포: [느림/보통/빠름]
악기: [원하는 악기]
보컬과 가사: [있음/없음, 주제]
길이: [시간]
기존 곡이나 가수의 목소리를 그대로 모방하지 말고 독창적으로 구성해 주세요.`,
      presentation: `다음 주제로 발표자료를 만들어 주세요: [주제]
청중: [대상]
발표 시간: [분]
목표: [설득/교육/보고]
총 [장수]장으로 구성하고, 각 장에는 핵심 메시지 하나와 짧은 근거만 넣어 주세요.
표지, 문제, 핵심 내용, 사례, 실행안, 결론 순서로 구성하고 시각자료 제안도 포함해 주세요.`
    };
    const id = String(tool.id);
    const groups = {
      document: ['notebooklm', 'notion-ai'],
      research: ['perplexity', 'genspark', 'grok'],
      image: ['firefly', 'midjourney', 'ideogram', 'leonardo-ai', 'recraft'],
      video: ['runway', 'kling-ai', 'google-veo', 'pika', 'luma-dream-machine', 'capcut'],
      avatar: ['heygen'],
      coding: ['cursor', 'github-copilot', 'replit', 'lovable', 'bolt-new'],
      automation: ['zapier-ai', 'n8n'],
      voice: ['elevenlabs'],
      music: ['suno'],
      presentation: ['gamma', 'canva']
    };
    const group = Object.entries(groups).find(([, ids]) => ids.includes(id))?.[0] || 'general';
    return prompts[group];
  }

  const deepToolProfiles = {
    chatgpt:{ outcome:'회의 메모를 핵심 결론·담당자별 할 일·확인할 질문이 있는 문서로 정리할 수 있어요.', best:['초안 작성과 아이디어 확장','대화하며 결과를 여러 번 다듬는 작업'], notBest:['최신 사실에 출처가 반드시 필요한 조사','회사 기밀처럼 외부 입력을 피해야 하는 자료'], alternatives:[['claude','긴 문서의 맥락을 유지하며 정리할 때'],['perplexity','최신 출처를 먼저 찾아야 할 때']] },
    claude:{ outcome:'긴 보고서 여러 개를 읽고 공통 쟁점·차이·실행할 일을 구조화한 분석 문서를 만들 수 있어요.', best:['긴 문서 요약과 글 다듬기','복잡한 조건을 반영한 차분한 초안'], notBest:['실시간 웹 출처가 핵심인 검색','이미지·영상 결과물을 직접 만드는 작업'], alternatives:[['chatgpt','범용 기능과 반복 대화가 중요할 때'],['notebooklm','지정한 자료만 근거로 답해야 할 때']] },
    gemini:{ outcome:'자료 조사 결과를 표로 정리하고 문서·메일에 활용할 초안을 한 흐름으로 만들 수 있어요.', best:['Google 서비스와 함께 쓰는 업무','텍스트·이미지를 함께 이해하는 작업'], notBest:['특정 자료만 엄격하게 근거로 삼는 분석','전문 영상 편집이나 디자인 제작'], alternatives:[['notebooklm','업로드한 자료 중심의 분석이 필요할 때'],['chatgpt','범용 대화와 템플릿 활용이 중요할 때']] },
    notebooklm:{ outcome:'올린 PDF와 문서에서 핵심 주장·근거 페이지·질문 답변을 출처와 함께 정리할 수 있어요.', best:['내가 제공한 자료 기반 분석','긴 문서 학습과 질의응답'], notBest:['자료 밖의 최신 정보를 폭넓게 찾는 조사','처음부터 창의적인 광고 문구를 만드는 작업'], alternatives:[['perplexity','외부 웹 자료부터 찾아야 할 때'],['claude','문서 내용을 새로운 글로 길게 재구성할 때']] },
    perplexity:{ outcome:'최근 시장 동향을 출처 링크·발표일·핵심 결론이 포함된 조사 메모로 만들 수 있어요.', best:['최신 정보와 출처 탐색','짧은 시간에 조사 범위를 잡는 작업'], notBest:['완성도 높은 장문 창작','민감한 내부 문서 분석'], alternatives:[['notebooklm','수집한 자료를 깊게 검토할 때'],['chatgpt','조사 결과를 보고서 문장으로 다듬을 때']] },
    canva:{ outcome:'브랜드 색과 문구를 반영한 카드뉴스·발표자료·썸네일 초안을 빠르게 만들 수 있어요.', best:['비디자이너의 빠른 시각 콘텐츠 제작','템플릿을 활용한 반복 디자인'], notBest:['완전히 독창적인 고급 이미지 생성','정교한 영상 합성과 후반 작업'], alternatives:[['firefly','이미지 생성과 Adobe 편집 흐름이 중요할 때'],['gamma','내용 중심 발표자료를 빠르게 만들 때']] },
    firefly:{ outcome:'제품 콘셉트에 맞는 이미지 시안과 배경 변형을 만들고 Adobe 편집 작업으로 이어갈 수 있어요.', best:['이미지 생성과 편집 아이디어','Adobe 작업 흐름과 연결한 시안 제작'], notBest:['긴 글이나 자료 조사','복잡한 영상 장면을 이어 만드는 작업'], alternatives:[['midjourney','분위기와 미감 중심의 이미지가 필요할 때'],['canva','완성 레이아웃까지 쉽게 만들고 싶을 때']] },
    midjourney:{ outcome:'브랜드 캠페인이나 콘텐츠 콘셉트를 보여주는 분위기 중심의 고품질 이미지 시안을 만들 수 있어요.', best:['감각적인 콘셉트 이미지','다양한 스타일 탐색'], notBest:['정확한 문구가 들어간 포스터','초보자가 세부 요소를 직접 편집하는 작업'], alternatives:[['ideogram','이미지 안 글자 표현이 중요할 때'],['firefly','생성 후 정교한 편집 흐름이 필요할 때']] },
    capcut:{ outcome:'세로 영상에 자동 자막·음악·장면 전환을 넣어 게시 가능한 쇼츠 초안을 만들 수 있어요.', best:['쇼츠·릴스 빠른 편집','초보자의 자막과 효과 적용'], notBest:['영화 수준의 복잡한 합성','출처 조사나 장문 작성'], alternatives:[['runway','생성 영상과 고급 AI 편집이 필요할 때'],['kling-ai','새로운 영상 장면을 생성해야 할 때']] },
    runway:{ outcome:'텍스트나 이미지를 바탕으로 짧은 영상 장면을 만들고 지우기·확장 같은 AI 편집을 적용할 수 있어요.', best:['생성 영상 실험과 시안','AI 기반 영상 후반 작업'], notBest:['긴 영상을 한 번에 완성하는 작업','간단한 모바일 자막 편집'], alternatives:[['kling-ai','영상 장면 생성 품질을 비교하고 싶을 때'],['capcut','자막과 음악까지 빠르게 마무리할 때']] },
    cursor:{ outcome:'기존 프로젝트의 관련 파일을 확인해 기능 코드·수정안·테스트 초안을 함께 만들 수 있어요.', best:['프로젝트 안에서 코드 수정','여러 파일을 연결한 개발 작업'], notBest:['코드 저장소 없이 개념만 묻는 초보 질문','디자인·영상 결과물 제작'], alternatives:[['github-copilot','기존 IDE에서 코드 제안을 받고 싶을 때'],['chatgpt','요구사항과 오류 원인을 먼저 정리할 때']] },
    'github-copilot':{ outcome:'IDE에서 반복 코드를 완성하고 함수·테스트 초안을 제안받아 개발 속도를 높일 수 있어요.', best:['코딩 중 자동 완성과 제안','기존 개발 환경을 유지하는 작업'], notBest:['비개발자의 노코드 앱 제작','시장 조사나 콘텐츠 디자인'], alternatives:[['cursor','프로젝트 전체 맥락으로 큰 수정을 맡길 때'],['chatgpt','코드 밖의 기획과 설명도 함께 필요할 때']] },
    'notion-ai':{ outcome:'업무 공간의 메모를 요약하고 회의 결과·프로젝트 업데이트·초안을 같은 페이지에서 만들 수 있어요.', best:['Notion 문서 정리와 재작성','팀 업무 기록 요약'], notBest:['최신 웹 출처 조사','고급 이미지·영상 생성'], alternatives:[['notebooklm','여러 자료의 근거를 추적해야 할 때'],['chatgpt','Notion 밖에서도 범용으로 사용하고 싶을 때']] },
    'microsoft-copilot':{ outcome:'업무 문서·메일·회의 자료를 Microsoft 환경에서 요약하고 초안으로 연결할 수 있어요.', best:['Microsoft 365 중심 업무','문서와 메일 초안 보조'], notBest:['독립적인 창작 이미지 전문 작업','다양한 외부 도구를 잇는 자동화'], alternatives:[['gemini','Google 서비스 중심으로 일할 때'],['chatgpt','특정 업무 생태계에 묶이지 않은 범용 사용']] },
    ideogram:{ outcome:'짧은 문구가 포함된 포스터·썸네일·로고 콘셉트 이미지를 여러 버전으로 만들 수 있어요.', best:['글자가 있는 이미지 시안','포스터와 썸네일 콘셉트'], notBest:['세밀한 레이아웃 편집과 인쇄 파일 완성','긴 영상 생성'], alternatives:[['midjourney','글자보다 분위기와 미감이 중요할 때'],['canva','생성 이미지와 문구를 직접 배치해 완성할 때']] },
    'kling-ai':{ outcome:'제품이나 인물의 움직임을 설명한 프롬프트로 짧은 영상 장면 시안을 만들 수 있어요.', best:['이미지 기반 영상 장면','세로형 콘텐츠용 생성 영상'], notBest:['자막·음악까지 포함한 최종 편집','긴 문서와 자료 조사'], alternatives:[['runway','생성과 AI 편집을 한곳에서 하고 싶을 때'],['capcut','생성 장면을 쇼츠로 마무리할 때']] },
    heygen:{ outcome:'대본을 입력해 발표자형 아바타 영상과 다국어 안내 영상 초안을 만들 수 있어요.', best:['설명·교육·홍보 아바타 영상','카메라 촬영을 줄이는 반복 콘텐츠'], notBest:['영화형 자유 장면 생성','복잡한 현장 촬영 편집'], alternatives:[['elevenlabs','영상 없이 자연스러운 음성만 필요할 때'],['capcut','직접 촬영한 영상 편집이 중심일 때']] },
    gamma:{ outcome:'주제와 청중을 입력해 목차·핵심 문장·시각 구성이 포함된 발표자료 초안을 만들 수 있어요.', best:['빠른 발표자료 구조화','텍스트를 시각 문서로 바꾸는 작업'], notBest:['회사 템플릿을 픽셀 단위로 맞추는 작업','복잡한 데이터 분석 자체'], alternatives:[['canva','디자인 요소를 직접 세밀하게 편집할 때'],['chatgpt','발표 내용과 논리를 먼저 깊게 다듬을 때']] },
    elevenlabs:{ outcome:'대본을 자연스러운 내레이션 음성으로 바꿔 영상·교육·오디오 콘텐츠에 사용할 수 있어요.', best:['자연스러운 음성 합성과 내레이션','여러 언어의 음성 콘텐츠 시안'], notBest:['영상 화면 편집','사실 조사나 장문 문서 분석'], alternatives:[['heygen','음성과 아바타 영상을 함께 만들 때'],['capcut','음성을 영상·자막과 결합해 마무리할 때']] },
    n8n:{ outcome:'폼·메일·스프레드시트·AI를 연결해 반복 업무가 조건에 따라 자동 실행되는 흐름을 만들 수 있어요.', best:['여러 서비스 연결과 자동화','세부 조건을 직접 통제하는 워크플로'], notBest:['설정 없이 즉시 쓰는 초보자용 자동화','이미지·영상 자체 제작'], alternatives:[['zapier-ai','설정을 더 단순하게 시작하고 싶을 때'],['chatgpt','자동화 전에 업무 절차를 설계할 때']] }
  };

  const toolResultSamples = {
    chatgpt:{ type:'업무 문서', input:'다음 회의 메모를 결정사항, 담당자별 할 일, 확인할 질문으로 정리해 줘. 메모: 신규 랜딩페이지는 금요일 공개, 민지가 문구 수정, 준호가 최종 검수.', output:'핵심 결론 · 랜딩페이지 금요일 공개\n할 일 · 민지: 문구 수정 / 준호: 최종 검수\n확인 필요 · 각 작업의 정확한 마감 시각' },
    claude:{ type:'긴 문서 분석', input:'첨부한 두 보고서의 공통 결론과 서로 다른 주장을 표로 비교하고, 의사결정에 필요한 질문 3개를 정리해 줘.', output:'공통 결론 · 고객 유지율 개선이 최우선\n차이 · A 보고서는 가격, B 보고서는 온보딩을 주요 원인으로 판단\n추가 질문 · 이탈 고객군별 원인이 같은가?' },
    gemini:{ type:'조사 정리', input:'친환경 포장재 시장을 고객, 경쟁사, 기회, 위험 관점에서 조사할 항목과 결과표 구조를 만들어 줘.', output:'조사표 · 고객군 / 구매 기준 / 경쟁사 / 가격대\n기회 · 규제 대응 수요와 브랜드 차별화\n위험 · 원재료 비용과 인증 확인 필요' },
    notebooklm:{ type:'근거 중심 요약', input:'올린 자료만 근거로 핵심 주장 5개를 요약하고 각 주장 옆에 근거가 있는 자료와 페이지를 표시해 줘.', output:'주장 1 · 신규 고객보다 기존 고객 유지가 효율적\n근거 · 2026 운영보고서 p.18\n자료에서 확인되지 않은 내용 · 경쟁사 평균 유지율' },
    perplexity:{ type:'출처 포함 조사', input:'최근 1년 한국 생성형 AI 교육 시장의 주요 변화 5개를 출처 링크와 발표일을 포함해 조사해 줘.', output:'변화 요약 · 기업 실무 교육 수요 확대\n근거 · 기관명 / 발표일 / 원문 링크\n추가 확인 · 조사 표본과 시장 규모 산정 기준' },
    canva:{ type:'카드뉴스', input:'AI 초보자가 지켜야 할 보안 수칙을 6장 카드뉴스로 만들어 줘. 네이비와 라임 색상을 사용해 줘.', output:'1장 · AI에 넣으면 안 되는 정보 3가지\n2~5장 · 개인정보 / 회사 기밀 / 계약 자료 / 확인 방법\n6장 · 저장하고 팀원과 공유하세요' },
    firefly:{ type:'제품 이미지 시안', input:'밝은 스튜디오 배경에 놓인 친환경 텀블러 제품 사진. 자연광, 깨끗한 그림자, 광고용 정사각형 구도.', output:'시안 A · 흰 배경과 부드러운 자연광\n시안 B · 식물이 있는 친환경 분위기\n시안 C · 제품을 강조한 근접 구도' },
    midjourney:{ type:'콘셉트 이미지', input:'미래형 서울의 야간 골목, 네온과 비가 반사되는 영화적 장면, 넓은 화면, 사람은 작게 표현.', output:'콘셉트 시안 · 푸른 네온 중심\n구도 · 골목의 깊이와 빗물 반사 강조\n활용 · 영상 배경 또는 캠페인 무드보드' },
    capcut:{ type:'30초 쇼츠', input:'텀블러 세척법을 알려주는 30초 세로 영상을 장면, 자막, 내레이션 순서로 구성해 줘.', output:'0~3초 · “냄새나는 텀블러, 이렇게 씻으세요”\n4~20초 · 세척 3단계와 큰 자막\n21~30초 · 전후 비교와 저장 유도' },
    runway:{ type:'생성 영상 장면', input:'제품이 어두운 배경에서 천천히 회전하고 뒤에서 라임색 조명이 켜지는 5초 광고 영상.', output:'장면 · 정면 제품에서 30도 회전\n조명 · 2초부터 후면 라임색 확산\n마무리 · 제품 중앙 정지, 문구 공간 확보' },
    cursor:{ type:'코드 수정안', input:'로그인 후 저장 목록이 늦게 갱신되는 원인을 찾고, 최소 수정과 테스트를 작성해 줘.', output:'원인 후보 · 비동기 저장 완료 전 화면 렌더링\n수정 · 저장 요청을 기다린 뒤 상태 갱신\n테스트 · 성공 / 실패 / 연속 클릭 3개 경우 확인' },
    'github-copilot':{ type:'코드와 테스트', input:'JavaScript 배열에서 중복 도구를 id 기준으로 제거하는 함수와 테스트를 작성해 줘.', output:'함수 · Map을 이용해 id별 마지막 항목 유지\n테스트 · 빈 배열 / 중복 없음 / 같은 id 2개\n주의 · 원본 배열을 변경하지 않음' },
    'notion-ai':{ type:'프로젝트 업데이트', input:'이번 주 프로젝트 메모를 완료, 진행 중, 위험, 다음 주 할 일로 정리해 줘.', output:'완료 · 랜딩페이지 시안 확정\n진행 중 · 뉴스 자동 수집 검수\n위험 · 가격 정보 확인 지연\n다음 주 · 주요 도구 20개 재검증' },
    'microsoft-copilot':{ type:'업무 요약', input:'회의 내용에서 경영진에게 보낼 5줄 요약과 담당자별 후속 이메일 초안을 만들어 줘.', output:'경영진 요약 · 일정 / 비용 / 주요 위험\n후속 이메일 · 담당 업무와 마감일 명시\n확인 필요 · 승인 담당자와 최종 예산' },
    ideogram:{ type:'문구 포함 포스터', input:'“AI를 쉽게, 내 일에 맞게” 문구가 크게 보이는 한국어 포스터. 네이비 배경과 라임 포인트.', output:'포스터 시안 · 중앙 한국어 문구 강조\n보조 요소 · AI 탐색을 상징하는 나침반\n하단 · 서비스 주소와 시작 버튼 영역' },
    'kling-ai':{ type:'숏폼 영상 장면', input:'카페 테이블 위 노트북 화면이 켜지고 AI 대시보드가 나타나는 6초 세로 영상. 부드러운 카메라 이동.', output:'0~2초 · 어두운 노트북 화면\n2~5초 · 화면 점등과 대시보드 등장\n5~6초 · 카메라가 천천히 가까워지며 정지' },
    heygen:{ type:'아바타 안내 영상', input:'처음 방문한 사용자를 위한 40초 AI 진단 사용법 안내 대본을 친근한 말투로 읽어 줘.', output:'도입 · “어떤 AI를 써야 할지 고민되셨나요?”\n설명 · 5개 질문 선택 방법\n마무리 · 추천 결과에서 비교 버튼 안내' },
    gamma:{ type:'발표자료 초안', input:'중소기업의 AI 도입 계획을 문제, 목표, 실행 단계, 예산, 기대효과 순서의 8장 발표자료로 만들어 줘.', output:'1장 · AI 도입 목적\n2~3장 · 현재 반복 업무와 문제\n4~6장 · 3단계 실행 계획\n7~8장 · 예산과 측정 지표' },
    elevenlabs:{ type:'내레이션 음성', input:'다음 제품 소개 문장을 차분하고 신뢰감 있는 한국어 안내 음성으로 읽어 줘. 속도는 조금 느리게.', output:'음성 방향 · 차분함 / 중저음 / 느린 속도\n강조 · 제품명과 핵심 효익\n활용 · 30초 제품 영상 내레이션' },
    n8n:{ type:'자동화 흐름', input:'문의 폼이 제출되면 내용을 AI로 분류하고 담당자에게 알림을 보낸 뒤 스프레드시트에 기록하는 흐름을 설계해 줘.', output:'트리거 · 새 문의 제출\n처리 · AI가 영업 / 지원 / 제휴로 분류\n실행 · 담당자 알림 + 시트 기록\n예외 · 분류 실패 시 관리자 검토함으로 이동' }
  };

  async function copyPrompt(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('프롬프트를 복사했어요.');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
      showToast('프롬프트를 복사했어요.');
    }
  }

  function openTool(tool) {
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = tool.name;
    $('#modal-kicker').textContent = `${koreanToolName(tool) ? koreanToolName(tool) + ' · ' : ''}${tool.maker} · AI 도구 상세 정보`;
    const strengths = tool.strengths?.length ? tool.strengths : ['핵심 기능은 공식 페이지에서 확인해 주세요.'];
    const bestFor = tool.bestFor?.length ? tool.bestFor : ['활용 목적을 확인 중입니다.'];
    const officialLink = tool.officialUrl && tool.officialUrl !== '#'
      ? `<a class="tool-detail-link" href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 사이트 열기 →</a>`
      : '';
    const prompt = starterPrompt(tool);
    const profile = deepToolProfiles[String(tool.id)];
    const sample = toolResultSamples[String(tool.id)];
    const sampleContent = sample ? `
      <section class="result-preview">
        <div class="result-preview-heading"><div><span>편집팀 제작 활용 예시</span><h4>${escapeHtml(sample.type)} 결과물 미리보기</h4></div><button type="button" data-copy-example>입력 예시 복사</button></div>
        <div class="result-preview-grid">
          <div class="result-input"><small>입력 예시</small><p>${escapeHtml(sample.input)}</p></div>
          <div class="result-output"><small>예상 결과 형태</small><pre>${escapeHtml(sample.output)}</pre></div>
        </div>
        <p class="result-disclaimer">실제 결과는 입력 내용·모델·요금제·서비스 업데이트에 따라 달라질 수 있습니다.</p>
      </section>` : '';
    const deepContent = profile ? `
      <div class="deep-guide-label">✓ 주요 AI 심층 가이드</div>
      <section class="tool-result-example"><span>이 도구로 만들 수 있는 결과 예시</span><p>${escapeHtml(profile.outcome)}</p></section>
      <div class="tool-fit-grid">
        <section class="tool-fit-card good"><h4>특히 잘하는 일</h4>${detailList(profile.best, 'positive')}</section>
        <section class="tool-fit-card caution"><h4>다른 도구가 나을 때</h4>${detailList(profile.notBest, 'caution')}</section>
      </div>
      <section class="tool-detail-section"><h4>비슷한 AI와 어떤 차이가 있나요?</h4><div class="tool-alternatives">${profile.alternatives.map(([id, note]) => { const alternative = state.tools.find(item => String(item.id) === id); return alternative ? `<button type="button" data-detail="${escapeHtml(alternative.id)}"><strong>${escapeHtml(displayToolName(alternative))}</strong><span>${escapeHtml(note)}</span><b>상세 보기 →</b></button>` : ''; }).join('')}</div></section>
    ` : '';
    $('#modal-body').innerHTML = `
      <p class="tool-detail-intro">${escapeHtml(tool.description || tool.reason)}</p>
      ${verificationMarkup(tool)}
      ${sampleContent}
      ${deepContent}
      <div class="tool-detail-grid">
        <div class="tool-detail-stat"><small>가격</small><strong>${escapeHtml(tool.price)}</strong></div>
        <div class="tool-detail-stat"><small>초보 난이도</small><strong>${difficultyLabel(tool.ease)}</strong></div>
        <div class="tool-detail-stat"><small>한국어</small><strong>${escapeHtml(tool.korean)}/5</strong></div>
        <div class="tool-detail-stat"><small>품질</small><strong>${escapeHtml(tool.quality)}/5</strong></div>
      </div>
      <section class="tool-detail-section"><h4>이런 작업에 추천</h4>${detailList(bestFor, 'positive')}</section>
      <section class="tool-detail-section"><h4>핵심 장점</h4>${detailList(strengths, 'positive')}</section>
      <section class="tool-detail-section"><h4>사용 전 확인할 점</h4>${detailList(toolLimitations(tool), 'caution')}</section>
      <section class="tool-detail-section"><h4>바로 써보는 실전 프롬프트</h4><div class="prompt-box"><button class="prompt-copy-btn" type="button" data-copy-prompt>프롬프트 복사</button><pre>${escapeHtml(prompt)}</pre></div><p class="prompt-help">[대괄호] 안의 내용만 내 상황에 맞게 바꿔서 사용하세요.</p></section>
      <div class="tool-detail-footer"><span class="tool-detail-verified">가격·무료 범위·기능은 변경될 수 있으므로 결제 전에 공식 출처를 다시 확인하세요.</span><button class="methodology-link" type="button" data-open-methodology>추천 기준 보기</button>${officialLink}</div>`;
    $('#modal').classList.add('open');
    recordToolEvent(tool.id, 'view');
    bindCardActions();
    $('[data-copy-example]')?.addEventListener('click', () => copyPrompt(sample.input));
    $('[data-open-methodology]')?.addEventListener('click', () => {
      $('#modal').classList.remove('open');
      scrollToId('methodology');
    });
    $('[data-copy-prompt]')?.addEventListener('click', () => copyPrompt(prompt));
  }

  async function toggleSave(id, button) {
    const saving = !state.saved.has(id);
    if (saving) state.saved.add(id); else state.saved.delete(id);
    saveLocalState();
    if (saving) recordToolEvent(id, 'save');
    if (state.connected && state.user) {
      try {
        if (saving) {
          const { error } = await supabaseClient.from('saved_tools').upsert({ user_id: state.user.id, tool_id: id });
          if (error) throw error;
        } else {
          const { error } = await supabaseClient.from('saved_tools').delete().eq('user_id', state.user.id).eq('tool_id', id);
          if (error) throw error;
        }
      } catch (error) {
        if (saving) state.saved.delete(id); else state.saved.add(id);
        saveLocalState();
        showToast(`저장 동기화 실패: ${error.message || '권한을 확인해 주세요.'}`);
        return;
      }
    } else if (state.connected && !state.user) {
      showToast('로그인하면 저장 목록이 여러 기기에서 동기화돼요.');
    }
    showToast(saving ? 'AI 도구를 저장했어요.' : '저장 목록에서 삭제했어요.');
    renderRecommendations(); renderDirectory(); renderSaved(); renderUpdates();
  }

  function renderCompareTray() {
    const selected = state.tools.filter(tool => state.compare.has(tool.id));
    $('#compare-tray').hidden = selected.length === 0;
    $('#compare-count').textContent = selected.length;
    $('#compare-names').textContent = selected.length ? selected.map(tool => tool.name).join(' · ') : '비교할 AI를 2개 이상 선택하세요.';
    $('#compare-open').disabled = selected.length < 2;
  }

  function toggleCompare(id) {
    if (state.compare.has(id)) {
      state.compare.delete(id);
    } else {
      if (state.compare.size >= 3) { showToast('AI는 최대 3개까지 비교할 수 있어요.'); return; }
      state.compare.add(id);
      recordToolEvent(id, 'compare');
    }
    renderRecommendations(); renderDirectory(); renderSaved(); renderCompareTray();
    if (!$('#compare-page').hidden) renderComparePage();
  }

  function clearCompare() {
    state.compare.clear();
    renderRecommendations(); renderDirectory(); renderSaved(); renderCompareTray();
    $('#compare-page').hidden = true;
  }

  function easeLabel(value) {
    if (value >= 5) return '매우 쉬움';
    if (value >= 4) return '쉬움';
    if (value >= 3) return '보통';
    return '어려움';
  }

  function compareWinners(selected, key) {
    const highest = Math.max(...selected.map(tool => Number(tool[key]) || 0));
    return selected.filter(tool => Number(tool[key]) === highest).map(tool => displayToolName(tool)).join(' · ');
  }

  function renderComparePage() {
    const selected = state.tools.filter(tool => state.compare.has(tool.id));
    if (selected.length < 2) { $('#compare-page').hidden = true; return; }
    const cells = mapper => selected.map(mapper).join('');
    $('#compare-page-count').textContent = selected.length;
    $('#compare-page-cards').innerHTML = selected.map(tool => `<article class="compare-product-card">
      <button class="compare-remove" type="button" data-compare-remove="${escapeHtml(tool.id)}" aria-label="${escapeHtml(tool.name)} 비교에서 제외">×</button>
      ${toolLogoMarkup(tool)}
      <div class="compare-product-name"><h3>${escapeHtml(tool.name)}</h3>${koreanToolName(tool) ? `<em>${escapeHtml(koreanToolName(tool))}</em>` : ''}<p>${escapeHtml(tool.maker)}</p></div>
      <span class="price">${escapeHtml(tool.price)}</span>
      <button class="detail-btn" type="button" data-detail="${escapeHtml(tool.id)}">상세 보기</button>
    </article>`).join('');
    $('#compare-page-table').innerHTML = `<table class="compare-table dedicated">
      <tr><th>비교 항목</th>${cells(tool => `<td><div class="compare-name">${escapeHtml(tool.name)}</div>${koreanToolName(tool) ? `<small class="compare-name-ko">${escapeHtml(koreanToolName(tool))}</small>` : ''}</td>`)}</tr>
      <tr><th>가격·무료 범위</th>${cells(tool => `<td><strong>${escapeHtml(tool.price)}</strong><small class="compare-sub">${escapeHtml(tool.freeLimit || '무료 범위는 공식 페이지에서 확인')}</small></td>`)}</tr>
      <tr><th>한국어 품질</th>${cells(tool => `<td><span class="compare-stars">${'★'.repeat(tool.korean)}${'☆'.repeat(5 - tool.korean)}</span><small class="compare-sub">${tool.korean}/5점</small></td>`)}</tr>
      <tr><th>결과물 품질</th>${cells(tool => `<td><span class="compare-stars">${'★'.repeat(tool.quality)}${'☆'.repeat(5 - tool.quality)}</span><small class="compare-sub">${tool.quality}/5점</small></td>`)}</tr>
      <tr><th>초보자 난이도</th>${cells(tool => `<td><strong>${easeLabel(tool.ease)}</strong><small class="compare-sub">${tool.ease}/5점</small></td>`)}</tr>
      <tr><th>추천 업무</th>${cells(tool => `<td>${escapeHtml(tool.bestFor.join(' · '))}</td>`)}</tr>
      <tr><th>핵심 장점</th>${cells(tool => `<td>${escapeHtml(tool.strengths.join(' · '))}</td>`)}</tr>
      <tr><th>사용 전 확인</th>${cells(tool => `<td>${escapeHtml(toolLimitations(tool).join(' · '))}</td>`)}</tr>
      <tr><th>최근 확인</th>${cells(tool => `<td>${escapeHtml(tool.verifiedAt || '확인일 미정')}</td>`)}</tr>
      <tr><th>공식 사이트</th>${cells(tool => `<td>${tool.officialUrl && tool.officialUrl !== '#' ? `<a href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 사이트 열기 →</a>` : '링크 확인 중'}</td>`)}</tr>
    </table>`;
    const overall = [...selected].sort((a, b) => (b.quality + b.ease + b.korean + b.costFit + b.privacy) - (a.quality + a.ease + a.korean + a.costFit + a.privacy))[0];
    $('#compare-verdicts').innerHTML = `
      <article><span>🏆 종합 추천</span><strong>${escapeHtml(displayToolName(overall))}</strong><p>품질·난이도·한국어·가격·보안을 고르게 고려했어요.</p></article>
      <article><span>🌱 초보자 추천</span><strong>${escapeHtml(compareWinners(selected, 'ease'))}</strong><p>처음 사용할 때 배우기 쉬운 도구예요.</p></article>
      <article><span>🇰🇷 한국어 추천</span><strong>${escapeHtml(compareWinners(selected, 'korean'))}</strong><p>한국어 입력과 결과 품질 점수가 높아요.</p></article>
      <article><span>💰 비용 효율</span><strong>${escapeHtml(compareWinners(selected, 'costFit'))}</strong><p>무료 범위와 가격 적합도를 기준으로 골랐어요.</p></article>`;
    $('#compare-page').hidden = false;
    $$('#compare-page [data-compare-remove]').forEach(button => button.addEventListener('click', () => toggleCompare(button.dataset.compareRemove)));
    bindCardActions();
  }

  function openCompare() {
    const selected = state.tools.filter(tool => state.compare.has(tool.id));
    if (selected.length < 2) { showToast('비교할 AI를 2개 이상 선택해 주세요.'); return; }
    renderComparePage();
    $('#compare-page').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`${selected.length}개 AI의 전용 비교표를 만들었어요.`);
  }

  function bindCompare() {
    $('#compare-open').addEventListener('click', openCompare);
    $('#compare-clear').addEventListener('click', clearCompare);
    $('#compare-page-reset').addEventListener('click', clearCompare);
    $('#compare-page-close').addEventListener('click', () => { $('#compare-page').hidden = true; scrollToId('directory'); });
    renderCompareTray();
  }

  function bindCardActions() {
    $$('[data-compare]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', event => { event.stopPropagation(); toggleCompare(button.dataset.compare); });
    });
    $$('[data-save]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', event => { event.stopPropagation(); toggleSave(button.dataset.save, button); });
    });
    $$('[data-detail]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', event => { event.stopPropagation(); const tool = state.tools.find(item => item.id === button.dataset.detail); if (tool) openTool(tool); });
    });
  }

  async function shareSite() {
    const shareData = {
      title: 'AI 네비게이터 — 내 일에 맞는 AI를 1분 만에',
      text: '가격·한국어·난이도를 비교하고 내 업무에 맞는 AI를 찾아보세요.',
      url: 'https://ai-navigator-ebon.vercel.app/?share=20260720'
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      showToast('공유 주소를 복사했어요. 카카오톡에 붙여 넣어 주세요.');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(shareData.url);
          showToast('공유 주소를 복사했어요. 카카오톡에 붙여 넣어 주세요.');
        } catch (_) {
          showToast('공유 주소: ai-navigator-ebon.vercel.app');
        }
      }
    }
  }

  const legalContent = {
    about: {
      kicker: '서비스 소개',
      title: 'AI 네비게이터는 어떤 서비스인가요?',
      body: `<div class="legal-copy"><p>AI 네비게이터는 한국 사용자가 업무 목적, 가격, 한국어 품질, 사용 난이도와 보안 조건을 비교해 적합한 AI 도구를 찾도록 돕는 정보 서비스입니다.</p><h4>정보 제공 원칙</h4><ul><li>공식 홈페이지와 제품 안내를 우선 확인합니다.</li><li>추천 결과는 선택을 돕는 참고자료이며 구매나 성능을 보장하지 않습니다.</li><li>가격과 기능은 변경될 수 있으므로 이용 전 공식 페이지에서 다시 확인해 주세요.</li></ul><h4>정보 수정 요청</h4><p>잘못되거나 오래된 정보는 하단의 ‘문의·정보 수정 요청’을 통해 알려주시면 확인 후 반영합니다.</p></div>`
    },
    privacy: {
      kicker: '개인정보 처리방침',
      title: '개인정보를 어떻게 다루나요?',
      body: `<div class="legal-copy"><p class="legal-updated">시행일: 2026년 7월 21일</p><h4>수집하는 정보</h4><ul><li>비회원: 브라우저에 생성되는 익명 방문자 식별값, AI 상세 조회·저장·비교 이용 기록</li><li>회원: 회원가입과 로그인에 사용하는 이메일 주소, 저장한 AI 목록</li><li>자동 생성 정보: 접속 시각, 기능 이용 기록과 오류 정보</li></ul><h4>이용 목적</h4><p>로그인, 저장 목록 동기화, 서비스 이용 통계, 추천과 기능 개선, 오류 대응을 위해 사용합니다.</p><h4>저장 위치와 외부 서비스</h4><p>회원 인증과 데이터 저장에는 Supabase를, 사이트 제공에는 Vercel을 사용합니다. 비회원 저장 목록과 읽음 상태 일부는 사용자의 브라우저 저장소에 보관됩니다.</p><h4>보관 및 삭제</h4><p>브라우저 데이터는 사용자가 브라우저 설정에서 삭제할 수 있습니다. 회원 정보는 계정 이용 중 보관하며 삭제 요청이 확인되면 관련 법령상 필요한 경우를 제외하고 처리합니다.</p><h4>주의 사항</h4><p>AI 네비게이터의 검색창과 진단에는 개인정보나 회사 기밀을 입력하지 마세요. 선택한 진단 조건은 추천 계산에만 사용됩니다.</p><h4>문의</h4><p>개인정보 열람·정정·삭제 요청은 하단의 ‘문의·정보 수정 요청’을 이용해 주세요.</p></div>`
    },
    terms: {
      kicker: '이용 안내',
      title: '서비스 이용 시 확인해 주세요',
      body: `<div class="legal-copy"><p class="legal-updated">시행일: 2026년 7월 21일</p><h4>정보의 성격</h4><p>AI 도구 추천, 가격, 기능, 순위와 뉴스는 일반적인 정보 제공을 위한 자료입니다. 특정 제품의 구매, 성능, 안전성 또는 업무 결과를 보장하지 않습니다.</p><h4>사용자의 확인 책임</h4><p>AI 서비스의 가격, 무료 범위, 이용약관과 데이터 처리 방식은 수시로 변경될 수 있습니다. 결제하거나 중요한 자료를 입력하기 전에 해당 서비스의 공식 안내를 확인해야 합니다.</p><h4>콘텐츠 이용</h4><p>사이트의 자체 작성 콘텐츠를 무단으로 대량 복제하거나 자동 수집해 재판매해서는 안 됩니다. 연결된 외부 사이트와 상표의 권리는 각 권리자에게 있습니다.</p><h4>서비스 변경</h4><p>서비스 품질과 보안을 위해 기능이나 제공 범위를 변경할 수 있으며, 중요한 변경은 사이트에서 안내합니다.</p><h4>문의와 수정</h4><p>권리 침해, 잘못된 정보 또는 서비스 문제는 하단의 문의 창구를 통해 알려 주세요.</p></div>`
    }
  };

  function openLegal(type) {
    const content = legalContent[type];
    if (!content) return;
    $('#modal').classList.remove('compare-open');
    $('#modal-kicker').textContent = content.kicker;
    $('#modal-title').textContent = content.title;
    $('#modal-body').innerHTML = content.body;
    $('#modal').classList.add('open');
  }

  function bindNavigation() {
    $$('[data-scroll]').forEach(btn => btn.addEventListener('click', event => { event.preventDefault(); scrollToId(btn.dataset.scroll); }));
    window.addEventListener('popstate', () => {
      const id = location.hash.slice(1) || 'top';
      showView(document.getElementById(id) || id === 'top' ? id : 'top');
      requestAnimationFrame(() => (id === 'top' ? document.getElementById('top') : document.getElementById(id))?.scrollIntoView({ block: 'start' }));
    });
    $$('[data-legal]').forEach(button => button.addEventListener('click', () => openLegal(button.dataset.legal)));
    $('#share-site')?.addEventListener('click', shareSite);
    $$('[data-toast]').forEach(btn => btn.addEventListener('click', event => { event.preventDefault(); showToast(btn.dataset.toast); }));
  }

  function bindSearch() {
    $('#recommend-form').addEventListener('submit', event => {
      event.preventDefault();
      const value = $('#search-input').value.trim();
      if (!value) { showToast('하고 싶은 일을 한 문장으로 입력해 주세요.'); return; }
      state.query = value; renderRecommendations(value); scrollToId('recommend'); showToast(`“${value}” 기준으로 추천을 업데이트했어요.`);
    });
    $$('.quick-chip').forEach(chip => chip.addEventListener('click', () => { $('#search-input').value = chip.textContent; $('#recommend-form').requestSubmit(); }));
    $$('.use-case').forEach(button => button.addEventListener('click', () => { $('#search-input').value = button.dataset.query; $('#recommend-form').requestSubmit(); }));
  }

  function bindDiagnosis() {
    $('#diagnosis-form').addEventListener('submit', event => {
      event.preventDefault();
      const goal = $('#diagnosis-goal').value;
      if (!goal) { showToast('먼저 필요한 업무를 선택해 주세요.'); $('#diagnosis-goal').focus(); return; }
      runDiagnosis({
        goal,
        level: $('#diagnosis-level').value,
        budget: $('#diagnosis-budget').value,
        korean: $('#diagnosis-korean').value,
        privacy: $('#diagnosis-privacy').value
      });
      showToast('조건에 맞는 AI 3개를 찾았어요.');
    });
    $('#diagnosis-retry').addEventListener('click', () => {
      $('#diagnosis-result').hidden = true;
      $('#diagnosis-goal').focus();
      $('#diagnosis-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function bindFilters() {
    $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
      $$('[data-filter]').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.category = button.dataset.filter; renderDirectory();
    }));
    $('#directory-search').addEventListener('input', event => { state.directoryQuery = event.target.value; renderDirectory(); });
    $('#directory-sort').addEventListener('change', event => { state.directorySort = event.target.value; renderDirectory(); });
    $('#price-filter').addEventListener('change', event => { state.priceFilter = event.target.value; renderDirectory(); });
    $('#korean-filter').addEventListener('change', event => { state.koreanFilter = event.target.value; renderDirectory(); });
    $('#filter-reset').addEventListener('click', () => {
      state.category = 'all'; state.priceFilter = 'all'; state.koreanFilter = 'all'; state.directoryQuery = ''; state.directorySort = 'recommended';
      $$('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
      $('#directory-search').value = ''; $('#directory-sort').value = 'recommended'; $('#price-filter').value = 'all'; $('#korean-filter').value = 'all';
      renderDirectory(); showToast('검색과 필터를 초기화했어요.');
    });
  }

  function bindModal() {
    $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => $('#modal').classList.remove('open')));
    $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) $('#modal').classList.remove('open'); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#modal').classList.remove('open'); $('#auth-modal').classList.remove('open'); } });
  }

  function setConnectionStatus() {
    const status = $('#data-status');
    status.textContent = state.connected ? 'Supabase 연결됨' : '데모 모드';
    status.classList.toggle('connected', state.connected);
  }

  function updateProfileUI() {
    const user = state.user;
    const name = state.profile?.display_name || user?.email?.split('@')[0] || '게스트';
    const initial = name.slice(0, 1).toUpperCase();
    $('#profile-name').textContent = user ? name : '게스트';
    $('#profile-type').textContent = user ? (state.isAdmin ? '관리자 · 저장 동기화 중' : '회원 · 저장 동기화 중') : (state.connected ? '로그인하면 저장 동기화' : '브라우저 저장 모드');
    $('#profile-avatar').textContent = initial;
    $('#top-auth-action').textContent = initial;
    $('#top-auth-action').setAttribute('aria-label', user ? '로그아웃' : '로그인');
    $('#auth-action').textContent = user ? '↙' : '↗';
    $('#auth-action').setAttribute('aria-label', user ? '로그아웃' : '로그인');
    $('#admin-nav').hidden = !state.isAdmin;
    $('#admin').hidden = !state.isAdmin;
    renderSaved();
  }

  async function syncSavedFromCloud() {
    if (!supabaseClient || !state.user) return;
    const { data, error } = await supabaseClient.from('saved_tools').select('tool_id').eq('user_id', state.user.id);
    if (error) { showToast('저장 목록을 불러오지 못했어요.'); return; }
    state.saved = new Set((data || []).map(row => row.tool_id));
    saveLocalState(); renderRecommendations(); renderDirectory(); renderSaved(); renderUpdates();
  }

  async function loadPublicData() {
    if (!supabaseClient) return;
    try {
      const toolResponse = await supabaseClient.from('tools').select('*').eq('is_published', true).order('name');
      if (!toolResponse.error && toolResponse.data?.length) {
        const remoteTools = toolResponse.data.map(mapTool);
        state.tools = [...remoteTools, ...localTools.filter(local => !remoteTools.some(remote => String(remote.id) === String(local.id)))];
      }
      const newsResponse = await supabaseClient.from('news').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(20);
      if (!newsResponse.error && newsResponse.data?.length) { state.news = newsResponse.data.map(mapNews); state.remoteNews = true; }
    } catch (error) {
      showToast('원격 데이터를 불러오지 못해 데모 데이터로 표시합니다.');
    }
    updatePageDates();
  renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderTemplates(); renderPromptRecipes(); renderPopularity(); renderUpdates(); renderNews();
    await Promise.all([loadPopularity(), loadToolUpdates()]);
  }

  async function applySession(session) {
    state.user = session?.user || null;
    state.profile = null;
    state.isAdmin = false;
    if (state.user && supabaseClient) {
      const { data } = await supabaseClient.from('profiles').select('display_name, role').eq('id', state.user.id).maybeSingle();
      state.profile = data || null;
      state.isAdmin = data?.role === 'admin' || (config.adminEmails || []).includes(state.user.email);
      await syncSavedFromCloud();
      if (state.isAdmin) await loadAdminNews();
    }
    updateProfileUI();
  }

  function openAuth(mode = 'signin') {
    state.authMode = mode;
    $$('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authMode === mode));
    $('#auth-title').textContent = mode === 'signin' ? '로그인' : '회원가입';
    $('#auth-submit').textContent = mode === 'signin' ? '로그인' : '계정 만들기';
    $('#auth-message').textContent = '';
    $('#auth-modal').classList.add('open');
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!supabaseClient) { setMessage('#auth-message', '먼저 config.js에 Supabase URL과 anon key를 입력해 주세요.', true); return; }
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const action = state.authMode === 'signin' ? supabaseClient.auth.signInWithPassword({ email, password }) : supabaseClient.auth.signUp({ email, password });
    const { data, error } = await action;
    if (error) { setMessage('#auth-message', error.message, true); return; }
    if (state.authMode === 'signup' && !data.session) setMessage('#auth-message', '가입 확인 이메일을 보냈어요. 이메일 인증 후 로그인해 주세요.');
    else { $('#auth-modal').classList.remove('open'); showToast('로그인했어요. 저장 목록을 동기화합니다.'); }
  }

  async function sendMagicLink() {
    if (!supabaseClient) { setMessage('#auth-message', 'Supabase 설정 후 이메일 링크를 사용할 수 있어요.', true); return; }
    const email = $('#auth-email').value.trim();
    if (!email) { setMessage('#auth-message', '이메일을 먼저 입력해 주세요.', true); return; }
    const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    setMessage('#auth-message', error ? error.message : '로그인 링크를 이메일로 보냈어요.', Boolean(error));
  }

  async function signOut() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    showToast('로그아웃했어요.');
  }

  function bindAuth() {
    ['#auth-action', '#top-auth-action'].forEach(selector => $(selector).addEventListener('click', () => state.user ? signOut() : openAuth()));
    $('[data-close-auth]').addEventListener('click', () => $('#auth-modal').classList.remove('open'));
    $('#auth-modal').addEventListener('click', event => { if (event.target === $('#auth-modal')) $('#auth-modal').classList.remove('open'); });
    $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => openAuth(tab.dataset.authMode)));
    $('#auth-form').addEventListener('submit', submitAuth);
    $('#magic-link').addEventListener('click', sendMagicLink);
  }

  function statusLabel(status) { return { draft: '초안', review: '검수 중', published: '발행' }[status] || status; }

  function renderAdminNews(rows = []) {
    $('#admin-news-list').innerHTML = rows.length ? rows.map(row => `<div class="admin-news-row"><div class="admin-news-copy"><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.source || '출처 미정')} · ${escapeHtml(formatDate(row.published_at))}</small></div><span class="status-chip status-${escapeHtml(row.status)}">${statusLabel(row.status)}</span><div class="admin-row-actions"><button class="mini-btn" data-admin-edit="${escapeHtml(row.id)}">수정</button><button class="mini-btn delete" data-admin-delete="${escapeHtml(row.id)}">삭제</button></div></div>`).join('') : '<div class="empty" style="display:block">아직 등록된 뉴스가 없습니다.</div>';
    $$('#admin-news-list [data-admin-edit]').forEach(button => button.addEventListener('click', () => fillAdminForm(rows.find(row => row.id === button.dataset.adminEdit))));
    $$('#admin-news-list [data-admin-delete]').forEach(button => button.addEventListener('click', () => deleteAdminNews(button.dataset.adminDelete)));
  }

  async function loadAdminSources() {
    if (!state.isAdmin || !supabaseClient) return;
    const { data, error } = await supabaseClient.from('news_sources').select('*').order('publisher');
    if (error) { $('#admin-source-list').innerHTML = `<div class="empty" style="display:block">소스 상태를 불러오지 못했어요.</div>`; return; }
    $('#admin-source-list').innerHTML = data?.length ? data.map(source => {
      const health = source.last_error ? 'error' : source.last_success_at ? 'ok' : '';
      const status = source.last_error ? `오류: ${source.last_error}` : source.last_success_at ? `최근 성공 ${formatDateTime(source.last_success_at)}` : '아직 수집 전';
      return `<div class="source-row"><i class="source-health ${health}"></i><div class="source-copy"><strong>${escapeHtml(source.publisher)} · ${escapeHtml(source.name)}</strong><small title="${escapeHtml(source.feed_url)}">${escapeHtml(status)}</small></div><span class="source-count">${Number(source.item_count || 0)}건</span></div>`;
    }).join('') : '<div class="empty" style="display:block">등록된 수집 소스가 없습니다.</div>';
  }

  async function loadAdminNews() {
    if (!state.isAdmin || !supabaseClient) return;
    const { data, error } = await supabaseClient.from('news').select('*').order('created_at', { ascending: false });
    if (error) { setMessage('#admin-message', error.message, true); return; }
    renderAdminNews(data || []);
    $('#admin-list-caption').textContent = `${data?.length || 0}개 콘텐츠 · Supabase`;
    await loadAdminSources();
  }

  function formatDateTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  function fillAdminForm(row) {
    if (!row) return;
    $('#admin-news-id').value = row.id;
    $('#admin-news-title').value = row.title || '';
    $('#admin-news-summary').value = row.summary || '';
    $('#admin-news-body').value = row.body || '';
    $('#admin-news-insight').value = row.insight || '';
    $('#admin-news-category').value = row.category || '';
    $('#admin-news-label').value = row.label || 'INSIGHT';
    $('#admin-news-source').value = row.source || '';
    $('#admin-news-source-url').value = row.source_url || '';
    $('#admin-news-date').value = row.published_at || '';
    $('#admin-news-status').value = row.status || 'draft';
    $('#admin-form-title').textContent = '뉴스 수정';
    scrollToId('admin');
  }

  function resetAdminForm() {
    $('#admin-news-form').reset();
    $('#admin-news-id').value = '';
    $('#admin-news-label').value = 'INSIGHT';
    $('#admin-news-form').querySelector('#admin-news-status').value = 'draft';
    $('#admin-form-title').textContent = '새 뉴스 작성';
    setMessage('#admin-message', '');
  }

  async function submitAdminNews(event) {
    event.preventDefault();
    if (!state.isAdmin || !supabaseClient) return;
    const id = $('#admin-news-id').value || slugify($('#admin-news-title').value);
    const payload = { id, title: $('#admin-news-title').value.trim(), summary: $('#admin-news-summary').value.trim(), body: $('#admin-news-body').value.trim(), insight: $('#admin-news-insight').value.trim(), category: $('#admin-news-category').value.trim() || 'insight', label: $('#admin-news-label').value.trim() || 'INSIGHT', source: $('#admin-news-source').value.trim() || 'AI 네비게이터 편집팀', source_url: $('#admin-news-source-url').value.trim() || '#', published_at: $('#admin-news-date').value || null, status: $('#admin-news-status').value, author_id: state.user.id };
    const { error } = await supabaseClient.from('news').upsert(payload);
    if (error) { setMessage('#admin-message', error.message, true); return; }
    setMessage('#admin-message', '뉴스를 저장했어요.'); resetAdminForm(); await loadAdminNews(); await loadPublicData();
  }

  async function deleteAdminNews(id) {
    if (!state.isAdmin || !supabaseClient || !window.confirm('이 뉴스 콘텐츠를 삭제할까요?')) return;
    const { error } = await supabaseClient.from('news').delete().eq('id', id);
    if (error) { setMessage('#admin-message', error.message, true); return; }
    showToast('뉴스를 삭제했어요.'); await loadAdminNews(); await loadPublicData();
  }

  function bindAdmin() {
    $('#admin-news-form').addEventListener('submit', submitAdminNews);
    $('#admin-news-reset').addEventListener('click', resetAdminForm);
    $('#admin-refresh').addEventListener('click', loadAdminNews);
  }

  async function initBackend() {
    setConnectionStatus();
    if (!supabaseClient) { updateProfileUI(); return; }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) showToast('로그인 상태를 확인하지 못했어요.');
    await applySession(data?.session || null);
    await loadPublicData();
    supabaseClient.auth.onAuthStateChange((_event, session) => { setTimeout(() => applySession(session), 0); });
  }

  renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderTemplates(); renderPopularity(); renderUpdates(); renderNews();
  showView(location.hash.slice(1) || 'top');
  bindNavigation(); bindSearch(); bindDiagnosis(); bindTemplates(); bindPromptRecipes(); bindPopularity(); bindUpdates(); bindFilters(); bindModal(); bindCompare(); bindAuth(); bindAdmin(); bindNewsExplorer();
  const sharedRecipe = new URLSearchParams(location.search).get('recipe');
  if (sharedRecipe) setTimeout(() => openPromptRecipe(sharedRecipe), 0);
  initBackend();
})();
