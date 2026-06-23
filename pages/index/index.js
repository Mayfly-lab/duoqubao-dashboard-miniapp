const { loadDashboard, calcSavedHours, getFuncForChart } = require('../../utils/data')

Page({
  data: {
    generatedAt: '',
    since: '',
    kpi: null,
    conclusion: null,
    savedHours: 0,
    trend: [],
    funcChart: [],
    loading: true,
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    const data = await loadDashboard()

    const funcChart = getFuncForChart(data.func_dist)
    const funcTotal = funcChart.reduce((s, f) => s + f.count, 0)
    const trendMax = Math.max(...data.trend_14d.map(t => t.count), 1)
    const savedHours = calcSavedHours(data.kpi.total_messages)

    // 核心结论：服务天数、日均、相当于几个全职
    const since = new Date(data.since)
    const now = new Date()
    const days = Math.max(Math.round((now - since) / 86400000), 1)
    const totalMsgs = parseInt(String(data.kpi.total_messages).replace(/,/g, ''))
    const dailyAvg = Math.round(totalMsgs / days)
    // 8小时工作日，每条对话15分钟
    const fullTimeEquiv = (savedHours / (days * 8)).toFixed(1)
    const activeRate = Math.round(parseInt(data.kpi.active_7d) / parseInt(data.kpi.total_users) * 100)

    const conclusion = {
      days,
      dailyAvg,
      savedHours,
      fullTimeEquiv,
      activeRate,
      totalUsers: data.kpi.total_users,
      active7d: data.kpi.active_7d,
    }

    const trend = data.trend_14d.map(t => ({
      ...t,
      heightPct: Math.max(Math.round(t.count / trendMax * 100), 3),
    }))

    const funcWithPct = funcChart.map(f => ({
      ...f,
      pct: funcTotal > 0 ? Math.round(f.count / funcTotal * 100) : 0,
    }))

    this.setData({
      generatedAt: data.generated_at,
      since: data.since,
      kpi: data.kpi,
      conclusion,
      savedHours,
      trend,
      funcChart: funcWithPct,
      funcTotal,
      loading: false,
    })

    wx.nextTick(() => this._drawRing(funcWithPct))
  },

  _drawRing(funcs) {
    const query = wx.createSelectorQuery()
    query.select('#ring-canvas').fields({ node: true, size: true }).exec(res => {
      if (!res[0]) return
      const { node: canvas, width, height } = res[0]
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const cx = width / 2
      const cy = height / 2
      const r = Math.min(cx, cy) * 0.82
      const innerR = r * 0.58
      let startAngle = -Math.PI / 2
      const total = funcs.reduce((s, f) => s + f.count, 0)

      funcs.forEach(f => {
        const sweep = (f.count / total) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, startAngle, startAngle + sweep)
        ctx.closePath()
        ctx.fillStyle = f.color
        ctx.fill()
        startAngle += sweep
      })

      ctx.beginPath()
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
      ctx.fillStyle = '#19233c'
      ctx.fill()

      ctx.fillStyle = '#eef2fb'
      ctx.font = `bold ${Math.round(r * 0.28)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(total, cx, cy - r * 0.08)
      ctx.fillStyle = '#94a3c4'
      ctx.font = `${Math.round(r * 0.16)}px sans-serif`
      ctx.fillText('次功能调用', cx, cy + r * 0.2)
    })
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },
})
