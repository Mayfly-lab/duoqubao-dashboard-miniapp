const MOCK = require('../../data/finance_mock.js')
const { ROLE_ORDER, ROLE_LABEL, getRole, setRole } = require('../../utils/role.js')
const { detect } = require('../../utils/alerts.js')

function fmtMoney(n) {
  const v = Math.round(n)
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US')
}

Page({
  data: {
    role: 'boss',
    roleOrder: ROLE_ORDER,
    roleLabel: ROLE_LABEL,
    roleName: '',
    generatedAt: MOCK.generated_at,
    rangeDays: MOCK.range_days,
    kpi: {},
    projects: [],
    alerts: [],
    expanded: '',
    costs: [],
  },

  onShow() {
    // 每次显示同步全局角色，保证与团队看板联动
    this.applyRole(getRole())
  },

  onRoleTap(e) {
    const role = e.currentTarget.dataset.role
    setRole(role)
    this.applyRole(role)
  },

  applyRole(role) {
    const conf = MOCK.roles[role]
    const visible = conf.visible
    let list = MOCK.projects
    if (visible !== 'all') list = list.filter(p => visible.includes(p.local_name))

    const sales = list.reduce((s, p) => s + p.sales, 0)
    const profit = list.reduce((s, p) => s + p.profit, 0)
    const adCost = list.reduce((s, p) => s + p.ad_cost, 0)
    const kpi = {
      projectCount: list.length,
      sales: fmtMoney(sales),
      profit: fmtMoney(profit),
      marginPct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
      acosPct: sales ? (adCost / sales * 100).toFixed(1) : '0.0',
    }
    const projects = list.map(p => ({
      ...p,
      salesText: fmtMoney(p.sales),
      profitText: fmtMoney(p.profit),
      adCostText: fmtMoney(p.ad_cost),
      ownersText: (p.owners || []).join('、'),
      loss: p.profit < 0,
      barWidth: list.length ? Math.max(4, Math.round(p.sales / list[0].sales * 100)) : 0,
    }))
    this.setData({
      role, roleName: conf.name, kpi, projects,
      alerts: detect(list),
      expanded: '', costs: [],
    })
  },

  onProjectTap(e) {
    const name = e.currentTarget.dataset.name
    if (this.data.expanded === name) {
      this.setData({ expanded: '', costs: [] })
      return
    }
    const raw = MOCK.costs[name] || []
    const max = raw.reduce((m, c) => Math.max(m, c.cost), 0) || 1
    const costs = raw.map(c => ({
      ...c,
      costText: fmtMoney(c.cost),
      barWidth: Math.max(6, Math.round(c.cost / max * 100)),
    }))
    this.setData({ expanded: name, costs })
  },

  onAlertTap(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({ url: '/pages/project/project?name=' + encodeURIComponent(name) })
  },

  onDetailTap(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({ url: '/pages/project/project?name=' + encodeURIComponent(name) })
  },
})
