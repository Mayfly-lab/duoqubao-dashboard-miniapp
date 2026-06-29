const api = require('../../utils/api.js')
const SNAP = require('../../data/api_snapshot.js')

function fmtMoney(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'
  return s + Math.round(a)
}

Page({
  data: {
    generatedAt: api.generatedAt,
    dates: [],          // available dates for picker ["2026-06-27", ...]
    selectedIdx: 0,
    employees: [],      // 渲染用:每人默认只显示第一条,点 header 展开看全部
    kpi: null,          // company-level KPI for the day (collapsed by default)
    kpiExpanded: false,
    loading: true, error: '',
  },

  onLoad() { this.build() },

  build() {
    const checkins = SNAP.checkin_actions || []
    const reports = SNAP.daily_reports || []

    if (!checkins.length && !reports.length) {
      this.setData({ loading: false, error: '快照中暂无日报数据，请重新运行 fetch_snapshot.py' })
      return
    }

    const dateSet = new Set(checkins.map(c => c.date || c.created_at?.slice(0, 10) || '').filter(Boolean))
    reports.forEach(r => {
      const d = (r.full_content || {}).date || r.pushed_at?.slice(0, 10) || ''
      if (d) dateSet.add(d)
    })
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a))

    this._reportMap = {}
    reports.forEach(r => {
      const d = (r.full_content || {}).date || r.pushed_at?.slice(0, 10) || ''
      if (d && !this._reportMap[d]) this._reportMap[d] = r.full_content || {}
    })

    this._checkinMap = {}
    checkins.forEach(c => {
      const d = c.date || c.created_at?.slice(0, 10) || ''
      if (!d) return
      if (!this._checkinMap[d]) this._checkinMap[d] = {}
      const name = c.name || c.open_id
      if (!this._checkinMap[d][name]) this._checkinMap[d][name] = []
      this._checkinMap[d][name].push(c)
    })

    this.setData({ dates, loading: false }, () => {
      this.selectDate(0)
    })
  },

  selectDate(idx) {
    const date = this.data.dates[idx]
    if (!date) return

    const byPerson = this._checkinMap[date] || {}
    // 每人完整行动列表,缓存到 this._employees;展开态每次切日期清空
    this._employees = Object.entries(byPerson)
      .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
      .map(([name, actions]) => ({
        name,
        count: actions.length,
        pendingCount: actions.filter(a => a.follow_up === '待跟进').length,
        allActions: actions.map(a => ({
          category: a.category,
          summary: a.summary,
          description: a.description || '',
          follow_up: a.follow_up,
          product: a.product || '',
        })),
      }))
    this._expanded = {}

    const fc = this._reportMap[date] || {}
    const sales = fc['USD_总销售额'] || 0
    const kpi = sales > 0 ? {
      date,
      sales: fmtMoney(sales),
      payback: fmtMoney(fc['回款_USD'] || 0),
      profit: fmtMoney(fc['毛利润_USD'] || 0),
      profitLoss: (fc['毛利润_USD'] || 0) < 0,
      profitPct: ((fc['毛利润_USD'] || 0) / sales * 100).toFixed(1),
    } : null

    this.setData({ selectedIdx: idx, kpi, kpiExpanded: false }, () => this.renderEmployees())
  },

  // 默认每人只显示第一条;展开则全部。点击 header 切换。
  renderEmployees() {
    const employees = (this._employees || []).map(e => {
      const expanded = !!this._expanded[e.name]
      return {
        name: e.name, count: e.count, pendingCount: e.pendingCount,
        expanded,
        actions: expanded ? e.allActions : e.allActions.slice(0, 1),
        moreCount: e.count > 1 ? e.count - 1 : 0,
      }
    })
    this.setData({ employees })
  },

  onToggleEmp(e) {
    const name = e.currentTarget.dataset.name
    this._expanded[name] = !this._expanded[name]
    this.renderEmployees()
  },

  onDatePick(e) {
    this.selectDate(Number(e.detail.value))
  },

  onToggleKpi() {
    this.setData({ kpiExpanded: !this.data.kpiExpanded })
  },
})
