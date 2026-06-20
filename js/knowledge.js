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

  // 手风琴：关闭同级其他展开项
  const level = id.startsWith('bian-') ? 'bian' : 'part';
  if (isHidden) {
    if (level === 'bian') {
      // 关闭其他编
      document.querySelectorAll('.tree-children[id^="bian-"]').forEach(sib => {
        if (sib.id !== id) {
          sib.style.display = 'none';
          const arrow = sib.previousElementSibling?.querySelector('.tree-arrow');
          if (arrow) arrow.classList.remove('tree-arrow--expanded');
        }
      });
    } else if (level === 'part') {
      // 关闭同编下的其他部
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
  if (section.content && typeof section.content === 'string') {
    html += `<div class="content-text">${formatText(section.content)}</div>`;
  }

  // 子节
  if (section.subsections) {
    for (const sub of section.subsections) {
      html += `<div class="subsection">`;
      if (sub.title) html += `<h3 class="subsection__title">${sub.title}</h3>`;

      // content: 字符串
      if (sub.content && typeof sub.content === 'string' && sub.content.trim()) {
        html += `<div class="content-text">${formatText(sub.content)}</div>`;
      }

      // content: 单个表格对象 {type:"table", headers, rows}
      if (sub.content && typeof sub.content === 'object' && !Array.isArray(sub.content) && sub.content.headers) {
        html += renderTable(sub.content);
      }

      // content: 数组（可能包含子条目或表格）
      if (sub.content && Array.isArray(sub.content)) {
        for (const item of sub.content) {
          if (!item || typeof item !== 'object') continue;
          // 表格对象
          if (item.headers && item.rows) {
            html += renderTable(item);
          }
          // 子条目 {title, content, table}
          else if (item.title || item.content || item.table) {
            html += `<div class="sub-item">`;
            if (item.title) html += `<div class="sub-item__title">${item.title}</div>`;
            if (item.content && typeof item.content === 'string') {
              html += `<div class="content-text">${formatText(item.content)}</div>`;
            }
            if (item.content && typeof item.content === 'object' && !Array.isArray(item.content) && item.content.headers) {
              html += renderTable(item.content);
            }
            if (item.table) html += renderTable(item.table);
            html += `</div>`;
          }
        }
      }

      // tables（复数）：多个表格
      if (sub.tables && Array.isArray(sub.tables)) {
        for (const tbl of sub.tables) {
          if (tbl && tbl.headers && tbl.rows) {
            html += renderTable(tbl);
          }
        }
      }

      // 子项
      if (sub.sub_items) {
        for (const item of sub.sub_items) {
          html += renderSubItem(item);
        }
      }

      // 词组辨析列表（实词/虚词/成语/重点词语）
      if (sub.word_groups && Array.isArray(sub.word_groups)) {
        html += renderWordGroups(sub.word_groups);
      }

      // subsection 自身的 items 字段
      // 结构1：{letter, list} — 按字母分组的词语列表（如容易读错的成语）
      // 结构2：{letter, table} — 按字母分组的表格（如多音字）
      // 结构3：{id, content} — 编号句子列表（如巧记多音多义字）
      // 结构4：古诗词/文言文名句卡片（由 renderItemsList 处理）
      if (sub.items && Array.isArray(sub.items)) {
        // 判断 items 类型
        const first = sub.items[0];
        if (first && first.letter !== undefined && first.list !== undefined) {
          // 结构1：按字母分组的词语列表
          html += renderLetterList(sub.items);
        } else if (first && first.letter !== undefined && first.table !== undefined) {
          // 结构2：按字母分组的表格
          for (const it of sub.items) {
            if (it.letter) html += `<div class="letter-group__label">${it.letter}</div>`;
            if (it.table) html += renderTable(it.table);
          }
        } else if (first && first.id !== undefined && first.content !== undefined) {
          // 结构3：编号句子列表
          html += renderNumberedSentences(sub.items);
        } else {
          // 结构4：古诗词/名句卡片
          html += renderItemsList(sub.items);
        }
      }

      // 直接挂在subsection上的table
      if (sub.table) html += renderTable(sub.table);
      html += `</div>`;
    }
  }

  return html || '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
}

/**
 * 渲染单个 sub_item，支持递归嵌套
 * 处理以下数据结构：
 * - {title, content(str)} — 文本内容
 * - {title, content({headers,rows})} — content 中的表格
 * - {title, table} — 直接表格
 * - {title, tables[]} — 多表格
 * - {title, headers, rows} — headers/rows 直接挂在 item 上（文化常识等）
 * - {title, sub_items[]} — 嵌套子项（递归）
 * - {title, items[]} — 键值对列表转表格，或名句卡片列表
 */
function renderSubItem(item) {
  if (!item || typeof item !== 'object') return '';
  let html = `<div class="sub-item">`;
  if (item.title) html += `<div class="sub-item__title">${item.title}</div>`;
  // content: 字符串
  if (item.content && typeof item.content === 'string') {
    html += `<div class="content-text">${formatText(item.content)}</div>`;
  }
  // content: 表格对象 {headers, rows}
  if (item.content && typeof item.content === 'object' && !Array.isArray(item.content) && item.content.headers) {
    html += renderTable(item.content);
  }
  // 直接挂在 item 上的表格
  if (item.table) html += renderTable(item.table);
  // headers/rows 直接挂在 item 上（如文化常识表格子项）
  if (item.headers && item.rows) html += renderTable(item);
  // 多表格
  if (item.tables && Array.isArray(item.tables)) {
    for (const tbl of item.tables) {
      if (tbl && tbl.headers && tbl.rows) html += renderTable(tbl);
    }
  }
  // 嵌套 sub_items（如谦称/敬称表）
  if (item.sub_items && Array.isArray(item.sub_items)) {
    for (const nested of item.sub_items) {
      html += renderSubItem(nested);
    }
  }
  // items 字段
  if (item.items && Array.isArray(item.items)) {
    const first = item.items[0];
    if (typeof first === 'string') {
      // 字符串数组（如作文技法列表）→ 渲染为列表
      html += '<ul class="content-list">';
      for (const it of item.items) {
        if (it) html += `<li>${formatText(it)}</li>`;
      }
      html += '</ul>';
    } else if (first && typeof first === 'object' &&
        !first.title && !first.content && !first.source && !first.quotes && !first.letter && !first.id) {
      // 键值对结构（如 {类别:"姓氏", 说明:"..."}）→ 转为表格渲染
      const headers = Object.keys(first);
      const rows = item.items.map(it => headers.map(h => it[h] || ''));
      html += renderTable({ headers, rows });
    } else {
      // 名句/古诗词卡片
      html += renderItemsList(item.items);
    }
  }
  html += `</div>`;
  return html;
}

function renderWordGroups(wordGroups) {
  if (!wordGroups || !Array.isArray(wordGroups) || wordGroups.length === 0) return '';
  let html = '<div class="word-groups">';
  for (const section of wordGroups) {
    if (section.letter) {
      html += `<div class="word-groups__letter">${section.letter}</div>`;
    }
    if (section.groups && Array.isArray(section.groups)) {
      html += '<ul class="word-groups__list">';
      for (const group of section.groups) {
        html += `<li class="word-groups__item"><div class="content-text">${formatText(group)}</div></li>`;
      }
      html += '</ul>';
    }
  }
  html += '</div>';
  return html;
}

// ==================== 名句/诗词列表渲染 ====================
function renderItemsList(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return '';
  let html = '<div class="items-list">';
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    // 结构1：古诗词 {title, author, dynasty, content}
    if (it.content && typeof it.content === 'string') {
      html += `<div class="poem-card">`;
      const meta = [it.author, it.dynasty].filter(Boolean).join(' · ');
      html += `<div class="poem-card__head"><span class="poem-card__title">${it.title || ''}</span>${meta ? `<span class="poem-card__meta">${meta}</span>` : ''}</div>`;
      html += `<div class="poem-card__content">${formatText(it.content)}</div>`;
      html += `</div>`;
    }
    // 结构2：文言文/现代文 {source, quotes}
    else if (it.quotes && Array.isArray(it.quotes) && it.quotes.length > 0) {
      html += `<div class="poem-card">`;
      if (it.source) html += `<div class="poem-card__head"><span class="poem-card__title">${it.source}</span></div>`;
      html += `<ul class="poem-card__quotes">`;
      for (const q of it.quotes) {
        if (q) html += `<li>${formatText(q)}</li>`;
      }
      html += `</ul>`;
      html += `</div>`;
    }
  }
  html += '</div>';
  return html;
}

