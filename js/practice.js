/**
 * practice.js - 刷题练习逻辑
 * 支持模式：按知识点 / 随机抽题 / 模拟测试 / 错题重练 / 真题套卷
 * 支持筛选：题型 / 难度 / 学期 / 来源
 */

let _dataReady = false;
let _deferredRender = null;

let practiceState = {
  mode: 'topic',       // topic | random | mock | error | exam_paper
  type: 'all',
  difficulty: 'mixed',
  count: 10,
  semester: 'all',     // all | g7s1 | g7s2 | g8s1 | g8s2 | g9s1 | g9s2
  source: 'all',       // all | exam | auto
  paperId: null,       // 真题套卷模式选中的试卷ID
  questions: [],
  currentIdx: 0,
  answers: [],
  startTime: 0
};

document.addEventListener('DOMContentLoaded', () => {
  // 立刻渲染静态配置面板（不依赖数据）
  setupNavbar();
  renderModeCards();
  renderConfigStatic();
  document.getElementById('btn-start').addEventListener('click', startPracticeDeferred);

  // 后台并行加载数据
  const handbookPromise = loadHandbookData();
  const questionPromise = loadAllQuestionData();
  Promise.all([handbookPromise, questionPromise])
    .then(([data]) => {
      _dataReady = true;
      // 数据就绪后，重新渲染依赖数据的部分（题型/学期选择器）
      refreshDataDependentUI();
      if (_deferredRender) _deferredRender();
    })
    .catch(err => {
      console.error('数据加载失败:', err);
      document.getElementById('practice-main').innerHTML =
        '<div class="loading"><div class="loading__spinner"></div>数据加载失败，请刷新重试</div>';
    });
});

/** 渲染不依赖 handbook 数据的静态配置（题型用兜底数据） */
function renderConfigStatic() {
  const panel = document.getElementById('config-panel');
  const mode = practiceState.mode;

  // 错题重练
  if (mode === 'error') {
    const errors = ProgressTracker.getErrors();
    panel.innerHTML = `<div style="text-align:center;padding:var(--space-md);">
      <p style="margin-bottom:var(--space-md);">当前错题本中有 <strong>${errors.length}</strong> 道错题</p>
      ${errors.length === 0
        ? '<p style="color:var(--color-text-tertiary);">还没有错题，去练习一些题目吧！</p>'
        : `<button class="btn-primary" onclick="startErrorPractice()">开始错题重练</button>`}
    </div>`;
    document.getElementById('btn-start').style.display = 'none';
    return;
  }

  // 真题套卷
  if (mode === 'exam_paper') {
    const papers = getExamPapers();
    if (papers.length === 0) {
      panel.innerHTML = `<div style="text-align:center;padding:var(--space-md);">
        <p style="color:var(--color-text-tertiary);">真题库中还没有试卷</p>
        <p style="color:var(--color-text-tertiary);font-size:0.88rem;">等真题录入后会在这里显示</p>
      </div>`;
    } else {
      let html = `<div class="config-row"><span class="config-label">试卷</span><div class="chip-group" style="flex-wrap:wrap;">`;
      for (const p of papers) {
        const qCount = getPaperQuestions(p.id).length;
        html += `<span class="chip${practiceState.paperId === p.id ? ' chip--active' : ''}" onclick="selectPaper('${p.id}', this)">
          ${p.year}·${p.region} ${qCount > 0 ? `(${qCount}题)` : ''}
        </span>`;
      }
      html += `</div></div>`;
      panel.innerHTML = html;
    }
    document.getElementById('btn-start').style.display = practiceState.paperId ? '' : 'none';
    return;
  }

  document.getElementById('btn-start').style.display = '';

  // 题型选择器：用兜底数据先渲染，数据就绪后替换
  let html = '';
  if (mode === 'topic') {
    html += renderTypeSelectorStatic();
  }

  // 难度
  html += `<div class="config-row"><span class="config-label">难度</span><div class="chip-group">`;
  html += `<span class="chip chip--active" onclick="selectDifficulty('mixed', this)">混合</span>`;
  for (const [key, val] of Object.entries(DIFFICULTIES)) {
    html += `<span class="chip chip--${val.color}" onclick="selectDifficulty('${key}', this)">${val.name}</span>`;
  }
  html += `</div></div>`;

  // 来源
  html += renderSourceSelector();

  // 学期选择器：用兜底数据先渲染
  html += renderSemesterSelectorStatic();

  // 数量
  const counts = mode === 'mock' ? [20, 30, 50] : [5, 10, 15, 20];
  html += `<div class="config-row"><span class="config-label">题量</span><div class="chip-group">`;
  for (const c of counts) {
    html += `<span class="chip${c === practiceState.count ? ' chip--active' : ''}" onclick="selectCount(${c}, this)">${c}题</span>`;
  }
  html += `</div></div>`;

  if (mode === 'mock') {
    const minutes = practiceState.count * 2;
    html += `<div class="config-row"><span class="config-label">限时</span><span style="color:var(--color-text-secondary);font-size:0.88rem;">${minutes} 分钟</span></div>`;
  }

  panel.innerHTML = html;
}

