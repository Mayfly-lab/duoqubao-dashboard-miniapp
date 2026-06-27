// 团队管理(老板个人工具·无角色切换):产品类 → 类下人员(主责∪参与)→ 个人负责产品。
// 组织职责视图:人头上不挂毛利/费用(opex 无产品列·无人字段,拆不到个人,见 finance-consistency-audit)。
// 个人只显示职责(主责N/参与M)+ 主责产品销售合计(真账体量)。费用/盈亏交给 finance/category 页类级展示。
const api = require('../../utils/api.js')
const registry = require('../../data/registry.js')
const { lineOf } = require('../../utils/aggregate.js')

function fmtMoney(n) { const a = Math.abs(n), s = n < 0 ? '-$' : '$'; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'; return s + Math.round(a) }

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
      people: Object.values(L.people).sort((a, b) => (b.ownCount - a.ownCount) || (b.joinCount - a.joinCount)).map(pe => ({
        name: pe.name, pcount: pe.products.length,
        ownCount: pe.ownCount, joinCount: pe.joinCount,
        expanded: L.line === expandedLine && pe.name === expandedPerson,
        products: pe.products.slice().sort((a, b) => b.sales - a.sales).map(p => ({
          name: p.name, role: p.role, isOwner: p.role === '主责',
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
