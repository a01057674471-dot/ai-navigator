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
    popularity: new Map(),
    popularityLive: false,
    popularityFilter: 'all',
    localPopularity: JSON.parse(localStorage.getItem('ai-navigator-popularity') || '{}')
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

  function scrollToId(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
    if (!value) return '날짜 미정';
    return String(value).slice(0, 10).replaceAll('-', '. ');
  }
  function mapTool(row) {
    return {
      id: row.id, name: row.name, maker: row.maker, logo: row.logo || '✦', logoClass: row.logo_class || 'logo-blue',
      categories: row.categories || [], bestFor: row.best_for || [], keywords: row.keywords || [],
      quality: row.quality ?? 3, korean: row.korean ?? 3, speed: row.speed ?? 3, privacy: row.privacy ?? 3, ease: row.ease ?? 3, costFit: row.cost_fit ?? 3,
      price: row.price || '정보 확인 필요', priceType: row.price_type || 'unknown', freeLimit: row.free_limit || '', strengths: row.strengths || [], reason: row.reason || '업무 조건에 맞는지 직접 비교해 보세요.', description: row.description || '', officialUrl: row.official_url || '#', verifiedAt: row.verified_at || '검증일 미정'
    };
  }
  function mapNews(row) {
    return { id: row.id, label: row.label, date: formatDate(row.published_at || row.date), title: row.title, summary: row.summary, insight: row.insight || '', category: row.category || 'insight', source: row.source || '출처 미정', sourceUrl: row.source_url || '#' };
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
    const reason = recommendation ? `<div class="recommend-reason">${escapeHtml(tool.reason)}</div>` : '';
    return `<article class="recommend-card" data-tool-id="${escapeHtml(tool.id)}">
      ${recommendation ? `<span class="rank">${String(index + 1).padStart(2, '0')}</span>` : ''}
      <div class="tool-head">${toolLogoMarkup(tool)}<div>${toolNameMarkup(tool)}<div class="tool-maker">${escapeHtml(tool.maker)}${deepToolProfiles[String(tool.id)] ? '<span class="deep-card-badge">심층 정보 · 예시</span>' : ''}</div></div></div>
      ${match}${reason}<div class="tag-row">${tags}</div>
      ${verificationMarkup(tool, true)}
      <div class="card-footer"><span class="price">${escapeHtml(tool.price)}</span><div class="card-actions"><button class="compare-btn ${state.compare.has(tool.id) ? 'selected' : ''}" data-compare="${escapeHtml(tool.id)}">${state.compare.has(tool.id) ? '✓ 비교중' : '+ 비교'}</button><button class="save-btn ${saved ? 'saved' : ''}" data-save="${escapeHtml(tool.id)}" aria-label="${saved ? '저장 취소' : '저장'}">${saved ? '♥ 저장됨' : '♡ 저장'}</button><button class="detail-btn" data-detail="${escapeHtml(tool.id)}">상세 보기</button></div></div>
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

  function runDiagnosis(answers) {
    const levelLabel = answers.level === 'beginner' ? '초보자' : answers.level === 'intermediate' ? '경험자' : '능숙한 사용자';
    const budgetLabel = answers.budget === 'free' ? '무료 사용' : answers.budget === 'value' ? '가격 대비 효율' : '성능';
    const ranked = state.tools
      .map(tool => ({ ...tool, total: diagnosisScore(tool, answers), reason: `${levelLabel}가 시작하기 좋고, ${budgetLabel}·한국어·보안 조건을 함께 반영한 추천입니다.` }))
      .sort((a, b) => b.total - a.total || b.quality - a.quality)
      .slice(0, 3);
    $('#diagnosis-title').textContent = `${ranked[0] ? displayToolName(ranked[0]) : 'AI'}를 가장 먼저 추천해요`;
    $('#diagnosis-caption').textContent = `${levelLabel} · ${budgetLabel} 기준으로 32개 AI를 비교한 결과예요.`;
    $('#diagnosis-grid').innerHTML = ranked.map((tool, index) => toolCard(tool, index, true)).join('');
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

  function popularityScore(tool) {
    const remote = state.popularity.get(String(tool.id));
    if (state.popularityLive && remote) return Number(remote.score) || 0;
    const local = state.localPopularity[tool.id] || {};
    return (Number(local.views) || 0) + (Number(local.saves) || 0) * 3 + (Number(local.compares) || 0) * 2;
  }

  function renderPopularity() {
    let tools = [...state.tools];
    if (state.popularityFilter === 'free') tools = tools.filter(tool => tool.priceType === 'free' || tool.priceType === 'freemium');
    if (state.popularityFilter === 'korean') tools = tools.filter(tool => Number(tool.korean) >= 4);
    if (state.popularityFilter === 'beginner') tools = tools.filter(tool => Number(tool.ease) >= 4);
    tools.sort((a, b) => popularityScore(b) - popularityScore(a) || b.quality - a.quality || b.costFit - a.costFit);
    const ranked = tools.slice(0, 5);
    $('#popularity-status').textContent = state.popularityLive ? '최근 30일 실제 이용 데이터' : '추천 순위 · 이용 데이터 수집 준비 중';
    $('#popularity-status').classList.toggle('live', state.popularityLive);
    $('#popularity-caption').textContent = state.popularityLive
      ? '상세 조회·저장·비교 선택을 개인정보 없이 합산했어요.'
      : '실시간 집계가 연결되면 사용자가 실제로 많이 찾은 순위로 자동 전환돼요.';
    $('#popularity-list').innerHTML = ranked.map((tool, index) => {
      const stats = state.popularity.get(String(tool.id)) || {};
      const local = state.localPopularity[tool.id] || {};
      const views = state.popularityLive ? Number(stats.views) || 0 : Number(local.views) || 0;
      const saves = state.popularityLive ? Number(stats.saves) || 0 : Number(local.saves) || 0;
      const compares = state.popularityLive ? Number(stats.compares) || 0 : Number(local.compares) || 0;
      return `<article class="popularity-row">
        <span class="popularity-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
        ${toolLogoMarkup(tool)}
        <div class="popularity-copy"><strong>${escapeHtml(tool.name)}</strong>${koreanToolName(tool) ? `<em>${escapeHtml(koreanToolName(tool))}</em>` : ''}<small>${escapeHtml(tool.bestFor.slice(0, 2).join(' · '))}</small></div>
        <div class="popularity-metrics">${state.popularityLive || popularityScore(tool) > 0 ? `<span>조회 ${views}</span><span>저장 ${saves}</span><span>비교 ${compares}</span>` : '<span>데이터 수집 전</span>'}</div>
        <button class="detail-btn" type="button" data-detail="${escapeHtml(tool.id)}">상세 보기</button>
      </article>`;
    }).join('');
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

  function renderDirectory() {
    let filtered = state.category === 'all' ? state.tools : state.tools.filter(tool => tool.categories.includes(state.category));
    if (state.priceFilter === 'free') filtered = filtered.filter(tool => tool.priceType === 'free' || tool.priceType === 'freemium');
    if (state.priceFilter === 'paid') filtered = filtered.filter(tool => tool.priceType === 'paid');
    if (state.koreanFilter !== 'all') filtered = filtered.filter(tool => Number(tool.korean) >= Number(state.koreanFilter));
    $('#directory-grid').innerHTML = filtered.map((tool, index) => toolCard(tool, index)).join('');
    $('#filter-count').textContent = filtered.length;
    $('#empty-directory').textContent = '선택한 조건에 맞는 AI 도구가 없어요. 필터를 초기화하거나 조건을 낮춰보세요.';
    $('#empty-directory').style.display = filtered.length ? 'none' : 'block';
    bindCardActions();
  }

  function newsItem(item, archive = false) {
    return `<a href="${escapeHtml(item.sourceUrl)}" class="news-item ${archive ? 'news-archive-card' : ''}" data-news-id="${escapeHtml(item.id)}">
      <div class="news-meta"><span>${escapeHtml(item.label)}</span><time>${escapeHtml(item.date)}</time></div>
      <p class="news-title">${escapeHtml(item.title)}</p>
      <p class="news-summary">${escapeHtml(item.summary)}</p>
      ${archive ? '<span class="news-read">전체 내용 보기 →</span>' : ''}
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
    $('.demo-badge').textContent = state.remoteNews ? '실시간 콘텐츠' : '데모 콘텐츠';
    $('.demo-badge').classList.toggle('connected', state.remoteNews);
    bindNewsActions();
  }

  function bindNewsActions() {
    $$('.news-item').forEach(item => {
      if (item.dataset.bound) return;
      item.dataset.bound = 'true';
      item.addEventListener('click', event => {
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
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = item.title;
    $('#modal-kicker').textContent = `${item.label} · ${item.date}`;
    $('#modal-body').innerHTML = `<p>${escapeHtml(item.summary)}</p><h4>왜 중요한가</h4><p>${escapeHtml(item.insight)}</p><h4>출처</h4><p>${escapeHtml(item.source)}</p>${!state.remoteNews ? '<p class="demo-note">현재 뉴스는 화면 검증을 위한 데모 콘텐츠입니다. Supabase를 연결하면 관리자 검수 후 발행된 뉴스가 표시됩니다.</p>' : ''}${item.sourceUrl !== '#' ? `<a class="modal-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">원문 출처 열기 →</a>` : ''}`;
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
    renderRecommendations(); renderDirectory(); renderSaved();
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

  function bindNavigation() {
    $$('[data-scroll]').forEach(btn => btn.addEventListener('click', () => scrollToId(btn.dataset.scroll)));
    const navButtons = $$('.nav-item, .mobile-nav button');
    navButtons.forEach(button => button.addEventListener('click', () => { navButtons.forEach(item => item.classList.remove('active')); button.classList.add('active'); }));
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
    $('#price-filter').addEventListener('change', event => { state.priceFilter = event.target.value; renderDirectory(); });
    $('#korean-filter').addEventListener('change', event => { state.koreanFilter = event.target.value; renderDirectory(); });
    $('#filter-reset').addEventListener('click', () => {
      state.category = 'all'; state.priceFilter = 'all'; state.koreanFilter = 'all';
      $$('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
      $('#price-filter').value = 'all'; $('#korean-filter').value = 'all';
      renderDirectory(); showToast('필터를 초기화했어요.');
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
    saveLocalState(); renderRecommendations(); renderDirectory(); renderSaved();
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
    renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderTemplates(); renderPopularity(); renderNews();
    await loadPopularity();
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
    const payload = { id, title: $('#admin-news-title').value.trim(), summary: $('#admin-news-summary').value.trim(), insight: $('#admin-news-insight').value.trim(), category: $('#admin-news-category').value.trim() || 'insight', label: $('#admin-news-label').value.trim() || 'INSIGHT', source: $('#admin-news-source').value.trim() || 'AI 네비게이터 편집팀', source_url: $('#admin-news-source-url').value.trim() || '#', published_at: $('#admin-news-date').value || null, status: $('#admin-news-status').value, author_id: state.user.id };
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

  renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderTemplates(); renderPopularity(); renderNews();
  bindNavigation(); bindSearch(); bindDiagnosis(); bindTemplates(); bindPopularity(); bindFilters(); bindModal(); bindCompare(); bindAuth(); bindAdmin(); bindNewsExplorer();
  initBackend();
})();
