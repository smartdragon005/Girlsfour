// ============================================================
// 故事分类清单
// ------------------------------------------------------------
// 使用说明：
//   1. 每写好一个新的故事json，把对应的 story_id（不含.json后缀）
//      加到下面对应分类的数组里，前端自动就能读到
//   2. romance 分类下暂时是空的，你把 romance_01.json ~ romance_15.json
//      写好之后，按顺序把 'romance_01'... 加进 romance 数组即可
//   3. 顺序无所谓，前端会先排重再随机
// ============================================================
window.STORY_CATALOG = {
  // 恐怖悬疑 8个
  horror: [
    'horror_01', 'horror_02', 'horror_03', 'horror_04',
    'horror_05', 'horror_06', 'horror_07', 'horror_08'
  ],
  // 刑侦破案 8+1=9个（含星湖樱花季命案）
  crime: [
    'crime_01', 'crime_02', 'crime_03', 'crime_04',
    'crime_05', 'crime_06', 'crime_07', 'crime_08',
    'xinghu_case_01'
  ],
  // 推理解谜 7个
  mystery: [
    'mystery_01', 'mystery_02', 'mystery_03', 'mystery_04',
    'mystery_05', 'mystery_06', 'mystery_07'
  ],
  // 都市传说 7个
  urban: [
    'urban_01', 'urban_02', 'urban_03', 'urban_04',
    'urban_05', 'urban_06', 'urban_07'
  ],
  // 爱情小说 15个（你写好之后在这里加）
  // 单人4个：romance_01~04
  // 两人6个：romance_05~10
  // 三人4个：romance_11~14
  // 四人1个：romance_15
  romance: [
    'romance_12',  // 甜小朵+白洁+李川（泳池夜话）
    'romance_13'   // 甜小朵+小雅+李川
  ]
};
