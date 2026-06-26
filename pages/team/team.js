// 团队管理(老板个人工具·无角色切换):产品类 → 类下人员(主责∪参与)→ 个人负责产品 + 费用动作。
// 团队按「产品类」组织(不再按部门)。个人毛利只计主责;费用动作 opex(全期·型号级偏漏)。
const api = require('../../utils/api.js')
const registry = require('../../data/registry.js')
const { lineOf } = require('../../utils/aggregate.js')

function fmtMoney(n) { const a = Math.abs(n), s = n < 0 ? '-$' : '$'; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'; return s + Math.round(a) }
const fmtCny = n => { const a = Math.abs(n); if (a >= 1e8) return '¥' + (a / 1e8).toFixed(2) + '亿'; if (a >= 1e4) return '¥' + (a / 1e4).toFixed(1) + '万'; return '¥' + Math.round(a) }

Page({
  data: {
    generatedAt: api.generatedAt,
    categories: [], expandedLine: '', expandedPerson: '', loading: true, error: '', _lines: [],
  },
  onLoad() { this.fetch() },

  async fetch() {
    this.setData({ loading: true, error: '' })
    try {
      const compare = await api.projectsCompare()
      const names = compare.map(p => p.local_name)
      const opexList = await Promise.all(names.map(n => api.projectOpex(n)))
      const opexBy = {}
      names.forEach((n, i) => { opexBy[n] = opexList[i] })

      const byLine = {}
      compare.forEach(p => {
        const line = lineOf(p.local_name)
        const r = registry.byProduct[p.local_name]
        if (!r) return
        const sales = api.num(p.sales), profit = api.num(p.profit)
        const e = byLine[line] || (byLine[line] = { line, sales: 0, profit: 0, people: {} })
        e.sales += sales; e.profit += profit
        const opex = opexBy[p.local_name] || []
        const persons = [...new Set([r.owner, ...(r.joiners || [])].filter(Boolean))]
        persons.forEach(person => {
          const isOwner = person === r.owner
          const pe = e.people[person] || (e.people[person] = { name: person, products: [], profit: 0, opexTotal: 0 })
          pe.products.push({ name: p.local_name, sales, profit, role: isOwner ? '主责' : '参与', opex })
          if (isOwner) pe.profit += profit
          pe.opexTotal += opex.reduce((s, o) => s + api.num(o.amount_cny), 0)
        })
      })
      this.setData({ _lines: Object.values(byLine), loading: false })
      this.render()
    } catch (e) {
      this.setData({ loading: false, error: '加载失败：' + (e.message || e) })
    }
  },

  render() {
    const { expandedLine, expandedPerson } = this.data
    const lines = this.data._lines.slice().sort((a, b) => b.sales - a.sales)
    const top = lines.length ? Math.max(...lines.map(L => L.sales)) : 1
    const categories = lines.map(L => ({
      line: L.line, peopleCount: Object.keys(L.people).length,
      salesText: fmtMoney(L.sales), profitText: fmtMoney(L.profit),
      marginPct: L.sales ? (L.profit / L.sales * 100).toFixed(1) : '0.0',
      loss: L.profit < 0, barWidth: Math.max(4, Math.round(L.sales / top * 100)),
      expanded: L.line === expandedLine,
      people: Object.values(L.people).sort((a, b) => b.profit - a.profit).map(pe => ({
        name: pe.name, pcount: pe.products.length,
        profitText: fmtMoney(pe.profit), opexTotalText: fmtCny(pe.opexTotal), loss: pe.profit < 0,
        expanded: L.line === expandedLine && pe.name === expandedPerson,
        products: pe.products.slice().sort((a, b) => b.sales - a.sales).map(p => ({
          name: p.name, role: p.role, salesText: fmtMoney(p.sales), profitText: fmtMoney(p.profit), loss: p.profit < 0,
          actions: (p.opex || []).slice().sort((a, b) => api.num(b.amount_cny) - api.num(a.amount_cny))
            .map(o => ({ category: o.category, costText: fmtCny(api.num(o.amount_cny)) })),
        })),
      })),
    }))
    this.setData({ categories })
  },

  onCatTap(e) {
    const line = e.currentTarget.dataset.line
    this.setData({ expandedLine: this.data.expandedLine === line ? '' : line, expandedPerson: '' }, () => this.render())
  },
  onPersonTap(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ expandedPerson: this.data.expandedPerson === name ? '' : name }, () => this.render())
  },
})
