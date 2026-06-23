/**
 * practice.js - 刷题练习逻辑
 * 支持模式：按知识点 / 随机抽题 / 模拟测试 / 错题重练 / 真题套卷
 *
 * 性能优化：
 * - 首屏不加载 question-bank.js / question-registry.js（63KB+），延迟到点击"开始练习"时动态加载
 * - 配置面板立即渲染，handbook.json 后台加载
 */

// ==================== 内建常量（不依赖 question-bank.js） ====================
const QUESTION_TYPES = {
  pinyin:     { name: '字音',     icon: '🔊', color: 'pinyin',     _newId: 'pinyin' },
  char:       { name: '字形',     icon: '✏️', color: 'char',       _newId: 'char' },
  word_usage: { name: '词语运用', icon: '💭', color: 'word_usage', _newId: 'word_usage' },
  idiom:      { name: '词语运用', icon: '💭', color: 'word_usage', _newId: 'word_usage' },
  rhetoric:   { name: '修辞手法', icon: '🎨', color: 'rhetoric',   _newId: 'rhetoric' },
  literature: { name: '文学常识', icon: '📚', color: 'literature', _newId: 'literature' },
  recitation: { name: '古诗文默写', icon: '📝', color: 'recitation', _newId: 'recitation' },
  quote:      { name: '古诗文默写', icon: '📝', color: 'recitation', _newId: 'recitation' },
  sentence:   { name: '病句辨析', icon: '🔧', color: 'sentence',   _newId: 'sentence' }
};

const DIFFICULTIES = {
  easy:   { name: '简单', color: 'easy' },
  medium: { name: '中等', color: 'medium' },
  hard:   { name: '困难', color: 'hard' }
};

// ==================== 状态 ====================
let _dataReady = false;
let _modulesLoading = false;
let _modulesLoaded = false;
let _modulesPromise = null;

let practiceState = {
  mode: 'topic',
  type: 'all',
  difficulty: 'mixed',
  count: 10,
  semester: 'all',
  source: 'all',
  paperId: null,
  questions: [],
  currentIdx: 0,
  answers: [],
  startTime: 0
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  // 立刻渲染 UI
  setupNavbar();
  renderModeCards();
  renderConfigStatic();
  document.getElementById('btn-start').addEventListener('click', startPracticeDeferred);

  // 后台加载 handbook.json（不阻塞 UI）
  loadHandbookData()
    .then(() => {
      _dataReady = true;
      refreshDataDependentUI();
    })
    .catch(err => {
      console.error('数据加载失败:', err);
    });
});

// ==================== 动态加载题目模块 ====================
function loadQuestionModules() {
  if (_modulesLoaded) return Promise.resolve();
  if (_modulesPromise) return _modulesPromise;
  _modulesLoading = true;

  _modulesPromise = new Promise((resolve, reject) => {
    // 先加载 question-bank.js（较重的生成逻辑），再加载 question-registry.js（依赖前者）
    const bankScript = document.createElement('script');
    bankScript.src = 'js/question-bank.js?v=20260623e';
    bankScript.onload = () => {
      const registryScript = document.createElement('script');
      registryScript.src = 'js/question-registry.js?v=20260623e';
      registryScript.onload = () => {
        // registry 加载完毕，现在调用 loadAllQuestionData
        loadAllQuestionData()
          .then(() => {
            _modulesLoaded = true;
            _modulesLoading = false;
            // 自动刷新配置面板（真题套卷的试卷列表等）
            renderConfig();
            resolve();
          })
          .catch(reject);
      };
      registryScript.onerror = () => {
        _modulesLoading = false;
        reject(new Error('question-registry.js 加载失败'));
      };
      document.head.appendChild(registryScript);
    };
    bankScript.onerror = () => {
      _modulesLoading = false;
      reject(new Error('question-bank.js 加载失败'));
    };
    document.head.appendChild(bankScript);
  });

  return _modulesPromise;
}

// ==================== 渲染函数 ====================