/**
 * 渲染按字母分组的词语列表（如：容易读错的成语）
 * items: [{letter:"A", list:["爱憎(zēng)分明", ...]}, ...]
 */
function renderLetterList(items) {
  if (!items || !Array.isArray(items)) return '';
  let html = '<div class="letter-list">';
  for (const group of items) {
    if (!group || !group.list) continue;
    html += `<div class="letter-group">`;
    html += `<div class="letter-group__label">${group.letter}</div>`;
    html += `<div class="letter-group__items">`;
    for (const word of group.list) {
      html += `<span class="letter-group__item">${word}</span>`;
    }
    html += `</div></div>`;
  }
  html += '</div>';
  return html;
}

/**
 * 渲染编号句子列表（如：巧记多音多义字）
 * items: [{id:1, content:"艾：他在耆艾 ài 之年..."}, ...]
 */
function renderNumberedSentences(items) {
  if (!items || !Array.isArray(items)) return '';
  let html = '<div class="numbered-list">';
  for (const item of items) {
    if (!item || !item.content) continue;
    html += `<div class="numbered-list__item">`;
    html += `<span class="numbered-list__num">${item.id}</span>`;
    html += `<span class="numbered-list__content">${formatText(item.content)}</span>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
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

  // 判断是否使用紧凑网格模式：2列、第二列为短文本（如拼音/读音）、且数据量大
  const col2MaxLen = table.rows.length > 0
    ? Math.max(...table.rows.map(r => (r[1] || '').length))
    : 0;
  const isCompact = table.headers.length === 2 && table.rows.length > 30 && col2MaxLen <= 20;
  const PAGE_SIZE = isCompact ? 60 : 15;
  const totalPages = Math.ceil(table.rows.length / PAGE_SIZE);
  const tableId = 'table-' + Math.random().toString(36).substr(2, 9);

  let html = `<div id="${tableId}">`;

  if (isCompact) {
    // 紧凑网格模式：响应式自适应列数，适合词语+拼音类大表
    html += `<div class="compact-grid" id="${tableId}-body"></div>`;
  } else {
    // 传统表格模式
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

  // 存储表格数据供分页使用
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
    // 紧凑网格：每个单元格展示 词语（主）+ 拼音（辅）
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
