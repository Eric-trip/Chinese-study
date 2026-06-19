/**
 * question-bank.js - 基于手册数据自动生成题库
 * 7种题型 × 3个难度等级
 */

const QUESTION_TYPES = {
  pinyin:    { name: '字音',   icon: '🔊', color: 'pinyin' },
  char:      { name: '字形',   icon: '✏️', color: 'char' },
  idiom:     { name: '成语',   icon: '📖', color: 'idiom' },
  rhetoric:  { name: '修辞',   icon: '🎨', color: 'rhetoric' },
  literature:{ name: '文学常识', icon: '📚', color: 'literature' },
  quote:     { name: '名句默写', icon: '📝', color: 'quote' },
  sentence:  { name: '病句',   icon: '🔧', color: 'sentence' }
};

const DIFFICULTIES = {
  easy:   { name: '简单', color: 'easy' },
  medium: { name: '中等', color: 'medium' },
  hard:   { name: '困难', color: 'hard' }
};

// 题库缓存
let _questionCache = null;

/**
 * 从手册数据中提取题库素材
 */
function extractQuestionData() {
  if (_questionCache) return _questionCache;
  const data = HANDBOOK_DATA;
  if (!data) return null;

  const bank = {
    pinyinWords: [],      // {word, pinyin}
    pinyinErrors: [],     // {reason, correct, wrong}
    multiPinyin: [],      // {char, sound1, word1, sound2, word2}
    idioms: [],           // {idiom, meaning}
    nearIdioms: [],       // {idiom1, idiom2, diff}
    rhetoricTypes: [],    // {type, desc, example}
    authors: [],          // {name, era}
    works: [],            // {title, desc}
    firstWorks: [],       // {desc, title}
    famousQuotes: [],     // {quote, author, source}
    sentenceErrors: [],   // {type, desc}
    errorMethods: []      // {method, desc}
  };

  const bian1 = data.bians[0];

  // === 语音部分 ===
  const pinyinPart = bian1.parts[0];
  for (const sec of pinyinPart.sections) {
    if (sec.section_name === '必考知识梳理') {
      if (sec.subsections) {
        for (const sub of sec.subsections) {
          if (sub.title && sub.title.includes('容易读错的词语') && sub.table) {
            for (const row of sub.table.rows) {
              if (row[0] && row[1]) bank.pinyinWords.push({ word: row[0], pinyin: row[1] });
            }
          }
          if (sub.title && sub.title.includes('容易读错的成语') && sub.table) {
            for (const row of sub.table.rows) {
              if (row[0] && row[1]) bank.pinyinWords.push({ word: row[0], pinyin: row[1] });
            }
          }
          if (sub.title && sub.title.includes('多音字') && sub.sub_items) {
            for (const item of sub.sub_items) {
              if (item.table) {
                for (const row of item.table.rows) {
                  if (row[0] && row[1]) {
                    bank.multiPinyin.push({
                      char: row[0], sound1: row[1], word1: row[2] || '',
                      sound2: row[3] || '', word2: row[4] || ''
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
    if (sec.section_name === '知识能力解读') {
      if (sec.subsections) {
        for (const sub of sec.subsections) {
          if (sub.title && sub.title.includes('误读') && sub.table) {
            for (const row of sub.table.rows) {
              if (row[1] && row[2]) {
                bank.pinyinErrors.push({ reason: row[0], correct: row[1], wrong: row[2] });
              }
            }
          }
        }
      }
    }
  }

  // === 词语/成语部分 ===
  const wordPart = bian1.parts[2];
  for (const sec of wordPart.sections) {
    if (sec.section_name === '必考知识梳理' && sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.title && sub.title.includes('重点成语') && sub.content) {
          // 解析成语：格式为 "成语（释义）" 或 "成语"
          const matches = sub.content.matchAll(/([^\s、，,（）()]+)[（(]([^）)]+)[）)]/g);
          for (const m of matches) {
            const idiom = m[1].trim();
            const meaning = m[2].trim();
            if (idiom.length >= 2 && idiom.length <= 8 && meaning.length >= 2) {
              bank.idioms.push({ idiom, meaning });
            }
          }
        }
      }
    }
  }

  // === 修辞部分 ===
  const rhetoricPart = bian1.parts[5];
  for (const sec of rhetoricPart.sections) {
    if (sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.content && Array.isArray(sub.content)) {
          for (const item of sub.content) {
            if (item && typeof item === 'object' && item.headers && item.rows) {
              for (const row of item.rows) {
                if (row[0] && row[1]) {
                  bank.rhetoricTypes.push({ type: row[0], desc: row[1], example: row[2] || '' });
                }
              }
            }
          }
        }
      }
    }
  }

  // === 文学常识部分 ===
  const litPart = bian1.parts[6];
  for (const sec of litPart.sections) {
    if (sec.section_name === '必考知识梳理' && sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.content) {
          if (sub.title && sub.title.includes('古代作家')) {
            // 解析 "名字（朝代）"
            const matches = sub.content.matchAll(/([\u4e00-\u9fa5]{2,4})[（(]([^）)]+)[）)]/g);
            for (const m of matches) {
              bank.authors.push({ name: m[1], era: m[2] });
            }
          }
          if (sub.title && sub.title.includes('第一') && sub.title.includes('集锦')) {
            // 解析 "第一部XXX——《书名》"
            const matches = sub.content.matchAll(/([^；；\n]+?)——《([^》]+)》/g);
            for (const m of matches) {
              bank.firstWorks.push({ desc: m[1].trim(), title: m[2].trim() });
            }
          }
          if (sub.title && sub.title.includes('并称') && sub.title.includes('作家')) {
            // 解析 "并称（人物1、人物2）"
            const matches = sub.content.matchAll(/([\u4e00-\u9fa5]{2,6})[（(]([^）)]+)[）)]/g);
            for (const m of matches) {
              bank.authors.push({ name: m[1], era: '并称：' + m[2] });
            }
          }
        }
      }
    }
  }

  // === 名句名段 ===
  const quotePart = bian1.parts[9];
  for (const sec of quotePart.sections) {
    if (sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.content && sub.title && sub.title.includes('名句')) {
          // 尝试解析名句
          const lines = sub.content.split('\n');
          for (const line of lines) {
            const m = line.match(/[「『"](.+?)[」』"]/);
            if (m && m[1].length >= 4) {
              bank.famousQuotes.push({ quote: m[1], author: '', source: '' });
            }
          }
        }
      }
    }
  }

  // 如果名句不够，补充经典名句
  if (bank.famousQuotes.length < 20) {
    bank.famousQuotes = [
      { quote: '学而时习之，不亦说乎', author: '孔子', source: '《论语》' },
      { quote: '三人行，必有我师焉', author: '孔子', source: '《论语》' },
      { quote: '温故而知新，可以为师矣', author: '孔子', source: '《论语》' },
      { quote: '知之者不如好之者，好之者不如乐之者', author: '孔子', source: '《论语》' },
      { quote: '不积跬步，无以至千里', author: '荀子', source: '《劝学》' },
      { quote: '锲而舍之，朽木不折；锲而不舍，金石可镂', author: '荀子', source: '《劝学》' },
      { quote: '海内存知己，天涯若比邻', author: '王勃', source: '《送杜少府之任蜀州》' },
      { quote: '落霞与孤鹜齐飞，秋水共长天一色', author: '王勃', source: '《滕王阁序》' },
      { quote: '明月松间照，清泉石上流', author: '王维', source: '《山居秋暝》' },
      { quote: '大漠孤烟直，长河落日圆', author: '王维', source: '《使至塞上》' },
      { quote: '长风破浪会有时，直挂云帆济沧海', author: '李白', source: '《行路难》' },
      { quote: '天生我材必有用，千金散尽还复来', author: '李白', source: '《将进酒》' },
      { quote: '床前明月光，疑是地上霜', author: '李白', source: '《静夜思》' },
      { quote: '会当凌绝顶，一览众山小', author: '杜甫', source: '《望岳》' },
      { quote: '国破山河在，城春草木深', author: '杜甫', source: '《春望》' },
      { quote: '无可奈何花落去，似曾相识燕归来', author: '晏殊', source: '《浣溪沙》' },
      { quote: '但愿人长久，千里共婵娟', author: '苏轼', source: '《水调歌头》' },
      { quote: '人生自古谁无死，留取丹心照汗青', author: '文天祥', source: '《过零丁洋》' },
      { quote: '先天下之忧而忧，后天下之乐而乐', author: '范仲淹', source: '《岳阳楼记》' },
      { quote: '醉翁之意不在酒，在乎山水之间也', author: '欧阳修', source: '《醉翁亭记》' },
      { quote: '出淤泥而不染，濯清涟而不妖', author: '周敦颐', source: '《爱莲说》' },
      { quote: '沉舟侧畔千帆过，病树前头万木春', author: '刘禹锡', source: '《酬乐天扬州初逢席上见赠》' },
      { quote: '乱花渐欲迷人眼，浅草才能没马蹄', author: '白居易', source: '《钱塘湖春行》' },
      { quote: '几处早莺争暖树，谁家新燕啄春泥', author: '白居易', source: '《钱塘湖春行》' },
      { quote: '黑云压城城欲摧，甲光向日金鳞开', author: '李贺', source: '《雁门太守行》' },
      { quote: '春蚕到死丝方尽，蜡炬成灰泪始干', author: '李商隐', source: '《无题》' },
      { quote: '商女不知亡国恨，隔江犹唱后庭花', author: '杜牧', source: '《泊秦淮》' },
      { quote: '何当共剪西窗烛，却话巴山夜雨时', author: '李商隐', source: '《夜雨寄北》' },
      { quote: '莫道不销魂，帘卷西风，人比黄花瘦', author: '李清照', source: '《醉花阴》' },
      { quote: '山重水复疑无路，柳暗花明又一村', author: '陆游', source: '《游山西村》' },
      { quote: '王师北定中原日，家祭无忘告乃翁', author: '陆游', source: '《示儿》' },
      { quote: '人生若只如初见，何事秋风悲画扇', author: '纳兰性德', source: '《木兰花》' },
      { quote: '落红不是无情物，化作春泥更护花', author: '龚自珍', source: '《己亥杂诗》' },
      { quote: '我自横刀向天笑，去留肝胆两昆仑', author: '谭嗣同', source: '《狱中题壁》' },
      { quote: '粉身碎骨浑不怕，要留清白在人间', author: '于谦', source: '《石灰吟》' },
      { quote: '千磨万击还坚劲，任尔东西南北风', author: '郑燮', source: '《竹石》' },
      { quote: '采菊东篱下，悠然见南山', author: '陶渊明', source: '《饮酒》' },
      { quote: '海日生残夜，江春入旧年', author: '王湾', source: '《次北固山下》' },
      { quote: '潮平两岸阔，风正一帆悬', author: '王湾', source: '《次北固山下》' },
      { quote: '绿树村边合，青山郭外斜', author: '孟浩然', source: '《过故人庄》' }
    ];
  }

  // === 病句部分 ===
  const sentencePart = bian1.parts[3];
  for (const sec of sentencePart.sections) {
    if (sec.section_name === '必考知识梳理' && sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.content) {
          if (sub.title && sub.title.includes('判断')) {
            const lines = sub.content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              if (line.length > 5) bank.sentenceErrors.push({ type: '判断', desc: line.trim() });
            }
          }
          if (sub.title && sub.title.includes('修改')) {
            const lines = sub.content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              if (line.length > 5) bank.sentenceErrors.push({ type: '修改', desc: line.trim() });
            }
          }
        }
      }
    }
  }

  // 修辞方法补充
  if (bank.rhetoricTypes.length < 5) {
    bank.rhetoricTypes = [
      { type: '比喻', desc: '打比方，用具体、浅显、熟知的事物来比喻抽象、深奥、生疏的事物', example: '叶子出水很高，像亭亭的舞女的裙' },
      { type: '拟人', desc: '把物当作人来写，赋予物以人的言行或思想感情', example: '桃树、杏树、梨树，你不让我，我不让你，都开满了花赶趟儿' },
      { type: '夸张', desc: '故意言过其实，对客观的人或事物作扩大或缩小的描述', example: '飞流直下三千尺，疑是银河落九天' },
      { type: '排比', desc: '把三个或三个以上结构相同或相似、语气一致、意思相关短语或句子排列在一起', example: '盼望着，盼望着，东风来了，春天的脚步近了' },
      { type: '对偶', desc: '用字数相等、结构相同、意义对称的一对短语或句子来表达两个相对应或相近的意思', example: '海内存知己，天涯若比邻' },
      { type: '反问', desc: '用疑问的形式表达确定的意思，只问不答，答案寓于问句之中', example: '难道我们不应该努力学习吗？' },
      { type: '设问', desc: '为了引起别人的注意，故意先提出问题，然后自己回答', example: '什么是路？就是从没路的地方践踏出来的。' },
      { type: '借代', desc: '不直接说出要说的人或事物，而是借用与它密切相关的另一事物来代替', example: '巾帼不让须眉' }
    ];
  }

  _questionCache = bank;
  return bank;
}

