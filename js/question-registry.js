/**
 * question-registry.js - 题库注册表与统一管理
 *
 * 职责：
 * 1. 加载题型注册表（data/question-types.json）
 * 2. 加载真题库（data/exam-questions.json）
 * 3. 提供统一的题型/难度/学期/来源查询接口
 * 4. 合并真题 + 自主题，统一输出给 practice.js
 *
 * 设计原则：
 * - 题型注册制：加新题型只需改 JSON，不改代码
 * - 真题/自主题统一接口：调用方不需要关心来源
 * - 向下兼容：原 question-bank.js 的 GENERATORS 继续工作
 */

// ==================== 注册表状态 ====================
let _registry = null;
let _examBank = null;
let _loadPromise = null;

// ==================== 加载 ====================
async function loadQuestionRegistry() {
  if (_registry) return _registry;
  try {
    const res = await fetch('data/question-types.json');
    _registry = await res.json();
  } catch (e) {
    console.error('加载题型注册表失败:', e);
    _registry = _getFallbackRegistry();
  }
  return _registry;
}

async function loadExamBank() {
  if (_examBank) return _examBank;
  try {
    const res = await fetch('data/exam-questions.json');
    _examBank = await res.json();
  } catch (e) {
    console.error('加载真题库失败:', e);
    _examBank = { version: 1, questions: [], papers: [] };
  }
  return _examBank;
}

async function loadAllQuestionData() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = Promise.all([loadQuestionRegistry(), loadExamBank()]);
  const [registry, examBank] = await _loadPromise;
  return { registry, examBank };
}

// ==================== 查询接口 ====================

/** 获取所有激活的题型（按板块分组） */
function getActiveTypesByCategory() {
  if (!_registry) return {};
  const result = {};
  for (const [typeId, type] of Object.entries(_registry.types)) {
    if (!type.active) continue;
    const cat = type.category;
    if (!result[cat]) result[cat] = [];
    result[cat].push({ id: typeId, ...type });
  }
  return result;
}

/** 获取题型信息 */
function getTypeInfo(typeId) {
  if (!_registry || !_registry.types[typeId]) {
    // 兼容旧题型名
    return { name: typeId, icon: '❓', category: 'basic' };
  }
  return _registry.types[typeId];
}

/** 获取板块信息 */
function getCategoryInfo(catId) {
  if (!_registry || !_registry.categories[catId]) return null;
  return _registry.categories[catId];
}

/** 获取所有板块 */
function getAllCategories() {
  return _registry ? _registry.categories : {};
}

/** 获取难度信息 */
function getDifficultyInfo(diffId) {
  if (!_registry || !_registry.difficulties[diffId]) return { name: diffId, level: 0 };
  return _registry.difficulties[diffId];
}

/** 获取所有学期 */
function getAllSemesters() {
  return _registry ? _registry.semesters : {};
}

/** 获取所有来源 */
function getAllSources() {
  return _registry ? _registry.sources : {};
}

// ==================== 真题查询 ====================

/** 获取所有真题试卷列表 */
function getExamPapers() {
  return _examBank ? _examBank.papers : [];
}

/** 获取所有真题题目 */
function getExamQuestions() {
  return _examBank ? _examBank.questions : [];
}

/** 按条件筛选真题 */
function filterExamQuestions(filters = {}) {
  let questions = getExamQuestions();
  if (filters.type) questions = questions.filter(q => q.type === filters.type);
  if (filters.difficulty && filters.difficulty !== 'mixed') {
    questions = questions.filter(q => q.difficulty === filters.difficulty);
  }
  if (filters.semester && filters.semester !== 'all') {
    questions = questions.filter(q => q.semester === filters.semester || q.semester === 'all');
  }
  if (filters.region) questions = questions.filter(q => q.exam_info?.region === filters.region);
  if (filters.year) questions = questions.filter(q => q.exam_info?.year === filters.year);
  if (filters.paperId) questions = questions.filter(q => q.paper_id === filters.paperId);
  return questions;
}

/** 获取一套真题卷的所有题目（按原卷顺序） */
function getPaperQuestions(paperId) {
  return getExamQuestions().filter(q => q.paper_id === paperId)
    .sort((a, b) => (a.original_no || 0) - (b.original_no || 0));
}

// ==================== 统一出题接口 ====================