function renderModeCards() {
  const modes = [
    { id: 'topic',     icon: '📌', title: '按知识点练习', desc: '选择题型专项训练' },
    { id: 'random',    icon: '🎲', title: '随机抽题',     desc: '随机出题综合练习' },
    { id: 'mock',      icon: '📝', title: '模拟测试',     desc: '限时完整测试' },
    { id: 'error',     icon: '❌', title: '错题重练',     desc: '复习做错的题目' },
    { id: 'exam_paper',icon: '📋', title: '真题套卷',     desc: '按真题原卷顺序做题' }
  ];
  document.getElementById('mode-cards').innerHTML = modes.map(m => `
    <div class="mode-card${m.id === practiceState.mode ? ' mode-card--active' : ''}" onclick="selectMode('${m.id}')">
      <div class="mode-card__icon">${m.icon}</div>
      <div class="mode-card__title">${m.title}</div>
      <div class="mode-card__desc">${m.desc}</div>
    </div>
  `).join('');
}

function selectMode(mode) {
  practiceState.mode = mode;
  practiceState.paperId = null;
  renderModeCards();
  renderConfig();
}

/** 静态配置渲染（不依赖远程数据） */
function renderConfigStatic() {
  renderConfig();
}

/** 主配置渲染 */
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
    // 模块未加载：显示加载提示并主动触发加载
    if (!_modulesLoaded && typeof getExamPapers !== 'function') {
      loadQuestionModules(); // 触发加载（不阻塞 UI）
      html = `<div style="text-align:center;padding:var(--space-md);">
        <div class="loading" style="margin:0;padding:var(--space-md);"><div class="loading__spinner"></div>题库加载中...</div>
      </div>`;
      panel.innerHTML = html;
      document.getElementById('btn-start').style.display = 'none';
      return;
    }
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
      const qCount = getPaperQuestionsSafe(p.id).length;
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

  // 题型选择
  if (mode === 'topic') {
    html += renderTypeSelector();
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

  // 学期
  html += renderSemesterSelector();

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

function renderTypeSelector() {
  // 使用注册表（如果已加载）或内建 QUESTION_TYPES
  let html = `<div class="config-row"><span class="config-label">题型</span><div class="chip-group" style="flex-wrap:wrap;">`;
  html += `<span class="chip chip--active" onclick="selectType('all', this)">全部</span>`;

  if (typeof getActiveTypesByCategory === 'function') {
    const cats = getAllCategories();
    const typesByCat = getActiveTypesByCategory();
    for (const [catId, cat] of Object.entries(cats)) {
      const types = typesByCat[catId];
      if (!types || types.length === 0) continue;
      for (const t of types) {
        html += `<span class="chip" onclick="selectType('${t.id}', this)">${t.icon} ${t.name}</span>`;
      }
    }
  } else {
    // 兜底：内建 QUESTION_TYPES
    const unique = {};
    for (const [k, v] of Object.entries(QUESTION_TYPES)) {
      if (!unique[v._newId]) unique[v._newId] = v;
    }
    for (const [, v] of Object.entries(unique)) {
      html += `<span class="chip" onclick="selectType('${v._newId}', this)">${v.icon} ${v.name}</span>`;
    }
  }
  html += `</div></div>`;
  return html;
}

function renderSourceSelector() {
  let sources = {};
  if (typeof getAllSources === 'function') {
    sources = getAllSources();
  } else {
    sources = {
      exam: { name: '中考真题', icon: '📋' },
      auto: { name: '自主生成', icon: '🤖' }
    };
  }
  let html = `<div class="config-row"><span class="config-label">来源</span><div class="chip-group">`;
  html += `<span class="chip chip--active" onclick="selectSource('all', this)">全部</span>`;
  for (const [key, val] of Object.entries(sources)) {
    html += `<span class="chip" onclick="selectSource('${key}', this)">${val.icon} ${val.name}</span>`;
  }
  html += `</div></div>`;
  return html;
}

function renderSemesterSelector() {
  let semesters = {};
  if (typeof getAllSemesters === 'function') {
    semesters = getAllSemesters();
  } else {
    semesters = { g7s1:{name:'七上'}, g7s2:{name:'七下'}, g8s1:{name:'八上'}, g8s2:{name:'八下'}, g9s1:{name:'九上'}, g9s2:{name:'九下'} };
  }
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

// ==================== 兜底查询（模块未加载时使用） ====================
function getExamPapersSafe() {
  if (typeof getExamPapers === 'function') return getExamPapers();
  return [];
}
function getPaperQuestionsSafe(paperId) {
  if (typeof getPaperQuestions === 'function') return getPaperQuestions(paperId);
  return [];
}

// ==================== 选择器回调 ====================
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

// ==================== 数据就绪后刷新 UI ====================
function refreshDataDependentUI() {
  const mode = practiceState.mode;
  if (mode === 'exam_paper') {
    renderConfig();
  } else if (mode !== 'error') {
    renderConfig();
  }
}

// ==================== 开始练习（延迟加载模块） ====================
function startPracticeDeferred() {
  // 需要加载题目模块
  if (!_modulesLoaded) {
    const btn = document.getElementById('btn-start');
    btn.textContent = '加载题库中...';
    btn.disabled = true;

    loadQuestionModules()
      .then(() => {
        btn.textContent = '🚀 开始练习';
        btn.disabled = false;
        startPractice();
      })
      .catch(err => {
        btn.textContent = '加载失败，请刷新重试';
        btn.disabled = false;
        console.error('题目模块加载失败:', err);
      });
    return;
  }
  startPractice();
}

function startPractice() {
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

  const typeInfo = (typeof getTypeInfoCompat === 'function' ? getTypeInfoCompat(q.type) : null) || QUESTION_TYPES[q.type] || { name: q.type, icon: '❓', color: 'pinyin' };
  const diffInfo = DIFFICULTIES[q.difficulty] || { name: '', color: 'easy' };
  const total = practiceState.questions.length;
  const idx = practiceState.currentIdx;

  document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('quiz-info-current').textContent = `第 ${idx + 1} 题`;
  document.getElementById('quiz-info-total').textContent = `共 ${total} 题`;

  let html = `<div class="question-card fade-in">
    <span class="question-card__type question-card__type--${typeInfo.color || typeInfo._newId || 'pinyin'}">${typeInfo.icon || ''} ${typeInfo.name}</span>
    <span class="question-card__difficulty question-card__difficulty--${diffInfo.color}">${diffInfo.name}</span>`;

  if (q.qsrc === 'exam' && q.sourceLabel) {
    html += `<span class="question-card__tag">📋 ${q.sourceLabel}</span>`;
  } else if (q.qsrc === 'mock' && q.sourceLabel) {
    html += `<span class="question-card__tag">📝 ${q.sourceLabel}</span>`;
  }

  html += `<div class="question-card__text">${formatQuestionText(q.question)}</div>`;

  if (q.isFill || q.format === 'fill') {
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
  if (!correct) ProgressTracker.addError({ ...q });
  renderQuestion();
}

function submitFill() {
  const input = document.getElementById('fill-answer');
  if (!input) return;
  const userAnswer = input.value.trim();
  if (!userAnswer) { showToast('请输入答案'); return; }
  const q = practiceState.questions[practiceState.currentIdx];
  const toneMap = { 'ā':'a1','á':'a2','ǎ':'a3','à':'a4','ē':'e1','é':'e2','ě':'e3','è':'e4','ī':'i1','í':'i2','ǐ':'i3','ì':'i4','ō':'o1','ó':'o2','ǒ':'o3','ò':'o4','ū':'u1','ú':'u2','ǔ':'u3','ù':'u4','ǖ':'u1','ǘ':'u2','ǚ':'u3','ǜ':'u4','ü':'u' };
  const normalize = s => s.trim()
    .replace(/[，,。.!！？?]/g, '')
    .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, c => toneMap[c])
    .toLowerCase();
  const correctAns = normalize(userAnswer) === normalize(q.answer);
  practiceState.answers[practiceState.currentIdx] = { answered: true, correct: correctAns, answer: userAnswer };
  if (!correctAns) ProgressTracker.addError({ ...q });
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
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;
  const timeUsed = Math.round((Date.now() - practiceState.startTime) / 1000);

  ProgressTracker.saveScore(practiceState.mode, practiceState.type, practiceState.difficulty, correct, total);

  document.getElementById('quiz-view').style.display = 'none';
  document.getElementById('results-view').style.display = '';

  document.getElementById('results-score').textContent = pct + '分';
  document.getElementById('results-score').className = 'results-score ' + (pct >= 60 ? 'results-score--pass' : 'results-score--fail');
  document.getElementById('results-correct').textContent = correct;
  document.getElementById('results-wrong').textContent = total - correct;
  document.getElementById('results-time').textContent = `${Math.floor(timeUsed/60)}分${timeUsed%60}秒`;

  let reviewHtml = '';
  practiceState.questions.forEach((q, i) => {
    const ans = practiceState.answers[i];
    if (!ans?.correct) {
      const typeInfo = (typeof getTypeInfoCompat === 'function' ? getTypeInfoCompat(q.type) : null) || QUESTION_TYPES[q.type] || { name: q.type };
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
  if (confirm('确定要退出本次练习吗？')) showConfigView();
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