// ==================== 题目生成器 ====================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(pool, correct, count) {
  const filtered = pool.filter(x => x !== correct);
  return shuffle(filtered).slice(0, count);
}

/**
 * 生成字音题
 */
function genPinyinQuestion(bank, difficulty) {
  const pool = bank.pinyinWords;
  if (pool.length === 0) return null;
  const item = pool[Math.floor(Math.random() * pool.length)];

  if (difficulty === 'easy') {
    // 给词语选拼音
    const distractors = pickDistractors(pool.map(p => p.pinyin), item.pinyin, 3);
    const options = shuffle([item.pinyin, ...distractors]);
    return {
      type: 'pinyin', difficulty,
      question: `下列词语中，"${item.word}"的正确读音是？`,
      options: options.map(o => ({ text: o, correct: o === item.pinyin })),
      answer: item.pinyin,
      explanation: `"${item.word}"的读音是 ${item.pinyin}。`
    };
  } else if (difficulty === 'medium') {
    // 给拼音选词语
    const distractors = pickDistractors(pool.map(p => p.word), item.word, 3);
    const options = shuffle([item.word, ...distractors]);
    return {
      type: 'pinyin', difficulty,
      question: `下列词语中，读音为 "${item.pinyin}" 的是？`,
      options: options.map(o => ({ text: o, correct: o === item.word })),
      answer: item.word,
      explanation: `读音 "${item.pinyin}" 对应的词语是"${item.word}"。`
    };
  } else {
    // 找读音错误的
    if (bank.pinyinErrors.length > 0) {
      const err = bank.pinyinErrors[Math.floor(Math.random() * bank.pinyinErrors.length)];
      const correctWord = err.correct;
      const wrongWord = err.wrong;
      return {
        type: 'pinyin', difficulty,
        question: `下列词语中，读音完全正确的一项是？`,
        options: shuffle([
          { text: correctWord, correct: true },
          { text: wrongWord, correct: false },
          { text: bank.pinyinWords[Math.floor(Math.random()*bank.pinyinWords.length)]?.word || correctWord, correct: false },
          { text: bank.pinyinWords[Math.floor(Math.random()*bank.pinyinWords.length)]?.word || wrongWord, correct: false }
        ]),
        answer: correctWord,
        explanation: `"${correctWord}"读音正确。"${wrongWord}"为常见误读，属于${err.reason}。`
      };
    }
    // fallback to easy
    return genPinyinQuestion(bank, 'easy');
  }
}

