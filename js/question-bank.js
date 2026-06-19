/**
 * question-bank.js - 基于手册数据自动生成题库
 * 7种题型 × 3个难度等级
 * 支持选择题(4选项)、判断题(2选项)、填空题
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

let _questionCache = null;

// ==================== 工具函数 ====================

/**
 * 确保选项唯一：从干扰项池中选出 count 个不重复且不等于正确答案的选项
 * @param {string} correct - 正确答案文本
 * @param {string[]} pool - 干扰项池
 * @param {number} count - 需要的干扰项数量
 * @returns {string[]} 去重后的干扰项数组
 */
function pickUniqueDistractors(correct, pool, count) {
  const seen = new Set([correct]);
  const result = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const item of shuffled) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= count) break;
    }
  }
  // 如果池子不够，补充占位（尽量避免）
  while (result.length < count) {
    const fake = `选项${result.length}`;
    if (!seen.has(fake)) { seen.add(fake); result.push(fake); }
  }
  return result;
}

/**
 * 构建选择题选项（正确答案 + 干扰项），随机打乱
 */
function buildOptions(correctText, distractorTexts) {
  const opts = [
    { text: correctText, correct: true },
    ...distractorTexts.map(t => ({ text: t, correct: false }))
  ];
  return opts.sort(() => Math.random() - 0.5);
}

/**
 * 构建判断题选项（只有 正确/错误 两个选项）
 */
function buildTrueFalseOptions(isCorrect) {
  return [
    { text: '正确', correct: isCorrect },
    { text: '错误', correct: !isCorrect }
  ];
}

/**
 * 从数组中随机取 n 个不重复元素
 */
