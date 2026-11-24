(() => {
  'use strict';

  const DATA = Array.isArray(window.APP_DATA) ? window.APP_DATA : [];
  const STORAGE_KEY = 'mis857-pwa-v1';
  const CHAPTER_NAMES = {
    '绪论': '绪论',
    '第1章': '第1章 城市环境与生态因子',
    '第2章': '第2章 光与园林植物',
    '第3章': '第3章 温度与园林植物',
    '第4章': '第4章 水与园林植物',
    '第5章': '第5章 大气与园林植物',
    '第6章': '第6章 土壤与园林植物',
    '第7章': '第7章 植物种群',
    '第8章': '第8章 植物群落结构',
    '第9章': '第9章 植物群落动态',
    '第10章': '第10章 植物群落类型与分布',
    '第11章': '第11章 生态系统基础',
    '第12章': '第12章 城市生态系统',
    '第13章': '第13章 城市景观生态',
    '第14章': '第14章 城市生态评价与生态管理',
    '第15章': '第15章 城市生态规划与设计',
    '第16章': '第16章 园林生态工程'
  };
  const CHAPTER_ORDER = ['绪论', ...Array.from({ length: 16 }, (_, i) => `第${i + 1}章`)];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addDays(days, base = new Date()) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dateDiff(a, b) {
    return Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function chapterLabel(ch) { return CHAPTER_NAMES[ch] || ch || '未分章'; }
  function chapterRank(ch) {
    const i = CHAPTER_ORDER.indexOf(ch);
    return i < 0 ? 99 : i;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const defaultState = () => ({
    progress: {},
    favorites: [],
    drafts: {},
    customAnswers: {},
    studyDays: {},
    newDate: todayKey(),
    newCount: 0,
    settings: {
      dailyNew: 20,
      reviewLimit: 120,
      order: 'random',
      dark: false
    }
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        progress: parsed.progress || {},
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        drafts: parsed.drafts || {},
        customAnswers: parsed.customAnswers || {},
        studyDays: parsed.studyDays || {},
        settings: { ...base.settings, ...(parsed.settings || {}) }
      };
    } catch (e) {
      console.warn('读取进度失败，使用默认状态', e);
      return defaultState();
    }
  }

  let state = loadState();
  let queue = [];
  let studyIndex = 0;
  let currentFilter = 'all';
  let currentCategory = 'all';
  let currentModalId = null;
  let toastTimer = null;

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('保存失败，浏览器存储空间可能已满'); }
  }

  function ensureDay() {
    const today = todayKey();
    if (state.newDate !== today) {
      state.newDate = today;
      state.newCount = 0;
      save();
    }
  }

  function progressOf(id) {
    return state.progress[id] || null;
  }

  function answerOf(item) {
    return state.customAnswers[item.id] || item.answer;
  }

  function statusOf(id) {
    const p = progressOf(id);
    if (!p) return 'new';
    if (p.status === 'mastered') return 'mastered';
    if (p.lastRating === 'again') return 'fuzzy';
    return 'learning';
  }

  function isDue(p) {
    return !!p && p.status !== 'new' && p.status !== 'mastered' && p.due && p.due <= todayKey();
  }

  function dueCount() {
    return DATA.filter(item => isDue(progressOf(item.id))).length;
  }

  function newLeft() {
    ensureDay();
    return Math.max(0, state.settings.dailyNew - state.newCount);
  }

  function learnedCount() {
    return DATA.filter(item => !!progressOf(item.id)).length;
  }

  function masteredCount() {
    return DATA.filter(item => progressOf(item.id)?.status === 'mastered').length;
  }

  function studyDaysCount() {
    return Object.values(state.studyDays).filter(v => v > 0).length;
  }

  function streakCount() {
    let n = 0;
    const d = new Date();
    if (!state.studyDays[todayKey()]) d.setDate(d.getDate() - 1);
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (state.studyDays[key] > 0) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  function applyTheme() {
    document.body.classList.toggle('dark', !!state.settings.dark);
    $('#themeBtn').textContent = state.settings.dark ? '☀' : '☾';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.settings.dark ? '#121815' : '#1f6b4f');
  }

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.goto === name));
    $('#backBtn').classList.toggle('hidden', name !== 'study');
    $('#topbar').classList.remove('hidden');
    if (name === 'home') renderHome();
    if (name === 'library') renderLibrary();
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function renderHome() {
    ensureDay();
    const due = dueCount();
    const left = newLeft();
    const done = state.studyDays[todayKey()] || 0;
    const target = done + due + left;
    const pct = target ? Math.round(done / target * 100) : 0;
    $('#todayRing').style.setProperty('--p', `${pct}%`);
    $('#todayDone').textContent = done;
    $('#todayTotal').textContent = target;
    $('#dueCount').textContent = due;
    $('#newLeft').textContent = left;
    $('#masteredCount').textContent = masteredCount();
    $('#learnedCount').textContent = learnedCount();
    $('#streakCount').textContent = streakCount();
    $('#streakPill').textContent = `🔥 ${streakCount()} 天`;
    $('#favCount').textContent = state.favorites.length;
    $('#keyCount').textContent = DATA.filter(x => x.category === '重点').length;
    $('#knowCount').textContent = DATA.filter(x => x.category === '了解').length;
    const d = new Date();
    $('#todayLabel').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}`;
    const learned = learnedCount();
    $('#chapterSummary').textContent = `${learned} / ${DATA.length}`;
    renderChapterProgress($('#chapterList'), 6);
  }

  function renderChapterProgress(container, limit = 99) {
    if (!container) return;
    const groups = new Map();
    DATA.forEach(item => {
      if (!groups.has(item.chapter)) groups.set(item.chapter, { total: 0, learned: 0 });
      const g = groups.get(item.chapter);
      g.total++;
      if (progressOf(item.id)) g.learned++;
    });
    const rows = Array.from(groups.entries())
      .sort((a, b) => chapterRank(a[0]) - chapterRank(b[0]))
      .slice(0, limit);
    container.innerHTML = rows.map(([ch, g]) => {
      const pct = g.total ? Math.round(g.learned / g.total * 100) : 0;
      return `<div class="chapter-item">
        <div class="chapter-line"><span>${escapeHtml(chapterLabel(ch))}</span><span>${g.learned}/${g.total}</span></div>
        <div class="mini-track"><div class="mini-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  function buildQueue() {
    ensureDay();
    const source = DATA.filter(item => currentCategory === 'all' || item.category === currentCategory);
    const due = source
      .filter(item => isDue(progressOf(item.id)))
      .sort((a, b) => (progressOf(a.id)?.due || '').localeCompare(progressOf(b.id)?.due || ''));
    let dueList = state.settings.order === 'random' ? shuffle(due) : due;
    dueList = dueList.slice(0, state.settings.reviewLimit);

    let fresh = source.filter(item => !progressOf(item.id));
    if (state.settings.order === 'random') fresh = shuffle(fresh);
    fresh = fresh.slice(0, newLeft());

    let combined = [...dueList, ...fresh];
    if (state.settings.order === 'random') combined = shuffle(combined);
    return combined;
  }

  function startStudy(force = false, category = null) {
    if (category) currentCategory = category;
    if (force || !queue.length) {
      queue = buildQueue();
      studyIndex = 0;
    }
    showScreen('study');
    if (!queue.length) {
      $('#studyArea').classList.add('hidden');
      $('#studyEmpty').classList.remove('hidden');
      $('#studyProgressText').textContent = '0 / 0';
      $('#studyProgressBar').style.width = '0%';
      const due = dueCount();
      const left = newLeft();
      $('#emptyText').textContent = due || left
        ? `还有 ${due} 个待复习、${left} 个新词，回首页重新开始。`
        : '今天的卡已经清空，可以去词库复习错词。';
      return;
    }
    $('#studyArea').classList.remove('hidden');
    $('#studyEmpty').classList.add('hidden');
    renderStudy();
  }

  function renderStudy() {
    if (!queue.length || studyIndex >= queue.length) { finishSession(); return; }
    const item = queue[studyIndex];
    const p = progressOf(item.id);
    $('#studyProgressText').textContent = `${studyIndex + 1} / ${queue.length}`;
    $('#studyProgressBar').style.width = `${Math.round(studyIndex / queue.length * 100)}%`;
    $('#studyMode').textContent = `${currentCategory === 'all' ? '' : currentCategory + ' · '}${p ? '复习' : '新词'}`;
    $('#studyChapter').textContent = chapterLabel(item.chapter);
    $('#studyTerm').textContent = item.term;
    $('#studyAnswer').textContent = answerOf(item);
    $('#studyImp').textContent = item.importance ? `重要度 ${item.importance}` : '';
    const studyNote = $('#studyNote');
    studyNote.textContent = item.note || '';
    studyNote.classList.toggle('hidden', !item.note);
    $('#answerBox').classList.add('hidden');
    $('#rating').classList.add('hidden');
    $('#revealBtn').classList.remove('hidden');
    $('#draft').classList.remove('hidden');
    $('#draft').value = state.drafts[item.id] || '';
    $('#starBtn').textContent = state.favorites.includes(item.id) ? '★' : '☆';
    $('#starBtn').style.color = state.favorites.includes(item.id) ? 'var(--gold)' : '';
  }

  function revealAnswer() {
    if (!queue.length) return;
    $('#answerBox').classList.remove('hidden');
    $('#rating').classList.remove('hidden');
    $('#revealBtn').classList.add('hidden');
    $('#draft').classList.add('hidden');
  }

  function rateCard(rating) {
    if (!queue.length || studyIndex >= queue.length) return;
    const item = queue[studyIndex];
    const today = todayKey();
    const p = progressOf(item.id) || {
      ease: 2.5, interval: 0, reps: 0, lapses: 0, status: 'new', due: null, lastRating: null, last: null
    };

    if (!progressOf(item.id)) {
      state.newCount = (state.newCount || 0) + 1;
    }

    if (rating === 'again') {
      p.interval = 0;
      p.due = today;
      p.lapses = (p.lapses || 0) + 1;
      p.ease = Math.max(1.3, (p.ease || 2.5) - 0.2);
      p.status = 'learning';
    } else if (rating === 'hard') {
      p.interval = p.interval ? Math.max(1, Math.round(p.interval * 1.2)) : 1;
      p.ease = Math.max(1.3, (p.ease || 2.5) - 0.05);
      p.due = addDays(p.interval);
      p.status = 'learning';
    } else {
      p.interval = p.interval ? Math.round(p.interval * (p.ease || 2.5)) : 1;
      p.interval = Math.min(180, p.interval);
      p.ease = Math.min(3.2, (p.ease || 2.5) + 0.1);
      p.due = addDays(p.interval);
      p.status = p.interval >= 21 ? 'mastered' : 'review';
    }
    p.reps = (p.reps || 0) + 1;
    p.lastRating = rating;
    p.last = today;
    state.progress[item.id] = p;
    state.studyDays[today] = (state.studyDays[today] || 0) + 1;
    save();
    studyIndex++;
    if (studyIndex >= queue.length) finishSession();
    else renderStudy();
  }

  function finishSession() {
    $('#studyArea').classList.add('hidden');
    $('#studyEmpty').classList.remove('hidden');
    $('#studyProgressBar').style.width = '100%';
    $('#studyProgressText').textContent = `${queue.length} / ${queue.length}`;
    const due = dueCount();
    const left = newLeft();
    $('#emptyText').textContent = due || left
      ? `还有 ${due} 个待复习、${left} 个新词，可以再开一组。`
      : '今天的卡已经清空，去词库复习错词吧。';
  }

  function renderLibrary() {
    const q = ($('#searchInput').value || '').trim().toLowerCase();
    let items = DATA.slice().sort((a, b) => chapterRank(a.chapter) - chapterRank(b.chapter) || a.id - b.id);

    if (currentFilter === 'new') items = items.filter(i => statusOf(i.id) === 'new');
    if (currentFilter === 'fuzzy') items = items.filter(i => statusOf(i.id) === 'fuzzy');
    if (currentFilter === 'mastered') items = items.filter(i => statusOf(i.id) === 'mastered');
    if (currentFilter === 'fav') items = items.filter(i => state.favorites.includes(i.id));
    if (currentCategory !== 'all') items = items.filter(i => i.category === currentCategory);

    if (q) {
      items = items.filter(i =>
        i.term.toLowerCase().includes(q) ||
        answerOf(i).toLowerCase().includes(q) ||
        chapterLabel(i.chapter).toLowerCase().includes(q)
      );
    }

    $('#libraryCount').textContent = `${items.length} 个`;
    const list = $('#termList');
    if (!items.length) {
      list.innerHTML = '<div class="empty-list">没有匹配的名词，换个关键词试试。</div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const st = statusOf(item.id);
      const dotClass = st === 'mastered' ? 'mastered' : st === 'fuzzy' ? 'fuzzy' : st === 'learning' ? 'learning' : '';
      const fav = state.favorites.includes(item.id) ? '<span class="term-fav">★</span>' : '';
      return `<button class="term-item" data-term-id="${item.id}">
        <span class="status-dot ${dotClass}"></span>
        <span class="term-left">
          <span class="term-name">${escapeHtml(item.term)} ${fav}</span>
          <span class="term-sub">${escapeHtml(chapterLabel(item.chapter))} · ${escapeHtml(item.importance || '')}</span>
        </span>
        <span style="color:var(--muted)">›</span>
      </button>`;
    }).join('');
  }

  function renderStats() {
    const total = DATA.length;
    const learned = learnedCount();
    const mastered = masteredCount();
    const learning = DATA.filter(i => {
      const s = statusOf(i.id);
      return s === 'learning' || s === 'fuzzy';
    }).length;
    const fresh = total - learned;
    $('#statLearned').textContent = learned;
    $('#statMastered').textContent = mastered;
    $('#statDays').textContent = studyDaysCount();
    $('#numMastered').textContent = mastered;
    $('#numLearning').textContent = learning;
    $('#numNew').textContent = fresh;
    $('#barMastered').style.width = `${total ? mastered / total * 100 : 0}%`;
    $('#barLearning').style.width = `${total ? learning / total * 100 : 0}%`;
    $('#barNew').style.width = `${total ? fresh / total * 100 : 0}%`;
    renderWeekChart();
    renderChapterProgress($('#statChapterList'), 99);
  }

  function renderWeekChart() {
    const days = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const x = new Date(d);
      x.setDate(x.getDate() - i);
      const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      days.push({ key, label: ['日','一','二','三','四','五','六'][x.getDay()], count: state.studyDays[key] || 0 });
    }
    const max = Math.max(1, ...days.map(x => x.count));
    const total = days.reduce((s, x) => s + x.count, 0);
    $('#weekTotal').textContent = `${total} 次`;
    $('#weekChart').innerHTML = days.map(x => {
      const h = Math.max(4, Math.round(x.count / max * 92));
      return `<div class="week-col">
        <div class="week-num">${x.count || ''}</div>
        <div class="week-bar" style="height:${h}px"><i style="height:100%"></i></div>
        <div class="week-day">${x.label}</div>
      </div>`;
    }).join('');
  }

  function renderSettings() {
    $('#dailyNewSelect').value = String(state.settings.dailyNew);
    $('#reviewLimitSelect').value = String(state.settings.reviewLimit);
    $('#orderSelect').value = state.settings.order;
    $('#darkToggle').checked = !!state.settings.dark;
  }

  function openModal(id) {
    const item = DATA.find(x => x.id === id);
    if (!item) return;
    currentModalId = id;
    $('#modalChapter').textContent = chapterLabel(item.chapter);
    $('#modalTerm').textContent = item.term;
    $('#modalAnswer').textContent = answerOf(item);
    const modalNote = $('#modalNote');
    modalNote.textContent = item.note || '';
    modalNote.classList.toggle('hidden', !item.note);
    $('#modalStar').textContent = state.favorites.includes(id) ? '★ 已收藏' : '☆ 收藏';
    const st = statusOf(id);
    $('#modalMaster').textContent = st === 'mastered' ? '已掌握' : '标记已掌握';
    $('#modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    document.body.style.overflow = '';
    currentModalId = null;
  }

  function toggleFavorite(id) {
    const i = state.favorites.indexOf(id);
    if (i >= 0) state.favorites.splice(i, 1);
    else state.favorites.push(id);
    save();
    if ($('#modal').classList.contains('hidden')) renderStudy();
    else { $('#modalStar').textContent = state.favorites.includes(id) ? '★ 已收藏' : '☆ 收藏'; }
    renderHome();
  }

  function markMastered(id) {
    const p = progressOf(id) || { ease: 2.5, interval: 0, reps: 0, lapses: 0, status: 'new', due: null };
    p.status = 'mastered';
    p.interval = Math.max(21, p.interval || 0);
    p.due = addDays(30);
    p.last = todayKey();
    state.progress[id] = p;
    save();
    $('#modalMaster').textContent = '已掌握';
    toast('已标记为掌握');
    renderHome();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `857名解进度-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出学习数据');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || typeof obj !== 'object') throw new Error('格式不对');
        state = {
          ...defaultState(),
          ...obj,
          progress: obj.progress || {},
          favorites: Array.isArray(obj.favorites) ? obj.favorites : [],
          drafts: obj.drafts || {},
          customAnswers: obj.customAnswers || {},
          studyDays: obj.studyDays || {},
          settings: { ...defaultState().settings, ...(obj.settings || {}) }
        };
        save();
        applyTheme();
        renderHome();
        renderSettings();
        toast('导入成功');
      } catch (e) {
        toast('导入失败：不是有效的进度文件');
      }
    };
    reader.readAsText(file);
  }

  function bind() {
    // navigation
    $$('.tab').forEach(tab => tab.addEventListener('click', () => {
      const name = tab.dataset.goto;
      if (name === 'study') startStudy(true);
      else showScreen(name);
    }));
    $$('[data-goto]').forEach(el => el.addEventListener('click', () => {
      const name = el.dataset.goto;
      if (name === 'study') startStudy(true);
      else showScreen(name);
    }));
    $('#backBtn').addEventListener('click', () => showScreen('home'));
    $('#startBtn').addEventListener('click', () => { currentCategory = 'all'; startStudy(true); });
    $$('[data-start-cat]').forEach(b => b.addEventListener('click', () => startStudy(true, b.dataset.startCat)));
    $('#emptyHomeBtn').addEventListener('click', () => showScreen('home'));

    $('#revealBtn').addEventListener('click', revealAnswer);
    $('#prevBtn').addEventListener('click', () => {
      if (studyIndex > 0) { studyIndex--; renderStudy(); }
      else toast('已经是第一张');
    });
    $('#skipBtn').addEventListener('click', () => {
      if (!queue.length) return;
      studyIndex++;
      if (studyIndex >= queue.length) finishSession();
      else renderStudy();
    });
    $$('.rate').forEach(btn => btn.addEventListener('click', () => rateCard(btn.dataset.rate)));
    $('#draft').addEventListener('input', (e) => {
      if (!queue.length) return;
      const id = queue[studyIndex]?.id;
      if (id) { state.drafts[id] = e.target.value; save(); }
    });
    $('#speakBtn').addEventListener('click', () => {
      const item = queue[studyIndex];
      if (!item || !window.speechSynthesis) return toast('当前浏览器不支持朗读');
      const u = new SpeechSynthesisUtterance(item.term);
      u.lang = 'zh-CN';
      u.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
    $('#starBtn').addEventListener('click', () => {
      const item = queue[studyIndex];
      if (item) toggleFavorite(item.id);
    });

    // library
    $('#searchInput').addEventListener('input', renderLibrary);
    $('#filterChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      currentFilter = chip.dataset.filter;
      $$('.chip', $('#filterChips')).forEach(c => c.classList.toggle('active', c === chip));
      renderLibrary();
    });
    $('#catChips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      currentCategory = c.dataset.cat;
      $$('.chip', $('#catChips')).forEach(x => x.classList.toggle('active', x === c));
      renderLibrary();
    });
    $('#termList').addEventListener('click', (e) => {
      const item = e.target.closest('[data-term-id]');
      if (item) openModal(Number(item.dataset.termId));
    });

    // modal
    $('#modal').addEventListener('click', (e) => {
      if (e.target.closest('[data-close="modal"]')) closeModal();
    });
    $('#modalStar').addEventListener('click', () => { if (currentModalId) toggleFavorite(currentModalId); });
    $('#modalMaster').addEventListener('click', () => { if (currentModalId) markMastered(currentModalId); });
    $('#modalEdit').addEventListener('click', () => {
      if (!currentModalId) return;
      const item = DATA.find(x => x.id === currentModalId);
      if (!item) return;
      const val = prompt('编辑这条名词的参考答案：', answerOf(item));
      if (val === null) return;
      const text = val.trim();
      if (!text) return toast('答案不能为空');
      state.customAnswers[currentModalId] = text;
      save();
      $('#modalAnswer').textContent = text;
      renderStudy();
      renderLibrary();
      toast('答案已更新');
    });

    // settings
    $('#dailyNewSelect').addEventListener('change', (e) => { state.settings.dailyNew = Number(e.target.value); save(); });
    $('#reviewLimitSelect').addEventListener('change', (e) => { state.settings.reviewLimit = Number(e.target.value); save(); });
    $('#orderSelect').addEventListener('change', (e) => { state.settings.order = e.target.value; save(); });
    $('#darkToggle').addEventListener('change', (e) => { state.settings.dark = e.target.checked; save(); applyTheme(); });
    $('#themeBtn').addEventListener('click', () => { state.settings.dark = !state.settings.dark; save(); applyTheme(); });
    $('#exportBtn').addEventListener('click', exportData);
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) importData(f);
      e.target.value = '';
    });
    $('#resetBtn').addEventListener('click', resetAll);
    $('#resetAllBtn').addEventListener('click', resetAll);

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if ($('#screen-study').classList.contains('active')) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!$('#answerBox').classList.contains('hidden')) return; revealAnswer(); }
        if (e.key === '1') rateCard('again');
        if (e.key === '2') rateCard('hard');
        if (e.key === '3') rateCard('good');
      }
    });
  }

  function resetAll() {
    if (!confirm('确定要清空全部学习进度吗？此操作不可恢复，建议先导出备份。')) return;
    state = defaultState();
    queue = [];
    studyIndex = 0;
    save();
    applyTheme();
    renderHome();
    renderSettings();
    toast('已重置');
  }

  function init() {
    bind();
    applyTheme();
    ensureDay();
    renderHome();
    // 首次进入不自动开始，保留用户选择
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  init();
  const params = new URLSearchParams(location.search);
  if (params.get('screen')) showScreen(params.get('screen'));
  if (params.get('study') === '1') startStudy(true);
  if (params.get('reveal') === '1') setTimeout(revealAnswer, 20);
  if (params.get('term')) {
    const found = DATA.find(x => x.term === params.get('term'));
    if (found) openModal(found.id);
  }
})();