/**
 * 生成字形题
 */
function genCharQuestion(bank, difficulty) {
  if (bank.pinyinErrors.length === 0) return null;
  const err = bank.pinyinErrors[Math.floor(Math.random() * bank.pinyinErrors.length)];

  if (difficulty === 'easy') {
    return {
      type: 'char', difficulty,
      question: `下列词语中，字形完全正确的一项是？`,
      options: shuffle([
        { text: err.correct, correct: true },
        { text: err.wrong, correct: false },
        { text: err.correct.replace(/(.)(.)/, '$2$1'), correct: false },
        { text: err.wrong.replace(/(.)(.)/, '$2$1'), correct: false }
      ]),
      answer: err.correct,
      explanation: `"${err.correct}"字形正确。"${err.wrong}"为常见误写，属于${err.reason}。`
    };
  } else if (difficulty === 'medium') {
    return {
      type: 'char', difficulty,
      question: `词语"${err.wrong}"中有一个错别字，请找出正确的词语：`,
      options: shuffle([
        { text: err.correct, correct: true },
        { text: err.wrong, correct: false },
        { text: err.correct.charAt(0) + err.wrong.slice(1), correct: false },
        { text: err.wrong.charAt(0) + err.correct.slice(1), correct: false }
      ]),
      answer: err.correct,
      explanation: `正确写法是"${err.correct}"，"${err.wrong}"中的字容易混淆，属于${err.reason}。`
    };
  } else {
    // hard: 给句子找错别字
    return {
      type: 'char', difficulty,
      question: `下列句子中没有错别字的一项是？`,
      options: shuffle([
        { text: err.correct + '是正确写法', correct: true },
        { text: err.wrong + '是错误写法', correct: false },
        { text: '这首诗的意景非常优美', correct: false },
        { text: '他做事总是副衍了事', correct: false }
      ]),
      answer: err.correct + '是正确写法',
      explanation: `"${err.correct}"是正确写法。"${err.wrong}"为常见误写。`
    };
  }
}

