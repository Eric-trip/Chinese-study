/**
 * data.js - 数据加载、存储与工具函数
 */

// ==================== 全局状态 ====================
let HANDBOOK_DATA = null;
let SEARCH_INDEX = null;
let CURRENT_STAGE = 'junior';

const STAGES = {
  junior: { name: '初中', shortName: '初', color: '#2C5F5D', active: true },
  senior: { name: '高中', shortName: '高', color: '#8B5CF6', active: false }
};

// ==================== 数据加载 ====================
async function loadHandbookData() {
  if (HANDBOOK_DATA) return HANDBOOK_DATA;
  try {
    const response = await fetch('data/handbook.json');
    HANDBOOK_DATA = await response.json();
    return HANDBOOK_DATA;
  } catch (error) {
    console.error('加载数据失败:', error);
    return null;
  }
}

// ==================== 数据查询 ====================
function getBians() {
  return HANDBOOK_DATA ? HANDBOOK_DATA.bians.map(b => ({ id: b.bian_id, name: b.bian_name, parts: b.parts })) : [];
}

function getParts(bianId) {
  const bian = HANDBOOK_DATA?.bians.find(b => b.bian_id === bianId);
  return bian ? bian.parts : [];
}

function getPart(bianId, partId) {
  const parts = getParts(bianId);
  return parts.find(p => p.part_id === partId);
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
  const bian = HANDBOOK_DATA?.bians.find(b => b.bian_id === bianId);
  const part = bian?.parts.find(p => p.part_id === partId);
  const section = part?.sections[sectionIndex];
  return {
    bianName: bian?.bian_name || '',
    partName: part?.part_name || '',
    sectionName: section?.section_name || ''
  };
}

function getContentStats() {
  if (!HANDBOOK_DATA) return { parts: 0, sections: 0, items: 0 };
  let parts = 0, sections = 0, items = 0;
  for (const bian of HANDBOOK_DATA.bians) {
    parts += bian.parts.length;
    for (const part of bian.parts) {
      sections += part.sections.length;
      for (const sec of part.sections) {
        if (sec.subsections) items += sec.subsections.length;
      }
    }
  }
  return { parts, sections, items };
}