/** 题型选择器 — 静态版（不依赖 registry，用 QUESTION_TYPES 兜底） */
function renderTypeSelectorStatic() {
  // 尝试用注册表，失败则用兜底
  let types = [];
  if (_dataReady && _registry) {
    const cats = getAllCategories();
    const typesByCat = getActiveTypesByCategory();
    let html = `<div class="config-row"><span class="config-label">题型</span><div class="chip-group" style="flex-wrap:wrap;">`;
    html += `<span class="chip chip--active" onclick="selectType('all', this)">全部</span>`;
    for (const [catId, cat] of Object.entries(cats)) {
      const tt = typesByCat[catId];
      if (!tt || tt.length === 0) continue;
      for (const t of tt) {
        html += `<span class="chip" onclick="selectType('${t.id}', this)">${t.icon} ${t.name}</span>`;
      }
    }
    html += `</div></div>`;
    return html;
  }
  // 兜底：直接用 QUESTION_TYPES 对象
  const entries = Object.entries(QUESTION_TYPES).filter(([, v]) => v._newId);
  const unique = {};
  for (const [k, v] of entries) {
    if (!unique[v._newId]) unique[v._newId] = v;
  }
  let html = `<div class="config-row"><span class="config-label">题型</span><div class="chip-group" style="flex-wrap:wrap;">`;
  html += `<span class="chip chip--active" onclick="selectType('all', this)">全部</span>`;
  for (const [, v] of Object.entries(unique)) {
    html += `<span class="chip" onclick="selectType('${v._newId}', this)">${v.icon} ${v.name}</span>`;
  }
  html += `</div></div>`;
  return html;
}

/** 学期选择器 — 静态版（不依赖 registry） */
function renderSemesterSelectorStatic() {
  const semesters = _dataReady && _registry ? getAllSemesters()
    : { g7s1:{name:'七上'}, g7s2:{name:'七下'}, g8s1:{name:'八上'}, g8s2:{name:'八下'}, g9s1:{name:'九上'}, g9s2:{name:'九下'} };
  const orderedKeys = ['g7s1','g7s2','g8s1','g8s2','g9s1','g9s2'];
  let html = `<div class="config-row"><span class="config-label">学期</span><div class="chip-group" style="flex-wrap:wrap;">`;
  html += `<span class="chip chip--active" onclick="selectSemester('all', this)">全部</span>`;
  for (const key of orderedKeys) {
    if (!semesters[key]) continue;
    html += `<span class="chip" onclick="selectSemester('${key}', this)">${semesters[key].name}</span>`;
  }
  html += `</div></div>`;
  return html;
}

/** 数据加载完成后，刷新依赖数据的 UI 部分 */
function refreshDataDependentUI() {
  const mode = practiceState.mode;
  if (mode === 'topic') {
    // 只替换题型选择器部分
    refreshTypeSelector();
  }
  if (mode !== 'error' && mode !== 'exam_paper') {
    refreshSemesterSelector();
  }
}

function refreshTypeSelector() {
  const panel = document.getElementById('config-panel');
  if (!panel) return;
  // 重新调用 renderConfig 完整重渲染（此时 _dataReady 为 true）
  renderConfig();
}

function refreshSemesterSelector() {
  renderConfig();
}

