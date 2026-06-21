/**
 * knowledge.js - 知识页逻辑（适配扁平数据结构）
 *
 * 导航树：编 → 部分 → 章节（标准 level 3 标题）
 * 内容渲染：遍历 section 区间内的扁平节点，按 type 分发渲染
 *   - heading: 按 level 渲染为不同层级标题
 *   - paragraph: 渲染为段落，支持 ①②③ 高亮
 *   - table: HTML 表格直接渲染，大数据表格分页
 *   - image: 跳过
 */
let currentState = { bianId: 1, partId: 1, sectionIndex: 0 };

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
        if (!STANDARD_SECTIONS.some(s => sec.name.includes(s))) return;
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

  const navPath = getNavPath(bianId, partId, sectionIndex);
  if (!navPath.partName) return;

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

  const contentEl = document.getElementById('section-content');
  const nodes = getSectionContent(bianId, partId, sectionIndex);
  contentEl.innerHTML = renderContent(nodes);

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

// ==================== 内容渲染核心 ====================
/**
 * 遍历 section 区间内的扁平节点，按 type 分发渲染
 * 渲染规则：
 *   - heading level 4: 子标题（如"一、容易读错的词语"）
 *   - heading level 5-6: 小标题
 *   - heading level 3: 区分标题（如"示例："），作为子标题
 *   - paragraph: 段落文本，支持 ①②③ 高亮、数字编号高亮
 *   - table: 解析 HTML 表格，判断布局后渲染
 *   - image: 跳过
 */
function renderContent(nodes) {
  if (!nodes || nodes.length === 0) {
    return '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
  }

  // 预处理：合并同一词语列表的所有节点（table + 字母标题 + 段落注释）
  // 原始数据中一个字母分组的词语被拆成多个 table，中间夹着 heading 和 paragraph
  const merged = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (!node || !node.type) { i++; continue; }

    if (node.type === 'table') {
      // 1) 收集前置的散装词语 paragraph（如"哀悼(dào)"），合并进表格
      let preWords = [];
      for (let k = merged.length - 1; k >= 0; k--) {
        const prevMerged = merged[k];
        if (prevMerged.type === 'paragraph' && isPinyinWord(prevMerged.text)) {
          preWords.unshift(prevMerged.text.trim());
        } else {
          break;
        }
      }
      // 从 merged 中移除这些段落
      if (preWords.length > 0) {
        merged.splice(merged.length - preWords.length, preWords.length);
      }

      // 2) 收集连续的 table + 字母标题(A/B/C) + 短段落注释
      const group = [];
      let j = i;
      while (j < nodes.length) {
        const n = nodes[j];
        if (!n) break;
        if (n.type === 'table') {
          group.push({ kind: 'table', html: n.html });
          j++;
        } else if (n.type === 'heading' && /^[A-Z]$/.test((n.text || '').trim())) {
          group.push({ kind: 'header', text: n.text.trim() });
          j++;
        } else if (n.type === 'paragraph' && (n.text || '').length < 60) {
          // 短段落注释（如"巉(chán)峻(jùn)(形容山势高而险)"）纳入合并
          group.push({ kind: 'note', text: n.text.trim() });
          j++;
        } else {
          break; // 长段落或其他类型，停止合并
        }
      }

      // 构建合并后的 HTML（每个片段都必须是完整的 <table>，裸 <tr> 会被浏览器丢弃）
      let mergedHtml = '';
      // 前置散装词语 → 包装为完整 table
      if (preWords.length > 0) {
        mergedHtml += '<table>';
        for (const w of preWords) {
          mergedHtml += `<tr><td>${escHtml(w)}</td><td></td></tr>`;
        }
        mergedHtml += '</table>';
      }
      for (const item of group) {
        if (item.kind === 'table') {
          mergedHtml += item.html || '';
        } else if (item.kind === 'header') {
          // 字母标题包装为独立 table，避免裸 <tr> 被丢弃
          mergedHtml += `<table><tr><td></td><td>${escHtml(item.text)}</td></tr></table>`;
        } else if (item.kind === 'note') {
          // 段落注释包装为独立 table，__NOTE__ 标记在 paintPage 中识别为全宽注释
          mergedHtml += `<table><tr><td colspan="2">__NOTE__${escHtml(item.text)}</td></tr></table>`;
        }
      }
      merged.push({ type: 'table', html: mergedHtml });
      i = j;
    } else {
      merged.push(node);
      i++;
    }
  }

  // 3) 后处理：将 merged 中残留的散装拼音词 paragraph 转为合成表格
  const mergedFinal = [];
  for (let m = 0; m < merged.length; m++) {
    const node = merged[m];
    if (node.type === 'paragraph' && isPinyinWord(node.text)) {
      let words = [node.text.trim()];
      let n = m + 1;
      while (n < merged.length && merged[n].type === 'paragraph' && isPinyinWord(merged[n].text)) {
        words.push(merged[n].text.trim());
        n++;
      }
      let syntheticHtml = '<table>';
      for (const w of words) {
        syntheticHtml += `<tr><td>${escHtml(w)}</td><td></td></tr>`;
      }
      syntheticHtml += '</table>';
      mergedFinal.push({ type: 'table', html: syntheticHtml });
      m = n - 1;
    } else {
      mergedFinal.push(node);
    }
  }

  let html = '';
  let tableSeq = 0;

  for (const node of mergedFinal) {
    if (!node || !node.type) continue;

    if (node.type === 'heading') {
      const level = node.level || 4;
      const text = escHtml(node.text || '');
      if (!text.trim()) continue;

      if (level <= 3) {
        // section 内部的 level 3 标题（如"示例："），作为子标题
        html += `<h4 class="sub-item__title">${formatInline(text)}</h4>`;
      } else if (level === 4) {
        html += `<h4 class="sub-item__title">${formatInline(text)}</h4>`;
      } else {
        html += `<h5 class="content-subtitle">${formatInline(text)}</h5>`;
      }
      continue;
    }

    if (node.type === 'paragraph') {
      const text = (node.text || '').trim();
      if (!text) continue;
      html += `<div class="content-text">${formatInline(escHtml(text))}</div>`;
      continue;
    }

    if (node.type === 'table') {
      tableSeq++;
      html += renderTable(node.html || '', tableSeq);
      continue;
    }

    // image: 跳过
  }

  return html || '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
}

