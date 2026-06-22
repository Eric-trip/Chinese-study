/**
 * data.js - 数据加载、存储与工具函数
 *
 * 数据源：扁平结构 handbook.json
 * 结构：{ book_info, content: [{type, level, text/html/url/alt}] }
 * content 是扁平数组，通过 buildIndex() 构建章节索引供其他模块使用。
 */

// ==================== 全局状态 ====================
let HANDBOOK_DATA = null;
let SEARCH_INDEX = null;
let _index = null; // 章节索引
let CURRENT_STAGE = 'junior';

const STAGES = {
  junior: { name: '初中', shortName: '初', color: '#2C5F5D', active: true },
  senior: { name: '高中', shortName: '高', color: '#8B5CF6', active: false }
};

// ==================== 数据加载 ====================
async function loadHandbookData() {
  if (HANDBOOK_DATA) return HANDBOOK_DATA;
  try {
    const response = await fetch('data/handbook.json?v=20260622');
    HANDBOOK_DATA = await response.json();
    buildIndex();
    return HANDBOOK_DATA;
  } catch (error) {
    console.error('加载数据失败:', error);
    return null;
  }
}

// 标准章节名称（level 3 中只认这些作为 section）
const STANDARD_SECTIONS = [
  '课标解读', '中考热点', '知识能力解读', '方法技巧归纳', '必考知识梳理',
  '附录', '知识要点'
];

// ==================== 章节索引构建 ====================
/**
 * 遍历扁平 content 数组，构建层级索引：
 *   _index = {
 *     bians: [
 *       { id, name, parts: [
 *         { id, name, sections: [
 *           { index, name, start, end }
 *         ], start, end }
 *       ], start, end }
 *     ]
 *   }
 *
 * 层级映射规则（根据原书结构）：
 *   level 1 "第X编" → bian
 *   level 2 "第X部分" → part
 *   level 3 课标解读/中考热点/知识能力解读/方法技巧归纳/必考知识梳理/... → section
 *   level 4+ → section 内部内容（不单独索引）
 */
