// 数据源：本地接口快照（scripts/fetch_snapshot.py 预拉），体验版免调域名。
// 函数签名与原 wx.request 版一致，finance/project 页无需改动。
// 切回实时请求：把各函数实现换成 wx.request 即可（见 git 历史）。
const SNAP = require('../data/api_snapshot.js')

// 数值是字符串（macmini runner 序列化），统一转 float
const num = v => parseFloat(v) || 0

// ── 老板总览 ──
const projectsCompare = () => Promise.resolve(SNAP.compare || [])
const projectsList = () => Promise.resolve(SNAP.projects || [])

// ── 产品下钻 ──
const projectPnl = name => Promise.resolve((SNAP.pnl || {})[name] || [])

// 费用拆解：从 dashboard/fees 快照里取本产品行，拆成费用项
const projectCosts = name => {
  const row = (SNAP.fees || []).find(f => f.local_name === name) || {}
  const items = [
    ['佣金', row.commission], ['FBA 配送', row.fba_delivery],
    ['广告', row.ads_cost], ['仓储', row.storage], ['退款', row.refunds],
  ].map(([d, v]) => ({ description: d, cost: Math.abs(num(v)) }))
    .filter(c => c.cost > 0).sort((a, b) => b.cost - a.cost)
  return Promise.resolve(items)
}

// dashboard 各端点：返回全量数组，页面侧自行 find 精确行
// ep 形如 'fees' / 'payback' / 'inventory' / 'ads' / 'refund' / 'quality/stars'
const dash = (ep, name) => Promise.resolve(SNAP[ep.replace(/\//g, '_')] || [])

// 月度回款时间轴（按产品存）
const projectTimeline = name => Promise.resolve((SNAP.timeline_payout || {})[name] || [])
// 运营费用/费用动作（按产品存，by 对方会计科目；型号级偏漏,类级聚合更准）
const projectOpex = name => Promise.resolve((SNAP.opex || {})[name] || [])
// 退货原因（按产品存，by reason）
const projectReasons = name => Promise.resolve((SNAP.quality_reasons_by || {})[name] || [])

// 快照生成时间(页面标注数据时效用)
const generatedAt = SNAP._generated || ''

// 全量回款/时间轴（团队页批量聚合用，避免逐产品循环调用）
const allTimelines = () => Promise.resolve(SNAP.timeline_payout || {})
const allPendingTimelines = () => Promise.resolve(SNAP.timeline_pending_by || {})
const allPaybacks = () => Promise.resolve(SNAP.payback || [])

// 公司资金预览:资金盘(账上现金/待回款/库存货值 by 公司) + 欠厂应付总额
const capital = () => Promise.resolve(SNAP.capital || [])
const payableTotal = () => Promise.resolve((SNAP.payable_total || [])[0] || {})

const dailyReports = () => Promise.resolve(SNAP.daily_reports || [])
const checkinActions = () => Promise.resolve(SNAP.checkin_actions || [])

// 月度销售（按产品×月聚合）：{n, ym, s, p, u} 全量数组
// 按产品名分组：返回 {productName: [{ym, s, p, u}]}
const monthlySalesByProduct = () => {
  const map = {}
  ;(SNAP.monthly_sales || []).forEach(r => {
    if (!map[r.n]) map[r.n] = []
    map[r.n].push({ ym: r.ym, s: r.s, p: r.p, u: r.u })
  })
  return Promise.resolve(map)
}

module.exports = { num, projectsCompare, projectsList, projectCosts, projectPnl, dash, projectTimeline, projectOpex, projectReasons, generatedAt, allTimelines, allPendingTimelines, allPaybacks, capital, payableTotal, dailyReports, checkinActions, monthlySalesByProduct }