// ==================== 表格渲染 ====================
/**
 * 解析 HTML 表格字符串，判断类型后渲染：
 * 1. 紧凑网格表格（2列、多行、每格短文本）→ 网格布局 + 分页
 * 2. 普通表格（有表头或列数>2）→ 标准表格 + 分页
 * 3. 分类标题行（如"A"、"B"字母分隔）→ 合并到数据中作为分隔
 */
function renderTable(htmlStr, seq) {
  if (!htmlStr) return '';

  let rows;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    // 支持 HTML 中包含多个 <table>（合并后的节点）
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) return '';

    rows = [];
    tables.forEach(tableEl => {
      tableEl.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td,th').forEach(cell => {
          cells.push(cell.textContent.trim());
        });
        if (cells.length > 0) rows.push(cells);
      });
    });
  } catch (e) {
    return '';
  }

  if (rows.length === 0) return '';

  // 判断是否有 th 表头
  let headers = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    const firstTr = doc.querySelector('tr');
    if (firstTr) {
      const ths = firstTr.querySelectorAll('th');
      if (ths.length > 0) {
        ths.forEach(th => headers.push(th.textContent.trim()));
        rows.shift(); // 去掉表头行
      }
    }
  } catch {}

  // 判断表格类型
  const colCount = rows[0] ? rows[0].length : 0;
  const hasHeaders = headers.length > 0;

  // 紧凑网格：2列、每格是"词语+拼音"格式（含括号拼音标注）
  // 行数阈值放宽：被段落注释拆分的小表格也可能只有几行
  if (!hasHeaders && colCount === 2 && rows.length >= 2) {
    // 抽样检查是否为词语+拼音格式
    const sampleCells = rows.flat().slice(0, 6).filter(c => c);
    const pinyinRatio = sampleCells.filter(c => /\([a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÂôÔîÎûÛäÄëËïÏöÖ\s]+\)/.test(c)).length;
    if (sampleCells.length > 0 && pinyinRatio / sampleCells.length > 0.5) {
      return renderCompactGrid(rows, seq);
    }
    // 兜底：短文本 + 较多行数
    const maxCellLen = Math.max(...rows.flat().map(c => (c || '').length));
    if (maxCellLen <= 25 && rows.length >= 4) {
      return renderCompactGrid(rows, seq);
    }
  }

  // 普通表格
  if (!hasHeaders) {
    // 尝试从第一行推断表头
    if (rows.length > 1 && rows[0].every(c => c.length <= 8 && c.length > 0)) {
      headers = rows[0];
      rows = rows.slice(1);
    } else {
      headers = Array.from({ length: colCount }, (_, i) => '');
    }
  }

  if (rows.length === 0) return '';
  return renderDataTable(headers, rows, seq);
}

