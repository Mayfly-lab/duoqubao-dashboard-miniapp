// 团队管理:产品类 → 类下人员(主责∪参与)→ 个人负责产品 → 产品利润时间轴。
// 组织职责视图:人头上显示主责毛利（P&L，与类/产品层级口径一致）。
// 个人毛利 = 主责产品 profit 汇总；月度时间轴来自 monthly_sales（P&L）。
// 日期筛选:月度销售额/毛利来自 monthly_sales（领星日粒度聚合到月）。
const api = require('../../utils/api.js')
const registry = require('../../data/registry.js')
const { lineOf } = require('../../utils/aggregate.js')

const FX = 6.8

function fmtMoney(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'
  return s + Math.round(a)
}
const fmtCny = n => { const a = Math.abs(n); const s = n < 0 ? '-¥' : '¥'; if (a >= 1e4) return s + (a / 1e4).toFixed(1) + '万'; return s + Math.round(a) }

Page({
  data: {
    generatedAt: api.generatedAt,
    categories: [],
    expandedLine: '', expandedPerson: '', expandedProduct: '',
    startYm: '', endYm: '', allMonths: [],
    loading: true, error: '', _lines: [],
  },

  onLoad() { this.fetch() },

  async fetch() {
    this.setData({ loading: true, error: '' })
    try {
      const [compare, timelines, pendingTimelines, paybacks, monthlySales] = await Promise.all([
        api.projectsCompare(),
        api.allTimelines(),
        api.allPendingTimelines(),
        api.allPaybacks(),
        api.monthlySalesByProduct(),
      ])
      this._timelines = timelines
      this._pendingTimelines = pendingTimelines
      this._monthlySales = monthlySales
      this._pbMap = {}
      paybacks.forEach(p => { this._pbMap[p.local_name] = p })

      // All unique months from timeline_payout + monthly_sales for the picker
      const monthSet = new Set()
      Object.values(timelines).forEach(arr => arr.forEach(m => monthSet.add(m.ym)))
      Object.values(monthlySales).forEach(arr => arr.forEach(m => monthSet.add(m.ym)))
      this._allMonths = Array.from(monthSet).sort()

      const byLine = {}
      compare.forEach(p => {
        const line = lineOf(p.local_name)
        const r = registry.byProduct[p.local_name]
        if (!r) return
        const sales = api.num(p.sales), profit = api.num(p.profit)
        const e = byLine[line] || (byLine[line] = { line, sales: 0, profit: 0, people: {}, productNames: [] })
        e.sales += sales; e.profit += profit
        e.productNames.push(p.local_name)
        const persons = [...new Set([r.owner, ...(r.joiners || [])].filter(Boolean))]
        persons.forEach(person => {
          const isOwner = person === r.owner
          const pe = e.people[person] || (e.people[person] = { name: person, products: [], ownCount: 0, joinCount: 0 })
          pe.products.push({ name: p.local_name, sales, profit, role: isOwner ? '主责' : '参与' })
          if (isOwner) { pe.ownCount++ } else { pe.joinCount++ }
        })
      })
      this.setData({ _lines: Object.values(byLine), allMonths: this._allMonths, loading: false })
      this.render()
    } catch (e) {
      this.setData({ loading: false, error: '加载失败：' + (e.message || e) })
    }
  },

  // Sum monthly_sales for one product within the date range; returns {s, p} in USD
  _filteredSales(name) {
    const { startYm, endYm } = this.data
    return ((this._monthlySales || {})[name] || [])
      .filter(m => (!startYm || m.ym >= startYm) && (!endYm || m.ym <= endYm))
      .reduce((acc, m) => ({ s: acc.s + m.s, p: acc.p + m.p }), { s: 0, p: 0 })
  },

  _buildProfitTimeline(name) {
    const { startYm, endYm } = this.data
    const inRange = ym => (!startYm || ym >= startYm) && (!endYm || ym <= endYm)
    const profit = {}
    ;((this._monthlySales || {})[name] || []).forEach(m => { if (inRange(m.ym)) profit[m.ym] = m.p || 0 })
    const yms = Object.keys(profit).sort()
    if (!yms.length) return null
    const k = v => Math.round((v || 0) / 100) / 10   // → $千(k),1 位小数
    return {
      type: 'column',
      categories: yms.map(y => y.slice(2)),
      series: [
        { name: '月度利润', data: yms.map(y => k(profit[y])), color: '#2b6cff' },
      ],
      background: '#ffffff',
      fontSize: 9,
      padding: [14, 12, 0, 6],
      legend: { show: true, fontColor: '#9aa6bc', fontSize: 9, padding: 4 },
      xAxis: { disableGrid: true, fontColor: '#9aa6bc', fontSize: 9, axisLineColor: '#edf0f5', rotateLabel: false, itemCount: 6, scrollShow: yms.length > 6, scrollPosition: 'right', scrollColor: '#2b6cff', scrollBackgroundColor: '#eef1f6' },
      yAxis: { gridType: 'dash', dashLength: 3, fontColor: '#9aa6bc', fontSize: 9, gridColor: '#edf0f5', splitNumber: 4 },
      extra: { column: { type: 'group', width: 12, seriesGap: 2, barBorderRadius: [4, 4, 0, 0], linearType: 'opacity', linearOpacity: 0.3, activeBgColor: '#000', activeBgOpacity: 0.04 }, tooltip: { showBox: true, bgColor: '#1f2a3c', fontColor: '#ffffff' } },
      enableScroll: yms.length > 6,
      dataLabel: false, animation: true,
    }
  },

  render() {
    const { expandedLine, expandedPerson, expandedProduct, startYm, endYm } = this.data
    const hasFilter = !!(startYm || endYm)

    const lines = this.data._lines.slice().sort((a, b) => b.sales - a.sales)
    const top = lines.length ? Math.max(...lines.map(L => {
      if (!hasFilter) return L.sales
      return (L.productNames || []).reduce((s, n) => s + this._filteredSales(n).s, 0)
    })) : 1

    const categories = lines.map(L => {
      const isLineExp = L.line === expandedLine

      // Line-level sales/profit: use monthly_sales when filter active
      let lineSales = L.sales, lineProfit = L.profit
      if (hasFilter) {
        lineSales = 0; lineProfit = 0
        ;(L.productNames || []).forEach(name => {
          const fs = this._filteredSales(name)
          lineSales += fs.s; lineProfit += fs.p
        })
      }

      // Only build people list for the expanded category
      const people = isLineExp
        ? Object.values(L.people)
          .sort((a, b) => (b.ownCount - a.ownCount) || (b.joinCount - a.joinCount))
          .map(pe => {
            const isPersonExp = pe.name === expandedPerson

            // Per-person profit — sum owned products' P&L (consistent with category/product levels)
            const ownedProds = pe.products.filter(p => p.role === '主责')
            const peProfit = hasFilter
              ? ownedProds.reduce((s, p) => s + this._filteredSales(p.name).p, 0)
              : ownedProds.reduce((s, p) => s + p.profit, 0)

            // Only build product detail for the expanded person
            const products = isPersonExp
              ? pe.products.slice().sort((a, b) => b.sales - a.sales).map(p => {
                  const prodKey = `${L.line}:${pe.name}:${p.name}`
                  const isProductExp = prodKey === expandedProduct
                  const hasProfitTimeline = ((this._monthlySales || {})[p.name] || []).length > 0

                  // Product sales/profit: use monthly_sales when filter active
                  const fs = hasFilter ? this._filteredSales(p.name) : null
                  const prodSales = hasFilter ? fs.s : p.sales
                  const prodProfit = hasFilter ? fs.p : p.profit

                  return {
                    name: p.name, role: p.role, isOwner: p.role === '主责',
                    key: prodKey, expanded: isProductExp,
                    salesText: fmtMoney(prodSales),
                    profitText: fmtMoney(prodProfit),
                    loss: prodProfit < 0,
                    chartOpts: isProductExp ? this._buildProfitTimeline(p.name) : null,
                    hasProfitTimeline,
                  }
                })
              : []

            return {
              name: pe.name, pcount: pe.products.length,
              ownCount: pe.ownCount, joinCount: pe.joinCount,
              personProfitText: fmtMoney(peProfit),
              personLoss: peProfit < 0,
              hasProfit: ownedProds.length > 0,
              expanded: isPersonExp,
              products,
            }
          })
        : []

      return {
        line: L.line, peopleCount: Object.keys(L.people).length,
        salesText: fmtMoney(lineSales), profitText: fmtMoney(lineProfit),
        marginPct: lineSales ? (lineProfit / lineSales * 100).toFixed(1) : '0.0',
        loss: lineProfit < 0, barWidth: Math.max(4, Math.round(lineSales / top * 100)),
        expanded: isLineExp, people,
      }
    })
    this.setData({ categories })
  },

  onStartPick(e) {
    const startYm = this._allMonths[e.detail.value] || ''
    this.setData({ startYm }, () => this.render())
  },
  onEndPick(e) {
    const endYm = this._allMonths[e.detail.value] || ''
    this.setData({ endYm }, () => this.render())
  },
  onClearFilter() {
    this.setData({ startYm: '', endYm: '' }, () => this.render())
  },

  onCatTap(e) {
    const line = e.currentTarget.dataset.line
    const same = this.data.expandedLine === line
    this.setData({ expandedLine: same ? '' : line, expandedPerson: '', expandedProduct: '' }, () => this.render())
  },
  onPersonTap(e) {
    const name = e.currentTarget.dataset.name
    const same = this.data.expandedPerson === name
    this.setData({ expandedPerson: same ? '' : name, expandedProduct: '' }, () => this.render())
  },
  onProductTap(e) {
    const key = e.currentTarget.dataset.key
    const same = this.data.expandedProduct === key
    this.setData({ expandedProduct: same ? '' : key }, () => this.render())
  },
})