/**
 * 统一出题：合并真题 + 自主题，按条件筛选
 * @param {Object} options - 筛选条件
 * @param {string} options.type - 题型ID，'all' 为全部
 * @param {string} options.difficulty - 难度，'mixed' 为混合
 * @param {number} options.count - 题量
 * @param {string} options.source - 来源 'all'|'exam'|'auto'
 * @param {string} options.semester - 学期 'all'|'g7s1'|'g7s2'|...
 * @returns {Array} 题目数组
 */
function generateUnifiedQuestions(options = {}) {
  const {
    type = 'all',
    difficulty = 'mixed',
    count = 10,
    source = 'all',
    semester = 'all'
  } = options;

  // 如果来源只选真题，直接从真题库取
  if (source === 'exam') {
    return _sampleFromExam(type, difficulty, semester, count);
  }

  // 如果来源只选自主题，用 GENERATORS 生成
  if (source === 'auto') {
    return _generateAutoQuestions(type, difficulty, count);
  }

  // 混合来源：真题 + 自主题
  const examQs = _sampleFromExam(type, difficulty, semester, count);
  const autoCount = count - examQs.length;
  const autoQs = autoCount > 0 ? _generateAutoQuestions(type, difficulty, autoCount) : [];
  return [...examQs, ...autoQs].sort(() => Math.random() - 0.5);
}

// ==================== 内部实现 ====================

/** 从真题库抽样 */
function _sampleFromExam(type, difficulty, semester, count) {
  let pool = getExamQuestions();
  if (type !== 'all') pool = pool.filter(q => q.type === type);
  if (difficulty !== 'mixed') pool = pool.filter(q => q.difficulty === difficulty);
  if (semester !== 'all') pool = pool.filter(q => q.semester === semester || q.semester === 'all');

  // 洗牌抽取
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/** 用 GENERATORS 生成自主题（兼容旧接口） */
function _generateAutoQuestions(type, difficulty, count) {
  // 检查该题型是否有自动生成器
  if (type !== 'all') {
    const typeInfo = getTypeInfo(type);
    if (!typeInfo.auto_generate) return [];
  }
  // 调用 question-bank.js 的原始生成函数
  if (typeof generateQuestions !== 'function') return [];
  return generateQuestions(type, difficulty, count);
}

// ==================== 向下兼容映射 ====================

/**
 * 旧题型名 → 新题型ID 映射
 * 保证已有错题记录不丢失
 */
const LEGACY_TYPE_MAP = {
  'pinyin': 'pinyin',
  'char': 'char',
  'idiom': 'word_usage',    // 成语 → 词语运用
  'rhetoric': 'rhetoric',
  'literature': 'literature',
  'quote': 'recitation',    // 名句默写 → 古诗文默写
  'sentence': 'sentence'
};

/** 将旧题型名转为新题型ID */
function normalizeTypeId(oldType) {
  return LEGACY_TYPE_MAP[oldType] || oldType;
}

/** 获取题型信息（兼容旧名称） */
function getTypeInfoCompat(typeId) {
  return getTypeInfo(normalizeTypeId(typeId));
}

// ==================== 兜底注册表 ====================
function _getFallbackRegistry() {
  return {
    version: 1,
    categories: { basic: { name: '积累与运用', icon: '📝' } },
    types: {
      pinyin:     { name: '字音', icon: '🔊', category: 'basic', active: true, auto_generate: true },
      char:       { name: '字形', icon: '✏️', category: 'basic', active: true, auto_generate: true },
      word_usage: { name: '词语运用', icon: '💭', category: 'basic', active: true, auto_generate: true },
      sentence:   { name: '病句辨析', icon: '🔧', category: 'basic', active: true, auto_generate: true },
      rhetoric:   { name: '修辞手法', icon: '🎨', category: 'basic', active: true, auto_generate: true },
      literature: { name: '文学常识', icon: '📚', category: 'basic', active: true, auto_generate: true },
      recitation: { name: '古诗文默写', icon: '📝', category: 'basic', active: true, auto_generate: true }
    },
    difficulties: {
      easy:   { name: '简单', level: 1 },
      medium: { name: '中等', level: 2 },
      hard:   { name: '困难', level: 3 }
    },
    semesters: { all: { name: '全学段', grade: 0, semester: 0 } },
    sources: {
      exam: { name: '中考真题', icon: '📋' },
      auto: { name: '自主生成', icon: '🤖' },
      mock: { name: '模拟题', icon: '📝' }
    }
  };
}
