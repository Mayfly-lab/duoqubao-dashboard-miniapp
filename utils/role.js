// 全局角色（占位演示权限分级；真实上线后由登录身份决定，存 storage）
const ROLE_ORDER = ['boss', 'manager', 'staff']
const ROLE_LABEL = { boss: '老板', manager: '管理层', staff: '员工' }
const STORE_KEY = 'dqm_role'

function getRole() {
  return wx.getStorageSync(STORE_KEY) || 'boss'
}

function setRole(role) {
  if (ROLE_ORDER.includes(role)) wx.setStorageSync(STORE_KEY, role)
}

module.exports = { ROLE_ORDER, ROLE_LABEL, getRole, setRole }
