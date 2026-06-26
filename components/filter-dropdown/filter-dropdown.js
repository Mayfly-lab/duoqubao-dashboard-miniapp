// 下拉筛选组件。props: options=[{label,value}], value;event: change({value})
Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
  },
  data: { open: false, currentLabel: '' },
  observers: {
    'value, options': function (value, options) {
      const cur = (options || []).find(o => o.value === value)
      this.setData({ currentLabel: cur ? cur.label : (options[0] && options[0].label) || '' })
    },
  },
  methods: {
    toggle() { this.setData({ open: !this.data.open }) },
    onSelect(e) {
      this.setData({ open: false })
      this.triggerEvent('change', { value: e.currentTarget.dataset.value })
    },
  },
})
