/**
 * clean-voice-words.js
 * 从 handbook.json 中提取"第一部分 语音 → 必考知识梳理"下全部4个子章节的数据，
 * 清洗后输出为干净的 JSON 文件，供 knowledge.js 直接使用。
 *
 * 用法：node scripts/clean-voice-words.js
 */

const fs = require('fs');
const path = require('path');

const HANDBOOK_PATH = path.join(__dirname, '..', 'data', 'handbook.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'handbook-voice-words.json');

// 提取尾部的中文释义括号，如 "...(形容山势高而险)"
// 返回 { word: 去掉释义后的词, def: 释义内容（无则空） }
function extractWordAndDef(text) {
  const m = text.match(/\(([\u4e00-\u9fff][^)]*)\)$/);
  if (m) {
    return { word: text.slice(0, m.index).replace(/\s+$/, ''), def: m[1] };
  }
  return { word: text, def: '' };
}

// 获取拼音首字母（大写A-Z）
function getFirstLetter(pinyin) {
  if (!pinyin) return '';
  const base = pinyin.charAt(0).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /[A-Z]/.test(base) ? base : '';
}

// ========================= 章节1：容易读错的词语 =========================
// 数据格式：table HTML 表格 + paragraph 纯文本词条交错排列，含字母标题
function extractSection1(content, startIdx, endIdx) {
  const groups = {};
  let currentLetter = '';

  for (let i = startIdx + 1; i < endIdx; i++) {
    const node = content[i];
    if (!node) continue;

    // 字母标题
    if (node.type === 'heading' && /^[A-Z]$/.test((node.text || '').trim())) {
      currentLetter = node.text.trim();
      if (!groups[currentLetter]) groups[currentLetter] = [];
      continue;
    }

    if (node.type === 'table' && node.html) {
      // 从 HTML 表格提取所有单元格内容
      const cellRegex = /<td>(.*?)<\/td>/g;
      let m;
      while ((m = cellRegex.exec(node.html)) !== null) {
        const content_text = m[1].trim();
        if (!content_text || /^[A-Z]$/.test(content_text)) continue;
        const { word, def } = extractWordAndDef(content_text);
        const pinyinMatch = word.match(/\(([a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ]+)\)/);
        if (!pinyinMatch) continue;
        const letter = getFirstLetter(pinyinMatch[1]) || currentLetter;
        if (!letter) continue;
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push({ word, def });
      }
    } else if (node.type === 'paragraph' && node.text) {
      const text = node.text.trim();
      if (!/\([a-zA-Z]/.test(text)) continue;
      const { word, def } = extractWordAndDef(text);
      const pinyinMatch = word.match(/\(([a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ]+)\)/);
      if (!pinyinMatch) continue;
      const letter = getFirstLetter(pinyinMatch[1]) || currentLetter;
      if (!letter) continue;
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push({ word, def });
    }
  }

  const total = Object.values(groups).reduce((s, a) => s + a.length, 0);
  return { groups, totalCount: total };
}

// ========================= 章节2：容易读错的成语 =========================
// 数据格式：全部段落。每个段落一条词。含 level5 字母标题。
function extractSection2(content, startIdx, endIdx) {
  const groups = {};
  let currentLetter = '';

  for (let i = startIdx + 1; i < endIdx; i++) {
    const node = content[i];
    if (!node) continue;

    if (node.type === 'heading' && node.level === 5 && /^[A-Z]?$/.test((node.text || '').trim())) {
      currentLetter = node.text.trim().toUpperCase();
      if (currentLetter && !groups[currentLetter]) groups[currentLetter] = [];
      continue;
    }

    if (node.type === 'paragraph' && node.text) {
      const text = node.text.trim();
      if (!/\([a-zA-Z]/.test(text)) continue;
      const { word, def } = extractWordAndDef(text);
      const pinyinMatch = word.match(/\(([a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ]+)\)/);
      if (!pinyinMatch) continue;
      const letter = getFirstLetter(pinyinMatch[1]) || currentLetter;
      if (!letter) continue;
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push({ word, def });
    }
  }

  // 如果开头有一批没有字母标题的词（字母组未确定），尝试放在第一个有效组前
  const total = Object.values(groups).reduce((s, a) => s + a.length, 0);
  return { groups, totalCount: total };
}

// ========================= 章节3：必须掌握的多音字 =========================
// 格式：段落混合图片，如 "阿 ①ā 阿长 阿哥 ②ē 阿其所好"
// 这不是按字母分组的词语列表，而是多音字释义，直接保留原文段落
function extractSection3(content, startIdx, endIdx) {
  const items = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const node = content[i];
    if (!node) continue;
    if (node.type === 'paragraph' && node.text) {
      items.push(node.text.trim());
    }
  }
  return { items, totalCount: items.length };
}

// ========================= 章节4：巧记多音多义字 =========================
// 格式：编号段落，如 "①艾: 他在耆艾ài之年..."
function extractSection4(content, startIdx, endIdx) {
  const items = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const node = content[i];
    if (!node) continue;
    if (node.type === 'paragraph' && node.text) {
      items.push(node.text.trim());
    }
  }
  return { items, totalCount: items.length };
}

