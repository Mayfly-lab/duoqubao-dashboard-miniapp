// 本地 mock 数据（从妙搭看板爬取，2026-06-18）
// 上线后替换为真实 API 请求
const MOCK = require('../data/dashboard_data.js')

function loadDashboard() {
  return Promise.resolve(MOCK)
}

// 工时估算：每条对话平均节省 10 分钟（含阅读、整理、执行时间）
function calcSavedHours(totalMessages) {
  const num = parseInt(String(totalMessages).replace(/,/g, '')) || 0
  return Math.round(num * 10 / 60)
}

// 功能分布：去掉"其他"，只展示有意义的分类，用于环形图
function getFuncForChart(funcDist) {
  const colors = ['#5b8cff', '#22c4a8', '#f5a524', '#8b5cf6', '#f06292', '#7c9cff', '#5fd0bb']
  return funcDist
    .filter(f => f.name !== '其他/对话')
    .map((f, i) => ({ ...f, color: colors[i % colors.length] }))
}

module.exports = { loadDashboard, calcSavedHours, getFuncForChart }
