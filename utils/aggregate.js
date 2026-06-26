// 产品类聚合:按 registry「产品主线」(line)把型号(local_name)加总成类。
const registry = require('../data/registry.js')

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

module.exports = { groupByCategory, lineOf, num, procurementOf, LINE_KW }
