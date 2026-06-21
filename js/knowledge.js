/**
 * knowledge.js - 知识页逻辑（适配扁平数据结构）
 */
let currentState = { bianId: 1, partId: 1, sectionIndex: 0 };
let currentTablePage = 1;

document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) {
    document.getElementById('section-content').innerHTML = '<div class="loading"><div class="loading__spinner"></div>数据加载失败</div>';
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const bianId = parseInt(params.get('bian')) || 1;
  const partId = parseInt(params.get('part')) || 1;
  const sectionIndex = parseInt(params.get('sec')) || 0;
  currentState = { bianId, partId, sectionIndex };
  renderSidebar();
  loadSection(bianId, partId, sectionIndex);
  setupNavbar();
  setupSidebarToggle();
  setupBackToTop();
  initSelectionLookup('#section-content');
});

// ==================== 侧边栏目录树 ====================
function renderSidebar() {
  const bians = getBians();
  const container = document.getElementById('sidebar-tree');
  let html = '';
  for (const bian of bians) {
    const isCurrentBian = bian.id === currentState.bianId;
    html += `<div class="tree-item">
      <div class="tree-node tree-node--bian${isCurrentBian ? ' tree-node--active' : ''}" onclick="toggleTree('bian-${bian.id}')">
        <span class="tree-arrow${isCurrentBian ? ' tree-arrow--expanded' : ''}">▶</span>
        <span>${bian.name}</span>
      </div>
      <div class="tree-children" id="bian-${bian.id}" style="${isCurrentBian ? '' : 'display:none'}">`;
    for (const part of bian.parts) {
      const isCurrentPart = bian.id === currentState.bianId && part.id === currentState.partId;
      html += `<div class="tree-item">
        <div class="tree-node tree-node--part${isCurrentPart ? ' tree-node--active' : ''}" onclick="toggleTree('part-${bian.id}-${part.id}', event)">
          <span class="tree-arrow${isCurrentPart ? ' tree-arrow--expanded' : ''}">▶</span>
          <span>${part.name}</span>
        </div>
        <div class="tree-children" id="part-${bian.id}-${part.id}" style="${isCurrentPart ? '' : 'display:none'}">`;
      part.sections.forEach((sec, si) => {
        const isCurrent = bian.id === currentState.bianId && part.id === currentState.partId && si === currentState.sectionIndex;
        html += `<div class="tree-node tree-node--section${isCurrent ? ' tree-node--active' : ''}" onclick="loadSection(${bian.id}, ${part.id}, ${si}); event.stopPropagation();">
          ${sec.name}
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

function toggleTree(id, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.style.display === 'none';

  const level = id.startsWith('bian-') ? 'bian' : 'part';
  if (isHidden) {
    if (level === 'bian') {
      document.querySelectorAll('.tree-children[id^="bian-"]').forEach(sib => {
        if (sib.id !== id) {
          sib.style.display = 'none';
          const arrow = sib.previousElementSibling?.querySelector('.tree-arrow');
          if (arrow) arrow.classList.remove('tree-arrow--expanded');
        }
      });
    } else if (level === 'part') {
      const parentBian = el.closest('.tree-children[id^="bian-"]');
      if (parentBian) {
        parentBian.querySelectorAll(':scope > .tree-item > .tree-children[id^="part-"]').forEach(sib => {
          if (sib.id !== id) {
            sib.style.display = 'none';
            const arrow = sib.previousElementSibling?.querySelector('.tree-arrow');
            if (arrow) arrow.classList.remove('tree-arrow--expanded');
          }
        });
      }
    }
  }

  el.style.display = isHidden ? '' : 'none';
  const arrow = el.previousElementSibling?.querySelector('.tree-arrow');
  if (arrow) arrow.classList.toggle('tree-arrow--expanded', isHidden);
}

// ==================== 加载内容 ====================
function loadSection(bianId, partId, sectionIndex) {
  currentState = { bianId, partId, sectionIndex };
  currentTablePage = 1;

  const navPath = getNavPath(bianId, partId, sectionIndex);
  if (!navPath.partName) return;

  // 面包屑
  document.getElementById('breadcrumb').innerHTML = `
    <a class="breadcrumb__item" href="index.html">首页</a>
    <span class="breadcrumb__sep">/</span>
    <span class="breadcrumb__item">${navPath.bianName}</span>
    <span class="breadcrumb__sep">/</span>
    <span class="breadcrumb__item">${navPath.partName}</span>
    <span class="breadcrumb__sep">/</span>
    <span class="breadcrumb__item" style="color:var(--color-text-secondary);">${navPath.sectionName}</span>
  `;

  document.getElementById('content-title').textContent = navPath.partName;
  document.getElementById('content-section-name').textContent = navPath.sectionName;

  document.querySelectorAll('.tree-node--section').forEach(n => n.classList.remove('tree-node--active'));
  document.querySelectorAll('.tree-node--part').forEach(n => n.classList.remove('tree-node--active'));
  document.querySelectorAll('.tree-node--bian').forEach(n => n.classList.remove('tree-node--active'));

  // 渲染内容
  const contentEl = document.getElementById('section-content');
  const nodes = getSectionContent(bianId, partId, sectionIndex);
  contentEl.innerHTML = renderFlatContent(nodes);

  renderNoteArea();
  updateBookmarkBtn();
  renderNavButtons();
  ProgressTracker.recordBrowse(bianId, partId, sectionIndex);

  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar__overlay');
  if (sidebar) sidebar.classList.remove('sidebar--open');
  if (overlay) overlay.classList.remove('sidebar__overlay--visible');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== 内容渲染（扁平结构）====================
/**
 * 遍历扁平内容节点，按 type 分发渲染
 * - heading: 按 level 渲染为 h4/h5/h6
 * - paragraph: 渲染为段落文本
 * - table: 解析 HTML 表格，转为分页表格渲染
 * - image: 跳过（不渲染）
 */
function renderFlatContent(nodes) {
  if (!nodes || nodes.length === 0) {
    return '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
  }

  let html = '';
  let inList = false;

  for (const node of nodes) {
    if (!node || !node.type) continue;

    switch (node.type) {
      case 'heading': {
        if (inList) { html += '</ul>'; inList = false; }
        const level = node.level || 4;
        const text = formatText(node.text || '');
        if (level <= 3) {
          html += `<h3 class="subsection__title">${text}</h3>`;
        } else if (level === 4) {
          html += `<h4 class="sub-item__title">${text}</h4>`;
        } else {
          html += `<h5 class="content-subtitle">${text}</h5>`;
        }
        break;
      }

      case 'paragraph': {
        if (inList) { html += '</ul>'; inList = false; }
        const text = node.text || '';
        if (text.trim()) {
          html += `<div class="content-text">${formatText(text)}</div>`;
        }
        break;
      }

      case 'table': {
        if (inList) { html += '</ul>'; inList = false; }
        html += renderHtmlTable(node.html || '');
        break;
      }

      case 'image': {
        // 跳过，不渲染
        break;
      }
    }
  }
  if (inList) html += '</ul>';

  return html || '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
}

/**
 * 将 HTML 表格字符串解析为 {headers, rows} 然后复用已有的分页表格渲染
 */
function renderHtmlTable(htmlStr) {
  if (!htmlStr) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString('<table>' + htmlStr.replace(/^<table>|<\/table>$/g, '') + '</table>', 'text/html');
    const tableEl = doc.querySelector('table');
    if (!tableEl) return '';

    const rows = [];
    let headers = [];

    const trList = tableEl.querySelectorAll('tr');
    trList.forEach((tr, ri) => {
      const cells = [];
      tr.querySelectorAll('td,th').forEach(cell => {
        cells.push(cell.textContent.trim());
      });
      if (cells.length === 0) return;

      // 第一行如果只有一个 cell 且是字母（如 "A"），当作分类标题
      if (ri === 0 && cells.length <= 2) {
        // 判断是否是表头（如 "A" "B" 等字母）
        if (cells.length === 1 && /^[A-Z]$/.test(cells[0])) {
          // 字母分组标题，不做表头
          rows.push(cells);
          return;
        }
        if (cells.length === 2 && cells[0] === '') {
          // 第一列空，第二列是字母
          rows.push(cells);
          return;
        }
      }

      // 判断第一行是否是表头
      if (ri === 0 && headers.length === 0) {
        const ths = tr.querySelectorAll('th');
        if (ths.length > 0) {
          headers = cells;
          return;
        }
        // 如果没有 th，但第一行看起来像表头（短文字），也当表头
        // 对于易错词表格，第一行可能是 "A" 这种字母，不当表头
        if (cells.length >= 2 && cells.every(c => c.length <= 10)) {
          // 不确定是表头还是数据，先当数据
          rows.push(cells);
        } else {
          rows.push(cells);
        }
      } else {
        rows.push(cells);
      }
    });

    // 如果没有明确表头，用第一行数据做表头（适用于有标题的表格）
    if (headers.length === 0 && rows.length > 0) {
      // 判断第一行是否像表头（如"容易读错的词语1499个"这种）
      const firstRow = rows[0];
      if (firstRow.length <= 2 && firstRow[0].length > 3) {
        // 可能是分类标题，不做表头
      } else if (firstRow.length >= 2) {
        headers = firstRow;
        rows.shift();
      }
    }

    if (rows.length === 0) return '';
    if (headers.length === 0) headers = Array.from({length: rows[0].length}, (_, i) => `列${i+1}`);

    return renderTable({ headers, rows });
  } catch (e) {
    console.error('表格解析失败:', e);
    return '';
  }
}

function formatText(text) {
  if (!text) return '';
  if (typeof text !== 'string') return '';
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/\n/g, '<br>');
  text = text.replace(/(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '<span class="highlight-accent">$1</span>');
  return text;
}

function renderTable(table) {
  if (!table || !table.headers || !table.rows || table.rows.length === 0) return '';

  const col2MaxLen = table.rows.length > 0
    ? Math.max(...table.rows.map(r => (r[1] || '').length))
    : 0;
  const isCompact = table.headers.length === 2 && table.rows.length > 30 && col2MaxLen <= 20;
  const PAGE_SIZE = isCompact ? 60 : 15;
  const totalPages = Math.ceil(table.rows.length / PAGE_SIZE);
  const tableId = 'table-' + Math.random().toString(36).substr(2, 9);

  let html = `<div id="${tableId}">`;

  if (isCompact) {
    html += `<div class="compact-grid" id="${tableId}-body"></div>`;
  } else {
    html += `<table class="data-table"><thead><tr>`;
    for (const h of table.headers) html += `<th>${h}</th>`;
    html += `</tr></thead><tbody id="${tableId}-body">`;
    html += `</tbody></table>`;
  }

  if (totalPages > 1) {
    html += `<div class="table-pagination">
      <button onclick="changeTablePage('${tableId}', ${table.rows.length}, ${PAGE_SIZE}, 1, 'prev')" id="${tableId}-prev" disabled>上一页</button>`;
    for (let p = 1; p <= totalPages; p++) {
      html += `<button onclick="changeTablePage('${tableId}', ${table.rows.length}, ${PAGE_SIZE}, ${p})" class="${p === 1 ? 'active' : ''}" id="${tableId}-btn-${p}">${p}</button>`;
    }
    html += `<button onclick="changeTablePage('${tableId}', ${table.rows.length}, ${PAGE_SIZE}, ${totalPages}, 'next')" id="${tableId}-next">下一页</button>`;
    html += `<span class="table-pagination__info">共 ${table.rows.length} 条</span>`;
    html += `</div>`;
  } else {
    html += `<div class="table-pagination__info" style="text-align:center;padding:8px;">共 ${table.rows.length} 条</div>`;
  }

  html += `</div>`;

  setTimeout(() => {
    window[tableId + '_data'] = table.rows;
    window[tableId + '_pageSize'] = PAGE_SIZE;
    window[tableId + '_totalPages'] = totalPages;
    window[tableId + '_compact'] = isCompact;
    renderTablePage(tableId, 1);
  }, 0);

  return html;
}

function renderTablePage(tableId, page) {
  const rows = window[tableId + '_data'];
  const pageSize = window[tableId + '_pageSize'];
  const isCompact = window[tableId + '_compact'];
  if (!rows) return;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  const body = document.getElementById(tableId + '-body');
  if (!body) return;
  let html = '';
  if (isCompact) {
    for (let i = start; i < end; i++) {
      const row = rows[i];
      html += `<div class="compact-grid__cell">`;
      html += `<span class="compact-grid__main">${row[0] || ''}</span>`;
      if (row[1]) html += `<span class="compact-grid__sub">${row[1]}</span>`;
      html += `</div>`;
    }
  } else {
    for (let i = start; i < end; i++) {
      html += '<tr>';
      for (const cell of rows[i]) {
        html += `<td>${cell || ''}</td>`;
      }
      html += '</tr>';
    }
  }
  body.innerHTML = html;
}

function changeTablePage(tableId, totalRows, pageSize, page, dir) {
  const totalPages = window[tableId + '_totalPages'];
  if (dir === 'prev') page = Math.max(1, currentTablePage - 1);
  if (dir === 'next') page = Math.min(totalPages, currentTablePage + 1);
  currentTablePage = page;

  renderTablePage(tableId, page);

  document.querySelectorAll(`[id^="${tableId}-btn-"]`).forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`${tableId}-btn-${page}`);
  if (activeBtn) activeBtn.classList.add('active');

  const prevBtn = document.getElementById(`${tableId}-prev`);
  const nextBtn = document.getElementById(`${tableId}-next`);
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

// ==================== 笔记区 ====================
function renderNoteArea() {
  const { bianId, partId, sectionIndex } = currentState;
  const existing = ProgressTracker.getNote(bianId, partId, sectionIndex);
  document.getElementById('note-area').innerHTML = `
    <h4>📝 我的笔记</h4>
    <textarea placeholder="在这里记录你的学习笔记..." id="note-textarea">${existing}</textarea>
    <div class="note-area__hint">笔记自动保存在本地浏览器中</div>
  `;
  const textarea = document.getElementById('note-textarea');
  if (textarea) {
    let saveTimer = null;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        ProgressTracker.saveNote(bianId, partId, sectionIndex, textarea.value);
        showToast('笔记已保存');
      }, 800);
    });
  }
}

// ==================== 收藏 ====================
function toggleBookmark() {
  const { bianId, partId, sectionIndex } = currentState;
  const added = ProgressTracker.toggleBookmark(bianId, partId, sectionIndex);
  showToast(added ? '已收藏' : '已取消收藏');
  updateBookmarkBtn();
}

function updateBookmarkBtn() {
  const { bianId, partId, sectionIndex } = currentState;
  const isBookmarked = ProgressTracker.isBookmarked(bianId, partId, sectionIndex);
  const btn = document.getElementById('btn-bookmark');
  if (btn) {
    btn.classList.toggle('toolbar__btn--active', isBookmarked);
    btn.innerHTML = isBookmarked
      ? '<span>⭐</span> 已收藏'
      : '<span>☆</span> 收藏';
  }
}

// ==================== 朗读 ====================
function toggleReadAloud() {
  const nodes = getSectionContent(currentState.bianId, currentState.partId, currentState.sectionIndex);
  let text = '';
  for (const node of nodes) {
    if (node.type === 'heading' || node.type === 'paragraph') {
      text += ' ' + (node.text || '');
    } else if (node.type === 'table') {
      text += ' ' + (node.html || '').replace(/<[^>]+>/g, ' ');
    }
  }
  if (!text.trim()) { showToast('该章节没有可朗读的内容'); return; }
  const isReading = toggleReadAloudCore(text.substring(0, 2000));
  const btn = document.getElementById('btn-read');
  if (btn) {
    btn.classList.toggle('toolbar__btn--active', isReading);
    btn.innerHTML = isReading ? '<span>⏸️</span> 停止' : '<span>🔊</span> 朗读';
  }
}

function toggleReadAloudCore(text) {
  if (!('speechSynthesis' in window)) { showToast('浏览器不支持语音朗读'); return false; }
  if (window._currentUtterance) {
    speechSynthesis.cancel();
    window._currentUtterance = null;
    return false;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.9;
  u.onend = () => {
    window._currentUtterance = null;
    const btn = document.getElementById('btn-read');
    if (btn) { btn.classList.remove('toolbar__btn--active'); btn.innerHTML = '<span>🔊</span> 朗读'; }
  };
  window._currentUtterance = u;
  speechSynthesis.speak(u);
  return true;
}

// ==================== 分享链接 ====================
function copySectionLink() {
  const { bianId, partId, sectionIndex } = currentState;
  const url = `${location.origin}${location.pathname}?bian=${bianId}&part=${partId}&sec=${sectionIndex}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('链接已复制'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('链接已复制');
  }
}

// ==================== 前后导航 ====================
function renderNavButtons() {
  const { bianId, partId, sectionIndex } = currentState;
  const sections = getSections(bianId, partId);
  const prevSec = sectionIndex > 0 ? sectionIndex - 1 : null;
  const nextSec = sectionIndex < sections.length - 1 ? sectionIndex + 1 : null;

  document.getElementById('nav-buttons').innerHTML = `
    <button class="nav-btn" ${prevSec === null ? 'disabled' : ''} onclick="loadSection(${bianId}, ${partId}, ${prevSec})">
      ← 上一节
    </button>
    <button class="nav-btn" ${nextSec === null ? 'disabled' : ''} onclick="loadSection(${bianId}, ${partId}, ${nextSec})">
      下一节 →
    </button>
  `;
}

// ==================== 侧边栏搜索 ====================
function filterSidebar(query) {
  const nodes = document.querySelectorAll('.tree-node--section, .tree-node--part');
  const q = query.trim().toLowerCase();
  if (!q) {
    nodes.forEach(n => n.style.display = '');
    return;
  }
  nodes.forEach(n => {
    const text = n.textContent.toLowerCase();
    n.style.display = text.includes(q) ? '' : 'none';
  });
}

// ==================== UI 设置 ====================
function setupSidebarToggle() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar__overlay');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar--open');
      overlay?.classList.toggle('sidebar__overlay--visible');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('sidebar--open');
      overlay.classList.remove('sidebar__overlay--visible');
    });
  }
}

function setupNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
}

function setupBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('back-to-top--visible', window.scrollY > 300);
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
