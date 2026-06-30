// 老板总览(个人工具·只老板视角):全公司整体盈亏 + 产品类对比(折叠/筛选) + 待关注(折叠/筛选)。
const api = require('../../utils/api.js')
const { groupByCategory, procurementByModel } = require('../../utils/aggregate.js')
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
    kpi: {}, fund: {}, pnlExpanded: false,
    alerts: [], alertTotal: 0, alertFilter: 'all', alertFilters: ALERT_FILTERS, showAllAlerts: false,
    categories: [], catTotal: 0, catFilter: 'all', catFilters: CAT_FILTERS, showAllCats: false, expandedLine: '',
    loading: true, error: '',
    rawProducts: [], _payback: [], rawCategories: [], rawAlerts: [],
  },

  onLoad() { this.fetch() },
  onTogglePnl() { this.setData({ pnlExpanded: !this.data.pnlExpanded }) },
  onShow() { if (this.data.rawProducts.length) this.render() },

  async fetch() {
    this.setData({ loading: true, error: '' })
    try {
      const [rows, plist, payback, opexCompany, capital, payable, procurement] = await Promise.all([
        api.projectsCompare(), api.projectsList(), api.dash('payback'), api.dash('opex_company'),
        api.capital(), api.payableTotal(), api.dash('procurement'),
      ])
      this._procurement = procurement
      this._opexCompanyTotal = (opexCompany || []).reduce((s, r) => s + api.num(r.amount_cny), 0)
      this._capital = capital
      this._payable = payable
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
    // ── 公司资金预览(翰毅:钱和货最重要,放最前) ──
    const cap = this._capital || []
    const N = api.num
    const cashCny = cap.reduce((s, r) => s + N(r.cash_cny), 0)
    const pendingCny = cap.reduce((s, r) => s + N(r.pending_usd), 0) * FX   // 卡着没回(待回款)
    const oweCny = N((this._payable || {}).owe_cny)                          // 还要付(欠厂)
    const stockCny = cap.reduce((s, r) => s + N(r.stock_usd), 0) * FX        // 在库货值
    const transitCny = cap.reduce((s, r) => s + N(r.transit_usd), 0) * FX    // 在途货值
    const stockQty = cap.reduce((s, r) => s + N(r.stock_qty), 0)
    const fund = {
      cash: fmtCny(cashCny),
      pending: fmtCny(pendingCny),
      owe: fmtCny(oweCny),
      stock: fmtCny(stockCny),
      stockQty: stockQty.toLocaleString('en-US'),
      transit: fmtCny(transitCny),
      goods: fmtCny(stockCny + transitCny),   // 货:在库+在途货值
    }
    const cats = groupByCategory(list, this.data._payback)
    const top = cats.length ? Math.max(...cats.map(c => c.sales)) : 1
    const rawCategories = cats.map(c => ({
      line: c.line, count: c.count, sales: c.sales, profit: c.profit, products: c.products,
      salesText: fmtCny(c.sales * FX), profitText: fmtCny(c.profit * FX),
      marginPct: c.margin_pct.toFixed(1),
      realizedText: fmtCny(c.realized * FX), pendingText: fmtCny(c.pending * FX),
      loss: c.profit < 0,
      barWidth: Math.max(4, Math.round(c.sales / top * 100)),
    }))
    const rawAlerts = detect(list)
    this.setData({ kpi, fund, rawCategories, rawAlerts, expandedLine: '' })
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
    shown = shown.map(c => ({
      ...c,
      expanded: c.line === this.data.expandedLine,
      bars: c.line === this.data.expandedLine ? this.buildLineBars(c) : [],
    }))
    this.setData({ categories: shown, catTotal: total })
  },

  // 每产品双进度条(参照经营驾驶舱·资金体检):能拿回=已到账+待回款 / 要付=欠厂。同比例尺。
  buildLineBars(cat) {
    const N = api.num
    const pbMap = {}; (this.data._payback || []).forEach(p => { pbMap[p.local_name] = p })
    const byModel = procurementByModel(this._procurement || [], cat.line).byModel || {}
    const prods = (cat.products || []).map(name => {
      const pb = pbMap[name] || {}
      const realizedCny = N(pb.realized_usd) * FX
      const pendingCny = N(pb.pending_usd) * FX
      const oweCny = (byModel[name] || {}).outstanding || 0
      return { name, realizedCny, pendingCny, oweCny, recover: realizedCny + pendingCny }
    }).filter(p => p.recover > 0 || p.oweCny > 0)
    const scale = Math.max(1, ...prods.map(p => Math.max(p.recover, p.oweCny)))
    return prods.sort((a, b) => b.recover - a.recover).map(p => ({
      name: p.name,
      realizedText: fmtCny(p.realizedCny), pendingText: fmtCny(p.pendingCny),
      oweText: fmtCny(p.oweCny), recoverText: fmtCny(p.recover),
      realizedW: p.realizedCny > 0 ? Math.max(2, Math.round(p.realizedCny / scale * 100)) : 0,
      pendingW: p.pendingCny > 0 ? Math.max(3, Math.round(p.pendingCny / scale * 100)) : 0,
      oweW: p.oweCny > 0 ? Math.max(3, Math.round(p.oweCny / scale * 100)) : 0,
      covered: p.recover >= p.oweCny,           // 能拿回是否盖住要付
      hasOwe: p.oweCny > 0,
    }))
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
