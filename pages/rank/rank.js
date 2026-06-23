const { loadDashboard } = require('../../utils/data')

Page({
  data: {
    rank: [],
    rankMax: 1,
    selectedUid: null,
    selectedUser: null,
    recentMsgs: [],
    showModal: false,
  },

  onLoad() {
    loadDashboard().then(data => {
      const rankMax = data.rank[0]?.messages || 1
      const rank = data.rank.map(r => ({
        ...r,
        barPct: Math.round(r.messages / rankMax * 100),
      }))
      this.setData({ rank, rankMax, _recentMsgs: data.recent_msgs })
    })
  },

  tapRow(e) {
    const { uid } = e.currentTarget.dataset
    const msgs = this.data._recentMsgs || {}
    const user = msgs[uid]
    if (!user) return
    this.setData({
      selectedUid: uid,
      selectedUser: user.name,
      recentMsgs: user.messages || [],
      showModal: true,
    })
  },

  closeModal() {
    this.setData({ showModal: false })
  },
})