/** 紧凑标签渲染（适合易错词、成语等短文本表格） */
function renderCompactGrid(rows, seq) {
  const PAGE_SIZE = 100;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const id = `tbl${seq}`;

  let html = `<div id="${id}" class="table-wrapper">`;
  html += `<div class="compact-grid" id="${id}-body"></div>`;

  if (totalPages > 1) {
    html += `<div class="table-pagination">`;
    html += `<button onclick="turnPage('${id}',-1)" id="${id}-prev" disabled>上一页</button>`;
    // 智能折叠：总页数过多时只显示首尾和当前邻近页码
    html += buildPageButtons(id, 1, totalPages);
    html += `<button onclick="turnPage('${id}',1)" id="${id}-next">下一页</button>`;
    html += `</div>`;
  }
  html += `</div>`;

  // 存数据
  setTimeout(() => {
    window[id + '_data'] = rows;
    window[id + '_pageSize'] = PAGE_SIZE;
    window[id + '_totalPages'] = totalPages;
    window[id + '_page'] = 1;
    window[id + '_type'] = 'compact';
    paintPage(id, 1);
  }, 0);

  return html;
}

/** 生成智能折叠的页码按钮 HTML */
function buildPageButtons(id, current, total) {
  if (total <= 7) {
    // 少于7页，全部显示
    let btns = '';
    for (let p = 1; p <= total; p++) {
      btns += `<button onclick="goPage('${id}',${p})" class="${p === current ? 'active' : ''}" id="${id}-btn-${p}">${p}</button>`;
    }
    return btns;
  }
  // 超过7页，折叠显示
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);

  let btns = '';
  for (const p of pages) {
    if (p === '...') {
      btns += `<span class="table-pagination__dots">…</span>`;
    } else {
      btns += `<button onclick="goPage('${id}',${p})" class="${p === current ? 'active' : ''}" id="${id}-btn-${p}">${p}</button>`;
    }
  }
  return btns;
}

/** 标准表格渲染 */
function renderDataTable(headers, rows, seq) {
  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const id = `tbl${seq}`;

  let html = `<div id="${id}" class="table-wrapper">`;
  html += `<table class="data-table"><thead><tr>`;
  for (const h of headers) html += `<th>${escHtml(h)}</th>`;
  html += `</tr></thead><tbody id="${id}-body"></tbody></table>`;

  if (totalPages > 1) {
    html += `<div class="table-pagination">`;
    html += `<button onclick="turnPage('${id}',-1)" id="${id}-prev" disabled>上一页</button>`;
    for (let p = 1; p <= totalPages; p++) {
      html += `<button onclick="goPage('${id}',${p})" class="${p === 1 ? 'active' : ''}" id="${id}-btn-${p}">${p}</button>`;
    }
    html += `<button onclick="turnPage('${id}',1)" id="${id}-next">下一页</button>`;
    html += `</div>`;
  }
  html += `</div>`;

  setTimeout(() => {
    window[id + '_data'] = rows;
    window[id + '_pageSize'] = PAGE_SIZE;
    window[id + '_totalPages'] = totalPages;
    window[id + '_page'] = 1;
    window[id + '_type'] = 'table';
    paintPage(id, 1);
  }, 0);

  return html;
}

