// 产品(型号)下钻看板。新增:类中定位 + 费用动作(opex) + 退货原因。
// 财务走快照;归属/asin 走 registry。opex 型号级偏漏(标注)。
const api = require('../../utils/api.js')
const registry = require('../../data/registry.js')
const { lineOf, settleView } = require('../../utils/aggregate.js')
const MODEL_MAP = require('../../data/model_map.js')

function fmtMoney(n) { const a = Math.abs(n), s = n < 0 ? '-$' : '$'; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'; return s + Math.round(a) }
const fmtCny = n => { const a = Math.abs(n); if (a >= 1e8) return '¥' + (a / 1e8).toFixed(2) + '亿'; if (a >= 1e4) return '¥' + (a / 1e4).toFixed(1) + '万'; return '¥' + Math.round(a) }
const mmdd = s => (s || '').slice(5).replace('-', '/')
const fmtShort = n => { const a = Math.abs(n); if (a >= 1e6) return (n < 0 ? '-' : '') + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return (n < 0 ? '-' : '') + Math.round(a / 1e3) + 'k'; return Math.round(n) + '' }

Page({
  data: {
    name: '', generatedAt: api.generatedAt, proj: null, locate: null, trend: [], costs: [], settle: null, procurement: null, owners: [],
    payback: null, inventory: null, refund: null, ads: null,
    timeline: [], stars: [], opexActions: [], reasons: [],
    loading: true, error: '',
  },

  onLoad(q) {
    const name = decodeURIComponent(q.name || '')
    this.setData({ name })
    wx.setNavigationBarTitle({ title: name || '产品看板' })
    this.fetch(name)
  },

  async fetch(name) {
    this.setData({ loading: true, error: '' })
    try {
      const [pnl, fees, payback, inv, refund, ads, timeline, starsAll, compare, opexRows, reasonRows, procAll] = await Promise.all([
        api.projectPnl(name, 30), api.dash('fees', name), api.dash('payback', name),
        api.dash('inventory', name), api.dash('refund', name), api.dash('ads', name),
        api.projectTimeline(name), api.dash('quality/stars', name),
        api.projectsCompare(30, 100), api.projectOpex(name), api.projectReasons(name),
        api.dash('procurement', name),
      ])
      const reg = registry.byProduct[name] || null
      const N = api.num

      // 该型号采购(金蝶):按 model_map 反查归到本 local_name 的采购合同(链路一致:型号也带采购)
      const buyRows = (procAll || []).filter(p => MODEL_MAP[p.product] === name)
      const buyAmount = buyRows.reduce((s, p) => s + N(p.amount), 0)
      const buyQty = buyRows.reduce((s, p) => s + N(p.qty), 0)
      const procurementCard = buyAmount > 0 ? {
        amountText: fmtCny(buyAmount), qty: buyQty.toLocaleString('en-US'),
        paidText: fmtCny(buyRows.reduce((s, p) => s + N(p.paid), 0)),
        oweText: fmtCny(buyRows.reduce((s, p) => s + N(p.outstanding), 0)),
      } : null

      // 头部:近 30 天汇总
      const sum = (arr, k) => arr.reduce((s, r) => s + N(r[k]), 0)
      const sales = sum(pnl, 'sales'), profit = sum(pnl, 'profit'), adCost = sum(pnl, 'ad_cost')
      const proj = {
        team: reg ? reg.dept : '',
        salesText: fmtMoney(sales), profitText: fmtMoney(profit), adCostText: fmtMoney(adCost),
        margin_pct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
        acos_pct: sales ? (adCost / sales * 100).toFixed(1) : '0.0',
        loss: profit < 0,
      }

      // 类中定位
      const line = lineOf(name)
      const lineProds = compare.filter(p => lineOf(p.local_name) === line)
      const lineSales = lineProds.reduce((s, p) => s + N(p.sales), 0)
      const sorted = lineProds.slice().sort((a, b) => N(b.sales) - N(a.sales))
      const rank = sorted.findIndex(p => p.local_name === name) + 1
      const myRow = compare.find(p => p.local_name === name)
      const share = lineSales && myRow ? Math.round(N(myRow.sales) / lineSales * 100) : 0
      const locate = { line, rank: rank || '-', total: lineProds.length, share }

      // 趋势(近7天)
      const rows = pnl.slice(0, 7).reverse()
      const maxSales = rows.reduce((m, r) => Math.max(m, N(r.sales)), 0) || 1
      const trend = rows.map(r => {
        const s = N(r.sales), p = N(r.profit)
        return { d: mmdd(r.data_date), salesText: fmtMoney(s), profitText: fmtMoney(p), loss: p < 0, h: Math.max(8, Math.round(s / maxSales * 160)) }
      })

      // 费用拆解(平台)
      const feeRow = fees.find(f => f.local_name === name) || fees[0] || {}
      const feeItems = [
        ['佣金', feeRow.commission], ['FBA 配送', feeRow.fba_delivery], ['广告', feeRow.ads_cost],
        ['仓储', feeRow.storage], ['退款', feeRow.refunds],
      ].map(([d, v]) => ({ description: d, cost: Math.abs(N(v)) })).filter(c => c.cost > 0).sort((a, b) => b.cost - a.cost)
      const maxCost = feeItems.reduce((m, c) => Math.max(m, c.cost), 0) || 1
      const costs = feeItems.map(c => ({ description: c.description, costText: fmtMoney(c.cost), barWidth: Math.max(6, Math.round(c.cost / maxCost * 100)) }))

      // 亚马逊结算视角(到手 = 销售 − 各项,全期·USD·≠毛利):销售用 fees 行口径(全期),与各项扣减自洽
      const sv = settleView(N(feeRow.sales), feeRow)
      const settle = sv.sales > 0 ? {
        salesText: fmtMoney(sv.sales),
        items: sv.items.map(i => ({ label: i.label, valText: '-' + fmtMoney(i.val), w: Math.max(4, Math.round(i.val / sv.sales * 100)) })),
        netText: fmtMoney(sv.net), netLoss: sv.net < 0,
        netPct: (sv.net / sv.sales * 100).toFixed(1),
      } : null

      // 费用动作(opex 型号级)
      const opexMax = opexRows.reduce((m, o) => Math.max(m, N(o.amount_cny)), 0) || 1
      const opexActions = opexRows.map(o => ({ category: o.category, costText: fmtCny(N(o.amount_cny)), barWidth: Math.max(6, Math.round(N(o.amount_cny) / opexMax * 100)) }))

      // 退货原因(按 reason 合并 qty)
      const reasonMap = {}
      reasonRows.forEach(r => { if (N(r.qty) > 0) reasonMap[r.reason] = (reasonMap[r.reason] || 0) + N(r.qty) })
      const reasonArr = Object.entries(reasonMap).sort((a, b) => b[1] - a[1])
      const reasonMax = Math.max(...reasonArr.map(x => x[1]), 1)
      const reasons = reasonArr.map(([reason, qty]) => ({ reason, qty, barWidth: Math.max(6, Math.round(qty / reasonMax * 100)) }))

      // 回款 / 弹药 / 退款 / 广告
      const pb = payback.find(r => r.local_name === name) || payback[0]
      const paybackData = pb ? { realizedText: fmtMoney(N(pb.realized_usd)), pendingText: fmtMoney(N(pb.pending_usd)) } : null
      const iv = inv.find(r => r.product_name === name) || inv[0]
      const inventoryData = iv ? { xianhuo: iv.xianhuo, zaitu: iv.zaitu, fbaTotal: iv.fba_total } : null
      const rf = refund.find(r => r.local_name === name)
      const refundData = rf ? { rate: rf.return_rate_pct, returns: rf.returns, amtText: fmtMoney(Math.abs(N(rf.refund_amt))) } : null
      const ad = ads.find(r => r.local_name === name)
      const adsData = ad ? { spendText: fmtMoney(N(ad.spend)), revText: fmtMoney(N(ad.revenue)), acos: ad.acos_pct } : null

      // 时间轴
      const tlMax = timeline.reduce((m, t) => Math.max(m, Math.abs(N(t.payout_usd))), 0) || 1
      const tl = timeline.map(t => { const v = N(t.payout_usd); return { ym: (t.ym || '').slice(2), valShort: fmtShort(v), neg: v < 0, w: Math.max(2, Math.round(Math.abs(v) / tlMax * 100)) } })

      // 质量星级
      const asins = (reg && reg.asins) || []
      const stars = starsAll.filter(s => asins.includes(s.asin)).map(s => ({ asin: s.asin, star: s.star, reviews: s.reviews, low: N(s.star) < 3.5 })).sort((a, b) => N(a.star) - N(b.star))

      // 负责员工
      const owners = reg ? [
        reg.owner && { name: reg.owner, team: reg.dept, tag: '主责' },
        ...(reg.joiners || []).map(j => ({ name: j, team: reg.dept, tag: '参与' })),
      ].filter(Boolean) : []

      this.setData({
        proj, locate, trend, costs, settle, procurement: procurementCard, owners, timeline: tl, stars, opexActions, reasons,
        payback: paybackData, inventory: inventoryData, refund: refundData, ads: adsData, loading: false,
      })
    } catch (e) {
      this.setData({ loading: false, error: '加载失败：' + (e.message || e) })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },
})