function buildIndex() {
  if (!HANDBOOK_DATA || !HANDBOOK_DATA.content) return;
  const content = HANDBOOK_DATA.content;
  _index = { bians: [] };

  let currentBian = null;
  let currentPart = null;
  let currentSection = null;
  let partId = 0, sectionIdx = 0;

  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (item.type !== 'heading') continue;
    const text = (item.text || '').trim();
    const level = item.level;

    // Level 1: "第X编" → bian
    // 原书目录区会连续出现3个"第X编"标题，内容区可能重复出现
    // 策略：用"第X部分"的编号推断属于哪个编，不依赖编标题位置
    if (level === 1 && /第[一二三四五六七八九十]+编/.test(text)) {
      // 检查是否已有同名 bian
      const existing = _index.bians.find(b => b.name === text);
      if (existing) {
        currentBian = existing;
        currentBian.start = i;
        currentBian.end = content.length;
        currentBian.parts = [];
        // 不更新前一个 bian 的 end（目录区连续标题不代表内容边界）
        currentPart = null;
        currentSection = null;
        partId = 0;
        sectionIdx = 0;
        continue;
      } else {
        currentBian = { id: _index.bians.length + 1, name: text, parts: [], start: i, end: content.length };
        _index.bians.push(currentBian);
        // 不更新前一个 bian 的 end（目录区连续标题不代表内容边界）
        currentPart = null;
        currentSection = null;
        partId = 0;
        sectionIdx = 0;
        continue;
      }
    }

    if (!currentBian) continue;

    // Level 2: "第X部分" → part
    // 特殊处理："第一编"下有12个part(语音~综合性学习)，"第二编"下有7个part(古代诗歌~文学作品鉴赏)+2个part(基本能力~分类指导)
    // 用"第X部分"出现的上下文判断归属：如果"第二编 阅读理解"已经出现过，第一部分~第十二部分属于第一编
    if (level === 2 && /第[一二三四五六七八九十百]+部分/.test(text)) {
      // 推断属于哪个编：
      // 第一编有12个部分(第一~第十二)，第二编有7个部分(第一~第七)+2个部分(第一~第二)
      // 第三编有2个部分(第一~第二)
      // 如果"第二编"已经作为 currentBian 存在，且遇到"第一部分 古代诗歌鉴赏"，应归到第二编
      // 用名称关键词来辅助判断
      const isReadingPart = /古代诗歌|文言文|记叙文|说明文|议论文|非连续性|文学作品/.test(text);
      const isWritingPart = /基本能力|分类指导/.test(text);

      // 如果当前 bian 不对，切换
      if (isReadingPart && currentBian.name.includes('第一编')) {
        // 关闭第一编
        currentBian.end = i;
        for (const p of currentBian.parts) {
          if (p.end > i) p.end = i;
          for (const s of p.sections) if (s.end > i) s.end = i;
        }
        const readingBian = _index.bians.find(b => b.name.includes('第二编'));
        if (readingBian) { currentBian = readingBian; partId = currentBian.parts.length; }
      } else if (isWritingPart && !currentBian.name.includes('第三编')) {
        // 关闭当前编
        currentBian.end = i;
        for (const p of currentBian.parts) {
          if (p.end > i) p.end = i;
          for (const s of p.sections) if (s.end > i) s.end = i;
        }
        const writingBian = _index.bians.find(b => b.name.includes('第三编'));
        if (writingBian) { currentBian = writingBian; partId = currentBian.parts.length; }
      } else if (!isReadingPart && !isWritingPart && !currentBian.name.includes('第一编')) {
        // 回到第一编
        const basicBian = _index.bians.find(b => b.name.includes('第一编'));
        if (basicBian) { currentBian = basicBian; partId = currentBian.parts.length; }
      }

      partId = currentBian.parts.length + 1;
      sectionIdx = 0;
      currentPart = { id: partId, name: text, sections: [], start: i, end: currentBian.end };
      currentBian.parts.push(currentPart);
      if (currentBian.parts.length > 1) {
        currentBian.parts[currentBian.parts.length - 2].end = i;
      }
      currentSection = null;
      continue;
    }

    if (!currentPart) continue;

    // Level 3: section
    // 只认标准章节名（课标解读/中考热点/知识能力解读/方法技巧归纳/必考知识梳理等）
    // 非标准 level 3（如"示例："）及 level 4+ 不做 section，归入前一个 section 的内容范围
    if (level === 3 && STANDARD_SECTIONS.some(s => text.includes(s))) {
      // 关闭上一个 section
      if (currentSection) {
        currentSection.end = i;
      }
      currentSection = { index: sectionIdx, name: text, start: i, end: currentPart.end };
      sectionIdx++;
      currentPart.sections.push(currentSection);
      continue;
    }
  }

  // 设置最后一批 end
  for (const bian of _index.bians) {
    for (const part of bian.parts) {
      for (const sec of part.sections) {
        if (sec.end === undefined || sec.end > part.end) sec.end = part.end;
      }
      if (part.end === undefined || part.end > bian.end) part.end = bian.end;
    }
    if (bian.end === undefined) bian.end = content.length;
  }
}

// ==================== 数据查询（兼容旧接口）====================

function getBians() {
  if (!_index) return [];
  return _index.bians.map(b => ({ id: b.id, name: b.name, parts: b.parts }));
}

function getParts(bianId) {
  const bian = _index?.bians.find(b => b.id === bianId);
  return bian ? bian.parts : [];
}

function getPart(bianId, partId) {
  const parts = getParts(bianId);
  return parts.find(p => p.id === partId);
}

function getSections(bianId, partId) {
  const part = getPart(bianId, partId);
  return part ? part.sections : [];
}

function getSection(bianId, partId, sectionIndex) {
  const sections = getSections(bianId, partId);
  return sections[sectionIndex] || null;
}

function getNavPath(bianId, partId, sectionIndex) {
  const bian = _index?.bians.find(b => b.id === bianId);
  const part = bian?.parts.find(p => p.id === partId);
  const section = part?.sections[sectionIndex];
  return {
    bianName: bian?.name || '',
    partName: part?.name || '',
    sectionName: section?.name || ''
  };
}

function getContentStats() {
  if (!_index) return { parts: 0, sections: 0, items: 0 };
  let parts = 0, sections = 0, items = 0;
  for (const bian of _index.bians) {
    parts += bian.parts.length;
    for (const part of bian.parts) {
      sections += part.sections.length;
    }
  }
  items = sections; // section 数量作为 items
  return { parts, sections, items };
}

/**
 * 获取一个 section 对应的扁平内容片段
 * 返回 content[start+1 .. end]（跳过 section 标题本身）
 */
function getSectionContent(bianId, partId, sectionIndex) {
  const sec = getSection(bianId, partId, sectionIndex);
  if (!sec || !HANDBOOK_DATA) return [];
  return HANDBOOK_DATA.content.slice(sec.start + 1, sec.end);
}

/**
 * 获取一个 part 下的所有内容（跨 section）
 */
