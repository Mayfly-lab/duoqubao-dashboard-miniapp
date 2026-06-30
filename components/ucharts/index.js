// uCharts 通用封装(canvas 2d)。传 opts(含 type/categories/series 等)即渲染;opts 变化自动重绘。
const uCharts = require('./u-charts.js')

Component({
  properties: {
    cid: { type: String, value: 'ucharts' },
    height: { type: Number, value: 360 },              // rpx
    opts: { type: Object, value: null, observer() { this.draw() } },
  },
  lifetimes: {
    ready() { this._ready = true; this.draw() },
    detached() { this._chart = null },
  },
  methods: {
    draw(retry) {
      if (!this._ready || !this.properties.opts) return
      const q = this.createSelectorQuery().in(this)
      q.select('#' + this.properties.cid).fields({ node: true, size: true }).exec(res => {
        // canvas 在 wx:if 里刚展开时节点可能还没就绪 → 重试几次兜底
        if (!res || !res[0] || !res[0].node) {
          if ((retry || 0) < 8) setTimeout(() => this.draw((retry || 0) + 1), 60)
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        // 旧实例丢弃,重建(opts 变了)
        this._chart = new uCharts(Object.assign({
          context: ctx,
          width: res[0].width * dpr,
          height: res[0].height * dpr,
          pixelRatio: dpr,
        }, this.properties.opts))
        // 可滚动时默认定位到最右(看最新月);构造函数的 scrollPosition 只管边缘渐变,需 updateData 才真滚
        if (this.properties.opts.enableScroll) {
          this._chart.updateData({ scrollPosition: 'right' })
        }
      })
    },
    // 横向滚动(uCharts scrollStart/scroll/scrollEnd)+ 松手出 tooltip
    touchStart(e) {
      if (!this._chart) return
      this._chart.scrollStart(e)
    },
    touchMove(e) {
      if (!this._chart) return
      this._chart.scroll(e)
    },
    touchEnd(e) {
      if (!this._chart) return
      this._chart.scrollEnd(e)
      this._chart.touchLegend(e)
      this._chart.showToolTip(e)
    },
  },
})
