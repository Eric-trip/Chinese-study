/**
 * knowledge.js - 知识页逻辑
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
      const isCurrentPart = bian.id === currentState.bianId && part.part_id === currentState.partId;
      html += `<div class="tree-item">
        <div class="tree-node tree-node--part${isCurrentPart ? ' tree-node--active' : ''}" onclick="toggleTree('part-${bian.id}-${part.part_id}', event)">
          <span class="tree-arrow${isCurrentPart ? ' tree-arrow--expanded' : ''}">▶</span>
          <span>${part.part_name}</span>
        </div>
        <div class="tree-children" id="part-${bian.id}-${part.part_id}" style="${isCurrentPart ? '' : 'display:none'}">`;
      part.sections.forEach((sec, si) => {
        const isCurrent = bian.id === currentState.bianId && part.part_id === currentState.partId && si === currentState.sectionIndex;
        html += `<div class="tree-node tree-node--section${isCurrent ? ' tree-node--active' : ''}" onclick="loadSection(${bian.id}, ${part.part_id}, ${si}); event.stopPropagation();">
          ${sec.section_name}
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
  el.style.display = isHidden ? '' : 'none';
  const arrow = el.previousElementSibling?.querySelector('.tree-arrow');
  if (arrow) arrow.classList.toggle('tree-arrow--expanded', isHidden);
}

// ==================== 加载内容 ====================
function loadSection(bianId, partId, sectionIndex) {
  currentState = { bianId, partId, sectionIndex };
  currentTablePage = 1;

  const section = getSection(bianId, partId, sectionIndex);
  const navPath = getNavPath(bianId, partId, sectionIndex);
  if (!section) return;

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

  // 标题
  document.getElementById('content-title').textContent = navPath.partName;
  document.getElementById('content-section-name').textContent = navPath.sectionName;

  // 更新侧边栏高亮
  document.querySelectorAll('.tree-node--section').forEach(n => n.classList.remove('tree-node--active'));
  document.querySelectorAll('.tree-node--part').forEach(n => n.classList.remove('tree-node--active'));
  document.querySelectorAll('.tree-node--bian').forEach(n => n.classList.remove('tree-node--active'));

  // 渲染内容
  const contentEl = document.getElementById('section-content');
  contentEl.innerHTML = renderSectionContent(section);

  // 笔记区
  renderNoteArea();

  // 收藏状态
  updateBookmarkBtn();

  // 前后导航
  renderNavButtons();

  // 记录浏览
  ProgressTracker.recordBrowse(bianId, partId, sectionIndex);

  // 关闭移动端侧边栏
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar__overlay');
  if (sidebar) sidebar.classList.remove('sidebar--open');
  if (overlay) overlay.classList.remove('sidebar__overlay--visible');

  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== 内容渲染 ====================
function renderSectionContent(section) {
  let html = '';

  // 简单文本内容
  if (section.content) {
    html += `<div class="content-text">${formatText(section.content)}</div>`;
  }

  // 子节
  if (section.subsections) {
    for (const sub of section.subsections) {
      html += `<div class="subsection">`;
      if (sub.title) html += `<h3 class="subsection__title">${sub.title}</h3>`;
      if (sub.content) html += `<div class="content-text">${formatText(sub.content)}</div>`;

      // content数组（可能是表格）
      if (sub.content && Array.isArray(sub.content)) {
        for (const item of sub.content) {
          if (item && typeof item === 'object' && item.headers && item.rows) {
            html += renderTable(item);
          }
        }
      }

      // 子项
      if (sub.sub_items) {
        for (const item of sub.sub_items) {
          html += `<div class="sub-item">`;
          if (item.title) html += `<div class="sub-item__title">${item.title}</div>`;
          if (item.content) html += `<div class="content-text">${formatText(item.content)}</div>`;
          if (item.table) html += renderTable(item.table);
          html += `</div>`;
        }
      }

      // 直接挂在subsection上的table
      if (sub.table) {
        html += renderTable(sub.table);
      }
      html += `</div>`;
    }
  }

  return html || '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
}

function formatText(text) {
  if (!text) return '';
  if (typeof text !== 'string') return '';
  // 转义HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 换行
  text = text.replace(/\n/g, '<br>');
  // 序号高亮
  text = text.replace(/(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '<span class="highlight-accent">$1</span>');
  return text;
}

function renderTable(table) {
  if (!table || !table.headers || !table.rows || table.rows.length === 0) return '';
  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(table.rows.length / PAGE_SIZE);
  const tableId = 'table-' + Math.random().toString(36).substr(2, 9);

  let html = `<div id="${tableId}">`;
  html += `<table class="data-table"><thead><tr>`;
  for (const h of table.headers) html += `<th>${h}</th>`;
  html += `</tr></thead><tbody id="${tableId}-body">`;
  html += `</tbody></table>`;

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

  // 存储表格数据供分页使用
  setTimeout(() => {
    window[tableId + '_data'] = table.rows;
    window[tableId + '_pageSize'] = PAGE_SIZE;
    window[tableId + '_totalPages'] = totalPages;
    renderTablePage(tableId, 1);
  }, 0);

  return html;
}

function renderTablePage(tableId, page) {
  const rows = window[tableId + '_data'];
  const pageSize = window[tableId + '_pageSize'];
  if (!rows) return;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  const body = document.getElementById(tableId + '-body');
  if (!body) return;
  let html = '';
  for (let i = start; i < end; i++) {
    html += '<tr>';
    for (const cell of rows[i]) {
      html += `<td>${cell || ''}</td>`;
    }
    html += '</tr>';
  }
  body.innerHTML = html;
}

function changeTablePage(tableId, totalRows, pageSize, page, dir) {
  const totalPages = window[tableId + '_totalPages'];
  if (dir === 'prev') page = Math.max(1, currentTablePage - 1);
  if (dir === 'next') page = Math.min(totalPages, currentTablePage + 1);
  currentTablePage = page;

  renderTablePage(tableId, page);

  // 更新按钮状态
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
  const section = getSection(currentState.bianId, currentState.partId, currentState.sectionIndex);
  if (!section) return;
  let text = section.content || '';
  if (section.subsections) {
    for (const sub of section.subsections) {
      if (sub.title) text += ' ' + sub.title;
      if (sub.content && typeof sub.content === 'string') text += ' ' + sub.content;
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

// 朗读核心函数（重命名避免与data.js冲突）
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