function getPartContent(bianId, partId) {
  const part = getPart(bianId, partId);
  if (!part || !HANDBOOK_DATA) return [];
  return HANDBOOK_DATA.content.slice(part.start + 1, part.end);
}

// 获取所有扁平化的内容节点（用于搜索）
function getAllContentNodes() {
  if (!_index || !HANDBOOK_DATA) return [];
  const nodes = [];
  const content = HANDBOOK_DATA.content;

  for (const bian of _index.bians) {
    for (const part of bian.parts) {
      for (const sec of part.sections) {
        // 收集 section 内所有文本内容
        let textParts = [];
        for (let i = sec.start + 1; i < sec.end; i++) {
          const item = content[i];
          if (!item) continue;
          if (item.type === 'paragraph' && item.text) {
            textParts.push(item.text);
          } else if (item.type === 'table' && item.html) {
            // 从 HTML 表格中提取文本
            textParts.push(item.html.replace(/<[^>]+>/g, ' '));
          } else if (item.type === 'heading' && item.text) {
            textParts.push(item.text);
          }
        }
        const fullText = textParts.join('\n').trim();
        if (fullText) {
          nodes.push({
            bianId: bian.id, bianName: bian.name,
            partId: part.id, partName: part.name,
            sectionIndex: sec.index, sectionName: sec.name,
            title: sec.name, content: fullText,
            path: `${bian.name} > ${part.name} > ${sec.name}`
          });
        }
      }
    }
  }
  return nodes;
}

// ==================== 全文搜索 ====================
function buildSearchIndex() {
  if (SEARCH_INDEX) return SEARCH_INDEX;
  SEARCH_INDEX = getAllContentNodes();
  return SEARCH_INDEX;
}

function searchContent(query) {
  if (!query || query.trim().length < 1) return [];
  const index = buildSearchIndex();
  const q = query.trim().toLowerCase();
  const results = [];

  for (const node of index) {
    const titleStr = String(node.title || '');
    const contentStr = String(node.content || '');
    const titleMatch = titleStr.toLowerCase().includes(q);
    const contentMatch = contentStr.toLowerCase().includes(q);
    if (titleMatch || contentMatch) {
      let snippet = '';
      if (contentMatch) {
        const idx = contentStr.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 30);
        const end = Math.min(contentStr.length, idx + q.length + 80);
        snippet = (start > 0 ? '...' : '') + contentStr.substring(start, end) + (end < contentStr.length ? '...' : '');
      } else {
        snippet = contentStr.substring(0, 100) + (contentStr.length > 100 ? '...' : '');
      }
      results.push({
        ...node,
        content: contentStr,
        snippet,
        score: titleMatch ? 100 : 1,
        matchCount: (contentStr.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      });
    }
  }
  results.sort((a, b) => b.score - a.score || b.matchCount - a.matchCount);
  return results;
}

function highlightText(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), m => `<mark class="highlight">${m}</mark>`);
}

// ==================== 本地存储 ====================
const Storage = {
  get(key, defaultValue = null) {
    try {
      const val = localStorage.getItem(`cl_${key}`);
      return val ? JSON.parse(val) : defaultValue;
    } catch { return defaultValue; }
  },
  set(key, value) {
    try { localStorage.setItem(`cl_${key}`, JSON.stringify(value)); } catch (e) { console.error('Storage full', e); }
  },
  remove(key) { try { localStorage.removeItem(`cl_${key}`); } catch {} }
};