/**
 * 生成成语题
 */
function genIdiomQuestion(bank, difficulty) {
  if (bank.idioms.length === 0) return null;
  const item = bank.idioms[Math.floor(Math.random() * bank.idioms.length)];

  if (difficulty === 'easy') {
    // 成语意思配对
    const distractors = pickDistractors(bank.idioms.map(i => i.meaning), item.meaning, 3);
    const options = shuffle([item.meaning, ...distractors]);
    return {
      type: 'idiom', difficulty,
      question: `成语"${item.idiom}"的意思是？`,
      options: options.map(o => ({ text: o, correct: o === item.meaning })),
      answer: item.meaning,
      explanation: `"${item.idiom}"的意思是：${item.meaning}。`
    };
  } else if (difficulty === 'medium') {
    // 给意思选成语
    const distractors = pickDistractors(bank.idioms.map(i => i.idiom), item.idiom, 3);
    const options = shuffle([item.idiom, ...distractors]);
    return {
      type: 'idiom', difficulty,
      question: `下列成语中，表示"${item.meaning}"的是？`,
      options: options.map(o => ({ text: o, correct: o === item.idiom })),
      answer: item.idiom,
      explanation: `表示"${item.meaning}"的成语是"${item.idiom}"。`
    };
  } else {
    // hard: 判断成语使用是否正确
    const isCorrect = Math.random() > 0.5;
    const sentence = isCorrect
      ? `他在学习上${item.idiom}，因此成绩一直很好。`
      : `这道数学题很简单，他却${item.idiom}地做了一下午。`;
    return {
      type: 'idiom', difficulty,
      question: `下列句子中成语使用${isCorrect ? '正确' : '错误'}的一项是：\n\n"${sentence}"`,
      options: [
        { text: '使用正确', correct: isCorrect },
        { text: '使用错误', correct: !isCorrect }
      ],
      answer: isCorrect ? '使用正确' : '使用错误',
      explanation: `"${item.idiom}"的意思是：${item.meaning}。${isCorrect ? '在该句中使用恰当。' : '在该句中使用不当，与语境不符。'}`
    };
  }
}

