const fs = require('fs');

const sampleQuestions = [
  {
    type: 'pinyin',
    difficulty: 'medium',
    question: '下列成语中，加点字的注音有误的一项是：\nA. 爱憎(zēng)分明  B. 安土重(zhòng)迁\nC. 按捺(nài)不住  D. 病入膏肓(huāng)',
    options: [
      { text: 'A. 爱憎(zēng)分明', correct: false },
      { text: 'B. 安土重(zhòng)迁', correct: false },
      { text: 'C. 按捺(nài)不住', correct: true },
      { text: 'D. 病入膏肓(huāng)', correct: false }
    ],
    answer: 'C',
    explanation: '按捺不住的"捺"应读 nà，意为抑制、忍耐。爱憎分明的"憎"读 zēng，安土重迁的"重"读 zhòng（意为"不轻易"），病入膏肓的"肓"读 huāng（注意与"盲"máng 区别）。',
    source: '初中生容易读错的成语'
  },
  {
    type: 'pinyin',
    difficulty: 'hard',
    question: '下列成语中，读音完全正确的一项是：\nA. 草菅(shū)人命  暴殄(tiǎn)天物\nB. 并行不悖(bèi)  不胫(jìng)而走\nC. 瞠(chēng)目结舌  相形见绌(chū)\nD. 不落窠(kē)臼  参差(cān chā)不齐',
    options: [
      { text: 'A. 草菅(shū)人命  暴殄(tiǎn)天物', correct: false },
      { text: 'B. 并行不悖(bèi)  不胫(jìng)而走', correct: true },
      { text: 'C. 瞠(chēng)目结舌  相形见绌(chū)', correct: false },
      { text: 'D. 不落窠(kē)臼  参差(cān chā)不齐', correct: false }
    ],
    answer: 'B',
    explanation: 'A项：草菅人命的"菅"应读 jiān，不是 shū（"菅"是草字头，不同于"管"）；C项：相形见绌的"绌"应读 chù，不是 chū；D项：参差不齐的"参差"应读 cēn cī。B项两个成语读音均正确。',
    source: '初中生容易读错的成语'
  },
  {
    type: 'pinyin',
    difficulty: 'easy',
    question: '判断下面成语的注音是否正确：\n"峥嵘(zhēng róng)岁月"',
    options: [
      { text: '正确', correct: true },
      { text: '错误', correct: false }
    ],
    answer: '正确',
    explanation: '峥嵘岁月的读音正确。峥读 zhēng（注意不读 zhèng），嵘读 róng。',
    source: '初中生容易读错的成语'
  },
  {
    type: 'char',
    difficulty: 'medium',
    question: '下列词语中没有错别字的一项是：',
    options: [
      { text: '黯然失色', correct: true },
      { text: '按步就班', correct: false },
      { text: '心弛神往', correct: false },
      { text: '惨绝人圜', correct: false }
    ],
    answer: '黯然失色',
    explanation: '"黯然失色"正确，"黯"表示阴暗、伤感的样子。B项应为"按部就班"（部：门类、步骤）；C项应为"心驰神往"（驰：车马快跑）；D项应为"惨绝人寰"（寰：广大的地域）。',
    source: '易混字辨析'
  },
  {
    type: 'char',
    difficulty: 'hard',
    question: '下列各组词语中，书写全部正确的一组是：',
    options: [
      { text: '部署  按部就班  胜卷在握', correct: false },
      { text: '舞弊  兴利除弊  脍炙人口', correct: true },
      { text: '脉搏  赤膊上阵  渊搏学识', correct: false },
      { text: '松弛  一张一驰  风驰电掣', correct: false }
    ],
    answer: '舞弊  兴利除弊  脍炙人口',
    explanation: 'A项"胜卷在握"应为"胜券在握"（券：票据/凭证）。C项"渊搏学识"应为"渊博学识"（博：丰富、通晓；搏：对打、跳动）。D项"一张一驰"应为"一张一弛"（弛：放松、松懈；驰：快跑）。',
    source: '易混字辨析'
  },
  {
    type: 'word_usage',
    difficulty: 'easy',
    question: '成语"安步当车"的意思是什么？',
    options: [
      { text: '把车子停稳当再步行', correct: false },
      { text: '用缓慢的步行代替乘车，形容轻松缓慢', correct: true },
      { text: '为了安全而不坐车', correct: false },
      { text: '安置好车辆准备出发', correct: false }
    ],
    answer: '用缓慢的步行代替乘车，形容轻松缓慢',
    explanation: '"安步当车"出自《战国策》，安：安详、不慌忙。指以从容的步行代替乘车，形容轻松缓慢地行走，也指人安于贫贱的生活。',
    source: '初中生容易读错的成语'
  },
  {
    type: 'word_usage',
    difficulty: 'medium',
    question: '下列句子中加点成语使用不恰当的一项是：',
    options: [
      { text: '他在学术上孜孜不倦，终于取得了令人瞩目的成就。', correct: false },
      { text: '大自然鬼斧神工，造就了张家界奇峰异石的壮丽景观。', correct: false },
      { text: '他废寝忘食地工作，真是到了不可救药的地步。', correct: true },
      { text: '这篇文章旁征博引，论证充分，令人信服。', correct: false }
    ],
    answer: '他废寝忘食地工作，真是到了不可救药的地步。',
    explanation: '"不可救药"意为病已重到无法用药医治，比喻事物坏到无法挽救的地步，是贬义词。用在这里形容努力工作是褒贬失当。',
    source: '初中生容易读错的成语'
  },
  {
    type: 'literature',
    difficulty: 'easy',
    question: '下列对小说三要素表述正确的一项是：',
    options: [
      { text: '人物、情节、环境', correct: true },
      { text: '开头、发展、结局', correct: false },
      { text: '人物、时间、地点', correct: false },
      { text: '记叙、描写、抒情', correct: false }
    ],
    answer: '人物、情节、环境',
    explanation: '小说是以刻画人物形象为中心，通过完整的故事情节和具体的环境描写来反映社会生活的一种文学体裁。人物、情节、环境被称为小说三要素。',
    source: '第七部分 文学常识'
  },
  {
    type: 'literature',
    difficulty: 'hard',
    question: '下列关于我国古典小说发展演变顺序正确的一项是：',
    options: [
      { text: '志怪小说 → 话本小说 → 传奇 → 章回体小说', correct: false },
      { text: '志怪小说 → 传奇 → 话本小说 → 章回体小说', correct: true },
      { text: '传奇 → 志怪小说 → 话本小说 → 章回体小说', correct: false },
      { text: '话本小说 → 志怪小说 → 传奇 → 章回体小说', correct: false }
    ],
    answer: '志怪小说 → 传奇 → 话本小说 → 章回体小说',
    explanation: '我国古典小说的发展顺序：魏晋南北朝出现志怪小说（如干宝《搜神记》）；唐代发展为传奇（如《柳毅传》）；宋代出现话本小说（说话人底本）；元末明初出现章回体小说（如《三国演义》《水浒传》）。',
    source: '第七部分 文学常识'
  },
  {
    type: 'literature',
    difficulty: 'medium',
    question: '我国古典长篇小说最主要的体裁形式是什么？',
    options: [
      { text: '志怪体', correct: false },
      { text: '传奇体', correct: false },
      { text: '章回体', correct: true },
      { text: '话本体', correct: false }
    ],
    answer: '章回体',
    explanation: '章回体小说是我国古典长篇小说的主要形式，由宋元时期的讲史话本发展而来，特点是分回标目、故事连接、段落整齐。代表作有《三国演义》《水浒传》《西游记》《红楼梦》等。',
    source: '第七部分 文学常识'
  }
];

// 写入文件
fs.writeFileSync('data/pilot-questions.json', JSON.stringify(sampleQuestions, null, 2), 'utf-8');
console.log('Generated ' + sampleQuestions.length + ' pilot questions');
console.log('Saved to data/pilot-questions.json');
