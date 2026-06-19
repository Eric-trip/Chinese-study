/**
 * errorbook.js - 错题本逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) return;
  setupNavbar();
  renderErrorBook();
  renderBookmarks();
  renderNotes();
});

// ==================== 错题本 ====================
function renderErrorBook() {
  const errors = ProgressTracker.getErrors();
  const container = document.getElementById('error-list');

  if (errors.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📝</div><div class="empty-state__text">错题本还是空的</div><div class="empty-state__subtext">去<a href="practice.html" style="color:var(--color-primary);">刷题练习</a>中积累错题吧</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="error-actions">
      <span class="error-actions__count">共 ${errors.length} 道错题</span>
      <button class="btn-primary" onclick="location.href='practice.html'">🎯 错题重练</button>
      <button class="btn-secondary" onclick="clearErrors()">🗑️ 清空错题本</button>
    </div>
  ` + errors.map((e, i) => {
    const typeInfo = QUESTION_TYPES[e.type] || { name: e.type, color: 'pinyin' };
    return `<div class="error-item">
      <div class="error-item__header">
        <span class="question-card__type question-card__type--${typeInfo.color}">${typeInfo.icon || ''} ${typeInfo.name}</span>
        <span class="error-item__time">错题 #${i + 1}</span>
        <button class="icon-btn" onclick="removeError(${i})" title="删除">✕</button>
      </div>
      <div class="error-item__question">${e.question.replace(/\n/g, '<br>')}</div>
      <div class="error-item__answer error-item__answer--correct">✅ ${e.answer}</div>
      ${e.explanation ? `<div class="error-item__answer">${e.explanation}</div>` : ''}
    </div>`;
  }).join('');
}

function removeError(idx) {
  if (confirm('确定删除这道错题吗？')) {
    ProgressTracker.removeError(idx);
    renderErrorBook();
    showToast('已删除');
  }
}

function clearErrors() {
  if (confirm('确定清空所有错题吗？此操作不可恢复。')) {
    ProgressTracker.clearErrors();
    renderErrorBook();
    showToast('错题本已清空');
  }
}

// ==================== 收藏列表 ====================
function renderBookmarks() {
  const bookmarks = Storage.get('bookmarks', []);
  const container = document.getElementById('bookmark-list');

  if (bookmarks.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⭐</div><div class="empty-state__text">还没有收藏任何知识点</div><div class="empty-state__subtext">在<a href="knowledge.html" style="color:var(--color-primary);">知识学习</a>中点击收藏按钮即可添加</div></div>`;
    return;
  }

  container.innerHTML = bookmarks.map((b, i) => {
    const navPath = getNavPath(b.bianId, b.partId, b.sectionIndex);
    return `<a class="bookmark-item" href="knowledge.html?bian=${b.bianId}&part=${b.partId}&sec=${b.sectionIndex}">
      <div class="bookmark-item__icon">⭐</div>
      <div class="bookmark-item__content">
        <div class="bookmark-item__title">${navPath.partName} · ${navPath.sectionName}</div>
        <div class="bookmark-item__path">${navPath.bianName} > ${navPath.partName}</div>
      </div>
      <button class="icon-btn" onclick="event.preventDefault();event.stopPropagation();removeBookmark('${b.key}')" title="取消收藏">✕</button>
    </a>`;
  }).join('');
}

function removeBookmark(key) {
  const bookmarks = Storage.get('bookmarks', []).filter(b => b.key !== key);
  Storage.set('bookmarks', bookmarks);
  renderBookmarks();
  showToast('已取消收藏');
}

// ==================== 笔记列表 ====================
function renderNotes() {
  const notes = Storage.get('notes', {});
  const container = document.getElementById('note-list');
  const entries = Object.entries(notes).filter(([k, v]) => v.content && v.content.trim());

  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">✏️</div><div class="empty-state__text">还没有写过笔记</div><div class="empty-state__subtext">在<a href="knowledge.html" style="color:var(--color-primary);">知识学习</a>页面底部可以写笔记</div></div>`;
    return;
  }

  container.innerHTML = entries.map(([key, v]) => {
    const [bianId, partId, secIdx] = key.split('-').map(Number);
    const navPath = getNavPath(bianId, partId, secIdx);
    const date = new Date(v.time).toLocaleDateString('zh-CN');
    return `<a class="note-item" href="knowledge.html?bian=${bianId}&part=${partId}&sec=${secIdx}">
      <div class="note-item__header">
        <span class="note-item__title">${navPath.partName} · ${navPath.sectionName}</span>
        <span class="note-item__time">${date}</span>
      </div>
      <div class="note-item__content">${v.content.substring(0, 100)}${v.content.length > 100 ? '...' : ''}</div>
    </a>`;
  }).join('');
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}
