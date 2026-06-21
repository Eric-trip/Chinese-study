/**
 * search.js - 全文搜索逻辑（适配扁平数据结构）
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

  renderHotSearches();
});

function renderHotSearches() {
  const hot = ['多音字', '成语', '修辞手法', '病句', '论语', '出师表', '诗经'];
  const container = document.getElementById('hot-searches');
  if (!container) return;
  container.innerHTML = hot.map(k => 
    `<button class="chip" onclick="document.getElementById('search-input').value='${k}';doSearch()">${k}</button>`
  ).join('');
}

function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  if (!query) {
    resultsEl.innerHTML = '';
    return;
  }

  // 从扁平 content 构建搜索索引
  const content = HANDBOOK_DATA.content || [];
  const results = [];
  const qLower = query.toLowerCase();

  // 遍历扁平数组，记录当前所在章节路径
  let currentBian = '', currentPart = '', currentSection = '';
  let currentBianId = 1, currentPartId = 1, currentSectionIndex = 0;
  const sectionMap = new Map(); // part_heading_index → section_count

  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (item.type === 'heading') {
      const text = (item.text || '').trim();
      if (item.level === 1 && (text.includes('第') && text.includes('编'))) {
        if (text.includes('第一编')) { currentBianId = 1; currentBian = '基础知识'; }
        else if (text.includes('第二编')) { currentBianId = 2; currentBian = '阅读理解'; }
        else if (text.includes('第三编')) { currentBianId = 3; currentBian = '写作'; }
        currentPartId = 1;
        currentSectionIndex = 0;
      } else if (item.level === 2 && text.includes('部分')) {
        currentPart = text.replace(/^第[一二三四五六七八九十]+部分\s*/, '');
        currentSectionIndex = 0;
        if (currentBianId === 1 && currentPartId < 12) currentPartId++;
        else if (currentBianId === 2 && currentPartId < 7) currentPartId++;
        else if (currentBianId === 3 && currentPartId < 2) currentPartId++;
      } else if (item.level === 3) {
        currentSection = text;
        currentSectionIndex++;
      }
    }

    // 搜索匹配
    const text = item.text || item.html || '';
    if (text && text.toLowerCase().includes(qLower)) {
      // 限制每个位置只取前后文
      const idx = text.toLowerCase().indexOf(qLower);
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + query.length + 50);
      const snippet = (start > 0 ? '...' : '') + text.substring(start, end).replace(/<[^>]+>/g, '') + (end < text.length ? '...' : '');

      results.push({
        bianId: currentBianId,
        partId: currentPartId,
        sectionIndex: Math.max(0, currentSectionIndex - 1),
        path: `${currentBian} / ${currentPart}`,
        title: currentSection || currentPart || '内容',
        snippet
      });

      if (results.length >= 50) break;
    }
  }

  if (results.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__text">没有找到"${query}"的相关内容</div><div class="empty-state__subtext">试试其他关键词？</div></div>`;
    return;
  }

  resultsEl.innerHTML = results.map(r => `
    <a class="search-result-item fade-in" href="knowledge.html?bian=${r.bianId}&part=${r.partId}&sec=${r.sectionIndex}">
      <div class="search-result-item__path">${highlightText(r.path, query)}</div>
      <div class="search-result-item__title">${highlightText(r.title, query)}</div>
      <div class="search-result-item__snippet">${highlightText(r.snippet, query)}</div>
    </a>
  `).join('');
}

function highlightText(text, query) {
  if (!text || !query) return text || '';
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}
