/**
 * validate-auto-questions.js
 *
 * 预制题校验脚本，检查 auto-questions.json 中所有题目
 * 确保入库题目符合规范
 *
 * 使用方式：node scripts/validate-auto-questions.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'auto-questions.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const errors = [];
const warnings = [];
const ids = new Set();

for (const q of data.questions) {
  // 1. id 检查
  if (!q.id) errors.push(`${q.id || 'NO_ID'}: 缺少 id`);
  else if (ids.has(q.id)) errors.push(`${q.id}: id 重复`);
  else ids.add(q.id);

  // 2. 必填字段
  if (!q.type) errors.push(`${q.id}: 缺少 type`);
  if (!q.format) errors.push(`${q.id}: 缺少 format`);
  else if (!['choice', 'truefalse', 'fill'].includes(q.format))
    errors.push(`${q.id}: format 非法 (${q.format})`);

  if (!q.difficulty) errors.push(`${q.id}: 缺少 difficulty`);
  else if (!['easy', 'medium', 'hard'].includes(q.difficulty))
    errors.push(`${q.id}: difficulty 非法 (${q.difficulty})`);

  if (q.qsrc !== 'auto') errors.push(`${q.id}: qsrc 不是 auto`);
  if (!q.status || !['approved', 'pending'].includes(q.status))
    errors.push(`${q.id}: status 非法 (${q.status})`);

  // 3. 题干
  if (!q.question || q.question.trim() === '')
    errors.push(`${q.id}: 题干为空`);
  else if (q.question.includes('undefined') || q.question.includes('null'))
    errors.push(`${q.id}: 题干含 undefined/null`);
  else if (q.question.includes('______'))
    warnings.push(`${q.id}: 题干含占位符 ______`);

  // 4. 答案
  if (!q.answer || q.answer.trim() === '')
    errors.push(`${q.id}: 答案为空`);

  // 5. 选项
  if (q.format === 'choice' || q.format === 'truefalse') {
    if (!q.options || !Array.isArray(q.options))
      errors.push(`${q.id}: 缺少 options`);
    else {
      if (q.options.length < 2) errors.push(`${q.id}: 选项不足 (${q.options.length})`);
      if (q.format === 'truefalse' && q.options.length !== 2)
        errors.push(`${q.id}: 判断题应有 2 个选项`);
      if (q.format === 'choice' && q.options.length !== 4)
        warnings.push(`${q.id}: 选择题通用为 4 个选项 (当前${q.options.length}个)`);

      const hasCorrect = q.options.some(o => o.correct === true);
      if (!hasCorrect) errors.push(`${q.id}: 缺少正确选项`);

      const texts = q.options.map(o => o.text);
      if (new Set(texts).size !== texts.length)
        errors.push(`${q.id}: 选项内容重复`);
      if (texts.some(t => !t || t.includes('undefined') || t.includes('null')))
        errors.push(`${q.id}: 选项含空值/undefined/null`);

      const altPrefixes = texts.map(t => t.replace(/^[A-Z][.)]\s*/, ''));
      if (new Set(altPrefixes).size !== altPrefixes.length)
        warnings.push(`${q.id}: 去掉选项前缀后内容重复`);
    }
  }

  // 6. 解析
  if (!q.explanation || q.explanation.length < 10)
    errors.push(`${q.id}: 解析缺失或过短 (${(q.explanation||'').length}字)`);

  // 7. handbookSource
  if (!q.handbookSource)
    warnings.push(`${q.id}: 建议标注 handbookSource`);
}

// 汇总
console.log('='.repeat(50));
console.log('  预制题校验报告');
console.log('='.repeat(50));
console.log(`  文件: auto-questions.json`);
console.log(`  版本: v${data.version}`);
console.log(`  生成日期: ${data.generated_date}`);
console.log(`  总题数: ${data.questions.length}`);
console.log('');

if (errors.length === 0 && warnings.length === 0) {
  console.log('  ✅ 全部通过，无问题。');
} else {
  if (errors.length > 0) {
    console.log(`  ❌ 错误 (${errors.length} 项，必须修复):`);
    errors.forEach(e => console.log(`     - ${e}`));
  }
  if (warnings.length > 0) {
    console.log(`  ⚠️  警告 (${warnings.length} 项，建议处理):`);
    warnings.forEach(e => console.log(`     - ${e}`));
  }
}

const exitCode = errors.length > 0 ? 1 : 0;
process.exit(exitCode);
