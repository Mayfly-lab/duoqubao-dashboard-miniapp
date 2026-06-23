const CAP = require('../../data/capabilities')

Page({
  data: {
    problems: CAP.problems,
    commands: CAP.commands,
    expandedIdx: null,
  },

  toggleExpand(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({
      expandedIdx: this.data.expandedIdx === idx ? null : idx,
    })
  },
})