/**
 * 生成修辞题
 */
function genRhetoricQuestion(bank, difficulty) {
  if (bank.rhetoricTypes.length === 0) return null;
  const item = bank.rhetoricTypes[Math.floor(Math.random() * bank.rhetoricTypes.length)];

  if (difficulty === 'easy') {
    const distractors = pickDistractors(bank.rhetoricTypes.map(r => r.type), item.type, 3);
    const options = shuffle([item.type, ...distractors]);
    return {
      type: 'rhetoric', difficulty,
      question: `"${item.example}"使用了什么修辞手法？`,
      options: options.map(o => ({ text: o, correct: o === item.type })),
      answer: item.type,
      explanation: `${item.type}：${item.desc}。例句：${item.example}`
    };
  } else if (difficulty === 'medium') {
    const distractors = pickDistractors(bank.rhetoricTypes.map(r => r.desc), item.desc, 3);
    const options = shuffle([item.desc, ...distractors]);
    return {
      type: 'rhetoric', difficulty,
      question: `下列关于"${item.type}"的说明，正确的一项是？`,
      options: options.map(o => ({ text: o, correct: o === item.desc })),
      answer: item.desc,
      explanation: `${item.type}：${item.desc}`
    };
  } else {
    // hard: 判断句子用了什么修辞（多个选项中选最合适的）
    const all = shuffle(bank.rhetoricTypes).slice(0, 4);
    if (!all.find(r => r.type === item.type)) all[0] = item;
    const options = shuffle(all.map(r => r.type));
    return {
      type: 'rhetoric', difficulty,
      question: `请判断以下句子主要使用的修辞手法：\n\n"${item.example}"`,
      options: options.map(o => ({ text: o, correct: o === item.type })),
      answer: item.type,
      explanation: `该句使用了${item.type}修辞手法。${item.desc}`
    };
  }
}