function sampleUnique(arr, n, exclude = []) {
  const excludeSet = new Set(exclude);
  const pool = arr.filter(x => !excludeSet.has(x));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ==================== 数据提取 ====================
function extractQuestionData() {
  if (_questionCache) return _questionCache;
  const data = HANDBOOK_DATA;
  if (!data) return null;

  const bank = {
    pinyinWords: [],      // {word, pinyin}
    pinyinErrors: [],     // {reason, correct, wrong, correctWord, wrongWord, correctPinyin, wrongPinyin}
    idioms: [],           // {idiom, meaning}
    idiomPairs: [],       // {correct, wrong} — 近义成语辨析
    rhetoricTypes: [],    // {name, desc, examples[]}
    rhetoricExamples: [], // {type, example}
    authors: [],          // {name, dynasty}
    firstWorks: [],       // {title, desc}
    quotes: [],
    sentenceErrors: []    // {type, desc, examples[]}
  };

  const bian1 = data.bians[0];

  // --- 语音：pinyinWords (483条) ---
  for (const sec of bian1.parts[0].sections) {
    if (sec.section_name === '必考知识梳理') {
      for (const sub of sec.subsections || []) {
        if ((sub.title || '').includes('容易读错的词语') && sub.table) {
          for (const row of sub.table.rows) {
            if (row[0] && row[1]) bank.pinyinWords.push({ word: row[0], pinyin: row[1] });
          }
        }
        if ((sub.title || '').includes('容易读错的成语') && sub.table) {
          for (const row of sub.table.rows) {
            if (row[0] && row[1]) bank.pinyinWords.push({ word: row[0], pinyin: row[1] });
          }
        }
      }
    }
    if (sec.section_name === '知识能力解读') {
      for (const sub of sec.subsections || []) {
        if ((sub.title || '').includes('误读') && sub.table) {
          for (const row of sub.table.rows) {
            if (row[1] && row[2]) {
              bank.pinyinErrors.push({
                reason: row[0],
                correct: row[1],
                wrong: row[2]
              });
            }
          }
        }
      }
    }
  }

  // --- 词语：成语 ---
  for (const sec of bian1.parts[2].sections) {
    if (sec.section_name === '必考知识梳理') {
      for (const sub of sec.subsections || []) {
        const title = sub.title || '';
        if (title.includes('重点成语')) {
          const content = sub.content || '';
          // 解析格式：成语（释义）、成语（释义）
          const regex = /([^\s、，（()]+)（([^）]+)）/g;
          let m;
          while ((m = regex.exec(content)) !== null) {
            const idiom = m[1].trim();
            const meaning = m[2].trim();
            if (idiom.length >= 2 && idiom.length <= 8 && meaning.length > 2) {
              bank.idioms.push({ idiom, meaning });
            }
          }
          // 也有些成语没有释义，按顿号分隔
          const noParenPart = content.replace(regex, '');
          const tokens = noParenPart.split(/[、，,]/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 8);
          for (const t of tokens) {
            if (!bank.idioms.some(i => i.idiom === t)) {
              bank.idioms.push({ idiom: t, meaning: '' });
            }
          }
        }
      }
    }
  }

  // --- 修辞 ---
  for (const sec of bian1.parts[5].sections) {
    for (const sub of sec.subsections || []) {
      if (Array.isArray(sub.content)) {
        for (const item of sub.content) {
          if (item && typeof item === 'object' && item.table) {
            const headers = item.table.headers || [];
            for (const row of item.table.rows) {
              // 修辞方法名称 + 说明 + 可能的例句
              if (headers[0] && headers[0].includes('修辞')) {
                const typeName = row[0];
                const desc = row[1] || '';
                if (typeName && desc) {
                  bank.rhetoricTypes.push({ name: typeName, desc });
                }
              }
              // 比喻类型等带例句的表格
              if (headers.includes('典型示例') || headers.includes('例句')) {
                const exampleIdx = headers.includes('典型示例') ? headers.indexOf('典型示例') : headers.indexOf('例句');
                const typeIdx = headers.includes('比喻类型') ? headers.indexOf('比喻类型') : 0;
                if (row[exampleIdx]) {
                  // 提取例句（可能多个，用①②③分隔）
                  const examples = row[exampleIdx].split(/[①②③④⑤\n]/).map(s => s.trim()).filter(s => s.length > 5);
                  for (const ex of examples) {
                    bank.rhetoricExamples.push({ type: row[typeIdx] || '', example: ex });
                  }
                }
              }
            }
          }
        }
      }
    }
    // 必考知识梳理的文本格式修辞
    if (sec.section_name === '必考知识梳理') {
      for (const sub of sec.subsections || []) {
        const content = sub.content || '';
        // 格式：1. 比喻：用跟甲事物...
        const lines = content.split('\n');
        for (const line of lines) {
          const m = line.match(/^\d+\.\s*(.+?)[:：](.+)/);
          if (m) {
            const name = m[1].trim();
            const desc = m[2].trim();
            if (name.length <= 4 && desc.length > 5) {
              if (!bank.rhetoricTypes.some(r => r.name === name)) {
                bank.rhetoricTypes.push({ name, desc });
              }
            }
          }
        }
      }
    }
  }

  // --- 文学常识 ---
  for (const sec of bian1.parts[6].sections) {
    if (sec.section_name === '必考知识梳理') {
      for (const sub of sec.subsections || []) {
        const title = sub.title || '';
        const content = sub.content || '';
        if (title.includes('古代作家')) {
          // 格式：孔子（春秋）、孟子（战国）...
          const regex = /([^、，,（）()]+)（([^）]+)）/g;
          let m;
          while ((m = regex.exec(content)) !== null) {
            bank.authors.push({ name: m[1].trim(), dynasty: m[2].trim() });
          }
        }
        if (title.includes('第一')) {
          // 格式：第一部诗歌总集——《诗经》
          const parts = content.split(/[；;。\n]/);
          for (const p of parts) {
            const m = p.match(/第一.+?——(.+?)$/);
            if (m) {
              const title = m[1].trim().replace(/[《》]/g, '');
              if (title.length > 0) bank.firstWorks.push({ title, desc: p.trim() });
            }
          }
        }
      }
    }
  }

  // --- 名句（内置补充题库，因为手册JSON中名句内容为概述） ---
  bank.quotes = [
    { quote: '海内存知己，天涯若比邻', author: '王勃', source: '《送杜少府之任蜀州》' },
    { quote: '落霞与孤鹜齐飞，秋水共长天一色', author: '王勃', source: '《滕王阁序》' },
    { quote: '海上生明月，天涯共此时', author: '张九龄', source: '《望月怀远》' },
    { quote: '春风又绿江南岸，明月何时照我还', author: '王安石', source: '《泊船瓜洲》' },
    { quote: '但愿人长久，千里共婵娟', author: '苏轼', source: '《水调歌头》' },
    { quote: '大江东去，浪淘尽，千古风流人物', author: '苏轼', source: '《念奴娇·赤壁怀古》' },
    { quote: '不畏浮云遮望眼，自缘身在最高层', author: '王安石', source: '《登飞来峰》' },
    { quote: '会当凌绝顶，一览众山小', author: '杜甫', source: '《望岳》' },
    { quote: '国破山河在，城春草木深', author: '杜甫', source: '《春望》' },
    { quote: '感时花溅泪，恨别鸟惊心', author: '杜甫', source: '《春望》' },
    { quote: '读书破万卷，下笔如有神', author: '杜甫', source: '《奉赠韦左丞丈二十二韵》' },
    { quote: '随风潜入夜，润物细无声', author: '杜甫', source: '《春夜喜雨》' },
    { quote: '天生我材必有用，千金散尽还复来', author: '李白', source: '《将进酒》' },
    { quote: '长风破浪会有时，直挂云帆济沧海', author: '李白', source: '《行路难》' },
    { quote: '两岸猿声啼不住，轻舟已过万重山', author: '李白', source: '《早发白帝城》' },
    { quote: '举头望明月，低头思故乡', author: '李白', source: '《静夜思》' },
    { quote: '飞流直下三千尺，疑是银河落九天', author: '李白', source: '《望庐山瀑布》' },
    { quote: '桃花潭水深千尺，不及汪伦送我情', author: '李白', source: '《赠汪伦》' },
    { quote: '孤帆远影碧空尽，唯见长江天际流', author: '李白', source: '《黄鹤楼送孟浩然之广陵》' },
    { quote: '床前明月光，疑是地上霜', author: '李白', source: '《静夜思》' },
    { quote: '春眠不觉晓，处处闻啼鸟', author: '孟浩然', source: '《春晓》' },
    { quote: '野火烧不尽，春风吹又生', author: '白居易', source: '《赋得古原草送别》' },
    { quote: '同是天涯沦落人，相逢何必曾相识', author: '白居易', source: '《琵琶行》' },
    { quote: '日出江花红胜火，春来江水绿如蓝', author: '白居易', source: '《忆江南》' },
    { quote: '在天愿作比翼鸟，在地愿为连理枝', author: '白居易', source: '《长恨歌》' },
    { quote: '曾经沧海难为水，除却巫山不是云', author: '元稹', source: '《离思》' },
    { quote: '沉舟侧畔千帆过，病树前头万木春', author: '刘禹锡', source: '《酬乐天扬州初逢席上见赠》' },
    { quote: '旧时王谢堂前燕，飞入寻常百姓家', author: '刘禹锡', source: '《乌衣巷》' },
    { quote: '商女不知亡国恨，隔江犹唱后庭花', author: '杜牧', source: '《泊秦淮》' },
    { quote: '东风不与周郎便，铜雀春深锁二乔', author: '杜牧', source: '《赤壁》' },
    { quote: '春蚕到死丝方尽，蜡炬成灰泪始干', author: '李商隐', source: '《无题》' },
    { quote: '夕阳无限好，只是近黄昏', author: '李商隐', source: '《登乐游原》' },
    { quote: '身无彩凤双飞翼，心有灵犀一点通', author: '李商隐', source: '《无题》' },
    { quote: '问渠那得清如许，为有源头活水来', author: '朱熹', source: '《观书有感》' },
    { quote: '等闲识得东风面，万紫千红总是春', author: '朱熹', source: '《春日》' },
    { quote: '纸上得来终觉浅，绝知此事要躬行', author: '陆游', source: '《冬夜读书示子聿》' },
    { quote: '山重水复疑无路，柳暗花明又一村', author: '陆游', source: '《游山西村》' },
    { quote: '王师北定中原日，家祭无忘告乃翁', author: '陆游', source: '《示儿》' },
    { quote: '零落成泥碾作尘，只有香如故', author: '陆游', source: '《卜算子·咏梅》' },
    { quote: '人生自古谁无死，留取丹心照汗青', author: '文天祥', source: '《过零丁洋》' },
    { quote: '臣心一片磁针石，不指南方不肯休', author: '文天祥', source: '《扬子江》' },
    { quote: '生当作人杰，死亦为鬼雄', author: '李清照', source: '《夏日绝句》' },
    { quote: '莫道不销魂，帘卷西风，人比黄花瘦', author: '李清照', source: '《醉花阴》' },
    { quote: '寻寻觅觅，冷冷清清，凄凄惨惨戚戚', author: '李清照', source: '《声声慢》' },
    { quote: '粉骨碎身浑不怕，要留清白在人间', author: '于谦', source: '《石灰吟》' },
    { quote: '千磨万击还坚劲，任尔东西南北风', author: '郑燮', source: '《竹石》' },
    { quote: '落红不是无情物，化作春泥更护花', author: '龚自珍', source: '《己亥杂诗》' },
    { quote: '我劝天公重抖擞，不拘一格降人才', author: '龚自珍', source: '《己亥杂诗》' },
    { quote: '采菊东篱下，悠然见南山', author: '陶渊明', source: '《饮酒》' },
    { quote: '少壮不努力，老大徒伤悲', author: '佚名', source: '《长歌行》' },
    { quote: '对酒当歌，人生几何', author: '曹操', source: '《短歌行》' },
    { quote: '老骥伏枥，志在千里', author: '曹操', source: '《龟虽寿》' },
    { quote: '日月之行，若出其中；星汉灿烂，若出其里', author: '曹操', source: '《观沧海》' },
    { quote: '秋风萧瑟，洪波涌起', author: '曹操', source: '《观沧海》' },
    { quote: '海日生残夜，江春入旧年', author: '王湾', source: '《次北固山下》' },
    { quote: '潮平两岸阔，风正一帆悬', author: '王湾', source: '《次北固山下》' },
    { quote: '绿树村边合，青山郭外斜', author: '孟浩然', source: '《过故人庄》' },
    { quote: '气蒸云梦泽，波撼岳阳城', author: '孟浩然', source: '《望洞庭湖赠张丞相》' },
    { quote: '黄梅时节家家雨，青草池塘处处蛙', author: '赵师秀', source: '《约客》' },
    { quote: '沾衣欲湿杏花雨，吹面不寒杨柳风', author: '志南', source: '《绝句》' },
    { quote: '黑云翻墨未遮山，白雨跳珠乱入船', author: '苏轼', source: '《六月二十七日望湖楼醉书》' },
    { quote: '欲把西湖比西子，淡妆浓抹总相宜', author: '苏轼', source: '《饮湖上初晴后雨》' },
    { quote: '不识庐山真面目，只缘身在此山中', author: '苏轼', source: '《题西林壁》' },
    { quote: '竹外桃花三两枝，春江水暖鸭先知', author: '苏轼', source: '《惠崇春江晚景》' },
    { quote: '春风又绿江南岸，明月何时照我还', author: '王安石', source: '《泊船瓜洲》' },
    { quote: '墙角数枝梅，凌寒独自开', author: '王安石', source: '《梅花》' },
    { quote: '不畏浮云遮望眼，自缘身在最高层', author: '王安石', source: '《登飞来峰》' },
    { quote: '月上柳梢头，人约黄昏后', author: '欧阳修', source: '《生查子》' },
    { quote: '醉翁之意不在酒，在乎山水之间也', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '先天下之忧而忧，后天下之乐而乐', author: '范仲淹', source: '《岳阳楼记》' },
    { quote: '不以物喜，不以己悲', author: '范仲淹', source: '《岳阳楼记》' },
    { quote: '长烟一空，皓月千里', author: '范仲淹', source: '《岳阳楼记》' },
    { quote: '出淤泥而不染，濯清涟而不妖', author: '周敦颐', source: '《爱莲说》' },
    { quote: '予独爱莲之出淤泥而不染', author: '周敦颐', source: '《爱莲说》' },
    { quote: '斯是陋室，惟吾德馨', author: '刘禹锡', source: '《陋室铭》' },
    { quote: '苔痕上阶绿，草色入帘青', author: '刘禹锡', source: '《陋室铭》' },
    { quote: '谈笑有鸿儒，往来无白丁', author: '刘禹锡', source: '《陋室铭》' },
    { quote: '学而时习之，不亦说乎', author: '孔子', source: '《论语》' },
    { quote: '有朋自远方来，不亦乐乎', author: '孔子', source: '《论语》' },
    { quote: '三人行，必有我师焉', author: '孔子', source: '《论语》' },
    { quote: '温故而知新，可以为师矣', author: '孔子', source: '《论语》' },
    { quote: '知之者不如好之者，好之者不如乐之者', author: '孔子', source: '《论语》' },
    { quote: '不愤不启，不悱不发', author: '孔子', source: '《论语》' },
    { quote: '己所不欲，勿施于人', author: '孔子', source: '《论语》' },
    { quote: '学而不思则罔，思而不学则殆', author: '孔子', source: '《论语》' },
    { quote: '知之为知之，不知为不知，是知也', author: '孔子', source: '《论语》' },
    { quote: '人不知而不愠，不亦君子乎', author: '孔子', source: '《论语》' },
    { quote: '吾日三省吾身', author: '曾子', source: '《论语》' },
    { quote: '君子坦荡荡，小人长戚戚', author: '孔子', source: '《论语》' },
    { quote: '逝者如斯夫，不舍昼夜', author: '孔子', source: '《论语》' },
    { quote: '富贵不能淫，贫贱不能移，威武不能屈', author: '孟子', source: '《孟子》' },
    { quote: '生于忧患，死于安乐', author: '孟子', source: '《孟子》' },
    { quote: '得道者多助，失道者寡助', author: '孟子', source: '《孟子》' },
    { quote: '天时不如地利，地利不如人和', author: '孟子', source: '《孟子》' },
    { quote: '鱼，我所欲也；熊掌，亦我所欲也', author: '孟子', source: '《孟子》' },
    { quote: '故天将降大任于是人也，必先苦其心志', author: '孟子', source: '《孟子》' },
    { quote: '窈窕淑女，君子好逑', author: '佚名', source: '《诗经》' },
    { quote: '蒹葭苍苍，白露为霜', author: '佚名', source: '《诗经》' },
    { quote: '关关雎鸠，在河之洲', author: '佚名', source: '《诗经》' },
    { quote: '路漫漫其修远兮，吾将上下而求索', author: '屈原', source: '《离骚》' },
    { quote: '长太息以掩涕兮，哀民生之多艰', author: '屈原', source: '《离骚》' },
    { quote: '亦余心之所善兮，虽九死其犹未悔', author: '屈原', source: '《离骚》' },
    { quote: '举世皆浊我独清，众人皆醉我独醒', author: '屈原', source: '《渔父》' },
    { quote: '苟全性命于乱世，不求闻达于诸侯', author: '诸葛亮', source: '《出师表》' },
    { quote: '受任于败军之际，奉命于危难之间', author: '诸葛亮', source: '《出师表》' },
    { quote: '鞠躬尽瘁，死而后已', author: '诸葛亮', source: '《后出师表》' },
    { quote: '非淡泊无以明志，非宁静无以致远', author: '诸葛亮', source: '《诫子书》' },
    { quote: '静以修身，俭以养德', author: '诸葛亮', source: '《诫子书》' },
    { quote: '谈笑间，樯橹灰飞烟灭', author: '苏轼', source: '《念奴娇·赤壁怀古》' },
    { quote: '莫愁前路无知己，天下谁人不识君', author: '高适', source: '《别董大》' },
    { quote: '忽如一夜春风来，千树万树梨花开', author: '岑参', source: '《白雪歌送武判官归京》' },
    { quote: '烽火连三月，家书抵万金', author: '杜甫', source: '《春望》' },
    { quote: '会当凌绝顶，一览众山小', author: '杜甫', source: '《望岳》' },
    { quote: '造化钟神秀，阴阳割昏晓', author: '杜甫', source: '《望岳》' },
    { quote: '烽火连三月，家书抵万金', author: '杜甫', source: '《春望》' },
    { quote: '白头搔更短，浑欲不胜簪', author: '杜甫', source: '《春望》' },
    { quote: '好雨知时节，当春乃发生', author: '杜甫', source: '《春夜喜雨》' },
    { quote: '晓看红湿处，花重锦官城', author: '杜甫', source: '《春夜喜雨》' },
    { quote: '无边落木萧萧下，不尽长江滚滚来', author: '杜甫', source: '《登高》' },
    { quote: '万里悲秋常作客，百年多病独登台', author: '杜甫', source: '《登高》' },
    { quote: '安得广厦千万间，大庇天下寒士俱欢颜', author: '杜甫', source: '《茅屋为秋风所破歌》' },
    { quote: '何时眼前突兀见此屋，吾庐独破受冻死亦足', author: '杜甫', source: '《茅屋为秋风所破歌》' },
    { quote: '两个黄鹂鸣翠柳，一行白鹭上青天', author: '杜甫', source: '《绝句》' },
    { quote: '泥融飞燕子，沙暖睡鸳鸯', author: '杜甫', source: '《绝句》' },
    { quote: '此曲只应天上有，人间能得几回闻', author: '杜甫', source: '《赠花卿》' },
    { quote: '为人性僻耽佳句，语不惊人死不休', author: '杜甫', source: '《江上值水如海势聊短述》' },
    { quote: '露从今夜白，月是故乡明', author: '杜甫', source: '《月夜忆舍弟》' },
    { quote: '明月几时有，把酒问青天', author: '苏轼', source: '《水调歌头》' },
    { quote: '人有悲欢离合，月有阴晴圆缺', author: '苏轼', source: '《水调歌头》' },
    { quote: '但愿人长久，千里共婵娟', author: '苏轼', source: '《水调歌头》' },
    { quote: '横看成岭侧成峰，远近高低各不同', author: '苏轼', source: '《题西林壁》' },
    { quote: '欲把西湖比西子，淡妆浓抹总相宜', author: '苏轼', source: '《饮湖上初晴后雨》' },
    { quote: '春色满园关不住，一枝红杏出墙来', author: '叶绍翁', source: '《游园不值》' },
    { quote: '等闲识得东风面，万紫千红总是春', author: '朱熹', source: '《春日》' },
    { quote: '问渠那得清如许，为有源头活水来', author: '朱熹', source: '《观书有感》' },
    { quote: '绿杨烟外晓寒轻，红杏枝头春意闹', author: '宋祁', source: '《玉楼春》' },
    { quote: '云横秦岭家何在，雪拥蓝关马不前', author: '韩愈', source: '《左迁至蓝关示侄孙湘》' },
    { quote: '世有伯乐，然后有千里马', author: '韩愈', source: '《马说》' },
    { quote: '千里马常有，而伯乐不常有', author: '韩愈', source: '《马说》' },
    { quote: '其真无马邪？其真不知马也', author: '韩愈', source: '《马说》' },
    { quote: '业精于勤，荒于嬉；行成于思，毁于随', author: '韩愈', source: '《进学解》' },
    { quote: '闻道有先后，术业有专攻', author: '韩愈', source: '《师说》' },
    { quote: '是故弟子不必不如师，师不必贤于弟子', author: '韩愈', source: '《师说》' },
    { quote: '醉翁之意不在酒，在乎山水之间也', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '山水之乐，得之心而寓之酒也', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '野芳发而幽香，佳木秀而繁阴', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '太守谓谁？庐陵欧阳修也', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '环滁皆山也', author: '欧阳修', source: '《醉翁亭记》' },
    { quote: '庭下如积水空明，水中藻荇交横', author: '苏轼', source: '《记承天寺夜游》' },
    { quote: '何夜无月？何处无竹柏？但少闲人如吾两人者耳', author: '苏轼', source: '《记承天寺夜游》' },
    { quote: '鱼戏莲叶东，鱼戏莲叶西', author: '佚名', source: '《江南》' },
    { quote: '江南可采莲，莲叶何田田', author: '佚名', source: '《江南》' },
    { quote: '天苍苍，野茫茫，风吹草低见牛羊', author: '佚名', source: '《敕勒歌》' },
    { quote: '少壮不努力，老大徒伤悲', author: '佚名', source: '《长歌行》' },
    { quote: '百川东到海，何时复西归', author: '佚名', source: '《长歌行》' },
    { quote: '阳春布德泽，万物生光辉', author: '佚名', source: '《长歌行》' },
    { quote: '青青园中葵，朝露待日晞', author: '佚名', source: '《长歌行》' },
    { quote: '树树皆秋色，山山唯落晖', author: '王绩', source: '《野望》' },
    { quote: '牧人驱犊返，猎马带禽归', author: '王绩', source: '《野望》' },
    { quote: '相顾无相识，长歌怀采薇', author: '王绩', source: '《野望》' },
    { quote: '木落雁南度，北风江上寒', author: '孟浩然', source: '《早寒江上有怀》' },
    { quote: '乡泪客中尽，孤帆天际看', author: '孟浩然', source: '《早寒江上有怀》' },
    { quote: '迷津欲有问，平海夕漫漫', author: '孟浩然', source: '《早寒江上有怀》' },
    { quote: '昔人已乘黄鹤去，此地空余黄鹤楼', author: '崔颢', source: '《黄鹤楼》' },
    { quote: '黄鹤一去不复返，白云千载空悠悠', author: '崔颢', source: '《黄鹤楼》' },
    { quote: '晴川历历汉阳树，芳草萋萋鹦鹉洲', author: '崔颢', source: '《黄鹤楼》' },
    { quote: '日暮乡关何处是？烟波江上使人愁', author: '崔颢', source: '《黄鹤楼》' },
    { quote: '行到水穷处，坐看云起时', author: '王维', source: '《终南别业》' },
    { quote: '明月松间照，清泉石上流', author: '王维', source: '《山居秋暝》' },
    { quote: '竹喧归浣女，莲动下渔舟', author: '王维', source: '《山居秋暝》' },
    { quote: '大漠孤烟直，长河落日圆', author: '王维', source: '《使至塞上》' },
    { quote: '萧关逢候骑，都护在燕然', author: '王维', source: '《使至塞上》' },
    { quote: '劝君更尽一杯酒，西出阳关无故人', author: '王维', source: '《送元二使安西》' },
    { quote: '渭城朝雨浥轻尘，客舍青青柳色新', author: '王维', source: '《送元二使安西》' },
    { quote: '独在异乡为异客，每逢佳节倍思亲', author: '王维', source: '《九月九日忆山东兄弟》' },
    { quote: '遥知兄弟登高处，遍插茱萸少一人', author: '王维', source: '《九月九日忆山东兄弟》' },
    { quote: '空山不见人，但闻人语响', author: '王维', source: '《鹿柴》' },
    { quote: '返景入深林，复照青苔上', author: '王维', source: '《鹿柴》' },
    { quote: '白日依山尽，黄河入海流', author: '王之涣', source: '《登鹳雀楼》' },
    { quote: '欲穷千里目，更上一层楼', author: '王之涣', source: '《登鹳雀楼》' },
    { quote: '羌笛何须怨杨柳，春风不度玉门关', author: '王之涣', source: '《凉州词》' },
    { quote: '黄河远上白云间，一片孤城万仞山', author: '王之涣', source: '《凉州词》' },
    { quote: '春潮带雨晚来急，野渡无人舟自横', author: '韦应物', source: '《滁州西涧》' },
    { quote: '独怜幽草涧边生，上有黄鹂深树鸣', author: '韦应物', source: '《滁州西涧》' },
    { quote: '细雨鱼儿出，微风燕子斜', author: '杜甫', source: '《水槛遣心》' },
    { quote: '会当凌绝顶，一览众山小', author: '杜甫', source: '《望岳》' },
    { quote: '问君能有几多愁，恰似一江春水向东流', author: '李煜', source: '《虞美人》' },
    { quote: '剪不断，理还乱，是离愁', author: '李煜', source: '《相见欢》' },
    { quote: '无可奈何花落去，似曾相识燕归来', author: '晏殊', source: '《浣溪沙》' },
    { quote: '衣带渐宽终不悔，为伊消得人憔悴', author: '柳永', source: '《蝶恋花》' },
    { quote: '多情自古伤离别，更那堪冷落清秋节', author: '柳永', source: '《雨霖铃》' },
    { quote: '执手相看泪眼，竟无语凝噎', author: '柳永', source: '《雨霖铃》' },
    { quote: '三十功名尘与土，八千里路云和月', author: '岳飞', source: '《满江红》' },
    { quote: '莫等闲，白了少年头，空悲切', author: '岳飞', source: '《满江红》' },
    { quote: '壮志饥餐胡虏肉，笑谈渴饮匈奴血', author: '岳飞', source: '《满江红》' },
    { quote: '山不在高，有仙则名', author: '刘禹锡', source: '《陋室铭》' },
    { quote: '水不在深，有龙则灵', author: '刘禹锡', source: '《陋室铭》' },
    { quote: '予独爱莲之出淤泥而不染，濯清涟而不妖', author: '周敦颐', source: '《爱莲说》' },
    { quote: '中通外直，不蔓不枝', author: '周敦颐', source: '《爱莲说》' },
    { quote: '香远益清，亭亭净植', author: '周敦颐', source: '《爱莲说》' },
    { quote: '可远观而不可亵玩焉', author: '周敦颐', source: '《爱莲说》' },
    { quote: '出淤泥而不染，濯清涟而不妖', author: '周敦颐', source: '《爱莲说》' },
    { quote: '大雪无痕，落无声', author: '陆游', source: '《卜算子·咏梅》' },
    { quote: '驿外断桥边，寂寞开无主', author: '陆游', source: '《卜算子·咏梅》' },
    { quote: '无意苦争春，一任群芳妒', author: '陆游', source: '《卜算子·咏梅》' },
    { quote: '零落成泥碾作尘，只有香如故', author: '陆游', source: '《卜算子·咏梅》' }
  ];

  // --- 病句（内置题库，补充手册数据） ---
  bank.sentenceErrors = [
    { type: '成分残缺', desc: '通过...使...', examples: [
      '通过这次语文学习，使我收获很大。',
      '经过大家的共同努力，使任务完成了。'
    ]},
    { type: '成分残缺', desc: '缺主语', examples: [
      '看了这部电视剧，对我教育很大。',
      '在老师的帮助下，使我进步了。'
    ]},
    { type: '搭配不当', desc: '主谓搭配', examples: [
      '他的嗓音很好，歌声清脆。',
      '春天的杭州是一年中最美的季节。'
    ]},
    { type: '搭配不当', desc: '动宾搭配', examples: [
      '我们要发挥优点，克服缺点。',
      '我们要继承和发扬老一辈的革命传统。'
    ]},
    { type: '语序不当', desc: '定语和中心语位置颠倒', examples: [
      '我国人口是世界上最多的国家。',
      '我们要认真克服并发现工作中的缺点。'
    ]},
    { type: '语序不当', desc: '关联词位置不当', examples: [
      '不但他学习好，而且思想好。',
      '因为他学习刻苦，所以成绩好。'
    ]},
    { type: '重复啰唆', desc: '成分赘余', examples: [
      '这是由失败的教训中得出的。',
      '他大约差不多有二十岁了。'
    ]},
    { type: '否定失当', desc: '多重否定', examples: [
      '为了避免不再发生类似事故，我们必须加强管理。',
      '谁也不能否认这部电影没有教育意义。'
    ]},
    { type: '关联词错误', desc: '关联词搭配不当', examples: [
      '虽然他学习很刻苦，但是成绩很好。',
      '只有努力学习，就能取得好成绩。'
    ]},
    { type: '逻辑矛盾', desc: '前后矛盾', examples: [
      '这件事基本上完全做好了。',
      '我估计他今天大概不会来了。'
    ]},
    { type: '分类不当', desc: '并列不当', examples: [
      '商店里有水果、蔬菜、苹果和日用品。',
      '参加活动的有工人、青年和学生。'
    ]},
    { type: '歧义', desc: '表意不明', examples: [
      '两个学校的老师来参加了会议。',
      '他发现老虎正在吃他的牛。'
    ]}
  ];

  // 构建易错字对（用于字形题）
  // 从成语中生成：取一个成语，用形近字替换
  bank.charPairs = [];
  const charSubstitutes = {
    '安': '按', '排': '徘', '然': '燃', '恙': '样', '山': '衫',
    '涉': '步', '跋': '拔', '废': '费', '具': '俱', '心': '新',
    '材': '才', '独': '毒', '帜': '识', '戴': '带', '赴': '扑',
    '汤': '烫', '蹈': '滔', '刚': '钢', '正': '政', '阿': '婀',
    '屋': '乌', '建': '月', '瓴': '领', '各': '个', '得': '德',
    '所': '锁', '厚': '后', '此': '次', '薄': '簿', '虎': '唬',
    '视': '市', '眈': '担', '花': '华', '枝': '支', '招': '召',
    '展': '崭', '画': '划', '龙': '尤', '点': '典', '睛': '晴',
    '焕': '换', '然': '燃', '一': '壹', '新': '心', '恍': '晃',
    '大': '达', '悟': '误', '诲': '悔', '人': '认', '倦': '卷',
    '豁': '活', '开': '门', '朗': '浪', '鸡': '鸭', '犬': '大',
    '相': '香', '闻': '问', '集': '极', '广': '光', '益': '易',
    '家': '加', '户': '互', '见': '件', '异': '导', '迁': '千',
    '剑': '箭', '拔': '拨', '弩': '努', '张': '胀', '交': '骄',
    '头': '投', '接': '结', '耳': '尔', '娇': '骄', '生': '身',
    '惯': '贯', '兢': '竞', '业': '叶', '迥': '回', '津': '精',
    '筋': '斤', '疲': '皮', '惊': '精', '心': '新', '魄': '破',
    '精': '经', '益': '一', '求': '球', '井': '金', '然': '燃',
    '居': '局', '高': '告', '临': '令', '下': '吓', '鞠': '拘',
    '躬': '弓', '尽': '进', '瘁': '碎', '非': '飞', '淡': '旦',
    '泊': '朴', '宁': '泞', '静': '净', '俭': '捡', '以': '已',
    '养': '氧', '德': '得'
  };
  for (const { idiom } of bank.idioms) {
    if (idiom.length >= 3) {
      // 尝试替换每个字
      for (let i = 0; i < idiom.length; i++) {
        const ch = idiom[i];
        if (charSubstitutes[ch]) {
          const wrong = idiom.substring(0, i) + charSubstitutes[ch] + idiom.substring(i + 1);
          bank.charPairs.push({ correct: idiom, wrong, replaceIdx: i, correctChar: ch, wrongChar: charSubstitutes[ch] });
        }
      }
    }
  }

  _questionCache = bank;
  return bank;
}

// ==================== 题目生成器 ====================

const GENERATORS = {
  // ---------- 字音 ----------
  pinyin(bank, difficulty) {
    if (bank.pinyinWords.length < 4) return null;

    if (difficulty === 'easy') {
      // 选择题：给词语选拼音
      const correct = bank.pinyinWords[Math.floor(Math.random() * bank.pinyinWords.length)];
      const distractorPool = bank.pinyinWords
        .filter(w => w.pinyin !== correct.pinyin)
        .map(w => w.pinyin);
      const distractors = pickUniqueDistractors(correct.pinyin, distractorPool, 3);
      return {
        type: 'pinyin', difficulty,
        question: `下列词语"${correct.word}"的正确读音是：`,
        options: buildOptions(correct.pinyin, distractors),
        answer: correct.pinyin,
        explanation: `"${correct.word}"的拼音是 ${correct.pinyin}`
      };
    }

    if (difficulty === 'medium') {
      // 选择题：给拼音选词语
      const correct = bank.pinyinWords[Math.floor(Math.random() * bank.pinyinWords.length)];
      const distractorPool = bank.pinyinWords
        .filter(w => w.word !== correct.word)
        .map(w => w.word);
      const distractors = pickUniqueDistractors(correct.word, distractorPool, 3);
      return {
        type: 'pinyin', difficulty,
        question: `下列读音"${correct.pinyin}"对应的词语是：`,
        options: buildOptions(correct.word, distractors),
        answer: correct.word,
        explanation: `拼音 ${correct.pinyin} 对应的词语是"${correct.word}"`
      };
    }

    // hard: 判断题 — 用 pinyinErrors 正/误对比数据
    if (bank.pinyinErrors.length > 0) {
      const err = bank.pinyinErrors[Math.floor(Math.random() * bank.pinyinErrors.length)];
      // 随机选正或误
      const showCorrect = Math.random() > 0.5;
      const display = showCorrect ? err.correct : err.wrong;
      return {
        type: 'pinyin', difficulty,
        question: `判断下列词语读音是否正确：\n\n"${display}"`,
        options: buildTrueFalseOptions(showCorrect),
        answer: showCorrect ? '正确' : '错误',
        explanation: showCorrect
          ? `读音正确。${err.reason}：正确读法为"${err.correct}"。`
          : `读音错误。${err.reason}：正确读法为"${err.correct}"，常见误读为"${err.wrong}"。`
      };
    }
    return null;
  },

  // ---------- 字形 ----------
  char(bank, difficulty) {
    if (bank.charPairs.length === 0) return null;

    if (difficulty === 'easy') {
      // 判断题：成语书写是否正确
      const pair = bank.charPairs[Math.floor(Math.random() * bank.charPairs.length)];
      const showCorrect = Math.random() > 0.5;
      const display = showCorrect ? pair.correct : pair.wrong;
      return {
        type: 'char', difficulty,
        question: `下列词语书写是否正确：\n\n"${display}"`,
        options: buildTrueFalseOptions(showCorrect),
        answer: showCorrect ? '正确' : '错误',
        explanation: showCorrect
          ? `书写正确。`
          : `书写错误。"${pair.wrongChar}"应为"${pair.correctChar}"，正确写法是"${pair.correct}"。`
      };
    }

    if (difficulty === 'medium') {
      // 选择题：4个词语，找出没有错别字的一个
      const correctPair = bank.charPairs[Math.floor(Math.random() * bank.charPairs.length)];
      // 从其他charPairs中取3个错词
      const wrongPool = bank.charPairs
        .filter(p => p.correct !== correctPair.correct)
        .map(p => p.wrong);
      const wrongs = pickUniqueDistractors(correctPair.wrong, wrongPool, 3);
      // 正确答案 = correctPair.correct，干扰项 = 3个错词 + correctPair.wrong
      const options = buildOptions(correctPair.correct, [...wrongs, correctPair.wrong].slice(0, 3));
      return {
        type: 'char', difficulty,
        question: `下列词语中没有错别字的一项是：`,
        options,
        answer: correctPair.correct,
        explanation: `"${correctPair.correct}"书写正确。其他选项中均含有错别字。`
      };
    }

    // hard: 选择题 — 找出有错别字的一项
    const correctPair = bank.charPairs[Math.floor(Math.random() * bank.charPairs.length)];
    // 正确答案 = 含错别字的词
    const correctWordPool = bank.idioms.filter(i => i.idiom !== correctPair.correct).map(i => i.idiom);
    const correctWords = pickUniqueDistractors(correctPair.wrong, correctWordPool, 3);
    const options = buildOptions(correctPair.wrong, correctWords);
    return {
      type: 'char', difficulty,
      question: `下列词语中有错别字的一项是：`,
      options,
      answer: correctPair.wrong,
      explanation: `"${correctPair.wrong}"中"${correctPair.wrongChar}"应为"${correctPair.correctChar}"，正确写法是"${correctPair.correct}"。`
    };
  },

  // ---------- 成语 ----------
  idiom(bank, difficulty) {
    const idiomPool = bank.idioms.filter(i => i.meaning);
    if (idiomPool.length < 4) return null;

    if (difficulty === 'easy') {
      // 选择题：给成语选释义
      const correct = idiomPool[Math.floor(Math.random() * idiomPool.length)];
      const distractorPool = idiomPool.filter(i => i.meaning !== correct.meaning).map(i => i.meaning);
      const distractors = pickUniqueDistractors(correct.meaning, distractorPool, 3);
      return {
        type: 'idiom', difficulty,
        question: `成语"${correct.idiom}"的意思是：`,
        options: buildOptions(correct.meaning, distractors),
        answer: correct.meaning,
        explanation: `"${correct.idiom}"的意思是：${correct.meaning}`
      };
    }

    if (difficulty === 'medium') {
      // 选择题：给释义选成语
      const correct = idiomPool[Math.floor(Math.random() * idiomPool.length)];
      const distractorPool = idiomPool.filter(i => i.idiom !== correct.idiom).map(i => i.idiom);
      const distractors = pickUniqueDistractors(correct.idiom, distractorPool, 3);
      return {
        type: 'idiom', difficulty,
        question: `"${correct.meaning}"对应的成语是：`,
        options: buildOptions(correct.idiom, distractors),
        answer: correct.idiom,
        explanation: `"${correct.meaning}"对应的成语是"${correct.idiom}"`
      };
    }

    // hard: 判断题 — 成语使用是否正确
    const idiomItem = idiomPool[Math.floor(Math.random() * idiomPool.length)];
    const pair = bank.charPairs.find(p => p.correct === idiomItem.idiom);
    const showCorrect = Math.random() > 0.5;
    if (pair) {
      const idiom = showCorrect ? pair.correct : pair.wrong;
      const sentence = `他在学习中${idiom}，成绩一直很好。`;
      return {
        type: 'idiom', difficulty,
        question: `判断下列句子中成语使用是否正确：\n\n"${sentence}"`,
        options: buildTrueFalseOptions(showCorrect),
        answer: showCorrect ? '正确' : '错误',
        explanation: showCorrect
          ? `成语使用正确。"${pair.correct}"是正确的写法。`
          : `成语使用错误。"${pair.wrong}"应为"${pair.correct}"。`
      };
    }
    // 如果没有匹配的pair，用成语释义判断
    const showCorrect2 = Math.random() > 0.5;
    const sentence2 = `他在学习上${showCorrect2 ? idiomItem.idiom : '（使用错误）'}，因此成绩优异。`;
    return {
      type: 'idiom', difficulty,
      question: `判断：成语"${idiomItem.idiom}"的意思是"${idiomItem.meaning}"。`,
      options: buildTrueFalseOptions(true),
      answer: '正确',
      explanation: `"${idiomItem.idiom}"的意思确实是：${idiomItem.meaning}`
    };
  },

  // ---------- 修辞 ----------
  rhetoric(bank, difficulty) {
    // 收集所有修辞类型名称
    const allTypes = [];
    const seen = new Set();
    for (const r of bank.rhetoricTypes) {
      if (!seen.has(r.name)) { seen.add(r.name); allTypes.push(r.name); }
    }
    if (allTypes.length < 4) return null;

    // 从修辞表中提取例句
    const examples = bank.rhetoricExamples.filter(e => e.example && e.example.length > 5);
    const useExample = examples.length >= 4 && Math.random() > 0.3;

    if (useExample) {
      // 用真实例句出题
      const correct = examples[Math.floor(Math.random() * examples.length)];
      // 干扰项：其他修辞类型
      const distractorTypes = pickUniqueDistractors(correct.type, allTypes, 3);
      return {
        type: 'rhetoric', difficulty,
        question: `请判断以下句子主要使用的修辞手法：\n\n"${correct.example}"`,
        options: buildOptions(correct.type, distractorTypes),
        answer: correct.type,
        explanation: `这句话使用了"${correct.type}"的修辞手法。`
      };
    }

    // 用内置例句
    const builtinExamples = [
      { type: '比喻', example: '春天像小姑娘，花枝招展的，笑着，走着。' },
      { type: '比喻', example: '理想是石，敲出星星之火。' },
      { type: '比拟', example: '鸟儿将窠巢安在繁花嫩叶当中，高兴起来了，呼朋引伴地卖弄清脆的喉咙。' },
      { type: '夸张', example: '白发三千丈，缘愁似个长。' },
      { type: '夸张', example: '飞流直下三千尺，疑是银河落九天。' },
      { type: '排比', example: '红的像火，粉的像霞，白的像雪。' },
      { type: '排比', example: '山朗润起来了，水涨起来了，太阳的脸红起来了。' },
      { type: '对偶', example: '两个黄鹂鸣翠柳，一行白鹭上青天。' },
      { type: '对偶', example: '海内存知己，天涯若比邻。' },
      { type: '反复', example: '盼望着，盼望着，东风来了，春天的脚步近了。' },
      { type: '设问', example: '什么是路？就是从没路的地方践踏出来的。' },
      { type: '反问', example: '难道我们不应该努力学习吗？' },
      { type: '借代', example: '巾帼不让须眉。' },
      { type: '借代', example: '将军百战死，壮士十年归。' },
      { type: '对比', example: '朱门酒肉臭，路有冻死骨。' },
      { type: '双关', example: '东边日出西边雨，道是无晴却有晴。' }
    ];
    const correct = builtinExamples[Math.floor(Math.random() * builtinExamples.length)];
    const distractorTypes = pickUniqueDistractors(correct.type, allTypes, 3);
    return {
      type: 'rhetoric', difficulty,
      question: `请判断以下句子主要使用的修辞手法：\n\n"${correct.example}"`,
      options: buildOptions(correct.type, distractorTypes),
      answer: correct.type,
      explanation: `这句话使用了"${correct.type}"的修辞手法。`
    };
  },

  // ---------- 文学常识 ----------
  literature(bank, difficulty) {
    if (difficulty === 'easy' && bank.firstWorks.length >= 4) {
      // 选择题：第一部xxx是？
      const correct = bank.firstWorks[Math.floor(Math.random() * bank.firstWorks.length)];
      const descMatch = correct.desc.match(/第一.+?——/);
      const descText = descMatch ? descMatch[0].replace('——', '') : '第一部';
      const distractorPool = bank.firstWorks.filter(w => w.title !== correct.title).map(w => w.title);
      const distractors = pickUniqueDistractors(correct.title, distractorPool, 3);
      return {
        type: 'literature', difficulty,
        question: `${descText}是：`,
        options: buildOptions(correct.title, distractors),
        answer: correct.title,
        explanation: correct.desc
      };
    }

    if (bank.authors.length >= 4) {
      if (difficulty === 'medium') {
        // 选择题：作者朝代配对
        const correct = bank.authors[Math.floor(Math.random() * bank.authors.length)];
        const distractorPool = bank.authors.filter(a => a.dynasty !== correct.dynasty).map(a => a.dynasty);
        const distractors = pickUniqueDistractors(correct.dynasty, distractorPool, 3);
        return {
          type: 'literature', difficulty,
          question: `作家"${correct.name}"是哪个朝代的？`,
          options: buildOptions(correct.dynasty, distractors),
          answer: correct.dynasty,
          explanation: `${correct.name}是${correct.dynasty}时期的作家。`
        };
      }

      // hard: 判断题
      const correct = bank.authors[Math.floor(Math.random() * bank.authors.length)];
      const other = bank.authors[Math.floor(Math.random() * bank.authors.length)];
      const showCorrect = Math.random() > 0.5;
      const dynasty = showCorrect ? correct.dynasty : other.dynasty;
      return {
        type: 'literature', difficulty,
        question: `判断正误：${correct.name}是${dynasty}时期的作家。`,
        options: buildTrueFalseOptions(showCorrect),
        answer: showCorrect ? '正确' : '错误',
        explanation: `${correct.name}是${correct.dynasty}时期的作家，不是${dynasty}。`
      };
    }
    return null;
  },

  // ---------- 名句默写 ----------
  quote(bank, difficulty) {
    if (bank.quotes.length < 4) return null;
    const q = bank.quotes[Math.floor(Math.random() * bank.quotes.length)];

    if (difficulty === 'easy') {
      // 填空题：给上句填下句
      const parts = q.quote.split(/[，,；;]/);
      if (parts.length >= 2) {
        const upper = parts[0];
        const lower = parts.slice(1).join('，');
        return {
          type: 'quote', difficulty, isFill: true,
          question: `请补写出名句的下句：\n\n${upper}，______`,
          answer: lower,
          explanation: `出自${q.author}${q.source}：${q.quote}`
        };
      }
      // 如果只有一句，用选择题
      const distractors = bank.quotes
        .filter(x => x.quote !== q.quote)
        .map(x => x.quote.split(/[，,；;]/)[0])
        .filter(x => x && x !== parts[0]);
      const dist = pickUniqueDistractors(parts[0], distractors, 3);
      return {
        type: 'quote', difficulty,
        question: `"${q.quote}"的上一句是：`,
        options: buildOptions(parts[0], dist),
        answer: parts[0],
        explanation: `出自${q.author}${q.source}`
      };
    }

    if (difficulty === 'medium') {
      // 选择题：给上句选下句
      const parts = q.quote.split(/[，,；;]/);
      if (parts.length < 2) return null;
      const upper = parts[0];
      const lower = parts.slice(1).join('，');
      const distractorPool = [];
      for (const other of bank.quotes) {
        if (other.quote !== q.quote) {
          const otherParts = other.quote.split(/[，,；;]/);
          if (otherParts.length >= 2) distractorPool.push(otherParts.slice(1).join('，'));
        }
      }
      const distractors = pickUniqueDistractors(lower, distractorPool, 3);
      return {
        type: 'quote', difficulty,
        question: `"${upper}"的下一句是：`,
        options: buildOptions(lower, distractors),
        answer: lower,
        explanation: `出自${q.author}${q.source}：${q.quote}`
      };
    }

    // hard: 填空题（整句默写）
    const hint = q.source.replace(/[《》]/g, '');
    return {
      type: 'quote', difficulty, isFill: true,
      question: `请补写出${q.author}《${hint}》中的名句：\n\n______`,
      answer: q.quote,
      explanation: `出自${q.author}${q.source}`
    };
  },

  // ---------- 病句 ----------
  sentence(bank, difficulty) {
    const errors = bank.sentenceErrors;
    if (errors.length === 0) return null;

    if (difficulty === 'easy') {
      // 判断题：句子是否有语病
      const err = errors[Math.floor(Math.random() * errors.length)];
      const sentence = err.examples[Math.floor(Math.random() * err.examples.length)];
      // 这是个病句，所以"正确"答案是"错误"（有语病）
      return {
        type: 'sentence', difficulty,
        question: `判断下列句子是否有语病：\n\n"${sentence}"`,
        options: buildTrueFalseOptions(false), // false = 有语病 = 选"错误"才对
        answer: '错误',
        explanation: `此句有语病。病因：${err.type}（${err.desc}）。`
      };
    }

    if (difficulty === 'medium') {
      // 选择题：4个句子，选出没有语病的一个
      // 需要一个正确句子和3个病句
      const correctSentences = [
        '经过努力，他终于完成了任务。',
        '我们在学习上要不断进步。',
        '春天的花园里开满了各种各样的花。',
        '老师耐心地解答了同学们的问题。',
        '这本书内容丰富，值得一读。',
        '他每天坚持锻炼身体。',
        '同学们积极参加课外活动。',
        '我们应当养成勤俭节约的好习惯。',
        '他的作文水平有了很大提高。',
        '这次活动增强了同学们的团结意识。'
      ];
      const correctSentence = correctSentences[Math.floor(Math.random() * correctSentences.length)];
      const errorSamples = [];
      const usedTypes = new Set();
      for (const err of errors.sort(() => Math.random() - 0.5)) {
        if (usedTypes.has(err.type)) continue;
        usedTypes.add(err.type);
        errorSamples.push(err.examples[0]);
        if (errorSamples.length >= 3) break;
      }
      const distractors = pickUniqueDistractors(correctSentence, errorSamples, 3);
      return {
        type: 'sentence', difficulty,
        question: `下列句子没有语病的一项是：`,
        options: buildOptions(correctSentence, distractors),
        answer: correctSentence,
        explanation: `其他选项都存在语病，只有"${correctSentence}"无语病。`
      };
    }

    // hard: 选择题 — 选出有语病的一项
    const correctSentences = [
      '经过努力，他终于完成了任务。',
      '我们在学习上要不断进步。',
      '春天的花园里开满了各种各样的花。',
      '老师耐心地解答了同学们的问题。',
      '这本书内容丰富，值得一读。',
      '他每天坚持锻炼身体。',
      '同学们积极参加课外活动。',
      '我们应当养成勤俭节约的好习惯。'
    ];
    const err = errors[Math.floor(Math.random() * errors.length)];
    const errorSentence = err.examples[Math.floor(Math.random() * err.examples.length)];
    const correctPool = correctSentences.filter(s => s !== errorSentence);
    const distractors = pickUniqueDistractors(errorSentence, correctPool, 3);
    return {
      type: 'sentence', difficulty,
      question: `下列句子中有语病的一项是：`,
      options: buildOptions(errorSentence, distractors),
      answer: errorSentence,
      explanation: `"${errorSentence}"存在语病。病因：${err.type}（${err.desc}）。`
    };
  }
};

// ==================== 生成题目 ====================

function generateQuestions(type = 'all', difficulty = 'mixed', count = 10) {
  const bank = extractQuestionData();
  if (!bank) return [];

  let types = type === 'all' ? Object.keys(GENERATORS) : [type];
  let difficulties = difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [difficulty];

  const questions = [];
  let attempts = 0;
  const maxAttempts = count * 15;

  while (questions.length < count && attempts < maxAttempts) {
    attempts++;
    const t = types[Math.floor(Math.random() * types.length)];
    const d = difficulties[Math.floor(Math.random() * difficulties.length)];
    const gen = GENERATORS[t];
    if (!gen) continue;
    try {
      const q = gen(bank, d);
      if (q && !questions.some(prev =>
        prev.question === q.question &&
        JSON.stringify(prev.options?.map(o=>o.text) || []) === JSON.stringify(q.options?.map(o=>o.text) || [])
      )) {
        questions.push(q);
      }
    } catch (e) { /* skip */ }
  }

  return questions;
}
