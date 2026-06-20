/**
 * data.js - 数据加载、存储与工具函数
 */

// ==================== 全局状态 ====================
let HANDBOOK_DATA = null;
let SEARCH_INDEX = null;
let DICTIONARY = null;
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

// ==================== 词库与 Tooltip ====================

/**
 * 加载词库数据
 */
async function loadDictionary() {
  if (DICTIONARY) return DICTIONARY;
  try {
    const response = await fetch('data/dictionary.json');
    DICTIONARY = await response.json();
    return DICTIONARY;
  } catch (error) {
    console.error('加载词库失败:', error);
    DICTIONARY = {};
    return DICTIONARY;
  }
}

/**
 * 查询词语信息
 */
function lookupWord(word) {
  if (!DICTIONARY) return null;
  // 清理词语（去掉括号注释等）
  const clean = word.replace(/[（(].*?[）)]/g, '').trim();
  return DICTIONARY[clean] || DICTIONARY[word] || null;
}

/**
 * 初始化 Tooltip 系统
 * 在知识学习页面的内容区域，为表格单元格和列表项中的词语添加 hover tooltip
 */
function initTooltipSystem() {
  // 移除已有的 tooltip
  const existing = document.getElementById('word-tooltip');
  if (existing) existing.remove();

  // 创建 tooltip 元素
  const tooltip = document.createElement('div');
  tooltip.id = 'word-tooltip';
  tooltip.className = 'word-tooltip';
  document.body.appendChild(tooltip);

  let hideTimer = null;

  // 显示 tooltip
  function showTooltip(word, rect) {
    clearTimeout(hideTimer);
    const info = lookupWord(word);
    if (!info) return;
    const hasPinyin = info.pinyin && info.pinyin.trim();
    const hasMeaning = info.meaning && info.meaning.trim();
    const hasExample = info.example && info.example.trim();
    if (!hasPinyin && !hasMeaning && !hasExample) return;

    let html = '';
    if (hasPinyin) html += `<div class="word-tooltip__pinyin">🔊 ${info.pinyin}</div>`;
    if (hasMeaning) html += `<div class="word-tooltip__meaning">${info.meaning}</div>`;
    if (hasExample) html += `<div class="word-tooltip__example">📝 ${info.example}</div>`;

    tooltip.innerHTML = html;
    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';

    // 定位
    const tipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - 8;

    // 边界检查
    if (left < 8) left = 8;
    if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
    if (top < 8) top = rect.bottom + 8; // 放下方

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.visibility = 'visible';
    tooltip.classList.add('word-tooltip--visible');
  }

  function hideTooltip() {
    hideTimer = setTimeout(() => {
      tooltip.classList.remove('word-tooltip--visible');
      setTimeout(() => { tooltip.style.display = 'none'; }, 200);
    }, 200);
  }

  // 监听鼠标事件（事件委托）
  document.addEventListener('mouseover', async (e) => {
    if (!DICTIONARY) return;
    const target = e.target;

    // 表格单元格
    if (target.tagName === 'TD') {
      const text = target.textContent.trim();
      if (text && text.length >= 2 && text.length <= 20) {
        showTooltip(text, target.getBoundingClientRect());
        target.addEventListener('mouseleave', hideTooltip, { once: true });
        return;
      }
      // 多个词语（顿号分隔）
      if (text.includes('、')) {
        const word = findWordAtPoint(target, e.clientX, e.clientY);
        if (word) {
          showTooltip(word, target.getBoundingClientRect());
          target.addEventListener('mouseleave', hideTooltip, { once: true });
        }
      }
    }

    // 紧凑网格单元格（compact-grid__main）
    if (target.classList.contains('compact-grid__main')) {
      const text = target.textContent.trim();
      if (text && text.length >= 2) {
        showTooltip(text, target.getBoundingClientRect());
        target.addEventListener('mouseleave', hideTooltip, { once: true });
        return;
      }
    }

    // 列表项
    if (target.tagName === 'LI') {
      const text = target.textContent.trim();
      if (text && text.length >= 2 && text.length <= 30) {
        // 提取第一个词（顿号前）
        const firstWord = text.split('、')[0].split('，')[0].trim();
        if (firstWord.length >= 2) {
          showTooltip(firstWord, target.getBoundingClientRect());
          target.addEventListener('mouseleave', hideTooltip, { once: true });
        }
      }
    }
  });

  // 阻止 tooltip 自身触发隐藏
  tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tooltip.addEventListener('mouseleave', hideTooltip);
}

/**
 * 根据鼠标位置找到对应的词
 */
function findWordAtPoint(element, x, y) {
  const text = element.textContent;
  if (!text || !text.includes('、')) return null;

  // 用 Range API 找到鼠标位置的词
  const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
  if (range) {
    const offset = range.startOffset;
    // 向前找到词的开头
    let start = offset;
    while (start > 0 && !'、，,；; '.includes(text[start - 1])) start--;
    // 向后找到词的结尾
    let end = offset;
    while (end < text.length && !'、，,；; '.includes(text[end])) end++;
    return text.substring(start, end).trim();
  }
  return null;
}
