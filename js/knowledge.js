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
let CLEAN_VOICE_WORDS = null; // 清洗后的"容易读错的词语"数据

async function loadCleanVoiceWords() {
  if (CLEAN_VOICE_WORDS) return CLEAN_VOICE_WORDS;
  try {
    const r = await fetch('data/handbook-voice-words.json?v=20260623');
    CLEAN_VOICE_WORDS = await r.json();
    return CLEAN_VOICE_WORDS;
  } catch (e) {
    console.warn('加载清洗数据失败，回退原始渲染:', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadHandbookData();
  if (!data) {
    document.getElementById('section-content').innerHTML = '<div class="loading"><div class="loading__spinner"></div>数据加载失败</div>';
    return;
  }
  // 预加载清洗数据（不阻塞主流程）
  loadCleanVoiceWords();
  const params = new URLSearchParams(window.location.search);
  const bianId = parseInt(params.get('bian')) || 1;
  const partId = parseInt(params.get('part')) || 1;
  const sectionIndex = parseInt(params.get('sec')) || 0;
  currentState = { bianId, partId, sectionIndex };
  renderSidebar();
  // 确保清洗数据加载完毕再渲染内容（首次加载可能是"容易读错的词语"）
  await loadCleanVoiceWords();
  loadSection(bianId, partId, sectionIndex);
  setupNavbar();
  setupSidebarToggle();
  setupBackToTop();
  initSelectionLookup('#section-content');
  // 移动端：点击带释义词语显示 tooltip
  setupWordTooltipToggle();
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

  // 滚动到内容标题
  requestAnimationFrame(() => {
    const target = document.getElementById('content-title') || document.getElementById('section-content');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ==================== 内容渲染核心 ====================
/**
 * 遍历 section 区间内的扁平节点，按 type 分发渲染
 */
function renderContent(nodes) {
  if (!nodes || nodes.length === 0) {
    return '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
  }

  // "必考知识梳理" section 可能包含多个 level 4 子章节（一/二/三/四）
  // 按 level 4 标题拆分成区块，逐块渲染
  const blocks = splitByLevel4Headings(nodes);

  let html = '';
  let tableSeq = 0;
  for (const block of blocks) {
    // 检查区块第一个标题是否命中清洗数据
    const blockHeading = block.find(n => n && n.type === 'heading');
    if (blockHeading) {
      const sectionKey = detectVoiceSection(blockHeading.text);
      if (sectionKey) {
        const cleanHtml = renderCleanVoiceSection(sectionKey, blockHeading);
        if (cleanHtml) { html += cleanHtml; continue; }
      }
      // 标题不属于清洗章节 → 走原始渲染，但把标题级别≤3的单独处理
      if (blockHeading.level <= 3) {
        html += `<h4 class="sub-item__title">${formatInline(escHtml(blockHeading.text))}</h4>`;
        // 去掉标题后渲染剩余节点
        const rest = block.slice(1);
        if (rest.length > 0) html += renderContentBlock(rest, () => tableSeq++);
        continue;
      }
    }
    // 普通区块 → 走原始渲染流水线
    html += renderContentBlock(block, () => tableSeq++);
  }

  return html || '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">该章节暂无内容</div></div>';
}

/** 按 level ≤4 的标题拆分成区块（每个区块以标题开头） */
function splitByLevel4Headings(nodes) {
  const blocks = [];
  let current = [];
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'heading' && (node.level || 9) <= 4 && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    current.push(node);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * 原始渲染流水线（处理一个区块内的节点）
 */
function renderContentBlock(nodes, nextTableSeqFn) {
  // 预处理：合并同一词语列表的所有节点
  const merged = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (!node || !node.type) { i++; continue; }
    if (node.type === 'table') {
      const group = [];
      let j = i;
      while (j < nodes.length) {
        const n = nodes[j];
        if (!n) break;
        if (n.type === 'table') { group.push({ kind: 'table', html: n.html }); j++; }
        else if (n.type === 'heading' && /^[A-Z]$/.test((n.text || '').trim())) { break; }
        else if (n.type === 'paragraph' && (n.text || '').length < 60 && /[\u4e00-\u9fff]\([^)]*[\u4e00-\u9fff]/.test(n.text)) {
          group.push({ kind: 'note', text: n.text.trim() }); j++;
        } else { break; }
      }
      let mergedHtml = '';
      for (const item of group) {
        if (item.kind === 'table') mergedHtml += item.html || '';
        else if (item.kind === 'header') mergedHtml += `<table><tr><td></td><td>${escHtml(item.text)}</td></tr></table>`;
        else if (item.kind === 'note') mergedHtml += `<table><tr><td colspan="2">__NOTE__${escHtml(item.text)}</td></tr></table>`;
      }
      merged.push({ type: 'table', html: mergedHtml });
      i = j;
    } else { merged.push(node); i++; }
  }

  // 后处理：散装拼音词/字母标题+表格
  const mergedFinal = [];
  for (let m = 0; m < merged.length; m++) {
    const node = merged[m];
    if (node.type === 'heading' && /^[A-Z]$/.test((node.text || '').trim()) && m + 1 < merged.length && merged[m + 1].type === 'table') {
      const hdr = node.text.trim();
      mergedFinal.push({ type: 'table', html: `<table><tr><td></td><td>${escHtml(hdr)}</td></tr></table>` + (merged[m + 1].html || '') });
      m++; continue;
    }
    if (node.type === 'heading' && /^[A-Z]$/.test((node.text || '').trim()) && m + 1 < merged.length && merged[m + 1].type === 'paragraph' && isPinyinWord(merged[m + 1].text)) {
      const hdr = node.text.trim();
      let words = [merged[m + 1].text.trim()], n = m + 2;
      while (n < merged.length && merged[n].type === 'paragraph' && isPinyinWord(merged[n].text)) words.push(merged[n++].text.trim());
      let sh = `<table><tr><td></td><td>${escHtml(hdr)}</td></tr>`;
      for (const w of words) sh += `<tr><td>${escHtml(w)}</td><td></td></tr>`;
      mergedFinal.push({ type: 'table', html: sh + '</table>' });
      m = n - 1; continue;
    }
    if (node.type === 'paragraph' && isPinyinWord(node.text)) {
      let words = [node.text.trim()], n = m + 1;
      while (n < merged.length && merged[n].type === 'paragraph' && isPinyinWord(merged[n].text)) words.push(merged[n++].text.trim());
      let startLetter = '';
      if (m > 0 && merged[m - 1].type === 'heading' && /^[A-Z]$/.test((merged[m - 1].text || '').trim())) startLetter = merged[m - 1].text.trim();
      const groups = [];
      let cg = [], ch = startLetter;
      for (const w of words) {
        const fp = (w.match(/\(([a-zA-Zāáǎà])/) || [])[1] || '';
        const l = fp ? fp.toUpperCase() : '';
        if (l && ch && l !== ch && cg.length > 0) { groups.push({ header: ch, words: cg }); cg = [w]; ch = l; }
        else if (l && !ch) { ch = l; cg.push(w); }
        else { cg.push(w); }
      }
      if (cg.length > 0) groups.push({ header: ch, words: cg });
      for (const g of groups) {
        const prev = mergedFinal[mergedFinal.length - 1];
        let skip = false;
        if (g.header && prev && prev.type === 'table' && prev.html) {
          const hm = prev.html.match(/<td>\s*([A-Z])\s*<\/td>/);
          if (hm && hm[1] === g.header) {
            for (const w of g.words) prev.html += `<tr><td>${escHtml(w)}</td><td></td></tr>`;
            skip = true;
          }
        }
        if (skip) continue;
        let sh = '<table>';
        if (g.header) sh += `<tr><td></td><td>${escHtml(g.header)}</td></tr>`;
        for (const w of g.words) sh += `<tr><td>${escHtml(w)}</td><td></td></tr>`;
        mergedFinal.push({ type: 'table', html: sh + '</table>' });
      }
      m = n - 1; continue;
    }
    if (node.type === 'paragraph' && node.text && node.text.length < 80 && !isPinyinWord(node.text)) {
      const text = node.text.trim();
      const stripped = text.replace(/\((?:[\u4e00-\u9fff][^)]*)\)$/, '');
      if (stripped && stripped !== text && stripped.length <= 30) {
        const wl = ((stripped.match(/\(([a-zA-Zāáǎà])/) || [])[1] || '').toUpperCase();
        const prev = mergedFinal[mergedFinal.length - 1];
        let pl = '';
        if (prev && prev.type === 'table' && prev.html) { const hm = prev.html.match(/<td>\s*([A-Z])\s*<\/td>/); if (hm) pl = hm[1]; }
        if (prev && prev.type === 'table' && prev.html && (!pl || pl === wl)) prev.html += `<tr><td>${escHtml(stripped)}</td><td></td></tr>`;
        else mergedFinal.push({ type: 'table', html: `<table><tr><td>${escHtml(stripped)}</td><td></td></tr></table>` });
        continue;
      }
      // 普通正文段落（非词语列表），走正常 content-text 渲染
      mergedFinal.push(node);
      continue;
    }
    mergedFinal.push(node);
  }

  let html = '';
  for (const node of mergedFinal) {
    if (!node || !node.type) continue;
    if (node.type === 'heading') {
      const lv = node.level || 4;
      const text = escHtml(node.text || '');
      if (!text.trim()) continue;
      html += lv <= 4 ? `<h4 class="sub-item__title">${formatInline(text)}</h4>` : `<h5 class="content-subtitle">${formatInline(text)}</h5>`;
      continue;
    }
    if (node.type === 'paragraph') {
      const text = (node.text || '').trim();
      if (!text) continue;
      html += `<div class="content-text">${formatInline(escHtml(text))}</div>`;
      continue;
    }
    if (node.type === 'table') {
      html += renderTable(node.html || '', nextTableSeqFn());
      continue;
    }
  }
  return html;
}

// ==================== 清洗数据渲染：第一部分 语音 全部子章节 ====================
/**
 * 根据标题文字识别属于哪个子章节
 */
function detectVoiceSection(titleText) {
  if (!titleText) return null;
  if (titleText.includes('初中生容易读错的词语')) return 'words';
  if (titleText.includes('初中生容易读错的成语')) return 'idioms';
  if (titleText.includes('初中生必须掌握的多音字')) return 'polyphones';
  if (titleText.includes('巧记多音多义字')) return 'mnemonics';
  return null;
}

/**
 * 使用预清洗数据渲染指定子章节
 * - words/idioms: 按首字母分组的 data-table（每行4列对齐），顶部带字母选择器
 * - polyphones/mnemonics: 段落格式
 */
function renderCleanVoiceSection(sectionKey, heading) {
  if (!CLEAN_VOICE_WORDS || !CLEAN_VOICE_WORDS.sections) return null;
  const sec = CLEAN_VOICE_WORDS.sections[sectionKey];
  if (!sec) return null;

  let html = '';
  html += `<h4 class="sub-item__title">${formatInline(escHtml(heading.text))}</h4>`;

  const COLS = 4; // 每行固定列数

  if (sec.groups) {
    // 字母分组类型（words, idioms）：data-table 对齐排版 + 字母选择器
    const sortedLetters = Object.keys(sec.groups).sort();
    const availableLetters = sortedLetters.filter(l => sec.groups[l] && sec.groups[l].length > 0);
    const uniqueId = `voice-${sectionKey}`;

    // 用相对定位容器包裹，限制 sticky 范围
    html += `<div class="voice-section-wrapper">`;

    // 字母选择器
    html += `<div class="alpha-selector" id="${uniqueId}-bar">`;
    for (const ll of 'ABCDEFGHJKLMNOPQRSTWXYZ') {
      const has = availableLetters.includes(ll);
      html += `<button class="alpha-selector__btn${has ? '' : ' alpha-selector__btn--empty'}" data-letter="${ll}"${has ? '' : ' disabled'}>${escHtml(ll)}</button>`;
    }
    html += `</div>`;

    // 内容区域
    html += `<div id="${uniqueId}-panel"></div>`;

    // 总数
    html += `<div class="content-text" style="margin-top:16px; color:var(--color-text-secondary); font-size:0.85rem;">
      共收录 ${sec.totalCount} 个条目，按拼音首字母分为 ${availableLetters.length} 组
    </div>`;

    html += `</div>`; // end voice-section-wrapper

    // 把数据挂到全局，供切换使用；延迟执行渲染默认字母
    const voiceDataKey = `__voiceData_${sectionKey}`;
    window[voiceDataKey] = { groups: sec.groups, sortedLetters: availableLetters, uniqueId, COLS };
    setTimeout(() => switchVoiceLetter(sectionKey, availableLetters[0] || ''), 0);

  } else if (sec.items) {
    // 段落类型（多音字/巧记）：包裹在 voice-section-wrapper 中，让 scroll-margin-top 生效
    html += `<div class="voice-section-wrapper">`;
    html += renderVoiceItems(sectionKey, sec.items, sec.totalCount);
    html += `</div>`;
  }

  return html;
}

/** 渲染 polyphones / mnemonics 的 items 为紧凑卡片 */
function renderVoiceItems(sectionKey, items, totalCount) {
  if (!items || items.length === 0) return '';

  // polyphones: 将同一个字的①②③行合并为一个卡片
  // mnemonics: 每条独立编号，直接使用编号
  const isPolyphones = sectionKey === 'polyphones';
  let html = '';

  if (isPolyphones) {
    // 合并同一字符的多行，解析为结构化数据
    const merged = [];
    let current = null;
    for (const item of items) {
      const text = item.trim();
      const m = text.match(/^([\u4e00-\u9fff])\s*①/);
      if (m) {
        if (current) merged.push(current);
        // 去掉行首汉字后再解析，避免 words 中出现重复字
        const rest = text.replace(/^[\u4e00-\u9fff]\s*/, '');
        current = { char: m[1], pronunciations: parseAllPronunciations(rest) };
      } else if (current) {
        // 续行可能包含多个读音（如 "②ào 拗口③niù 执拗"）
        current.pronunciations.push(...parseAllPronunciations(text));
      } else {
        merged.push({ char: '', pronunciations: parseAllPronunciations(text) });
      }
    }
    if (current) merged.push(current);

    // 把数据挂到全局，初始渲染第1页
    const uniqueId = `voice-${sectionKey}`;
    window[`__voiceData_${sectionKey}`] = { items: merged, totalCount, uniqueId };
    html += `<div class="polyphone-table" id="${uniqueId}-panel"></div>`;
    html += `<div class="voice-pagination" id="${uniqueId}-pager"></div>`;
    html += `<div class="content-text" style="margin-top:8px; color:var(--color-text-secondary); font-size:0.85rem;">
      共 ${totalCount} 条
    </div>`;
    setTimeout(() => switchVoicePage(sectionKey, 1), 0);
  } else {
    // mnemonics: 分页渲染，12条/页
    const uniqueId = `voice-${sectionKey}`;
    window[`__voiceData_${sectionKey}`] = { items, totalCount, uniqueId };
    html += `<div class="mnemonic-list" id="${uniqueId}-panel"></div>`;
    html += `<div class="voice-pagination" id="${uniqueId}-pager"></div>`;
    html += `<div class="content-text" style="margin-top:8px;color:var(--color-text-secondary);font-size:0.85rem;">共 ${totalCount} 条</div>`;
    setTimeout(() => switchMnemonicPage(sectionKey, 1), 0);
  }

  return html;
}

/** 从一行文本中提取所有读音（支持一行多个读音，如 "②ào 拗口③niù 执拗"）
 *  返回 [{num, pinyin, words}, ...]
 */
function parseAllPronunciations(text) {
  const results = [];
  // 按 ①②③④⑤⑥⑦⑧⑨⑩ 分割
  const parts = text.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // 匹配 "①ā 阿长 阿哥" 或 "②ái挨打"（无空格）
    const m = trimmed.match(/^([①②③④⑤⑥⑦⑧⑨⑩]+)\s*([a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛ]+)\s*(.+)$/);
    if (m) {
      results.push({ num: m[1], pinyin: m[2], words: m[3].trim() });
    }
  }
  return results;
}

/** 多音字分页切换 */
function switchVoicePage(sectionKey, page) {
  const voiceDataKey = `__voiceData_${sectionKey}`;
  const data = window[voiceDataKey];
  if (!data) return;
  const { items, uniqueId } = data;
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, items.length);

  // 渲染当前页内容
  let panelHtml = '';
  for (let i = start; i < end; i++) {
    const item = items[i];
    panelHtml += `<div class="polyphone-row">`;
    panelHtml += `<div class="polyphone-row__char">${escHtml(item.char)}</div>`;
    panelHtml += `<div class="polyphone-row__cols">`;
    for (const p of item.pronunciations) {
      panelHtml += `<div class="polyphone-item">`;
      panelHtml += `<span class="polyphone-item__num">${escHtml(p.num)}</span>`;
      panelHtml += `<span class="polyphone-item__pinyin">${escHtml(p.pinyin)}</span>`;
      panelHtml += `<span class="polyphone-item__words">${formatInline(escHtml(p.words))}</span>`;
      panelHtml += `</div>`;
    }
    panelHtml += `</div></div>`;
  }

  const panel = document.getElementById(`${uniqueId}-panel`);
  if (panel) {
    panel.innerHTML = panelHtml;
    requestAnimationFrame(() => {
      const wrapper = panel.closest('.voice-section-wrapper');
      if (wrapper) {
        const heading = wrapper.previousElementSibling;
        const target = (heading && heading.tagName === 'H4') ? heading : wrapper;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // 渲染分页器
  const pager = document.getElementById(`${uniqueId}-pager`);
  if (pager && totalPages > 1) {
    let pagerHtml = `<div class="voice-pagination__btns">`;
    pagerHtml += `<button onclick="switchVoicePage('${sectionKey}',${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let p = 1; p <= totalPages; p++) {
      pagerHtml += `<button class="${p === currentPage ? 'active' : ''}" onclick="switchVoicePage('${sectionKey}',${p})">${p}</button>`;
    }
    pagerHtml += `<button onclick="switchVoicePage('${sectionKey}',${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    pagerHtml += `</div>`;
    pager.innerHTML = pagerHtml;
  }
}

/** 巧记多音多义字分页切换（12条/页） */
function switchMnemonicPage(sectionKey, page) {
  const voiceDataKey = `__voiceData_${sectionKey}`;
  const data = window[voiceDataKey];
  if (!data) return;
  const { items, totalCount, uniqueId } = data;
  const PAGE_SIZE = 12;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, items.length);

  let panelHtml = '';
  let globalIdx = start;
  for (let i = start; i < end; i++) {
    const item = items[i];
    let text = item.trim();
    const colonPos = text.indexOf('：') !== -1 ? text.indexOf('：') : text.indexOf(':');
    if (colonPos > 0 && /[\u4e00-\u9fff]/.test(text[colonPos - 1])) {
      text = text.slice(colonPos - 1);
    }
    globalIdx++;
    panelHtml += `<div class="mnemonic-list__item">`;
    panelHtml += `<span class="mnemonic-num">${globalIdx}</span>`;
    panelHtml += `<span class="mnemonic-content">${formatInline(escHtml(text))}</span>`;
    panelHtml += `</div>`;
  }

  const panel = document.getElementById(`${uniqueId}-panel`);
  if (panel) {
    panel.innerHTML = panelHtml;
    requestAnimationFrame(() => {
      const wrapper = panel.closest('.voice-section-wrapper');
      if (wrapper) {
        const heading = wrapper.previousElementSibling;
        const target = (heading && heading.tagName === 'H4') ? heading : wrapper;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const pager = document.getElementById(`${uniqueId}-pager`);
  if (pager && totalPages > 1) {
    let pagerHtml = `<div class="voice-pagination__btns">`;
    pagerHtml += `<button onclick="switchMnemonicPage('${sectionKey}',${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let p = 1; p <= totalPages; p++) {
      pagerHtml += `<button class="${p === currentPage ? 'active' : ''}" onclick="switchMnemonicPage('${sectionKey}',${p})">${p}</button>`;
    }
    pagerHtml += `<button onclick="switchMnemonicPage('${sectionKey}',${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    pagerHtml += `</div>`;
    pager.innerHTML = pagerHtml;
  }
}

/** 切换到指定字母组的词语，支持分页 */
function switchVoiceLetter(sectionKey, letter, page = 1) {
  const voiceDataKey = `__voiceData_${sectionKey}`;
  const data = window[voiceDataKey];
  if (!data) return;
  const { groups, sortedLetters, uniqueId, COLS } = data;
  if (!letter || !groups[letter]) return;

  // 更新按钮激活态
  const bar = document.getElementById(`${uniqueId}-bar`);
  if (bar) {
    bar.querySelectorAll('.alpha-selector__btn').forEach(b => {
      b.classList.toggle('alpha-selector__btn--active', b.getAttribute('data-letter') === letter);
    });
  }

  const words = groups[letter];
  const PAGE_SIZE = 40; // 10行×4列
  const totalPages = Math.ceil(words.length / PAGE_SIZE);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, words.length);

  // 渲染当前页
  const infoText = `${letter} 组 · ${words.length} 个词语${totalPages > 1 ? ` · 第 ${currentPage}/${totalPages} 页` : ''}`;
  let panelHtml = `<table class="data-table" style="margin-bottom:12px;">`;
  panelHtml += `<thead><tr><th colspan="${COLS}" style="position:relative;text-align:center;background:var(--color-primary-lighter);color:var(--color-primary);font-weight:700;font-size:1rem;padding:10px 12px;">
    <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-weight:400;font-size:0.82rem;color:var(--color-text-secondary);white-space:nowrap;">${escHtml(infoText)}</span>
    <span style="font-size:1.15rem;">${escHtml(letter)}</span>
  </th></tr></thead>`;
  panelHtml += `<tbody>`;
  for (let i = start; i < end; i += COLS) {
    panelHtml += `<tr>`;
    for (let j = 0; j < COLS; j++) {
      const entry = words[i + j];
      if (!entry) {
        panelHtml += `<td style="width:25%;"></td>`;
      } else if (typeof entry === 'object' && entry.def) {
        panelHtml += `<td class="word-has-def" data-tooltip="${escHtml(entry.def)}" style="width:25%;font-family:'Noto Serif SC',serif;">${escHtml(entry.word)}</td>`;
      } else {
        const w = typeof entry === 'object' ? entry.word : entry;
        panelHtml += `<td style="width:25%;font-family:'Noto Serif SC',serif;">${escHtml(w)}</td>`;
      }
    }
    panelHtml += `</tr>`;
  }
  panelHtml += `</tbody></table>`;

  // 分页器（超过1页才显示）
  if (totalPages > 1) {
    panelHtml += `<div class="voice-pagination">`;
    panelHtml += `<div class="voice-pagination__btns">`;
    panelHtml += `<button onclick="switchVoiceLetter('${sectionKey}','${letter}',${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let p = 1; p <= totalPages; p++) {
      panelHtml += `<button class="${p === currentPage ? 'active' : ''}" onclick="switchVoiceLetter('${sectionKey}','${letter}',${p})">${p}</button>`;
    }
    panelHtml += `<button onclick="switchVoiceLetter('${sectionKey}','${letter}',${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    panelHtml += `</div></div>`;
  }

  const panel = document.getElementById(`${uniqueId}-panel`);
  if (panel) {
    panel.innerHTML = panelHtml;
    requestAnimationFrame(() => {
      const wrapper = panel.closest('.voice-section-wrapper');
      if (wrapper) {
        const heading = wrapper.previousElementSibling;
        const target = (heading && heading.tagName === 'H4') ? heading : wrapper;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

// ==================== 表格渲染 ====================
function renderTable(htmlStr, seq) {
  if (!htmlStr) return '';

  let rows;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) return '';

    rows = [];
    tables.forEach(tableEl => {
      tableEl.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td,th').forEach(cell => {
          let text = cell.textContent.trim();
          // 过滤图片占位符标记 [1/24]、[1748]、[2DX5] 等
          if (/^\[[\w/]+\]$/.test(text)) text = '';
          cells.push(text);
        });
        if (cells.length > 0) rows.push(cells);
      });
    });
  } catch (e) {
    return '';
  }

  if (rows.length === 0) return '';

  let headers = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    const firstTr = doc.querySelector('tr');
    if (firstTr) {
      const ths = firstTr.querySelectorAll('th');
      if (ths.length > 0) {
        ths.forEach(th => headers.push(th.textContent.trim()));
        rows.shift();
      }
    }
  } catch {}

  const colCount = rows[0] ? rows[0].length : 0;
  const hasHeaders = headers.length > 0;
  const hasNote = rows.some(r => r[0] && r[0].startsWith('__NOTE__'));

  if (!hasHeaders && (colCount === 2 || hasNote) && rows.length >= 1) {
    if (hasNote) return renderCompactGrid(rows, seq);
    const sampleCells = rows.flat().slice(0, 6).filter(c => c);
    const pinyinRatio = sampleCells.filter(c => /\([a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÂôÔîÎûÛäÄëËïÏöÖ\s]+\)/.test(c)).length;
    if (sampleCells.length > 0 && pinyinRatio / sampleCells.length > 0.5) {
      return renderCompactGrid(rows, seq);
    }
    const maxCellLen = Math.max(...rows.flat().map(c => (c || '').length));
    if (maxCellLen <= 25 && rows.length >= 4) {
      return renderCompactGrid(rows, seq);
    }
  }

  if (!hasHeaders) {
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

/** 紧凑标签渲染 */
function renderCompactGrid(rows, seq) {
  const PAGE_SIZE = 9999;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const id = `tbl${seq}`;

  let html = `<div id="${id}" class="table-wrapper">`;
  html += `<div class="compact-grid" id="${id}-body"></div>`;

  if (totalPages > 1) {
    html += `<div class="table-pagination">`;
    html += `<button onclick="turnPage('${id}',-1)" id="${id}-prev" disabled>上一页</button>`;
    html += buildPageButtons(id, 1, totalPages);
    html += `<button onclick="turnPage('${id}',1)" id="${id}-next">下一页</button>`;
    html += `</div>`;
  }
  html += `</div>`;

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
    let btns = '';
    for (let p = 1; p <= total; p++) {
      btns += `<button onclick="goPage('${id}',${p})" class="${p === current ? 'active' : ''}" id="${id}-btn-${p}">${p}</button>`;
    }
    return btns;
  }
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
      const headerText = row[0] || row[1];
      if (row.length === 2 && headerText && headerText.length <= 3) {
        html += `<div class="compact-grid__cell--header">${headerText}</div>`;
      } else if (row.length >= 1 && String(row[0]).startsWith('__NOTE__')) {
        let noteText = String(row[0]).replace('__NOTE__', '');
        noteText = noteText.replace(/\((?:[\u4e00-\u9fff][^)]*)\)$/, '');
        html += `<span class="compact-tag">${escHtml(noteText)}</span>`;
      } else {
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

  const totalPages = window[id + '_totalPages'];
  const pagination = document.querySelector(`#${id} + .table-pagination, #${id} .table-pagination`);
  if (pagination && totalPages > 7) {
    const prevBtn = pagination.querySelector(`#${id}-prev`);
    const nextBtn = pagination.querySelector(`#${id}-next`);
    let el = prevBtn ? prevBtn.nextElementSibling : pagination.firstElementChild;
    while (el && el !== nextBtn) {
      const nextEl = el.nextElementSibling;
      if (el.tagName === 'BUTTON' || el.classList.contains('table-pagination__dots')) {
        el.remove();
      }
      el = nextEl;
    }
    if (prevBtn) {
      prevBtn.insertAdjacentHTML('afterend', buildPageButtons(id, page, totalPages));
    }
  } else {
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
function isPinyinWord(text) {
  if (!text || text.length > 30) return false;
  const matches = text.match(/\(([^)]+)\)/g);
  if (!matches) return false;
  for (const m of matches) {
    if (/[\u4e00-\u9fff]/.test(m)) return false;
  }
  return /\([a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÔôîÎûÛäÄëËïÏöÖ\s,.·;:]+\)/.test(text);
}

function escHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

  // 检查是否处于部分的最后一节
  const isLastSection = nextIdx === null;
  let nextPartInfo = null;
  if (isLastSection) {
    nextPartInfo = getNextPart(bianId, partId);
  }

  let nextButtonHtml = '';
  if (isLastSection && nextPartInfo) {
    // 是最后一节且存在下一个部分：显示"下一章"按钮
    nextButtonHtml = `<button class="nav-btn" onclick="loadSection(${nextPartInfo.bianId}, ${nextPartInfo.partId}, 0)">下一章 →</button>`;
  } else if (isLastSection && !nextPartInfo) {
    // 是最后一节且不存在下一个部分：禁用按钮
    nextButtonHtml = `<button class="nav-btn" disabled>下一节 →</button>`;
  } else {
    // 不是最后一节：显示"下一节"按钮
    nextButtonHtml = `<button class="nav-btn" onclick="loadSection(${bianId}, ${partId}, ${nextIdx})">下一节 →</button>`;
  }

  document.getElementById('nav-buttons').innerHTML = `
    <button class="nav-btn" ${prevIdx === null ? 'disabled' : ''} onclick="loadSection(${bianId}, ${partId}, ${prevIdx})">← 上一节</button>
    ${nextButtonHtml}
  `;
}

/** 获取下一个部分的信息 */
function getNextPart(bianId, partId) {
  const bians = getBians();
  let foundCurrent = false;
  
  for (const bian of bians) {
    for (const part of bian.parts) {
      if (foundCurrent) {
        // 找到下一个部分
        return { bianId: bian.id, partId: part.id };
      }
      // 检查是否是当前部分
      if (bian.id === bianId && part.id === partId) {
        foundCurrent = true;
      }
    }
  }
  return null; // 没有下一个部分
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

/** 移动端：点击/触摸带释义词语时切换显示 tooltip + 字母选择器点击 */
function setupWordTooltipToggle() {
  document.getElementById('section-content').addEventListener('click', (e) => {
    // 字母选择器按钮
    const alphaBtn = e.target.closest('.alpha-selector__btn');
    if (alphaBtn && !alphaBtn.disabled) {
      const letter = alphaBtn.getAttribute('data-letter');
      // 从按钮所在选择器 ID 反推 sectionKey
      const bar = alphaBtn.closest('.alpha-selector');
      if (bar && bar.id) {
        const sectionKey = bar.id.replace('voice-', '').replace('-bar', '');
        switchVoiceLetter(sectionKey, letter);
      }
      return;
    }
    // 带释义词语 tooltip
    const target = e.target.closest('.word-has-def');
    if (!target) {
      // 点击其他位置关闭已打开的 tooltip
      const active = document.querySelector('.word-has-def--active');
      if (active) active.classList.remove('word-has-def--active');
      return;
    }
    // 切换当前 tooltip
    const wasActive = target.classList.contains('word-has-def--active');
    // 先关闭所有
    document.querySelectorAll('.word-has-def--active').forEach(el => el.classList.remove('word-has-def--active'));
    if (!wasActive) {
      target.classList.add('word-has-def--active');
    }
    e.stopPropagation();
  });
  // 点击页面其他位置关闭 tooltip
  document.addEventListener('click', () => {
    const active = document.querySelector('.word-has-def--active');
    if (active) active.classList.remove('word-has-def--active');
  });
}