// ==================== 原 renderConfig（数据就绪后使用）====================
function renderConfig() {
  const panel = document.getElementById('config-panel');
  const mode = practiceState.mode;

  let html = '';

  if (mode === 'error') {
    const errors = ProgressTracker.getErrors();
    html = `<div style="text-align:center;padding:var(--space-md);">
      <p style="margin-bottom:var(--space-md);">当前错题本中有 <strong>${errors.length}</strong> 道错题</p>
      ${errors.length === 0
      ? '<p style="color:var(--color-text-tertiary);">还没有错题，去练习一些题目吧！</p>'
      : `<button class="btn-primary" onclick="startErrorPractice()">开始错题重练</button>`}
    </div>`;
    panel.innerHTML = html;
    document.getElementById('btn-start').style.display = 'none';
    return;
  }

  if (mode === 'exam_paper') {
    const papers = getExamPapers();
    if (papers.length === 0) {
      html = `<div style="text-align:center;padding:var(--space-md);">
        <p style="color:var(--color-text-tertiary);">真题库中还没有试卷</p>
        <p style="color:var(--color-text-tertiary);font-size:0.88rem;">等真题录入后会在这里显示</p>
      </div>`;
      panel.innerHTML = html;
      document.getElementById('btn-start').style.display = 'none';
      return;
    }
    html += `<div class="config-row"><span class="config-label">试卷</span><div class="chip-group" style="flex-wrap:wrap;">`;
    for (const p of papers) {
      const qCount = getPaperQuestions(p.id).length;
      html += `<span class="chip${practiceState.paperId === p.id ? ' chip--active' : ''}" onclick="selectPaper('${p.id}', this)">
        ${p.year}·${p.region} ${qCount > 0 ? `(${qCount}题)` : ''}
      </span>`;
    }
    html += `</div></div>`;
    panel.innerHTML = html;
    document.getElementById('btn-start').style.display = practiceState.paperId ? '' : 'none';
    return;
  }

  document.getElementById('btn-start').style.display = '';

  if (mode === 'topic') {
    html += renderTypeSelector();
  }

  html += `<div class="config-row"><span class="config-label">难度</span><div class="chip-group">`;
  html += `<span class="chip chip--active" onclick="selectDifficulty('mixed', this)">混合</span>`;
  for (const [key, val] of Object.entries(DIFFICULTIES)) {
    html += `<span class="chip chip--${val.color}" onclick="selectDifficulty('${key}', this)">${val.name}</span>`;
  }
  html += `</div></div>`;

  html += renderSourceSelector();
  html += renderSemesterSelector();

  const counts = mode === 'mock' ? [20, 30, 50] : [5, 10, 15, 20];
  html += `<div class="config-row"><span class="config-label">题量</span><div class="chip-group">`;
  for (const c of counts) {
    html += `<span class="chip${c === practiceState.count ? ' chip--active' : ''}" onclick="selectCount(${c}, this)">${c}题</span>`;
  }
  html += `</div></div>`;

  if (mode === 'mock') {
    const minutes = practiceState.count * 2;
    html += `<div class="config-row"><span class="config-label">限时</span><span style="color:var(--color-text-secondary);font-size:0.88rem;">${minutes} 分钟</span></div>`;
  }

  panel.innerHTML = html;
}

/** 渲染题型选择器 — 按板块分组（原逻辑，数据就绪后调用） */
function renderTypeSelector() {
  const categories = getAllCategories();
  const typesByCat = getActiveTypesByCategory();
  let html = `<div class="config-row"><span class="config-label">题型</span><div class="chip-group" style="flex-wrap:wrap;">`;
  html += `<span class="chip chip--active" onclick="selectType('all', this)">全部</span>`;
  for (const [catId, cat] of Object.entries(categories)) {
    const types = typesByCat[catId];
    if (!types || types.length === 0) continue;
    for (const t of types) {
      html += `<span class="chip" onclick="selectType('${t.id}', this)">${t.icon} ${t.name}</span>`;
    }
  }
  html += `</div></div>`;
  return html;
}

/** 渲染来源选择器 */
function renderSourceSelector() {
  const sources = getAllSources();
  let html = `<div class="config-row"><span class="config-label">来源</span><div class="chip-group">`;
  html += `<span class="chip chip--active" onclick="selectSource('all', this)">全部</span>`;
  for (const [key, val] of Object.entries(sources)) {
    html += `<span class="chip" onclick="selectSource('${key}', this)">${val.icon} ${val.name}</span>`;
  }
  html += `</div></div>`;
  return html;
}

/** 渲染学期选择器 */
function renderSemesterSelector() {
  const semesters = getAllSemesters();
  const orderedKeys = ['g7s1','g7s2','g8s1','g8s2','g9s1','g9s2'];
  let html = `<div class="config-row"><span class="config-label">学期</span><div class="chip-group" style="flex-wrap:wrap;">`;
  html += `<span class="chip chip--active" onclick="selectSemester('all', this)">全部</span>`;
  for (const key of orderedKeys) {
    if (!semesters[key]) continue;
    html += `<span class="chip" onclick="selectSemester('${key}', this)">${semesters[key].name}</span>`;
  }
  html += `</div></div>`;
  return html;
}

