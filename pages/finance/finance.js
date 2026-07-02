// 老板总览(个人工具·只老板视角):全公司整体盈亏 + 产品类对比(折叠/筛选) + 待关注(折叠/筛选)。
const api = require('../../utils/api.js')
const { groupByCategory, procurementByModel, lineUnitCostMap, unitCostOf, realProfitUsd } = require('../../utils/aggregate.js')
const registry = require('../../data/registry.js')
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
const FX = 7.16                                   // USD→CNY(与类页/时间轴口径一致)
const fmtCny = n => { const a = Math.abs(n), s = n < 0 ? '-¥' : '¥'; return a >= 1e4 ? s + (a / 1e4).toFixed(0) + '万' : s + Math.round(a) }

Page({
  data: {
    generatedAt: api.generatedAt,
    kpi: {}, fund: {}, inv: {}, sales: {}, opexMod: {}, pnlExpanded: true,
    cashDetail: [], oweSuppliers: [], fundSeg: '', expandedSupplier: '',
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
      const [rows, plist, payback, opexCompany, capital, payable, procurement, inventory, reports, profitBase, unitRows, cashAccounts, outstanding] = await Promise.all([
        api.projectsCompare(), api.projectsList(), api.dash('payback'), api.dash('opex_company'),
        api.capital(), api.payableTotal(), api.dash('procurement'), api.dash('inventory'), api.dailyReports(),
        api.profitBase(), api.lineUnitCostRows(), api.cashAccounts(), api.outstandingDetail(),
      ])
      const [invAge, refund] = await Promise.all([api.invAge(), api.dash('refund')])
      this._profitBase = profitBase
      this._unitMap = lineUnitCostMap(unitRows)
      this._cashAccounts = cashAccounts || []
      this._outstanding = outstanding || []
      this._invAge = invAge || []
      this._refund = refund || []
      this._procurement = procurement
      this._opexCompany = opexCompany || []
      this._opexCompanyTotal = this._opexCompany.reduce((s, r) => s + api.num(r.amount_cny), 0)
      this._capital = capital
      this._payable = payable
      this._inventory = inventory || []
      this._reports = reports || []
      const skuMap = {}
      plist.forEach(p => { skuMap[p.local_name] = p.sku_count })
      // 真实毛利:每个产品的 profit 直接替换成"合同成本修正后"的真实毛利,KPI/类聚合自动变真实
      const baseMap = {}; (profitBase || []).forEach(b => { baseMap[b.local_name] = b })
      const realOf = name => {
        const b = baseMap[name]
        return b ? realProfitUsd(b, unitCostOf(this._unitMap, name), FX) : null
      }
      const raw = rows.map(p => {
        const lxProfit = api.num(p.profit)
        const real = realOf(p.local_name)
        const profit = real != null ? real : lxProfit
        const sales = api.num(p.sales)
        return {
          local_name: p.local_name,
          sales, profit, lxProfit, ad_cost: api.num(p.ad_cost),
          margin_pct: sales ? (profit / sales * 100) : 0, acos_pct: api.num(p.acos_pct),
          sku_count: skuMap[p.local_name] || '',
        }
      })
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
    const profit = list.reduce((s, p) => s + p.profit, 0)        // 真实毛利(已修正)
    const lxProfit = list.reduce((s, p) => s + (p.lxProfit != null ? p.lxProfit : p.profit), 0)  // 领星原值
    const adCost = list.reduce((s, p) => s + p.ad_cost, 0)
    const hasReal = Math.abs(lxProfit - profit) > 1
    // 净利(公司级,CNY):真实毛利换汇 − 公司全量运营费
    const grossCny = profit * FX
    const opexCny = this._opexCompanyTotal || 0
    const netCny = grossCny - opexCny
    // 全页统一人民币(领星美元 ×FX)。毛利=真实毛利(合同成本修正)
    const kpi = {
      sales: fmtCny(sales * FX), profit: fmtCny(profit * FX),
      marginPct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
      acosPct: sales ? (adCost / sales * 100).toFixed(1) : '0.0',
      netText: fmtCny(netCny), netLoss: netCny < 0,
      grossCnyText: fmtCny(grossCny), opexCnyText: fmtCny(opexCny),
      hasReal,
      lxMarginPct: sales ? (lxProfit / sales * 100).toFixed(1) : '0.0',   // 领星虚高
      correctionText: fmtCny((lxProfit - profit) * FX),                   // 挤掉的虚高额
    }
    // ── 资金卡(现金流核心):能拿回(现金+待回) vs 欠厂应付线 → 可动用 ──
    const cap = this._capital || []
    const N = api.num
    const cashCny = cap.reduce((s, r) => s + N(r.cash_cny), 0)
    const pendingCny = cap.reduce((s, r) => s + N(r.pending_usd), 0) * FX   // 待回款(在路上)
    const recoverCny = cashCny + pendingCny                                  // 能拿回(最乐观)
    const oweCny = (this._outstanding || []).reduce((s, r) => s + N(r.owe), 0) || N((this._payable || {}).owe_cny)
    const deployCny = recoverCny - oweCny                                    // 可动用(越过应付线)
    const stockCny = cap.reduce((s, r) => s + N(r.stock_usd), 0) * FX
    const transitCny = cap.reduce((s, r) => s + N(r.transit_usd), 0) * FX
    const stockQty = cap.reduce((s, r) => s + N(r.stock_qty), 0)
    const denom = recoverCny || 1
    const fund = {
      cashText: fmtCny(cashCny), pendingText: fmtCny(pendingCny), recoverText: fmtCny(recoverCny),
      oweText: fmtCny(oweCny), deployText: fmtCny(Math.abs(deployCny)), deployNeg: deployCny < 0,
      cashPct: +(cashCny / denom * 100).toFixed(2),
      pendPct: +(pendingCny / denom * 100).toFixed(2),
      owePct: +Math.min(100, oweCny / denom * 100).toFixed(2),   // 应付线位置
      healthy: cashCny >= oweCny,                                // 光现金盖得住应付=健康
      // 货值(库存卡复用)
      stock: fmtCny(stockCny), transit: fmtCny(transitCny), goods: fmtCny(stockCny + transitCny),
      stockQty: stockQty.toLocaleString('en-US'),
    }
    // 现金明细(点现金段):账户
    const cashMax = Math.max(...(this._cashAccounts || []).map(a => N(a.cny)), 1)
    const cashDetail = (this._cashAccounts || []).slice().sort((a, b) => N(b.cny) - N(a.cny)).map(a => ({
      account: a.account, company: a.company, ccy: a.ccy,
      cnyText: fmtCny(N(a.cny)), pct: Math.max(3, Math.round(N(a.cny) / cashMax * 100)),
    }))
    // 欠厂供应商明细(点欠厂段):按供应商聚合 + 合同(产品)
    const supMap = {}
    ;(this._outstanding || []).forEach(r => {
      if (N(r.owe) <= 0) return
      const s = supMap[r.supplier] || (supMap[r.supplier] = { supplier: r.supplier, owe: 0, amt: 0, contracts: [] })
      s.owe += N(r.owe); s.amt += N(r.amt)
      s.contracts.push({ nm: r.product, amtText: fmtCny(N(r.amt)), oweText: fmtCny(N(r.owe)), _owe: N(r.owe) })
    })
    const supList = Object.values(supMap).sort((a, b) => b.owe - a.owe)
    const supMax = supList.length ? supList[0].owe : 1
    const oweSuppliers = supList.map(s => ({
      supplier: s.supplier, oweText: fmtCny(s.owe), amtText: fmtCny(s.amt),
      pct: Math.max(4, Math.round(s.owe / supMax * 100)),
      contracts: s.contracts.sort((a, b) => b._owe - a._owe).slice(0, 20),
    }))
    // ── 库存卡(公司级):货值 + 现货/在途 + 库龄分档(超90天越深) ──
    const ageRows = this._invAge || []
    const aSum = k => ageRows.reduce((s, r) => s + N(r[k]), 0)
    const xianhuo = aSum('xianhuo'), zaitu = aSum('zaitu')
    const healthy = aSum('healthy'), a91 = aSum('a91'), a181 = aSum('a181'), a271 = aSum('a271'), a365 = aSum('a365')
    const totalAge = healthy + a91 + a181 + a271 + a365 || 1
    const stale = a91 + a181 + a271 + a365   // 超90天(压资金)
    // 滞销超龄:每档单独一行横条,越久越深(相对最大档填充);365+ 高亮
    const maxStale = Math.max(a91, a181, a271, a365, 1)
    const staleBars = [
      { label: '91-180 天', qty: a91, cls: 'age-1' },
      { label: '181-270 天', qty: a181, cls: 'age-2' },
      { label: '271-365 天', qty: a271, cls: 'age-3' },
      { label: '365 天+', qty: a365, cls: 'age-4', warn: true },
    ].map(b => ({ ...b, qtyText: b.qty.toLocaleString('en-US'), pct: Math.max(2, Math.round(b.qty / maxStale * 100)) }))
    const inv = {
      goods: fund.goods, stockValue: fund.stock, transitValue: fund.transit,
      xianhuo: xianhuo.toLocaleString('en-US'), zaitu: zaitu.toLocaleString('en-US'),
      staleBars, healthyText: healthy.toLocaleString('en-US'),
      staleQty: stale.toLocaleString('en-US'), stalePct: +(stale / totalAge * 100).toFixed(0),
      age365Text: a365.toLocaleString('en-US'),
    }
    // ── 销售卡(公司级):销售额/销量/毛利率/退款率/广告TAcos + 按部门(复用开头 sales/profit/adCost) ──
    const qtyAll = (this._profitBase || []).reduce((s, b) => s + N(b.qty), 0)
    const refundUsd = (this._refund || []).reduce((s, r) => s + Math.abs(N(r.refund_amount != null ? r.refund_amount : r.refund)), 0)
    const deptAgg = { 多趣: { s: 0, p: 0 }, 格致: { s: 0, p: 0 } }
    list.forEach(p => { const d = (registry.byProduct[p.local_name] || {}).dept; if (deptAgg[d]) { deptAgg[d].s += p.sales; deptAgg[d].p += p.profit } })
    const salesCard = {
      salesText: fmtCny(sales * FX), qty: Math.round(qtyAll).toLocaleString('en-US'),
      marginPct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
      tacosPct: sales ? (adCost / sales * 100).toFixed(1) : '0.0',
      refundPct: (sales && refundUsd) ? (refundUsd / sales * 100).toFixed(1) : null,
      depts: ['多趣', '格致'].map(d => ({
        name: d, salesText: fmtCny(deptAgg[d].s * FX),
        marginPct: deptAgg[d].s ? (deptAgg[d].p / deptAgg[d].s * 100).toFixed(1) : '0.0',
        loss: deptAgg[d].p < 0,
      })),
    }
    // ── 经营费用模块:运营费用类目(opex 公司级·真账) + 滞销费/报销(待补·先搭UI) ──
    const opexRows = (this._opexCompany || []).slice().sort((a, b) => N(b.amount_cny) - N(a.amount_cny))
    const opexMax = opexRows.length ? N(opexRows[0].amount_cny) : 1
    const opexMod = {
      total: fmtCny(this._opexCompanyTotal || 0),
      items: opexRows.slice(0, 8).map(o => ({
        category: o.category, costText: fmtCny(N(o.amount_cny)),
        barWidth: Math.max(6, Math.round(N(o.amount_cny) / opexMax * 100)),
      })),
      reimburse: '待补', // 报销依赖员工填报,先占位
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
    this.setData({ kpi, fund, inv, sales: salesCard, opexMod, cashDetail, oweSuppliers, rawCategories, rawAlerts, expandedLine: '' })
    this.renderAlerts()
    this.renderCats()
  },

  // ── 资金卡下钻:点段(现金/待回/欠厂/可动用)展开明细;欠厂再点供应商看合同 ──
  onFundSeg(e) {
    const seg = e.currentTarget.dataset.seg
    this.setData({ fundSeg: this.data.fundSeg === seg ? '' : seg, expandedSupplier: '' })
  },
  onSupplierTap(e) {
    const s = e.currentTarget.dataset.supplier
    this.setData({ expandedSupplier: this.data.expandedSupplier === s ? '' : s })
  },
  onFundClose() { this.setData({ fundSeg: '', expandedSupplier: '' }) },

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