// ==================== 进度追踪 ====================
const ProgressTracker = {
  recordBrowse(bianId, partId, sectionIndex) {
    const browsed = Storage.get('browsed_sections', []);
    const key = `${bianId}-${partId}-${sectionIndex}`;
    if (!browsed.some(b => b.key === key)) {
      browsed.push({ key, bianId, partId, sectionIndex, time: Date.now() });
      Storage.set('browsed_sections', browsed);
    }
  },
  getBrowsedCount() {
    return Storage.get('browsed_sections', []).length;
  },
  getTotalSections() {
    const stats = getContentStats();
    return stats.sections || 46;
  },

  toggleBookmark(bianId, partId, sectionIndex) {
    const bookmarks = Storage.get('bookmarks', []);
    const key = `${bianId}-${partId}-${sectionIndex}`;
    const idx = bookmarks.findIndex(b => b.key === key);
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
      Storage.set('bookmarks', bookmarks);
      return false;
    }
    const nav = getNavPath(bianId, partId, sectionIndex);
    bookmarks.push({ key, bianId, partId, sectionIndex, ...nav, time: Date.now() });
    Storage.set('bookmarks', bookmarks);
    return true;
  },
  isBookmarked(bianId, partId, sectionIndex) {
    const bookmarks = Storage.get('bookmarks', []);
    const key = `${bianId}-${partId}-${sectionIndex}`;
    return bookmarks.some(b => b.key === key);
  },
  getBookmarks() { return Storage.get('bookmarks', []); },
  getBookmarkCount() { return Storage.get('bookmarks', []).length; },

  saveNote(bianId, partId, sectionIndex, content) {
    const notes = Storage.get('notes', {});
    const key = `${bianId}-${partId}-${sectionIndex}`;
    if (content.trim()) {
      notes[key] = { content, time: Date.now() };
    } else {
      delete notes[key];
    }
    Storage.set('notes', notes);
  },
  getNote(bianId, partId, sectionIndex) {
    const notes = Storage.get('notes', {});
    return notes[`${bianId}-${partId}-${sectionIndex}`]?.content || '';
  },
  getAllNotes() {
    const notes = Storage.get('notes', {});
    return Object.entries(notes).map(([key, val]) => {
      const [bianId, partId, sectionIndex] = key.split('-').map(Number);
      const nav = getNavPath(bianId, partId, sectionIndex);
      return { key, bianId, partId, sectionIndex, ...val, ...nav };
    }).sort((a, b) => b.time - a.time);
  },

  saveScore(mode, type, difficulty, score, total) {
    const scores = Storage.get('practice_scores', []);
    scores.push({ mode, type, difficulty, score, total, time: Date.now() });
    Storage.set('practice_scores', scores);
  },
  getScoreStats() {
    const scores = Storage.get('practice_scores', []);
    if (scores.length === 0) return { count: 0, avg: 0 };
    const avg = Math.round(scores.reduce((s, x) => s + (x.score / x.total * 100), 0) / scores.length);
    return { count: scores.length, avg };
  },

  addError(question) {
    const errors = Storage.get('error_book', []);
    const existing = errors.findIndex(e =>
      e.question === question.question && e.type === question.type
    );
    if (existing >= 0) {
      errors[existing].wrongCount = (errors[existing].wrongCount || 1) + 1;
      errors[existing].lastWrong = Date.now();
    } else {
      errors.push({ ...question, wrongCount: 1, addedAt: Date.now(), lastWrong: Date.now() });
    }
    Storage.set('error_book', errors);
  },
  removeError(index) {
    const errors = Storage.get('error_book', []);
    errors.splice(index, 1);
    Storage.set('error_book', errors);
  },
  clearErrors() { Storage.set('error_book', []); },
  getErrors() { return Storage.get('error_book', []); },
  getErrorCount() { return Storage.get('error_book', []).length; },

  getNoteCount() {
    const notes = Storage.get('notes', {});
    return Object.keys(notes).length;
  }
};

// ==================== Toast 提示 ====================
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: var(--color-primary); color: #fff; padding: 10px 24px; border-radius: 8px;
    font-size: 0.9rem; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0;
    transition: opacity 0.3s;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ==================== TTS 朗读 ====================
let currentUtterance = null;
function toggleReadAloud(text) {
  if (!('speechSynthesis' in window)) {
    showToast('浏览器不支持语音朗读');
    return false;
  }
  if (currentUtterance) {
    speechSynthesis.cancel();
    currentUtterance = null;
    return false;
  }
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = 'zh-CN';
  currentUtterance.rate = 0.9;
  currentUtterance.onend = () => { currentUtterance = null; };
  speechSynthesis.speak(currentUtterance);
  return true;
}

/**
 * 清理选中文本中的拼音注释
 */
function cleanPinyinAnnotations(text) {
  if (!text) return text;
  let result = text.replace(/[（(][a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÂôÔîÎûÛäÄëËïÏöÖ\s,.·;:]+[）)]/g, '');
  result = result.replace(/\s{2,}/g, '').trim();
  return result;
}

// ==================== 选词查词典 ====================
let _selectionPopup = null;
let _selectionTimer = null;