function selectType(type, el) {
  practiceState.type = type;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
}
function selectDifficulty(d, el) {
  practiceState.difficulty = d;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
}
function selectCount(c, el) {
  practiceState.count = c;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
  if (practiceState.mode === 'mock') renderConfig();
}
function selectSource(s, el) {
  practiceState.source = s;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
}
function selectSemester(s, el) {
  practiceState.semester = s;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
}
function selectPaper(paperId, el) {
  practiceState.paperId = paperId;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
  el.classList.add('chip--active');
  document.getElementById('btn-start').style.display = '';
}

// ==================== 开始练习（延迟版：数据未就绪时等待）====================
function startPracticeDeferred() {
  if (!_dataReady) {
    // 显示 loading，等数据加载完再执行
    const btn = document.getElementById('btn-start');
    btn.textContent = '数据加载中...';
    btn.disabled = true;
    _deferredRender = () => {
      btn.textContent = '开始练习';
      btn.disabled = false;
      startPractice();
    };
    return;
  }
  startPractice();
}

function startPractice() {
  // 真题套卷模式
  if (practiceState.mode === 'exam_paper' && practiceState.paperId) {
    practiceState.questions = getPaperQuestions(practiceState.paperId);
    if (practiceState.questions.length === 0) {
      showToast('该试卷暂无题目');
      return;
    }
    practiceState.currentIdx = 0;
    practiceState.answers = [];
    practiceState.startTime = Date.now();
    showQuizView();
    renderQuestion();
    return;
  }

  // 统一出题接口（合并真题+自主题）
  practiceState.questions = generateUnifiedQuestions({
    type: practiceState.type,
    difficulty: practiceState.difficulty,
    count: practiceState.count,
    source: practiceState.source,
    semester: practiceState.semester
  });

  if (practiceState.questions.length === 0) {
    showToast('题目生成失败，请重试或调整筛选条件');
    return;
  }
  practiceState.currentIdx = 0;
  practiceState.answers = [];
  practiceState.startTime = Date.now();

  if (practiceState.mode === 'mock') {
    startMockTimer(practiceState.count * 2 * 60 * 1000);
  }

  showQuizView();
  renderQuestion();
}

function startErrorPractice() {
  const errors = ProgressTracker.getErrors();
  if (errors.length === 0) return;
  practiceState.questions = errors.map(e => ({
    type: e.type, difficulty: e.difficulty || 'medium',
    question: e.question, options: e.options || [],
    answer: e.answer, explanation: e.explanation || '',
    isFill: e.isFill
  }));
  practiceState.currentIdx = 0;
  practiceState.answers = [];
  practiceState.startTime = Date.now();
  practiceState.mode = 'error';
  showQuizView();
  renderQuestion();
}

// ==================== 模拟测试计时器 ====================
let mockTimer = null;
function startMockTimer(duration) {
  const timerEl = document.getElementById('mock-timer');
  timerEl.style.display = '';
  let remaining = duration;
  mockTimer = setInterval(() => {
    remaining -= 1000;
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `⏱️ ${m}:${s.toString().padStart(2, '0')}`;
    if (remaining <= 0) {
      clearInterval(mockTimer);
      finishPractice();
    }
  }, 1000);
}

// ==================== 答题界面 ====================
function showQuizView() {
  document.getElementById('config-view').style.display = 'none';
  document.getElementById('quiz-view').style.display = '';
  document.getElementById('results-view').style.display = 'none';
}

function showConfigView() {
  document.getElementById('config-view').style.display = '';
  document.getElementById('quiz-view').style.display = 'none';
  document.getElementById('results-view').style.display = 'none';
  document.getElementById('mock-timer').style.display = 'none';
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
}

