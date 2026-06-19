/**
 * practice.js - 刷题练习逻辑
 */
let practiceState = {
  mode: 'topic',       // topic | random | mock | error
  type: 'all',
  difficulty: 'mixed',
  count: 10,
  questions: [],
  currentIdx: 0,
  answers: [],
  startTime: 0
};

document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) { document.getElementById('practice-main').innerHTML = '<div class="loading"><div class="loading__spinner"></div>数据加载失败</div>'; return; }
  setupNavbar();
  renderModeCards();
  renderConfig();
  document.getElementById('btn-start').addEventListener('click', startPractice);
});

// ==================== 模式选择 ====================
function renderModeCards() {
  const modes = [
    { id: 'topic', icon: '📌', title: '按知识点练习', desc: '选择题型专项训练' },
    { id: 'random', icon: '🎲', title: '随机抽题', desc: '随机出题综合练习' },
    { id: 'mock', icon: '📝', title: '模拟测试', desc: '限时完整测试' },
    { id: 'error', icon: '❌', title: '错题重练', desc: '复习做错的题目' }
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
  renderModeCards();
  renderConfig();
}

// ==================== 配置面板 ====================
function renderConfig() {
  const panel = document.getElementById('config-panel');
  const mode = practiceState.mode;

  let html = '';

  // 错题重练模式：不需要配置
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

  document.getElementById('btn-start').style.display = '';

  // 题型选择（topic模式显示，random/mock可选all）
  if (mode === 'topic') {
    html += `<div class="config-row"><span class="config-label">题型</span><div class="chip-group">`;
    html += `<span class="chip chip--active" onclick="selectType('all', this)">全部</span>`;
    for (const [key, val] of Object.entries(QUESTION_TYPES)) {
      html += `<span class="chip" onclick="selectType('${key}', this)">${val.icon} ${val.name}</span>`;
    }
    html += `</div></div>`;
  }

  // 难度
  html += `<div class="config-row"><span class="config-label">难度</span><div class="chip-group">`;
  html += `<span class="chip chip--active" onclick="selectDifficulty('mixed', this)">混合</span>`;
  for (const [key, val] of Object.entries(DIFFICULTIES)) {
    html += `<span class="chip chip--${val.color}" onclick="selectDifficulty('${key}', this)">${val.name}</span>`;
  }
  html += `</div></div>`;

  // 数量
  const counts = mode === 'mock' ? [20, 30, 50] : [5, 10, 15, 20];
  html += `<div class="config-row"><span class="config-label">题量</span><div class="chip-group">`;
  for (const c of counts) {
    html += `<span class="chip${c === practiceState.count ? ' chip--active' : ''}" onclick="selectCount(${c}, this)">${c}题</span>`;
  }
  html += `</div></div>`;

  // 模拟测试显示限时
  if (mode === 'mock') {
    const minutes = practiceState.count * 2;
    html += `<div class="config-row"><span class="config-label">限时</span><span style="color:var(--color-text-secondary);font-size:0.88rem;">${minutes} 分钟</span></div>`;
  }

  panel.innerHTML = html;
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

// ==================== 开始练习 ====================
function startPractice() {
  practiceState.questions = generateQuestions(
    practiceState.type,
    practiceState.difficulty,
    practiceState.count
  );
  if (practiceState.questions.length === 0) {
    showToast('题目生成失败，请重试');
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

  const typeInfo = QUESTION_TYPES[q.type] || { name: q.type, color: 'pinyin' };
  const diffInfo = DIFFICULTIES[q.difficulty] || { name: '', color: 'easy' };
  const total = practiceState.questions.length;
  const idx = practiceState.currentIdx;

  // 进度
  document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;
  document.getElementById('quiz-info-current').textContent = `第 ${idx + 1} 题`;
  document.getElementById('quiz-info-total').textContent = `共 ${total} 题`;

  // 题目卡片
  let html = `<div class="question-card fade-in">
    <span class="question-card__type question-card__type--${typeInfo.color}">${typeInfo.icon || ''} ${typeInfo.name}</span>
    <span class="question-card__difficulty question-card__difficulty--${diffInfo.color}">${diffInfo.name}</span>
    <div class="question-card__text">${formatQuestionText(q.question)}</div>`;

  if (q.isFill) {
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
    html += `<button class="btn-primary" onclick="${q.isFill ? 'submitFill()' : 'submitOption()'}">确认作答</button>`;
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
  const correct = userAnswer === q.answer.trim() ||
    userAnswer.replace(/[，,。.!！？?]/g, '') === q.answer.trim().replace(/[，,。.!！？?]/g, '');
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
      const typeInfo = QUESTION_TYPES[q.type] || { name: q.type };
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