/**
 * 生成文学常识题
 */
function genLiteratureQuestion(bank, difficulty) {
  if (bank.authors.length === 0 && bank.firstWorks.length === 0) return null;

  const useFirst = bank.firstWorks.length > 0 && Math.random() > 0.5;
  if (useFirst) {
    const item = bank.firstWorks[Math.floor(Math.random() * bank.firstWorks.length)];
    const distractors = pickDistractors(bank.firstWorks.map(w => w.title), item.title, 3);
    const options = shuffle([item.title, ...distractors]);
    return {
      type: 'literature', difficulty,
      question: `${item.desc}是？`,
      options: options.map(o => ({ text: `《${o}》`, correct: o === item.title })),
      answer: `《${item.title}》`,
      explanation: `${item.desc}——《${item.title}》。`
    };
  }

  if (bank.authors.length === 0) return null;
  const item = bank.authors[Math.floor(Math.random() * bank.authors.length)];

  if (difficulty === 'easy') {
    const distractors = pickDistractors(bank.authors.map(a => a.era), item.era, 3);
    const options = shuffle([item.era, ...distractors]);
    return {
      type: 'literature', difficulty,
      question: `作家"${item.name}"属于哪个朝代/时期？`,
      options: options.map(o => ({ text: o, correct: o === item.era })),
      answer: item.era,
      explanation: `${item.name}，${item.era}。`
    };
  } else if (difficulty === 'medium') {
    const distractors = pickDistractors(bank.authors.map(a => a.name), item.name, 3);
    const options = shuffle([item.name, ...distractors]);
    return {
      type: 'literature', difficulty,
      question: `${item.era}时期的代表作家是？`,
      options: options.map(o => ({ text: o, correct: o === item.name })),
      answer: item.name,
      explanation: `${item.name}，${item.era}。`
    };
  } else {
    // hard: 综合题
    const distractors = pickDistractors(bank.authors.map(a => a.name), item.name, 3);
    const options = shuffle([item.name, ...distractors]);
    return {
      type: 'literature', difficulty,
      question: `下列关于文学常识的表述，正确的一项是：`,
      options: options.map((o, i) => ({
        text: `${o}，${item.era}`,
        correct: o === item.name
      })),
      answer: `${item.name}，${item.era}`,
      explanation: `${item.name}，${item.era}。`
    };
  }
}

