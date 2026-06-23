const MOCK = require('../../data/finance_mock.js')

function fmtMoney(n) {
  const v = Math.round(n)
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US')
}

Page({
  data: {
    name: '',
    proj: null,
    trend: [],
    costs: [],
    owners: [],
  },

  onLoad(q) {
    const name = decodeURIComponent(q.name || '')
    const proj = MOCK.projects.find(p => p.local_name === name)
    if (!proj) {
      wx.showToast({ title: '项目不存在', icon: 'none' })
      return
    }
    wx.setNavigationBarTitle({ title: name })

    // 盈亏趋势：算条形高度（按销售额归一）
    const rawTrend = MOCK.pnl_trend[name] || []
    const maxSales = rawTrend.reduce((m, t) => Math.max(m, t.sales), 0) || 1
    const trend = rawTrend.map(t => ({
      ...t,
      salesText: fmtMoney(t.sales),
      profitText: fmtMoney(t.profit),
      loss: t.profit < 0,
      h: Math.max(8, Math.round(t.sales / maxSales * 160)),
    }))

    // 费用拆解
    const rawCosts = MOCK.costs[name] || []
    const maxCost = rawCosts.reduce((m, c) => Math.max(m, c.cost), 0) || 1
    const costs = rawCosts.map(c => ({
      ...c,
      costText: fmtMoney(c.cost),
      barWidth: Math.max(6, Math.round(c.cost / maxCost * 100)),
    }))

    // 负责员工
    const owners = MOCK.employees
      .filter(e => (proj.owners || []).includes(e.name))
      .map(e => ({ ...e, contribText: fmtMoney(e.contribution), loss: e.contribution < 0 }))

    this.setData({
      name,
      proj: {
        ...proj,
        salesText: fmtMoney(proj.sales),
        profitText: fmtMoney(proj.profit),
        adCostText: fmtMoney(proj.ad_cost),
        loss: proj.profit < 0,
      },
      trend, costs, owners,
    })
  },
})
