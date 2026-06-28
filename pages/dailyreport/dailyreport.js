const api = require('../../utils/api.js')
const SNAP = require('../../data/api_snapshot.js')

function fmtMoney(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'
  return s + Math.round(a)
}

function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%' }

Page({
  data: {
    generatedAt: api.generatedAt,
    reportDates: [],     // ["2026-06-26", ...] for picker
    selectedIdx: 0,
    report: null,        // current full_content
    operators: [],       // 按主负责运营
    segments: [],        // A/B/C/D 分段
    aging: null,         // 库龄危险
    checkins: [],        // grouped checkin actions [{date, actions:[]}]
    checkinDate: '',     // selected checkin date
    loading: true, error: '',
  },

  onLoad() { this.build() },

  build() {
    const reports = SNAP.daily_reports || []
    if (!reports.length) {
      this.setData({ loading: false, error: '快照中暂无日报数据，请重新运行 fetch_snapshot.py' })
      return
    }

    // Deduplicate by date (snapshot already deduped, but guard)
    const seen = new Set()
    const unique = reports.filter(r => {
      const d = (r.full_content || {}).date || r.pushed_at?.slice(0, 10) || ''
      if (seen.has(d)) return false
      seen.add(d)
      return true
    }).sort((a, b) => {
      const da = (a.full_content || {}).date || '', db = (b.full_content || {}).date || ''
      return db.localeCompare(da)
    })

    this._reports = unique
    const reportDates = unique.map(r => (r.full_content || {}).date || r.pushed_at?.slice(0, 10) || '')

    // Build checkin groups
    const allCheckins = SNAP.checkin_actions || []
    const byDate = {}
    allCheckins.forEach(c => {
      const d = c.date || c.created_at?.slice(0, 10) || ''
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(c)
    })
    const checkins = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => ({
      date, actions: byDate[date],
    }))

    this.setData({ reportDates, checkins, loading: false }, () => {
      this.selectReport(0)
    })
  },

  selectReport(idx) {
    const r = this._reports[idx]
    if (!r) return
    const fc = r.full_content || {}

    const operators = (fc['按主负责运营'] || []).map(op => ({
      name: op.owner,
      sales: fmtMoney(op.sales_usd),
      profit: fmtMoney(op.profit_usd),
      count: op['品名数'] || 0,
      loss: op.profit_usd < 0,
    }))

    const segMap = fc['分段汇总'] || {}
    const segKeys = { 'A_主卖品': '主卖品', 'B_ERP漏建': 'ERP漏建', 'C_种子链接': '种子链接', 'D_base未维护': 'Base未维护' }
    const segments = Object.entries(segKeys).map(([k, label]) => {
      const s = segMap[k] || {}
      return { label, count: s['组数'] || 0, sales: fmtMoney(s['销售额_usd'] || 0), pct: (s['占比'] || 0).toFixed(1) }
    }).filter(s => s.count > 0)

    const agRaw = fc['库龄危险'] || {}
    const aging = agRaw.msku_over_365 != null ? {
      over365: agRaw.msku_over_365, qty365: agRaw.qty_over_365,
      over270: agRaw.msku_270plus, qty270: agRaw.qty_270plus,
      topItems: (agRaw.top_items || []).map(t => ({ name: t[0], qty: t[1] })),
    } : null

    const l7 = fc['L7日均_USD'] || 0
    const sales = fc['USD_总销售额'] || 0
    const vsL7 = l7 > 0 ? ((sales - l7) / l7 * 100) : 0

    const report = {
      date: fc.date || '',
      sales: fmtMoney(sales),
      l7avg: fmtMoney(l7),
      vsL7: fmtPct(vsL7), vsL7Up: vsL7 >= 0,
      payback: fmtMoney(fc['回款_USD'] || 0),
      profit: fmtMoney(fc['毛利润_USD'] || 0),
      profitLoss: (fc['毛利润_USD'] || 0) < 0,
      profitPct: sales > 0 ? ((fc['毛利润_USD'] || 0) / sales * 100).toFixed(1) : '0.0',
      ads: fmtMoney(fc['广告_USD'] || 0),
    }

    this.setData({ selectedIdx: idx, report, operators, segments, aging })
  },

  onDatePick(e) {
    this.selectReport(Number(e.detail.value))
  },
})