/**
 * 生成名句默写题
 */
function genQuoteQuestion(bank, difficulty) {
  if (bank.famousQuotes.length === 0) return null;
  const item = bank.famousQuotes[Math.floor(Math.random() * bank.famousQuotes.length)];

  if (difficulty === 'easy') {
    // 填空：给上半句填下半句
    const parts = item.quote.split(/[，,；;]/);
    if (parts.length >= 2) {
      const blank = parts[1];
      const blankIndex = item.quote.indexOf(blank);
      const before = item.quote.substring(0, blankIndex);
      return {
        type: 'quote', difficulty, isFill: true,
        question: `请补写出下列名句的下一句：\n\n${before}______`,
        answer: blank,
        explanation: `完整句子：${item.quote}${item.author ? ' —— ' + item.author : ''}${item.source ? '《' + item.source + '》' : ''}`
      };
    }
  } else if (difficulty === 'medium') {
    // 选择题：给上半句选下半句
    const parts = item.quote.split(/[，,；;]/);
    if (parts.length >= 2) {
      const distractors = shuffle(bank.famousQuotes.filter(q => q !== item)).slice(0, 3)
        .map(q => q.quote.split(/[，,；;]/)[1] || q.quote);
      const options = shuffle([parts[1], ...distractors]);
      return {
        type: 'quote', difficulty,
        question: `"${parts[0]}"的下一句是？`,
        options: options.map(o => ({ text: o, correct: o === parts[1] })),
        answer: parts[1],
        explanation: `完整句子：${item.quote}${item.author ? ' —— ' + item.author : ''}`
      };
    }
  }
  // hard or fallback: 填空
  const parts = item.quote.split(/[，,；;]/);
  const blank = parts[0];
  const after = item.quote.substring(blank.length + 1);
  return {
    type: 'quote', difficulty: difficulty === 'easy' ? 'medium' : difficulty, isFill: true,
    question: `请补写出下列名句的上半句：\n\n______${after}`,
    answer: blank,
    explanation: `完整句子：${item.quote}${item.author ? ' —— ' + item.author : ''}${item.source ? '《' + item.source + '》' : ''}`
  };
}

/**
 * 生成病句题
 */
