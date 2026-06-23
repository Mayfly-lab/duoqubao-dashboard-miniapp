const MOCK = require('../../data/finance_mock.js')
const { ROLE_ORDER, ROLE_LABEL, getRole, setRole } = require('../../utils/role.js')

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
    employees: [],
  },

  onShow() { this.applyRole(getRole()) },

  onRoleTap(e) {
    const role = e.currentTarget.dataset.role
    setRole(role)
    this.applyRole(role)
  },

  applyRole(role) {
    const conf = MOCK.roles[role]
    let list = MOCK.employees
    // 占位权限：老板看全部，管理层看本团队，员工只看自己
    if (role === 'manager') list = list.filter(e => e.team === '多趣')
    else if (role === 'staff') list = list.filter(e => e.name === '林梦欣')

    list = list.slice().sort((a, b) => b.contribution - a.contribution)
    const max = list.reduce((m, e) => Math.max(m, Math.abs(e.contribution)), 0) || 1
    const employees = list.map(e => ({
      ...e,
      contribText: fmtMoney(e.contribution),
      adCostText: fmtMoney(e.ad_cost),
      perAction: fmtMoney(e.actions ? e.contribution / e.actions : 0),
      projectsText: (e.projects || []).join('、'),
      loss: e.contribution < 0,
      barWidth: Math.max(4, Math.round(Math.abs(e.contribution) / max * 100)),
    }))
    this.setData({ role, roleName: conf.name, employees })
  },
})
