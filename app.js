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
    newsCategory: 'all'
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
      <div class="tool-head"><div class="tool-logo ${escapeHtml(tool.logoClass)}">${escapeHtml(tool.logo)}</div><div><div class="tool-title">${escapeHtml(tool.name)}</div><div class="tool-maker">${escapeHtml(tool.maker)}</div></div></div>
      ${match}${reason}<div class="tag-row">${tags}</div>
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
    $('#diagnosis-title').textContent = `${ranked[0]?.name || 'AI'}를 가장 먼저 추천해요`;
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
      return `<button class="workflow-step" type="button" data-detail="${escapeHtml(step.toolId)}">
        <span class="workflow-number">STEP ${index + 1}</span>
        <span class="workflow-tool">${escapeHtml(name)}</span>
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
    $('#modal-kicker').textContent = `${tool.maker} · AI 도구 상세 정보`;
    const strengths = tool.strengths?.length ? tool.strengths : ['핵심 기능은 공식 페이지에서 확인해 주세요.'];
    const bestFor = tool.bestFor?.length ? tool.bestFor : ['활용 목적을 확인 중입니다.'];
    const officialLink = tool.officialUrl && tool.officialUrl !== '#'
      ? `<a class="tool-detail-link" href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 사이트 열기 →</a>`
      : '';
    const prompt = starterPrompt(tool);
    $('#modal-body').innerHTML = `
      <p class="tool-detail-intro">${escapeHtml(tool.description || tool.reason)}</p>
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
      <div class="tool-detail-footer"><span class="tool-detail-verified">최근 검증: ${escapeHtml(tool.verifiedAt || '검증일 미정')} · 가격과 기능은 변경될 수 있습니다.</span>${officialLink}</div>`;
    $('#modal').classList.add('open');
    $('[data-copy-prompt]')?.addEventListener('click', () => copyPrompt(prompt));
  }

  async function toggleSave(id, button) {
    const saving = !state.saved.has(id);
    if (saving) state.saved.add(id); else state.saved.delete(id);
    saveLocalState();
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
    }
    renderRecommendations(); renderDirectory(); renderSaved(); renderCompareTray();
  }

  function clearCompare() {
    state.compare.clear();
    renderRecommendations(); renderDirectory(); renderSaved(); renderCompareTray();
  }

  function easeLabel(value) {
    if (value >= 5) return '매우 쉬움';
    if (value >= 4) return '쉬움';
    if (value >= 3) return '보통';
    return '어려움';
  }

  function openCompare() {
    const selected = state.tools.filter(tool => state.compare.has(tool.id));
    if (selected.length < 2) { showToast('비교할 AI를 2개 이상 선택해 주세요.'); return; }
    const cells = mapper => selected.map(mapper).join('');
    $('#modal').classList.add('compare-open');
    $('#modal-title').textContent = 'AI 도구 비교';
    $('#modal-kicker').textContent = `${selected.length}개 도구 한눈에 비교`;
    $('#modal-body').innerHTML = `<div class="compare-table-wrap"><table class="compare-table">
      <tr><th>도구</th>${cells(tool => `<td><div class="compare-name">${escapeHtml(tool.name)}</div><small>${escapeHtml(tool.maker)}</small></td>`)}</tr>
      <tr><th>가격</th>${cells(tool => `<td>${escapeHtml(tool.price)}</td>`)}</tr>
      <tr><th>한국어</th>${cells(tool => `<td>${'★'.repeat(tool.korean)}${'☆'.repeat(5 - tool.korean)}</td>`)}</tr>
      <tr><th>품질</th>${cells(tool => `<td>${'★'.repeat(tool.quality)}${'☆'.repeat(5 - tool.quality)}</td>`)}</tr>
      <tr><th>초보 난이도</th>${cells(tool => `<td>${easeLabel(tool.ease)}</td>`)}</tr>
      <tr><th>추천 작업</th>${cells(tool => `<td>${escapeHtml(tool.bestFor.join(' · '))}</td>`)}</tr>
      <tr><th>핵심 장점</th>${cells(tool => `<td>${escapeHtml(tool.strengths.join(' · '))}</td>`)}</tr>
      <tr><th>바로가기</th>${cells(tool => `<td><a href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 사이트 →</a></td>`)}</tr>
    </table></div>`;
    $('#modal').classList.add('open');
  }

  function bindCompare() {
    $('#compare-open').addEventListener('click', openCompare);
    $('#compare-clear').addEventListener('click', clearCompare);
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
    renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderNews();
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

  renderRecommendations(); renderDirectory(); renderSaved(); renderWorkflow(); renderNews();
  bindNavigation(); bindSearch(); bindDiagnosis(); bindFilters(); bindModal(); bindCompare(); bindAuth(); bindAdmin(); bindNewsExplorer();
  initBackend();
})();
