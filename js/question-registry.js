/**
 * question-registry.js - 题库注册表与统一管理
 *
 * 职责：
 * 1. 加载题型注册表（data/question-types.json）
 * 2. 加载真题库（data/exam-questions.json）
 * 3. 加载预制题库（data/auto-questions.json）
 * 4. 提供统一的题型/难度/学期/来源查询接口
 * 5. 合并真题 + 预制题，统一输出给 practice.js
 *
 * 设计原则：
 * - 题型注册制：加新题型只需改 JSON，不改代码
 * - 真题/预制题统一接口：调用方不需要关心来源
 * - 只使用预制题和真题：不依赖运行时实时生成
 */

// ==================== 注册表状态 ====================
let _registry = null;
let _examBank = null;
let _autoBank = null;
let _loadPromise = null;

// ==================== 加载 ====================
async function loadQuestionRegistry() {
  if (_registry) return _registry;
  try {
    const res = await fetch('data/question-types.json?v=20260625b');
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
    const res = await fetch('data/exam-questions.json?v=20260625b');
    _examBank = await res.json();
  } catch (e) {
    console.error('加载真题库失败:', e);
    _examBank = { version: 1, questions: [], papers: [] };
  }
  return _examBank;
}

/** 加载预制题库（AI 预先编写的题目，替代实时生成） */
async function loadAutoBank() {
  if (_autoBank) return _autoBank;
  try {
    const res = await fetch('data/auto-questions.json?v=20260625b');
    _autoBank = await res.json();
  } catch (e) {
    _autoBank = { version: 1, questions: [] };
  }
  return _autoBank;
}

async function loadAllQuestionData() {
  if (_loadPromise) return _loadPromise;
  // 三个数据源并行加载：题型注册表 + 真题库 + 预制题库
  _loadPromise = Promise.all([loadQuestionRegistry(), loadExamBank(), loadAutoBank()]);
  const [registry, examBank, autoBank] = await _loadPromise;
  return { registry, examBank, autoBank };
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

/** 获取所有预制题 */
function getAutoQuestions() {
  return _autoBank ? _autoBank.questions : [];
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
  return getExamQuestions().filter(q => q.paper_id === paperId && q.qsrc === 'exam')
    .sort((a, b) => (a.original_no || 0) - (b.original_no || 0));
}

// ==================== 统一出题接口 ====================

/**
 * 统一出题：合并真题 + 预制题，按条件筛选
 *
 * 出题策略（2026-06-24 更新）：
 * - 只使用预制题和真题，完全放弃运行时实时生成
 * - 预制题（auto-questions.json）：AI 预先编写，质量可控，持续扩充
 * - 真题（exam-questions.json）：真实考卷题目，按年份/地区组织
 * - 来源不足时不会降级到实时生成，应通过扩充数据文件解决
 *
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

  // 诊断：检查数据是否已加载
  const autoCount = getAutoQuestions().length;
  const examCount = getExamQuestions().length;
  if (autoCount === 0 && examCount === 0) {
    console.warn('[出题] 题库未加载或为空：预制题 0 道，真题 0 道', {
      loadState: { _autoBank: !!_autoBank, _examBank: !!_examBank, _registry: !!_registry }
    });
  }

  // 来源：仅真题
  if (source === 'exam') {
    const result = _sampleFromExam(type, difficulty, semester, count);
    if (result.length === 0) {
      console.warn('[出题] 来源=真题，无匹配题目', { type, difficulty, semester, count, examTotal: examCount });
    }
    return result;
  }

  // 来源：仅预制题（无需实时生成降级）
  if (source === 'auto') {
    const result = _sampleFromAuto(type, difficulty, count);
    if (result.length === 0) {
      console.warn('[出题] 来源=预制题，无匹配题目', { type, difficulty, count, autoTotal: autoCount });
    }
    return result;
  }

  // 混合来源：真题 + 预制题（混排）
  // 真题按 semester 筛选，预制题不受学期限制
  const examQs = _sampleFromExam(type, difficulty, semester, Math.ceil(count / 2));
  const autoRemain = count - examQs.length;
  const autoQs = autoRemain > 0 ? _sampleFromAuto(type, difficulty, autoRemain) : [];
  const result = [...examQs, ...autoQs].sort(() => Math.random() - 0.5);

  if (result.length === 0) {
    console.warn('[出题] 混合来源，无匹配题目', {
      type, difficulty, count, source, semester,
      examMatched: examQs.length, autoTotal: autoCount, examTotal: examCount
    });
  }

  return result;
}

// ==================== 内部实现 ====================

/** 从真题库抽样（只取 qsrc === 'exam' 的题） */
function _sampleFromExam(type, difficulty, semester, count) {
  let pool = getExamQuestions().filter(q => q.qsrc === 'exam');
  if (type !== 'all') pool = pool.filter(q => q.type === type);
  if (difficulty !== 'mixed') pool = pool.filter(q => q.difficulty === difficulty);
  if (semester !== 'all') pool = pool.filter(q => q.semester === semester || q.semester === 'all');

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * 从预制题库抽样（只使用已入库的预制题，不依赖实时生成）
 *
 * 策略：
 * 1. 从 auto-questions.json 取预制题（qsrc === 'auto'）
 * 2. 按题型+难度筛选，洗牌后取指定数量
 * 3. 如果预制题不够，只返回已有的（不再降级到实时生成）
 *
 * 注意：2026-06-24 起已放弃"实时生成降级"方案，
 * 题量不足时应通过 generate-auto-questions.js 扩充预制题来解决。
 */
function _sampleFromAuto(type, difficulty, count) {
  let pool = getAutoQuestions().filter(q => q.status === 'approved');
  if (type !== 'all') pool = pool.filter(q => q.type === type);
  if (difficulty !== 'mixed') pool = pool.filter(q => q.difficulty === difficulty);

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
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
      pinyin:     { name: '字音', icon: '🔊', category: 'basic', active: true },
      char:       { name: '字形', icon: '✏️', category: 'basic', active: true },
      word_usage: { name: '词语运用', icon: '💭', category: 'basic', active: true },
      sentence:   { name: '病句辨析', icon: '🔧', category: 'basic', active: true },
      rhetoric:   { name: '修辞手法', icon: '🎨', category: 'basic', active: true },
      literature: { name: '文学常识', icon: '📚', category: 'basic', active: true },
      recitation: { name: '古诗文默写', icon: '📝', category: 'basic', active: true }
    },
    difficulties: {
      easy:   { name: '简单', level: 1 },
      medium: { name: '中等', level: 2 },
      hard:   { name: '困难', level: 3 }
    },
    semesters: { all: { name: '全学段', grade: 0, semester: 0 } },
    sources: {
      exam: { name: '真题', icon: '📋' },
      auto: { name: '预制题', icon: '📋' },
      mock: { name: '模拟题', icon: '📝' }
    }
  };
}