function renderQuestion() {
  const q = practiceState.questions[practiceState.currentIdx];
  if (!q) return;

  // 兼容新旧题型ID
  const typeInfo = getTypeInfoCompat(q.type) || QUESTION_TYPES[q.type] || { name: q.type, icon: '❓', color: 'pinyin' };
  const diffInfo = DIFFICULTIES[q.difficulty] || { name: '', color: 'easy' };
  const total = practiceState.questions.length;
  const idx = practiceState.currentIdx;

  // 进度
  document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('quiz-info-current').textContent = `第 ${idx + 1} 题`;
  document.getElementById('quiz-info-total').textContent = `共 ${total} 题`;

  // 题目卡片
  let html = `<div class="question-card fade-in">
    <span class="question-card__type question-card__type--${typeInfo.color || typeInfo._newId || 'pinyin'}">${typeInfo.icon || ''} ${typeInfo.name}</span>
    <span class="question-card__difficulty question-card__difficulty--${diffInfo.color}">${diffInfo.name}</span>`;

  // 题目来源标记
  if (q.qsrc === 'exam' && q.sourceLabel) {
    html += `<span class="question-card__tag">📋 ${q.sourceLabel}</span>`;
  } else if (q.qsrc === 'mock' && q.sourceLabel) {
    html += `<span class="question-card__tag">📝 ${q.sourceLabel}</span>`;
  }

  html += `<div class="question-card__text">${formatQuestionText(q.question)}</div>`;

  if (q.isFill || q.format === 'fill') {
    // 填空题
    const userAnswer = practiceState.answers[idx]?.answer || '';
    const isAnswered = practiceState.answers[idx]?.answered;
    html += `<input type="text" class="fill-input${isAnswered ? (practiceState.answers[idx].correct ? ' fill-input--correct' : ' fill-input--wrong') : ''}"
      placeholder="请输入答案..." value="${userAnswer}" id="fill-answer"
      ${isAnswered ? 'disabled' : ''} onkeydown="if(event.key==='Enter')submitFill()">`;
    if (isAnswered) {
      html += `<div class="answer-explanation">
        <div class="answer-explanation__label">${practiceState.answers[idx].correct ? '✅ 回答正确' : '❌ 回答错误'}</div>
        <div class="answer-explanation__text">正确答案：${q.answer}</div>
        <div class="answer-explanation__text">${q.explanation || ''}</div>
      </div>`;
    }
  } else {
    // 选择题
    const selectedIdx = practiceState.answers[idx]?.selectedIdx;
    const isAnswered = practiceState.answers[idx]?.answered;
    html += `<div class="options">`;
    q.options.forEach((opt, oi) => {
      let cls = 'option';
      if (isAnswered) {
        if (opt.correct) cls += ' option--correct';
        else if (oi === selectedIdx) cls += ' option--wrong';
      } else if (oi === selectedIdx) {
        cls += ' option--selected';
      }
      html += `<div class="${cls}" onclick="${isAnswered ? '' : `selectOption(${oi})`}">
        <span class="option__label">${String.fromCharCode(65 + oi)}</span>
        <span>${opt.text}</span>
      </div>`;
    });
    html += `</div>`;
    if (isAnswered) {
      html += `<div class="answer-explanation">
        <div class="answer-explanation__label">${practiceState.answers[idx].correct ? '✅ 回答正确' : '❌ 回答错误'}</div>
        <div class="answer-explanation__text">正确答案：${q.answer}</div>
        <div class="answer-explanation__text">${q.explanation || ''}</div>
      </div>`;
    }
  }

  // 操作按钮
  html += `<div class="quiz-actions">`;
  if (!practiceState.answers[idx]?.answered) {
    html += `<button class="btn-primary" onclick="${(q.isFill || q.format === 'fill') ? 'submitFill()' : 'submitOption()'}">确认作答</button>`;
  } else {
    if (idx < total - 1) {
      html += `<button class="btn-primary" onclick="nextQuestion()">下一题 →</button>`;
    } else {
      html += `<button class="btn-primary btn-accent" onclick="finishPractice()">查看结果 📊</button>`;
    }
    if (!practiceState.answers[idx].correct) {
      html += `<button class="btn-secondary" onclick="addToErrorBook()">加入错题本</button>`;
    }
  }
  html += `<button class="btn-secondary" onclick="quitPractice()">退出</button>`;
  html += `</div></div>`;

  document.getElementById('quiz-container').innerHTML = html;
}

function formatQuestionText(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>');
}

// ==================== 答题逻辑 ====================
function selectOption(idx) {
  const current = practiceState.answers[practiceState.currentIdx];
  if (current?.answered) return;
  practiceState.answers[practiceState.currentIdx] = { selectedIdx: idx, answered: false };
  renderQuestion();
}

