/**
 * search.js - 全文搜索逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) { document.getElementById('search-results').innerHTML = '<div class="loading"><div class="loading__spinner"></div>数据加载失败</div>'; return; }
  setupNavbar();

  const input = document.getElementById('search-input');
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if (q) { input.value = q; doSearch(); }

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(), 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // 热门搜索
  renderHotSearches();
});

function renderHotSearches() {
  const hot = ['多音字', '成语', '修辞', '病句', '论语', '李白', '杜甫', '标点符号'];
  document.getElementById('hot-searches').innerHTML = hot.map(h =>
    `<span class="chip" onclick="searchTopic('${h}')">${h}</span>`
  ).join('');
}

function searchTopic(topic) {
  document.getElementById('search-input').value = topic;
  doSearch();
}

function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  const resultsEl = document.getElementById('search-results');
  const countEl = document.getElementById('search-count');

  if (!query) {
    resultsEl.innerHTML = '';
    countEl.textContent = '';
    document.getElementById('hot-searches-wrap').style.display = '';
    return;
  }
  document.getElementById('hot-searches-wrap').style.display = 'none';

  const results = searchContent(query);
  countEl.textContent = `找到 ${results.length} 条相关内容`;

  if (results.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__text">没有找到"${query}"的相关内容</div><div class="empty-state__subtext">试试其他关键词？</div></div>`;
    return;
  }

  resultsEl.innerHTML = results.slice(0, 50).map(r => `
    <a class="search-result-item fade-in" href="knowledge.html?bian=${r.bianId}&part=${r.partId}&sec=${r.sectionIndex}">
      <div class="search-result-item__path">${highlightText(r.path, query)}</div>
      <div class="search-result-item__title">${highlightText(r.title, query)}</div>
      <div class="search-result-item__snippet">${highlightText(r.snippet, query)}</div>
    </a>
  `).join('');
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}
