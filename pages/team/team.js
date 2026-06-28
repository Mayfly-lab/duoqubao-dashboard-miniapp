// 团队管理:产品类 → 类下人员(主责∪参与)→ 个人负责产品 → 产品生命周期时间轴。
// 组织职责视图:人头上不挂毛利/费用(opex 无产品列·无人字段,拆不到个人)。
// 个人回款 = 主责产品 payback 汇总；月度时间轴来自 timeline_payout。
// 性能:只渲染当前展开层的完整数据，避免 setData 超载导致 timeout。
const api = require('../../utils/api.js')
const registry = require('../../data/registry.js')
const { lineOf } = require('../../utils/aggregate.js')

function fmtMoney(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$'
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'
  return s + Math.round(a)
}

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
      const [compare, timelines, paybacks] = await Promise.all([
        api.projectsCompare(),
        api.allTimelines(),
        api.allPaybacks(),
      ])
      // Instance vars — not reactive, avoids setData cost
      this._timelines = timelines
      this._pbMap = {}
      paybacks.forEach(p => { this._pbMap[p.local_name] = p })

      // Collect all unique months across all products for the picker
      const monthSet = new Set()
      Object.values(timelines).forEach(arr => arr.forEach(m => monthSet.add(m.ym)))
      this._allMonths = Array.from(monthSet).sort()

      const byLine = {}
      compare.forEach(p => {
        const line = lineOf(p.local_name)
        const r = registry.byProduct[p.local_name]
        if (!r) return
        const sales = api.num(p.sales), profit = api.num(p.profit)
        const e = byLine[line] || (byLine[line] = { line, sales: 0, profit: 0, people: {} })
        e.sales += sales; e.profit += profit
        const persons = [...new Set([r.owner, ...(r.joiners || [])].filter(Boolean))]
        persons.forEach(person => {
          const isOwner = person === r.owner
          const pe = e.people[person] || (e.people[person] = { name: person, products: [], ownCount: 0, joinCount: 0 })
          pe.products.push({ name: p.local_name, sales, role: isOwner ? '主责' : '参与' })
          if (isOwner) { pe.ownCount++ } else { pe.joinCount++ }
        })
      })
      this.setData({ _lines: Object.values(byLine), allMonths: this._allMonths, loading: false })
      this.render()
    } catch (e) {
      this.setData({ loading: false, error: '加载失败：' + (e.message || e) })
    }
  },

  _buildTimeline(name) {
    const { startYm, endYm } = this.data
    let months = (this._timelines || {})[name] || []
    if (!months.length) return []
    if (startYm) months = months.filter(m => m.ym >= startYm)
    if (endYm) months = months.filter(m => m.ym <= endYm)
    if (!months.length) return []
    const maxAbs = Math.max(...months.map(m => Math.abs(api.num(m.payout_usd))), 1)
    return months.map(m => {
      const v = api.num(m.payout_usd)
      const h = Math.round(Math.abs(v) / maxAbs * 52)
      return { ym: m.ym, label: m.ym.slice(5), positive: v >= 0, posH: v >= 0 ? h : 0, negH: v < 0 ? h : 0 }
    })
  },

  render() {
    const { expandedLine, expandedPerson, expandedProduct, startYm, endYm } = this.data
    const pbMap = this._pbMap || {}
    const timelines = this._timelines || {}
    const hasFilter = !!(startYm || endYm)

    // Sum payout_usd within the selected date range for one product
    const filteredPayout = name => (timelines[name] || [])
      .filter(m => (!startYm || m.ym >= startYm) && (!endYm || m.ym <= endYm))
      .reduce((s, m) => s + api.num(m.payout_usd), 0)
    const lines = this.data._lines.slice().sort((a, b) => b.sales - a.sales)
    const top = lines.length ? Math.max(...lines.map(L => L.sales)) : 1

    const categories = lines.map(L => {
      const isLineExp = L.line === expandedLine

      // Only build people list for the expanded category
      const people = isLineExp
        ? Object.values(L.people)
          .sort((a, b) => (b.ownCount - a.ownCount) || (b.joinCount - a.joinCount))
          .map(pe => {
            const isPersonExp = pe.name === expandedPerson

            // Per-person payback aggregate — use date-filtered timeline when filter active
            const ownedNames = pe.products.filter(p => p.role === '主责').map(p => p.name)
            const peRealized = hasFilter
              ? ownedNames.reduce((s, n) => s + filteredPayout(n), 0)
              : ownedNames.reduce((s, n) => s + api.num((pbMap[n] || {}).realized_usd), 0)
            const pePending = hasFilter ? 0
              : ownedNames.reduce((s, n) => s + api.num((pbMap[n] || {}).pending_usd), 0)

            // Only build product detail for the expanded person
            const products = isPersonExp
              ? pe.products.slice().sort((a, b) => b.sales - a.sales).map(p => {
                  const prodKey = `${L.line}:${pe.name}:${p.name}`
                  const isProductExp = prodKey === expandedProduct
                  const pb = pbMap[p.name] || {}
                  const hasTimeline = (timelines[p.name] || []).length > 0
                  const hasPayback = api.num(pb.realized_usd) > 0 || api.num(pb.pending_usd) > 0
                  // When filter active: realized = filtered timeline sum; pending/locked = all-time
                  const realized = isProductExp
                    ? (hasFilter ? filteredPayout(p.name) : api.num(pb.realized_usd))
                    : 0
                  const pending = isProductExp && !hasFilter ? api.num(pb.pending_usd) : 0
                  const locked = isProductExp && !hasFilter ? api.num(pb.locked_usd) : 0
                  return {
                    name: p.name, role: p.role, isOwner: p.role === '主责',
                    key: prodKey, expanded: isProductExp,
                    realized: isProductExp ? fmtMoney(realized) : '',
                    pending: isProductExp && !hasFilter ? fmtMoney(pending) : '',
                    locked: isProductExp && !hasFilter ? fmtMoney(locked) : '',
                    hasPayback, hasLocked: isProductExp && !hasFilter && locked > 0,
                    timeline: isProductExp ? this._buildTimeline(p.name) : [],
                    hasTimeline,
                  }
                })
              : []

            return {
              name: pe.name, pcount: pe.products.length,
              ownCount: pe.ownCount, joinCount: pe.joinCount,
              personRealized: fmtMoney(peRealized), personPending: fmtMoney(pePending),
              hasPayback: peRealized > 0 || pePending > 0,
              filterActive: hasFilter,
              expanded: isPersonExp,
              products,
            }
          })
        : []

      return {
        line: L.line, peopleCount: Object.keys(L.people).length,
        salesText: fmtMoney(L.sales), profitText: fmtMoney(L.profit),
        marginPct: L.sales ? (L.profit / L.sales * 100).toFixed(1) : '0.0',
        loss: L.profit < 0, barWidth: Math.max(4, Math.round(L.sales / top * 100)),
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