function submitOption() {
  const current = practiceState.answers[practiceState.currentIdx];
  if (!current || current.selectedIdx === undefined) { showToast('请先选择一个答案'); return; }
  const q = practiceState.questions[practiceState.currentIdx];
  const correct = q.options[current.selectedIdx].correct;
  practiceState.answers[practiceState.currentIdx] = { ...current, answered: true, correct, answer: q.options[current.selectedIdx].text };
  if (!correct) {
    ProgressTracker.addError({ ...q });
  }
  renderQuestion();
}

function submitFill() {
  const input = document.getElementById('fill-answer');
  if (!input) return;
  const userAnswer = input.value.trim();
  if (!userAnswer) { showToast('请输入答案'); return; }
  const q = practiceState.questions[practiceState.currentIdx];
  // 归一化：声调符号→声调数字，保留声调信息，去标点，小写
  const toneMap = { 'ā':'a1','á':'a2','ǎ':'a3','à':'a4','ē':'e1','é':'e2','ě':'e3','è':'e4','ī':'i1','í':'i2','ǐ':'i3','ì':'i4','ō':'o1','ó':'o2','ǒ':'o3','ò':'o4','ū':'u1','ú':'u2','ǔ':'u3','ù':'u4','ǖ':'u1','ǘ':'u2','ǚ':'u3','ǜ':'u4','ü':'u' };
  const normalize = s => s.trim()
    .replace(/[，,。.!！？?]/g, '')
    .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, c => toneMap[c])
    .toLowerCase();
  const correct = normalize(userAnswer) === normalize(q.answer);
  practiceState.answers[practiceState.currentIdx] = { answered: true, correct, answer: userAnswer };
  if (!correct) {
    ProgressTracker.addError({ ...q });
  }
  renderQuestion();
}

function nextQuestion() {
  if (practiceState.currentIdx < practiceState.questions.length - 1) {
    practiceState.currentIdx++;
    renderQuestion();
  }
}

function addToErrorBook() {
  const q = practiceState.questions[practiceState.currentIdx];
  ProgressTracker.addError({ ...q });
  showToast('已加入错题本');
}

// ==================== 结果界面 ====================
function finishPractice() {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
  document.getElementById('mock-timer').style.display = 'none';

  const total = practiceState.questions.length;
  const correct = practiceState.answers.filter(a => a?.correct).length;
  const wrong = total - correct;
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;
  const timeUsed = Math.round((Date.now() - practiceState.startTime) / 1000);

  // 保存成绩
  ProgressTracker.saveScore(practiceState.mode, practiceState.type, practiceState.difficulty, correct, total);

  document.getElementById('quiz-view').style.display = 'none';
  document.getElementById('results-view').style.display = '';

  document.getElementById('results-score').textContent = pct + '分';
  document.getElementById('results-score').className = 'results-score ' + (pct >= 60 ? 'results-score--pass' : 'results-score--fail');
  document.getElementById('results-correct').textContent = correct;
  document.getElementById('results-wrong').textContent = wrong;
  document.getElementById('results-time').textContent = `${Math.floor(timeUsed/60)}分${timeUsed%60}秒`;

  // 错题回顾
  let reviewHtml = '';
  practiceState.questions.forEach((q, i) => {
    const ans = practiceState.answers[i];
    if (!ans?.correct) {
      const typeInfo = getTypeInfoCompat(q.type) || QUESTION_TYPES[q.type] || { name: q.type };
      reviewHtml += `<div class="error-item">
        <div class="error-item__header">
          <span class="error-item__type">${typeInfo.name}</span>
          <span class="error-item__time">第${i+1}题</span>
        </div>
        <div class="error-item__question">${q.question.replace(/\n/g, '<br>')}</div>
        <div class="error-item__answer error-item__answer--correct">✅ ${q.answer}</div>
        ${ans?.answer ? `<div class="error-item__answer error-item__answer--wrong">❌ ${ans.answer}</div>` : '<div class="error-item__answer">未作答</div>'}
        ${q.explanation ? `<div class="error-item__answer">${q.explanation}</div>` : ''}
      </div>`;
    }
  });
  document.getElementById('results-review').innerHTML = reviewHtml || '<div class="empty-state"><div class="empty-state__icon">🎉</div><div class="empty-state__text">全部答对，太棒了！</div></div>';
}

function quitPractice() {
  if (confirm('确定要退出本次练习吗？')) {
    showConfigView();
  }
}

function restartPractice() {
  showConfigView();
  renderConfig();
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}
