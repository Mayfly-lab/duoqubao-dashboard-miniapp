// 老板总览(个人工具·只老板视角):全公司整体盈亏 + 产品类对比(折叠/筛选) + 待关注(折叠/筛选)。
const api = require('../../utils/api.js')
const { groupByCategory } = require('../../utils/aggregate.js')
const { detect } = require('../../utils/alerts.js')

const ALERT_FILTERS = [
  { label: '全部', value: 'all' }, { label: '亏损', value: '亏损' },
  { label: '低毛利', value: '低毛利' }, { label: 'ACOS高', value: 'ACOS高' },
]
const CAT_FILTERS = [
  { label: '全部', value: 'all' }, { label: '盈利', value: 'profit' }, { label: '亏损', value: 'loss' },
]

function fmtMoney(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'
  return s + Math.round(a)
}
const FX = 6.8                                   // USD→CNY(与类页/时间轴口径一致)
const fmtCny = n => { const a = Math.abs(n), s = n < 0 ? '-¥' : '¥'; return a >= 1e4 ? s + (a / 1e4).toFixed(0) + '万' : s + Math.round(a) }

Page({
  data: {
    generatedAt: api.generatedAt,
    kpi: {},
    alerts: [], alertTotal: 0, alertFilter: 'all', alertFilters: ALERT_FILTERS, showAllAlerts: false,
    categories: [], catTotal: 0, catFilter: 'all', catFilters: CAT_FILTERS, showAllCats: false, expandedLine: '',
    loading: true, error: '',
    rawProducts: [], _payback: [], rawCategories: [], rawAlerts: [],
  },

  onLoad() { this.fetch() },
  onShow() { if (this.data.rawProducts.length) this.render() },

  async fetch() {
    this.setData({ loading: true, error: '' })
    try {
      const [rows, plist, payback, opexCompany] = await Promise.all([
        api.projectsCompare(), api.projectsList(), api.dash('payback'), api.dash('opex_company'),
      ])
      this._opexCompanyTotal = (opexCompany || []).reduce((s, r) => s + api.num(r.amount_cny), 0)
      const skuMap = {}
      plist.forEach(p => { skuMap[p.local_name] = p.sku_count })
      const raw = rows.map(p => ({
        local_name: p.local_name,
        sales: api.num(p.sales), profit: api.num(p.profit), ad_cost: api.num(p.ad_cost),
        margin_pct: api.num(p.margin_pct), acos_pct: api.num(p.acos_pct),
        sku_count: skuMap[p.local_name] || '',
      }))
      this.setData({ rawProducts: raw, _payback: payback, loading: false })
      this.render()
    } catch (e) {
      this.setData({ loading: false, error: '数据加载失败：' + (e.message || e) })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  render() {
    const list = this.data.rawProducts
    const sales = list.reduce((s, p) => s + p.sales, 0)
    const profit = list.reduce((s, p) => s + p.profit, 0)
    const adCost = list.reduce((s, p) => s + p.ad_cost, 0)
    // 净利(公司级,CNY):毛利换汇 − 公司全量运营费(opex 公司级总额,无归属偏漏问题,只在「全公司」层可这么算)
    const grossCny = profit * FX
    const opexCny = this._opexCompanyTotal || 0
    const netCny = grossCny - opexCny
    // 全页统一人民币(领星美元 ×FX),与净利/类页同币种
    const kpi = {
      sales: fmtCny(sales * FX), profit: fmtCny(profit * FX),
      marginPct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
      acosPct: sales ? (adCost / sales * 100).toFixed(1) : '0.0',
      netText: fmtCny(netCny), netLoss: netCny < 0,
      grossCnyText: fmtCny(grossCny), opexCnyText: fmtCny(opexCny),
    }
    const cats = groupByCategory(list, this.data._payback)
    const top = cats.length ? Math.max(...cats.map(c => c.sales)) : 1
    const rawCategories = cats.map(c => ({
      line: c.line, count: c.count, sales: c.sales, profit: c.profit,
      salesText: fmtCny(c.sales * FX), profitText: fmtCny(c.profit * FX),
      marginPct: c.margin_pct.toFixed(1),
      realizedText: fmtCny(c.realized * FX), pendingText: fmtCny(c.pending * FX),
      loss: c.profit < 0,
      barWidth: Math.max(4, Math.round(c.sales / top * 100)),
    }))
    const rawAlerts = detect(list)
    this.setData({ kpi, rawCategories, rawAlerts, expandedLine: '' })
    this.renderAlerts()
    this.renderCats()
  },

  // ── 待关注:筛选 + 折叠 ──
  renderAlerts() {
    const f = this.data.alertFilter
    let list = this.data.rawAlerts
    if (f !== 'all') list = list.filter(a => a.tag === f)
    const shown = this.data.showAllAlerts ? list : list.slice(0, 3)
    this.setData({ alerts: shown, alertTotal: list.length })
  },
  onAlertFilterChange(e) { this.setData({ alertFilter: e.detail.value, showAllAlerts: false }, () => this.renderAlerts()) },
  onToggleAlerts() { this.setData({ showAllAlerts: !this.data.showAllAlerts }, () => this.renderAlerts()) },
  onAlertTap(e) { wx.navigateTo({ url: '/pages/project/project?name=' + encodeURIComponent(e.currentTarget.dataset.name) }) },

  // ── 产品类:筛选 + 折叠 + 展开 ──
  renderCats() {
    const f = this.data.catFilter
    let list = this.data.rawCategories
    if (f === 'profit') list = list.filter(c => !c.loss)
    else if (f === 'loss') list = list.filter(c => c.loss)
    const total = list.length
    let shown = this.data.showAllCats ? list : list.slice(0, 8)
    shown = shown.map(c => ({ ...c, expanded: c.line === this.data.expandedLine }))
    this.setData({ categories: shown, catTotal: total })
  },
  onCatFilterChange(e) { this.setData({ catFilter: e.detail.value, showAllCats: false, expandedLine: '' }, () => this.renderCats()) },
  onToggleCats() { this.setData({ showAllCats: !this.data.showAllCats }, () => this.renderCats()) },
  onCatTap(e) {
    const line = e.currentTarget.dataset.line
    this.setData({ expandedLine: this.data.expandedLine === line ? '' : line }, () => this.renderCats())
  },
  onEnterCategory(e) {
    wx.navigateTo({ url: '/pages/category/category?line=' + encodeURIComponent(e.currentTarget.dataset.line) })
  },
})