function genSentenceQuestion(bank, difficulty) {
  // 基于病句类型生成
  const errorTypes = [
    { type: '语序不当', example: '我们要不断地努力，争取更大的成绩和进步。', correct: '我们要不断地努力，争取更大的进步和成绩。', fix: '应改为"进步和成绩"' },
    { type: '搭配不当', example: '他的写作水平有了很大的改善。', correct: '他的写作水平有了很大的提高。', fix: '"水平"应与"提高"搭配' },
    { type: '成分残缺', example: '通过这次活动，使我受到了很大的教育。', correct: '通过这次活动，我受到了很大的教育。', fix: '删去"使"' },
    { type: '成分赘余', example: '这件事大约差不多需要三天时间。', correct: '这件事大约需要三天时间。', fix: '"大约"和"差不多"意思重复' },
    { type: '结构混乱', example: '他的学习成绩之所以好，是因为他刻苦学习的原因。', correct: '他的学习成绩之所以好，是因为他刻苦学习。', fix: '删去"的原因"' },
    { type: '表意不明', example: '两个学校的老师来参加了会议。', correct: '两所学校的老师来参加了会议。', fix: '歧义：是两个学校还是两个老师？' },
    { type: '不合逻辑', example: '为了防止这类事件不再发生，我们必须加强管理。', correct: '为了防止这类事件再次发生，我们必须加强管理。', fix: '"防止"和"不再"双重否定表肯定，意思反了' },
    { type: '分类不当', example: '图书馆里有小说、诗歌、文学作品等。', correct: '图书馆里有小说、诗歌等文学作品。', fix: '小说和诗歌属于文学作品，不能并列' }
  ];

  const item = errorTypes[Math.floor(Math.random() * errorTypes.length)];

  if (difficulty === 'easy') {
    return {
      type: 'sentence', difficulty,
      question: `下列句子有语病的一项是：`,
      options: shuffle([
        { text: item.example + '（有语病）', correct: true },
        { text: item.correct + '（无语病）', correct: false },
        { text: '他的文章写得很好，受到大家的好评。（无语病）', correct: false },
        { text: '我们一定要努力学习。（无语病）', correct: false }
      ]),
      answer: item.example + '（有语病）',
      explanation: `语病类型：${item.type}。${item.fix}。`
    };
  } else if (difficulty === 'medium') {
    return {
      type: 'sentence', difficulty,
      question: `下列句子中，没有语病的一项是：`,
      options: shuffle([
        { text: item.correct, correct: true },
        { text: item.example, correct: false },
        { text: errorTypes[(errorTypes.indexOf(item) + 1) % errorTypes.length].example, correct: false },
        { text: errorTypes[(errorTypes.indexOf(item) + 2) % errorTypes.length].example, correct: false }
      ]),
      answer: item.correct,
      explanation: `正确句子："${item.correct}"。原句"${item.example}"存在${item.type}的语病。${item.fix}。`
    };
  } else {
    return {
      type: 'sentence', difficulty,
      question: `请指出下列句子的语病类型：\n\n"${item.example}"`,
      options: shuffle([
        { text: item.type, correct: true },
        { text: errorTypes[(errorTypes.indexOf(item) + 1) % errorTypes.length].type, correct: false },
        { text: errorTypes[(errorTypes.indexOf(item) + 2) % errorTypes.length].type, correct: false },
        { text: errorTypes[(errorTypes.indexOf(item) + 3) % errorTypes.length].type, correct: false }
      ]),
      answer: item.type,
      explanation: `该句的语病类型是"${item.type}"。${item.fix}。修改后：${item.correct}`
    };
  }
}

// ==================== 题目生成入口 ====================
const GENERATORS = {
  pinyin: genPinyinQuestion,
  char: genCharQuestion,
  idiom: genIdiomQuestion,
  rhetoric: genRhetoricQuestion,
  literature: genLiteratureQuestion,
  quote: genQuoteQuestion,
  sentence: genSentenceQuestion
};

/**
 * 生成题目
 * @param {string} type - 题型 (pinyin/char/idiom/rhetoric/literature/quote/sentence/all)
 * @param {string} difficulty - 难度 (easy/medium/hard/mixed)
 * @param {number} count - 数量
 */
function generateQuestions(type = 'all', difficulty = 'mixed', count = 10) {
  const bank = extractQuestionData();
  if (!bank) return [];

  let types = type === 'all' ? Object.keys(GENERATORS) : [type];
  let difficulties = difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [difficulty];

  const questions = [];
  let attempts = 0;
  const maxAttempts = count * 10;

  while (questions.length < count && attempts < maxAttempts) {
    attempts++;
    const t = types[Math.floor(Math.random() * types.length)];
    const d = difficulties[Math.floor(Math.random() * difficulties.length)];
    const gen = GENERATORS[t];
    if (!gen) continue;
    try {
      const q = gen(bank, d);
      if (q && !questions.some(prev => prev.question === q.question)) {
        questions.push(q);
      }
    } catch (e) { /* skip */ }
  }

  return questions;
}
