// 产品类聚合:按 registry「产品主线」(line)把型号(local_name)加总成类。
const registry = require('../data/registry.js')
const MODEL_MAP = require('../data/model_map.js')

const num = v => parseFloat(v) || 0
const lineOf = name => (registry.byProduct[name] || {}).line || '其他'

// compareRows: /finance/projects/compare;paybackRows: dashboard/payback 全量(用于类回款)
function groupByCategory(compareRows, paybackRows) {
  const pbMap = {}
  ;(paybackRows || []).forEach(r => { pbMap[r.local_name] = r })

  const byLine = {}
  compareRows.forEach(p => {
    const line = lineOf(p.local_name)
    const e = byLine[line] || (byLine[line] = {
      line, products: [], sales: 0, profit: 0, ad_cost: 0, realized: 0, pending: 0,
    })
    e.products.push(p.local_name)
    e.sales += num(p.sales)
    e.profit += num(p.profit)
    e.ad_cost += num(p.ad_cost)
    const pb = pbMap[p.local_name]
    if (pb) { e.realized += num(pb.realized_usd); e.pending += num(pb.pending_usd) }
  })

  return Object.values(byLine).map(e => ({
    line: e.line,
    products: e.products,
    count: e.products.length,
    sales: e.sales, profit: e.profit, ad_cost: e.ad_cost,
    realized: e.realized, pending: e.pending,
    margin_pct: e.sales ? e.profit / e.sales * 100 : 0,
    acos_pct: e.sales ? e.ad_cost / e.sales * 100 : 0,
  })).sort((a, b) => b.sales - a.sales)
}

// line → 采购产品名关键词(默认=line,少数 line 名与采购/财务口径不一致的 override)
// ⚠️ 大杂烩线(长尾/其他/种子链接)无共同关键词,采购匹配不到,需 model_map 逐产品归集。
const LINE_KW = {
  '电动猫砂盆': '猫砂盆', '骨传导耳机': '骨传导', '翻译耳机': '翻译',
  '剃头剃须': '剃',          // 金蝶用 剃头刀/剃须刀/剃头机,连写"剃头剃须"匹配不到 → 用"剃"
  '宠物湿巾': '湿巾',
}

// 逐线「活跃代」:采购明细(带 buy_year)→ 取采购额最大的那年(当前主力备货代)的行。
// 治款混又不打骨折:空调活跃代=2026,保险箱=2025,猫砂盆=2024…各线按自己的备货年,不全局卡一年。
function activeYearRows(detailRows, line) {
  const kw = LINE_KW[line] || line
  const rows = (detailRows || []).filter(p => (p.product || '').includes(kw))
  const byYear = {}
  rows.forEach(r => { const y = String(r.buy_year); byYear[y] = (byYear[y] || 0) + num(r.amount) })
  let year = null, best = -Infinity
  Object.keys(byYear).forEach(y => { if (y !== 'null' && y !== 'undefined' && byYear[y] > best) { best = byYear[y]; year = y } })
  return { year, rows: rows.filter(r => String(r.buy_year) === year) }
}

// 活跃代采购合计(类级):加总采购/已付/欠厂/台数 + 活跃代年份
function procurementOf(detailRows, line) {
  const { year, rows } = activeYearRows(detailRows, line)
  return {
    year, count: rows.length,
    amount: rows.reduce((s, p) => s + num(p.amount), 0),
    paid: rows.reduce((s, p) => s + num(p.paid), 0),
    outstanding: rows.reduce((s, p) => s + num(p.outstanding), 0),
    qty: rows.reduce((s, p) => s + num(p.qty), 0),
  }
}

// 亚马逊结算视角(对齐 mockup):到手 = 销售 − 佣金 − FBA − 广告 − 仓储 − 退款。
// 全 USD 单币种;⚠️ 这是「平台结算后」≠ 毛利(领星毛利还扣了采购成本 COGS,口径不同,勿与 KPI 毛利混)。
// fee 形如 {commission,fba_delivery,ads_cost,storage,refunds}(可正可负,这里统一取绝对值)。
function settleView(sales, fee) {
  const items = [
    ['佣金', fee.commission], ['FBA 配送', fee.fba_delivery], ['广告', fee.ads_cost],
    ['仓储', fee.storage], ['退款', fee.refunds],
  ].map(([label, v]) => ({ label, val: Math.abs(num(v)) })).filter(i => i.val > 0)
  const deduct = items.reduce((s, i) => s + i.val, 0)
  return { sales: num(sales), items, deduct, net: num(sales) - deduct }
}

// 把某 line「活跃代」的金蝶采购行,按 model_map 拆到「型号级」:
//   byModel[领星local_name] = {amount,paid,outstanding,qty}  (matched,挂到在售型号)
//   byModel['_unmapped']    = 笼统名拆不到型号的(B类),类级未拆,前端单列提示
//   unstocked[]             = 未铺货新款(model_map 值=null,领星无对应),型号列表单列
function procurementByModel(detailRows, line) {
  const { rows } = activeYearRows(detailRows, line)
  const byModel = {}, unstockedMap = {}
  const blank = () => ({ amount: 0, paid: 0, outstanding: 0, qty: 0 })
  const add = (b, p) => { b.amount += num(p.amount); b.paid += num(p.paid); b.outstanding += num(p.outstanding); b.qty += num(p.qty) }
  rows.forEach(p => {
    const has = Object.prototype.hasOwnProperty.call(MODEL_MAP, p.product)
    const lx = has ? MODEL_MAP[p.product] : '_unmapped'
    if (lx === null) { (unstockedMap[p.product] || (unstockedMap[p.product] = blank())); add(unstockedMap[p.product], p) }
    else { (byModel[lx] || (byModel[lx] = blank())); add(byModel[lx], p) }
  })
  const unstocked = Object.entries(unstockedMap).map(([jdName, v]) => ({ jdName, ...v }))
  return { byModel, unstocked }
}

module.exports = { groupByCategory, lineOf, num, procurementOf, procurementByModel, LINE_KW, settleView }
