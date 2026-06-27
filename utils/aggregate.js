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

// line → 采购产品名关键词(默认=line,少数 line 名与采购口径不一致的 override)
const LINE_KW = { '电动猫砂盆': '猫砂盆', '骨传导耳机': '骨传导', '翻译耳机': '翻译' }

// 按 line 关键词匹配 procurement(财务采购,by 财务产品名),加总采购/已付/欠厂/台数
function procurementOf(procRows, line) {
  const kw = LINE_KW[line] || line
  const m = (procRows || []).filter(p => (p.product || '').includes(kw))
  return {
    count: m.length,
    amount: m.reduce((s, p) => s + num(p.amount), 0),
    paid: m.reduce((s, p) => s + num(p.paid), 0),
    outstanding: m.reduce((s, p) => s + num(p.outstanding), 0),
    qty: m.reduce((s, p) => s + num(p.qty), 0),
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

// 把某 line 的金蝶采购行,按 model_map 拆到「型号级」:
//   byModel[领星local_name] = {amount,paid,outstanding,qty}  (matched,挂到在售型号)
//   unstocked[] = {jdName, amount,paid,outstanding,qty}        (未铺货新款,领星无对应)
// 未在 model_map 的金蝶名:计入 byModel['_unmapped'](型号级拆不了,仍进类合计,不单列型号)。
function procurementByModel(procRows, line) {
  const kw = LINE_KW[line] || line
  const m = (procRows || []).filter(p => (p.product || '').includes(kw))
  const byModel = {}, unstocked = []
  const add = (bucket, p) => {
    bucket.amount += num(p.amount); bucket.paid += num(p.paid)
    bucket.outstanding += num(p.outstanding); bucket.qty += num(p.qty)
  }
  const blank = () => ({ amount: 0, paid: 0, outstanding: 0, qty: 0 })
  m.forEach(p => {
    const has = Object.prototype.hasOwnProperty.call(MODEL_MAP, p.product)
    const lx = has ? MODEL_MAP[p.product] : '_unmapped'
    if (lx === null) { unstocked.push({ jdName: p.product, ...blank(), amount: num(p.amount), paid: num(p.paid), outstanding: num(p.outstanding), qty: num(p.qty) }) }
    else { (byModel[lx] || (byModel[lx] = blank())); add(byModel[lx], p) }
  })
  return { byModel, unstocked }
}

module.exports = { groupByCategory, lineOf, num, procurementOf, procurementByModel, LINE_KW, settleView }
