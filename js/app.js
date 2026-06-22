/**
 * app.js - 首页逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) {
    document.getElementById('app').innerHTML = '<div class="loading"><div class="loading__spinner"></div>数据加载失败，请刷新重试</div>';
    return;
  }
  renderHeroStats();
  renderDashboard();
  renderQuickEntries();
  renderKnowledgeMap();
  setupNavbar();
});

function renderHeroStats() {
  const stats = getContentStats();
  document.getElementById('stat-parts').textContent = stats.parts;
  document.getElementById('stat-sections').textContent = stats.sections;
  document.getElementById('stat-items').textContent = stats.items;
}

function renderDashboard() {
  const browsed = ProgressTracker.getBrowsedCount();
  const total = ProgressTracker.getTotalSections();
  const progressPct = total > 0 ? Math.round(browsed / total * 100) : 0;
  const scoreStats = ProgressTracker.getScoreStats();
  const bookmarkCount = ProgressTracker.getBookmarkCount();
  const errorCount = ProgressTracker.getErrorCount();
  const noteCount = ProgressTracker.getNoteCount();

  document.getElementById('dash-progress').textContent = progressPct + '%';
  document.getElementById('dash-progress-label').textContent = `学习进度（已浏览 ${browsed}/${total} 节）`;
  document.getElementById('dash-score').textContent = scoreStats.count > 0 ? scoreStats.avg + '分' : '—';
  document.getElementById('dash-score-label').textContent = `练习平均分（共 ${scoreStats.count} 次）`;
  document.getElementById('dash-bookmark').textContent = bookmarkCount;
  document.getElementById('dash-bookmark-label').textContent = `收藏知识点${noteCount > 0 ? ` · ${noteCount}条笔记` : ''}`;
  document.getElementById('dash-error').textContent = errorCount;
  document.getElementById('dash-error-label').textContent = '错题待复习';
}

function renderQuickEntries() {
  const entries = [
    { icon: '📚', title: '知识学习', desc: '系统学习基础知识', url: 'knowledge.html' },
    { icon: '🎯', title: '刷题练习', desc: '专项训练与模拟测试', url: 'practice.html' },
    { icon: '❌', title: '错题本', desc: '复习做错的题目', url: 'errorbook.html' },
    { icon: '🔍', title: '全文搜索', desc: '快速查找知识点', url: 'search.html' },
  ];
  document.getElementById('quick-entries').innerHTML = entries.map(e => `
    <a class="quick-entry fade-in" href="${e.url}">
      <div class="quick-entry__icon">${e.icon}</div>
      <div class="quick-entry__title">${e.title}</div>
      <div class="quick-entry__desc">${e.desc}</div>
    </a>
  `).join('');
}

function renderKnowledgeMap() {
  const bians = getBians();
  const icons = ['🏗️', '📖', '✍️'];
  document.getElementById('knowledge-map-grid').innerHTML = bians.map((bian, i) => {
    const partsHtml = bian.parts.map(part => {
      const sectionCount = part.sections.length;
      return `<a class="km-item" href="knowledge.html?bian=${bian.id}&part=${part.id}&sec=0">
        <span class="km-item__dot"></span>
        <span>${part.name}</span>
        <span style="margin-left:auto;font-size:0.75rem;color:var(--color-text-tertiary);">${sectionCount}节</span>
      </a>`;
    }).join('');
    return `<div class="km-column fade-in">
      <div class="km-column__header">
        <span>${icons[i] || '📄'}</span><span>${bian.name}</span>
        <span class="km-column__badge">${bian.parts.length}部</span>
      </div>${partsHtml}</div>`;
  }).join('');
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}