function initSelectionLookup(scopeSelector) {
  if (!_selectionPopup) {
    _selectionPopup = document.createElement('div');
    _selectionPopup.className = 'selection-popup';
    _selectionPopup.innerHTML = `
      <a class="selection-popup__item" data-action="dict">📖 查百度汉语</a>
      <a class="selection-popup__item" data-action="baike">🔍 查百度百科</a>
    `;
    document.body.appendChild(_selectionPopup);

    document.addEventListener('mousedown', (e) => {
      if (_selectionPopup && !_selectionPopup.contains(e.target)) {
        hideSelectionPopup();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideSelectionPopup();
    });

    _selectionPopup.addEventListener('click', (e) => {
      const item = e.target.closest('.selection-popup__item');
      if (!item) return;
      const action = item.dataset.action;
      const word = _selectionPopup.dataset.word;
      if (!word) return;
      if (action === 'dict') {
        const url = `https://dict.baidu.com/s?wd=${encodeURIComponent(word)}`;
        showDictPanel(word, url);
        hideSelectionPopup();
      } else if (action === 'baike') {
        const url = `https://baike.baidu.com/item/${encodeURIComponent(word)}`;
        window.open(url, '_blank');
        hideSelectionPopup();
      }
    });
  }

  document.addEventListener('mouseup', (e) => {
    if (scopeSelector) {
      const scope = document.querySelector(scopeSelector);
      if (!scope || !scope.contains(e.target)) return;
    }

    clearTimeout(_selectionTimer);
    _selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const text = sel.toString().trim();
      if (!text) { hideSelectionPopup(); return; }

      if (text.length < 2 || text.length > 20) return;
      if (/^[\d\s\p{P}]+$/u.test(text)) return;

      const cleanText = cleanPinyinAnnotations(text);
      if (cleanText.length < 2 || cleanText.length > 20) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      showSelectionPopup(cleanText, rect);
    }, 300);
  });
}

function showSelectionPopup(word, rect) {
  if (!_selectionPopup) return;
  _selectionPopup.dataset.word = word;
  _selectionPopup.style.visibility = 'hidden';
  _selectionPopup.style.display = 'flex';

  const popupRect = _selectionPopup.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  let top = rect.top - popupRect.height - 8;

  if (left < 8) left = 8;
  if (left + popupRect.width > window.innerWidth - 8) {
    left = window.innerWidth - popupRect.width - 8;
  }
  if (top < 8) top = rect.bottom + 8;

  _selectionPopup.style.left = left + 'px';
  _selectionPopup.style.top = top + 'px';
  _selectionPopup.style.visibility = 'visible';
  _selectionPopup.classList.add('selection-popup--visible');
}

function hideSelectionPopup() {
  if (!_selectionPopup) return;
  _selectionPopup.classList.remove('selection-popup--visible');
  setTimeout(() => {
    if (_selectionPopup) _selectionPopup.style.display = 'none';
  }, 200);
}

// ==================== 词典面板（iframe） ====================
let _dictPanel = null;
let _dictOverlay = null;

function showDictPanel(word, url) {
  closeDictPanel();

  _dictOverlay = document.createElement('div');
  _dictOverlay.className = 'dict-overlay';

  _dictPanel = document.createElement('div');
  _dictPanel.className = 'dict-panel';
  _dictPanel.innerHTML = `
    <div class="dict-panel__header">
      <span class="dict-panel__title">📖 ${word}</span>
      <div class="dict-panel__actions">
        <a class="dict-panel__link" href="${url}" target="_blank" rel="noopener">在新标签页打开 ↗</a>
        <button class="dict-panel__close" title="关闭">✕</button>
      </div>
    </div>
    <div class="dict-panel__body">
      <div class="dict-panel__loading"><div class="loading__spinner"></div>正在加载词典...</div>
      <iframe class="dict-panel__iframe" src="${url}" style="display:none;"></iframe>
    </div>
  `;

  document.body.appendChild(_dictOverlay);
  document.body.appendChild(_dictPanel);

  requestAnimationFrame(() => {
    _dictPanel.classList.add('dict-panel--visible');
    _dictOverlay.classList.add('dict-overlay--visible');
  });

  const iframe = _dictPanel.querySelector('.dict-panel__iframe');
  iframe.addEventListener('load', () => {
    _dictPanel.querySelector('.dict-panel__loading').style.display = 'none';
    iframe.style.display = 'block';
  });

  _dictPanel.querySelector('.dict-panel__close').addEventListener('click', closeDictPanel);
  _dictOverlay.addEventListener('click', closeDictPanel);
  document.addEventListener('keydown', _dictEscHandler);
}

function _dictEscHandler(e) {
  if (e.key === 'Escape') closeDictPanel();
}

function closeDictPanel() {
  document.removeEventListener('keydown', _dictEscHandler);
  if (_dictPanel) {
    _dictPanel.classList.remove('dict-panel--visible');
    const panel = _dictPanel;
    setTimeout(() => panel.remove(), 250);
    _dictPanel = null;
  }
  if (_dictOverlay) {
    _dictOverlay.classList.remove('dict-overlay--visible');
    const overlay = _dictOverlay;
    setTimeout(() => overlay.remove(), 250);
    _dictOverlay = null;
  }
}