// ========================= 主流程 =========================

console.log('读取 handbook.json...');
const handbook = JSON.parse(fs.readFileSync(HANDBOOK_PATH, 'utf-8'));
const content = handbook.content;
console.log(`总节点数: ${content.length}`);

// 定位所有子章节标题
const sections = [];
for (let i = 0; i < content.length; i++) {
  const node = content[i];
  if (node.type !== 'heading') continue;
  const t = node.text || '';
  if (t.includes('初中生容易读错的词语')) sections.push({ idx: i, key: 'words', title: t });
  else if (t.includes('初中生容易读错的成语')) sections.push({ idx: i, key: 'idioms', title: t });
  else if (t.includes('初中生必须掌握的多音字')) sections.push({ idx: i, key: 'polyphones', title: t });
  else if (t.includes('巧记多音多义字')) sections.push({ idx: i, key: 'mnemonics', title: t });
  else if (t.includes('第二部分 汉字')) sections.push({ idx: i, key: '_END_', title: t });
}

console.log('找到子章节:');
sections.forEach(s => console.log(`  [${s.key}] index ${s.idx}: ${s.title.slice(0, 60)}`));

// 构建结果
const result = {
  description: '第一部分 语音 → 必考知识梳理（全部字词数据清洗后）',
  generatedAt: new Date().toISOString(),
  sections: {}
};

for (let i = 0; i < sections.length - 1; i++) {
  const sec = sections[i];
  if (sec.key === '_END_') break;
  const endIdx = sections.find((s, j) => j > i && s.key !== '_END_')?.idx || sections[sections.length - 1].idx;

  console.log(`\n处理 [${sec.key}] 范围 [${sec.idx}, ${endIdx})...`);

  let data;
  if (sec.key === 'words') {
    data = extractSection1(content, sec.idx, endIdx);
  } else if (sec.key === 'idioms') {
    data = extractSection2(content, sec.idx, endIdx);
  } else if (sec.key === 'polyphones') {
    data = extractSection3(content, sec.idx, endIdx);
  } else if (sec.key === 'mnemonics') {
    data = extractSection4(content, sec.idx, endIdx);
  }

  result.sections[sec.key] = {
    title: sec.title,
    ...data
  };

  if (data.groups) {
    const sorted = Object.keys(data.groups).sort();
    console.log(`  分组: ${sorted.join(', ')}`);
    sorted.forEach(l => console.log(`    ${l}: ${data.groups[l].length} 条`));
    console.log(`  总计: ${data.totalCount} 条`);
  } else {
    console.log(`  总计: ${data.totalCount} 条`);
  }
}

// 写入
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
console.log(`\n已生成: ${OUTPUT_PATH}`);
