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
    remoteNews: false
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

  function renderRecommendations(query = state.query) {
    const context = classifyQuery(query);
    const ranked = rankTools(query, context).slice(0, 3);
    $('#recommend-caption').textContent = context ? categoryInfo[context].caption : '콘텐츠 제작에 자주 쓰이는 도구를 골라봤어요.';
    $('#recommend-grid').innerHTML = ranked.map((tool, index) => toolCard(tool, index, true)).join('');
    $('#empty-recommend').style.display = ranked.length ? 'none' : 'block';
    bindCardActions();
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

  function renderNews() {
    $('#news-list').innerHTML = state.news.slice(0, 3).map(item => `<a href="${escapeHtml(item.sourceUrl)}" class="news-item" data-news-id="${escapeHtml(item.id)}"><div class="news-meta">${escapeHtml(item.label)} <time>${escapeHtml(item.date)}</time></div><p class="news-title">${escapeHtml(item.title)}</p><p class="news-summary">${escapeHtml(item.summary)}</p></a>`).join('');
    $('.demo-badge').textContent = state.remoteNews ? '실시간 콘텐츠' : '데모 콘텐츠';
    $('.demo-badge').classList.toggle('connected', state.remoteNews);
    bindNewsActions();
  }

  function bindNewsActions() {
    $$('.news-item').forEach(item => item.addEventListener('click', event => {
      event.preventDefault();
      const itemData = state.news.find(
  entry => String(entry.id) === String(item.dataset.newsId)
);
      if (itemData) openNews(itemData);
    }));
  }

  function openNews(item) {
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = item.title;
    $('#modal-kicker').textContent = `${item.label} · ${item.date}`;
    $('#modal-body').innerHTML = `<p>${escapeHtml(item.summary)}</p><h4>왜 중요한가</h4><p>${escapeHtml(item.insight)}</p><h4>출처</h4><p>${escapeHtml(item.source)}</p>${!state.remoteNews ? '<p class="demo-note">현재 뉴스는 화면 검증을 위한 데모 콘텐츠입니다. Supabase를 연결하면 관리자 검수 후 발행된 뉴스가 표시됩니다.</p>' : ''}${item.sourceUrl !== '#' ? `<a class="modal-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">원문 출처 열기 →</a>` : ''}`;
    $('#modal').classList.add('open');
  }

  function openTool(tool) {
    $('#modal').classList.remove('compare-open');
    $('#modal-title').textContent = tool.name;
    $('#modal-kicker').textContent = `${tool.maker} · ${tool.verifiedAt}`;
    $('#modal-body').innerHTML = `<p>${escapeHtml(tool.description)}</p><h4>잘하는 일</h4><p>${escapeHtml(tool.bestFor.join(' · '))}</p><h4>사용 조건</h4><p>한국어 ${tool.korean}/5 · 품질 ${tool.quality}/5 · 속도 ${tool.speed}/5 · 보안 고려 ${tool.privacy}/5</p><p class="demo-note">가격과 기능은 변경될 수 있습니다. 공식 페이지에서 최신 정보를 확인하세요.</p><a class="modal-link" href="${escapeHtml(tool.officialUrl)}" target="_blank" rel="noreferrer">공식 사이트 열기 →</a>`;
    $('#modal').classList.add('open');
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
    renderRecommendations(); renderDirectory();
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
    renderRecommendations(); renderDirectory(); renderCompareTray();
  }

  function clearCompare() {
    state.compare.clear();
    renderRecommendations(); renderDirectory(); renderCompareTray();
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

  function bindFilters() {
    $('.filter-btn').forEach(button => button.addEventListener('click', () => {
      $('.filter-btn').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.category = button.dataset.filter; renderDirectory();
    }));
    $('#price-filter').addEventListener('change', event => { state.priceFilter = event.target.value; renderDirectory(); });
    $('#korean-filter').addEventListener('change', event => { state.koreanFilter = event.target.value; renderDirectory(); });
    $('#filter-reset').addEventListener('click', () => {
      state.category = 'all'; state.priceFilter = 'all'; state.koreanFilter = 'all';
      $('.filter-btn').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
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
  }

  async function syncSavedFromCloud() {
    if (!supabaseClient || !state.user) return;
    const { data, error } = await supabaseClient.from('saved_tools').select('tool_id').eq('user_id', state.user.id);
    if (error) { showToast('저장 목록을 불러오지 못했어요.'); return; }
    state.saved = new Set((data || []).map(row => row.tool_id));
    saveLocalState(); renderRecommendations(); renderDirectory();
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
    renderRecommendations(); renderDirectory(); renderNews();
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

  renderRecommendations(); renderDirectory(); renderNews();
  bindNavigation(); bindSearch(); bindFilters(); bindModal(); bindCompare(); bindAuth(); bindAdmin();
  initBackend();
})();