// 获取所有扁平化的内容节点（用于搜索）
function getAllContentNodes() {
  if (!HANDBOOK_DATA) return [];
  const nodes = [];
  for (const bian of HANDBOOK_DATA.bians) {
    for (const part of bian.parts) {
      for (let si = 0; si < part.sections.length; si++) {
        const sec = part.sections[si];
        // Section level content
        if (sec.content) {
          nodes.push({
            bianId: bian.bian_id, bianName: bian.bian_name,
            partId: part.part_id, partName: part.part_name,
            sectionIndex: si, sectionName: sec.section_name,
            title: sec.section_name, content: sec.content,
            path: `${bian.bian_name} > ${part.part_name} > ${sec.section_name}`
          });
        }
        // Subsection level
        if (sec.subsections) {
          for (const sub of sec.subsections) {
            const subTitle = sub.title || '';
            if (sub.content) {
              nodes.push({
                bianId: bian.bian_id, bianName: bian.bian_name,
                partId: part.part_id, partName: part.part_name,
                sectionIndex: si, sectionName: sec.section_name,
                title: subTitle || sec.section_name, content: sub.content,
                path: `${bian.bian_name} > ${part.part_name} > ${sec.section_name}${subTitle ? ' > ' + subTitle : ''}`
              });
            }
            if (sub.sub_items) {
              for (const item of sub.sub_items) {
                const itemTitle = item.title || '';
                if (item.content) {
                  nodes.push({
                    bianId: bian.bian_id, bianName: bian.bian_name,
                    partId: part.part_id, partName: part.part_name,
                    sectionIndex: si, sectionName: sec.section_name,
                    title: itemTitle || subTitle, content: item.content,
                    path: `${bian.bian_name} > ${part.part_name} > ${sec.section_name}${subTitle ? ' > ' + subTitle : ''}${itemTitle ? ' > ' + itemTitle : ''}`
                  });
                }
                if (item.table) {
                  const tableText = item.table.headers.join(' ') + ' ' +
                    item.table.rows.map(r => r.join(' ')).join(' ');
                  nodes.push({
                    bianId: bian.bian_id, bianName: bian.bian_name,
                    partId: part.part_id, partName: part.part_name,
                    sectionIndex: si, sectionName: sec.section_name,
                    title: itemTitle || subTitle, content: tableText,
                    path: `${bian.bian_name} > ${part.part_name} > ${sec.section_name}${subTitle ? ' > ' + subTitle : ''}${itemTitle ? ' > ' + itemTitle : ''}`
                  });
                }
              }
            }
            if (sub.table) {
              const tableText = sub.table.headers.join(' ') + ' ' +
                sub.table.rows.map(r => r.join(' ')).join(' ');
              nodes.push({
                bianId: bian.bian_id, bianName: bian.bian_name,
                partId: part.part_id, partName: part.part_name,
                sectionIndex: si, sectionName: sec.section_name,
                title: subTitle || sec.section_name, content: tableText,
                path: `${bian.bian_name} > ${part.part_name} > ${sec.section_name}${subTitle ? ' > ' + subTitle : ''}`
              });
            }
          }
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
  // 浏览记录
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
  getTotalSections() { return 46; },

  // 收藏
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

  // 笔记
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

  // 练习成绩
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

  // 错题
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

  // 笔记数量
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
 * 例如："爱憎(zēng)分明" → "爱憎分明"
 *       "一丘之貉(hé)" → "一丘之貉"
 *       " 差(chā)强(qiáng)人(rén)意(yì) " → "差强人意"
 * @param {string} text - 原始选中文本
 * @returns {string} - 清理后的文本
 */
function cleanPinyinAnnotations(text) {
  if (!text) return text;
  // 匹配全角/半角括号内的拼音注释：
  // 拼音特征为拉丁字母+声调符号，括号内可能包含空格、标点分隔的多个拼音
  // 例如: (zēng), （hé）, (chā qiáng rén yì), (wéi jí)
  let result = text.replace(/[（(][a-zA-ZāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜĀÁǍÀŌÓǑÒĒÉĚÈĪÍǏÌŪÚǓÙǕǗǙǛüÜñÑêÊâÂôÔîÎûÛäÄëËïÏöÖ\s,.·;:]+[）)]/g, '');
  // 清理可能产生的多余空格
  result = result.replace(/\s{2,}/g, '').trim();
  return result;
}

// ==================== 选词查词典 ====================
let _selectionPopup = null;
let _selectionTimer = null;

/**
 * 初始化选词弹窗系统
 * @param {string} scopeSelector - 限定在哪个容器内生效
 */
function initSelectionLookup(scopeSelector) {
  // 创建弹窗元素
  if (!_selectionPopup) {
    _selectionPopup = document.createElement('div');
    _selectionPopup.className = 'selection-popup';
    _selectionPopup.innerHTML = `
      <a class="selection-popup__item" data-action="dict">📖 查百度汉语</a>
      <a class="selection-popup__item" data-action="baike">🔍 查百度百科</a>
    `;
    document.body.appendChild(_selectionPopup);

    // 点击弹窗外或按 Esc 关闭
    document.addEventListener('mousedown', (e) => {
      if (_selectionPopup && !_selectionPopup.contains(e.target)) {
        hideSelectionPopup();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideSelectionPopup();
    });

    // 点击弹窗项
    _selectionPopup.addEventListener('click', (e) => {
      const item = e.target.closest('.selection-popup__item');
      if (!item) return;
      const action = item.dataset.action;
      const word = _selectionPopup.dataset.word;
      if (!word) return;
      let url = '';
      if (action === 'dict') {
        url = `https://dict.baidu.com/s?wd=${encodeURIComponent(word)}`;
      } else if (action === 'baike') {
        url = `https://baike.baidu.com/item/${encodeURIComponent(word)}`;
      }
      if (url) window.open(url, '_blank');
      hideSelectionPopup();
    });
  }

  // 监听 mouseup（检测选中文本）
  document.addEventListener('mouseup', (e) => {
    // 只在指定区域内生效
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

      // 限制：2-20字，不含纯标点/数字
      if (text.length < 2 || text.length > 20) return;
      if (/^[\d\s\p{P}]+$/u.test(text)) return;

      // 清理选中文本中的拼音注释（如"爱憎(zēng)分明" → "爱憎分明"）
      const cleanText = cleanPinyinAnnotations(text);
      if (cleanText.length < 2 || cleanText.length > 20) return;

      // 获取选区的位置
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

  // 定位：选区正上方居中
  const popupRect = _selectionPopup.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  let top = rect.top - popupRect.height - 8;

  // 边界检查
  if (left < 8) left = 8;
  if (left + popupRect.width > window.innerWidth - 8) {
    left = window.innerWidth - popupRect.width - 8;
  }
  if (top < 8) top = rect.bottom + 8; // 放下方

  _selectionPopup.style.left = left + 'px';
  _selectionPopup.style.top = top + 'px'; // fixed 定位，不需要加 scrollY
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