/** 渲染某一页的数据 */
function paintPage(id, page) {
  const rows = window[id + '_data'];
  const pageSize = window[id + '_pageSize'];
  const type = window[id + '_type'];
  if (!rows) return;

  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  const body = document.getElementById(id + '-body');
  if (!body) return;

  let html = '';
  if (type === 'compact') {
    for (let i = start; i < end; i++) {
      const row = rows[i];
      // 如果是分类标题行（如"A"、"B"），跨列显示
      const headerText = row[0] || row[1];
      if (row.length === 2 && headerText && headerText.length <= 3) {
        html += `<div class="compact-grid__cell--header">${headerText}</div>`;
      } else if (row.length >= 1 && String(row[0]).startsWith('__NOTE__')) {
        // 段落注释行 → 全宽显示
        const noteText = String(row[0]).replace('__NOTE__', '');
        html += `<div class="compact-grid__note">${formatInline(noteText)}</div>`;
      } else {
        // 每行的每一列都是独立的词语，轻量标签流式排列
        for (const cell of row) {
          if (!cell) continue;
          html += `<span class="compact-tag">${escHtml(cell)}</span>`;
        }
      }
    }
  } else {
    for (let i = start; i < end; i++) {
      html += '<tr>';
      for (const cell of rows[i]) {
        html += `<td>${escHtml(cell || '')}</td>`;
      }
      html += '</tr>';
    }
  }
  body.innerHTML = html;
}

function turnPage(id, dir) {
  const totalPages = window[id + '_totalPages'];
  let page = window[id + '_page'];
  page = dir > 0 ? Math.min(totalPages, page + 1) : Math.max(1, page - 1);
  goPage(id, page);
}

function goPage(id, page) {
  window[id + '_page'] = page;
  paintPage(id, page);

  // 重新生成智能折叠的页码按钮
  const totalPages = window[id + '_totalPages'];
  const pagination = document.querySelector(`#${id} + .table-pagination, #${id} .table-pagination`);
  if (pagination && totalPages > 7) {
    // 找到页码按钮区域并替换
    const prevBtn = pagination.querySelector(`#${id}-prev`);
    const nextBtn = pagination.querySelector(`#${id}-next`);
    // 移除中间所有按钮和省略号
    let el = prevBtn ? prevBtn.nextElementSibling : pagination.firstElementChild;
    while (el && el !== nextBtn) {
      const nextEl = el.nextElementSibling;
      if (el.tagName === 'BUTTON' || el.classList.contains('table-pagination__dots')) {
        el.remove();
      }
      el = nextEl;
    }
    // 在 prev 后面插入新按钮
    if (prevBtn) {
      prevBtn.insertAdjacentHTML('afterend', buildPageButtons(id, page, totalPages));
    }
  } else {
    // 少于7页，直接更新选中态
    document.querySelectorAll(`[id^="${id}-btn-"]`).forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`${id}-btn-${page}`);
    if (btn) btn.classList.add('active');
  }

  const prev = document.getElementById(`${id}-prev`);
  const next = document.getElementById(`${id}-next`);
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;
}

// ==================== 文本工具 ====================
/** 判断段落是否为含拼音的短词语（如"哀悼(dào)"） */
function isPinyinWord(text) {
  if (!text || text.length > 30) return false;
  return /\([a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÔôîÎûÛäÄëËïÏöÖ\s,.·;:]+\)/.test(text);
}

/** HTML 转义 */
function escHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 行内格式化：圆圈数字高亮、换行 */
function formatInline(text) {
  if (!text) return '';
  text = text.replace(/\n/g, '<br>');
  text = text.replace(/(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '<span class="highlight-accent">$1</span>');
  return text;
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
    btn.innerHTML = isBookmarked ? '<span>⭐</span> 已收藏' : '<span>☆</span> 收藏';
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
  const standardIndices = sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => STANDARD_SECTIONS.some(name => s.name.includes(name)))
    .map(({ i }) => i);

  const currentPos = standardIndices.indexOf(sectionIndex);
  const prevIdx = currentPos > 0 ? standardIndices[currentPos - 1] : null;
  const nextIdx = currentPos >= 0 && currentPos < standardIndices.length - 1 ? standardIndices[currentPos + 1] : null;

  document.getElementById('nav-buttons').innerHTML = `
    <button class="nav-btn" ${prevIdx === null ? 'disabled' : ''} onclick="loadSection(${bianId}, ${partId}, ${prevIdx})">← 上一节</button>
    <button class="nav-btn" ${nextIdx === null ? 'disabled' : ''} onclick="loadSection(${bianId}, ${partId}, ${nextIdx})">下一节 →</button>
  `;
}

// ==================== 侧边栏搜索 ====================
function filterSidebar(query) {
  const nodes = document.querySelectorAll('.tree-node--section, .tree-node--part');
  const q = query.trim().toLowerCase();
  if (!q) { nodes.forEach(n => n.style.display = ''); return; }
  nodes.forEach(n => {
    n.style.display = n.textContent.toLowerCase().includes(q) ? '' : 'none';
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
