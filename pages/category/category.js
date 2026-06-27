// 类详细看板(完整,向 mockup 看齐):L0 双进度条 + L1 四问 + L0.5 时间轴 + L2 五下钻 + 型号列表。
// 全部从快照按「类」聚合。采购按 line 关键词匹配 procurement;USD 段 ×FX 统一人民币。
const api = require('../../utils/api.js')
const { lineOf, procurementOf, procurementByModel, settleView } = require('../../utils/aggregate.js')
const registry = require('../../data/registry.js')

const FX = 6.8                                   // USD→CNY(与时间轴口径一致)
const HEAD_FREIGHT_PER_UNIT = 15                 // 头程估:$15/台
function fmtMoney(n) { const a = Math.abs(n), s = n < 0 ? '-$' : '$'; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'; return s + Math.round(a) }
const fmtCny = n => { const a = Math.abs(n); if (a >= 1e8) return '¥' + (a / 1e8).toFixed(2) + '亿'; if (a >= 1e4) return '¥' + (a / 1e4).toFixed(1) + '万'; return '¥' + Math.round(a) }
const fmtWan = n => '¥' + (n / 1e4).toFixed(0) + '万'
const mmShort = ym => (ym || '').slice(2)
const fmtShort = n => { const a = Math.abs(n); if (a >= 1e6) return (n < 0 ? '-' : '') + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return (n < 0 ? '-' : '') + Math.round(a / 1e3) + 'k'; return Math.round(n) + '' }

Page({
  data: {
    line: '', generatedAt: api.generatedAt, kpi: {}, level0: null, four: null, settle: null, models: [], unmappedText: '',
    timeline: [], fees: [], ads: null, refund: null, inventory: null, stars: [], opex: [],
    loading: true, error: '',
  },

  onLoad(q) {
    const line = decodeURIComponent(q.line || '')
    this.setData({ line })
    wx.setNavigationBarTitle({ title: line + ' · 类看板' })
    this.fetch(line)
  },

  async fetch(line) {
    this.setData({ loading: true, error: '' })
    try {
      const [compare, payback, inventory, feesAll, adsAll, refundAll, starsAll, procurement] = await Promise.all([
        api.projectsCompare(30, 100), api.dash('payback'), api.dash('inventory'),
        api.dash('fees'), api.dash('ads'), api.dash('refund'), api.dash('quality/stars'), api.dash('procurement'),
      ])
      const products = compare.filter(p => lineOf(p.local_name) === line)
      const names = products.map(p => p.local_name)
      const nameSet = new Set(names)
      const [tlAll, opexAll] = await Promise.all([
        Promise.all(names.map(n => api.projectTimeline(n))),
        Promise.all(names.map(n => api.projectOpex(n))),
      ])
      const N = api.num

      // 回款
      const pbMap = {}; payback.forEach(r => { pbMap[r.local_name] = r })
      const sales = products.reduce((s, p) => s + N(p.sales), 0)
      const profit = products.reduce((s, p) => s + N(p.profit), 0)
      const realized = products.reduce((s, p) => s + N((pbMap[p.local_name] || {}).realized_usd), 0)
      const pending = products.reduce((s, p) => s + N((pbMap[p.local_name] || {}).pending_usd), 0)
      // 顶部 KPI 统一人民币(×FX),与下面回本/采购同币种(毛利率是比值不换算)
      const kpi = {
        count: products.length, loss: profit < 0,
        salesText: fmtCny(sales * FX), profitText: fmtCny(profit * FX),
        marginPct: sales ? (profit / sales * 100).toFixed(1) : '0.0',
        realizedText: fmtCny(realized * FX), pendingText: fmtCny(pending * FX),
      }

      // 费用(fees 加总,USD)
      const feeAgg = { commission: 0, fba_delivery: 0, ads_cost: 0, storage: 0, refunds: 0 }
      let salesFromFees = 0
      feesAll.filter(f => nameSet.has(f.local_name)).forEach(f => { for (const k in feeAgg) feeAgg[k] += Math.abs(N(f[k])); salesFromFees += N(f.sales) })
      const platFeeUsd = Object.values(feeAgg).reduce((s, v) => s + v, 0)

      // 亚马逊结算视角(到手 = 销售 − 各项,全期·USD·≠毛利):用 fees 口径销售,与各项扣减自洽
      const sv = settleView(salesFromFees, feeAgg)
      const settle = sv.sales > 0 ? {
        salesText: fmtMoney(sv.sales),
        items: sv.items.map(i => ({ label: i.label, valText: '-' + fmtMoney(i.val), w: Math.max(4, Math.round(i.val / sv.sales * 100)) })),
        netText: fmtMoney(sv.net), netLoss: sv.net < 0,
        netPct: (sv.net / sv.sales * 100).toFixed(1),
      } : null

      // 运营费用(opex 类聚合,CNY)
      const opexMap = {}
      opexAll.flat().forEach(o => { opexMap[o.category] = (opexMap[o.category] || 0) + N(o.amount_cny) })
      const opexArr = Object.entries(opexMap).map(([category, v]) => ({ category, cost: v })).sort((a, b) => b.cost - a.cost)
      const opexTotal = opexArr.reduce((s, o) => s + o.cost, 0)
      const opexMax = Math.max(...opexArr.map(o => o.cost), 1)
      const opex = opexArr.map(o => ({ category: o.category, costText: fmtCny(o.cost), barWidth: Math.max(6, Math.round(o.cost / opexMax * 100)) }))

      // ── L0 双进度条(对齐 demo §2.2 口径,统一 CNY) ──
      // 投入 = 采购合同全额(含税·amount) + 头程(¥15/台估) + 运营opex;回款 = 已到账(realized) + 在途(pending)。
      // 回本率 = (已到账+在途) / 全投入。采购取本线「活跃代年份」(采购额最大年),与回款同代,治款混不打骨折。
      const proc = procurementOf(procurement, line)
      const headFreight = proc.qty * HEAD_FREIGHT_PER_UNIT * FX
      const realizedCny = realized * FX, pendingCny = pending * FX
      const invest = proc.amount + headFreight + opexTotal   // 全投入
      const back = realizedCny + pendingCny                  // 回款(已到账+在途)
      const base = Math.max(invest, back, 1)
      const seg = (val) => Math.round(val / base * 100)
      const level0 = {
        investText: fmtWan(invest), backText: fmtWan(back),
        lockPct: invest ? Math.round(back / invest * 100) : 0,   // 回本率 = 回款 / 全投入
        investSegs: [
          { label: '采购', val: fmtWan(proc.amount), w: seg(proc.amount), cls: 'seg-buy' },
          { label: '头程估', val: fmtWan(headFreight), w: seg(headFreight), cls: 'seg-freight' },
          { label: '运营', val: fmtWan(opexTotal), w: seg(opexTotal), cls: 'seg-opex' },
        ],
        backSegs: [
          { label: '已到账', val: fmtWan(realizedCny), w: seg(realizedCny), cls: 'seg-realized' },
          { label: '在途待回', val: fmtWan(pendingCny), w: seg(pendingCny), cls: 'seg-pending' },
        ],
        owe: fmtWan(proc.outstanding),   // 欠厂应付(账期红利,提示用)
        buyYear: proc.year || '—',       // 活跃代年份
      }

      // ── L1 四问(对齐 demo:① 钱→货 ② 货→费用 ③ 卖→回款 ④ 收回vs付出) ──
      const four = {
        q1: { buy: fmtWan(proc.amount), paid: fmtWan(proc.paid), owe: fmtWan(proc.outstanding), qty: proc.qty.toLocaleString('en-US') },
        q2: { freight: fmtWan(headFreight), opex: fmtWan(opexTotal), plat: fmtWan(platFeeUsd * FX) },
        q3: { sales: fmtWan(sales * FX), realized: fmtWan(realizedCny) },
        // q4 回本:回款 − 全投入 = 盈余/超额(回正即回本)
        q4: { invest: fmtWan(invest), locked: fmtWan(back), over: fmtWan(back - invest), overPos: back >= invest },
      }

      // 型号列表
      // 型号级采购(model_map 把金蝶采购拆到领星型号)+ 未铺货新款(只有采购、领星无销售)
      const { byModel: procByModel, unstocked } = procurementByModel(procurement, line)
      const top = products.length ? Math.max(...products.map(p => N(p.sales))) : 1
      const models = products.map(p => {
        const pm = procByModel[p.local_name]
        return {
          name: p.local_name, salesText: fmtCny(N(p.sales) * FX), profitText: fmtCny(N(p.profit) * FX),
          marginPct: N(p.margin_pct).toFixed(1), loss: N(p.profit) < 0,
          barWidth: Math.max(4, Math.round(N(p.sales) / top * 100)),
          buyText: pm ? fmtWan(pm.amount) : '', unstocked: false,
        }
      })
      // 未铺货款追加到型号列表末尾:有采购、销售/回款为 —(链路一致,不漏型号)
      unstocked.forEach(u => models.push({
        name: u.jdName, salesText: '—', profitText: '—', marginPct: '—', loss: false,
        barWidth: 2, buyText: fmtWan(u.amount), unstocked: true,
      }))
      // 类级未拆采购(B类:金蝶笼统名拆不到型号),单列保证 Σ型号采购 + 未拆 = 类采购
      const unmapped = procByModel._unmapped
      const unmappedText = (unmapped && unmapped.amount > 0) ? fmtWan(unmapped.amount) : ''

      // 时间轴
      const tlMap = {}
      tlAll.flat().forEach(t => { tlMap[t.ym] = (tlMap[t.ym] || 0) + N(t.payout_usd) })
      const tlArr = Object.keys(tlMap).sort().map(ym => ({ ym, usd: tlMap[ym] }))
      const tlMax = Math.max(...tlArr.map(t => Math.abs(t.usd)), 1)
      const timeline = tlArr.map(t => ({ ym: mmShort(t.ym), valShort: '¥' + fmtShort(t.usd * FX), neg: t.usd < 0, w: Math.max(2, Math.round(Math.abs(t.usd) / tlMax * 100)) }))

      // 费用扣除横条
      const feeItems = [
        ['佣金', feeAgg.commission], ['FBA 配送', feeAgg.fba_delivery], ['广告', feeAgg.ads_cost],
        ['仓储', feeAgg.storage], ['退款', feeAgg.refunds],
      ].map(([d, v]) => ({ description: d, cost: v })).filter(c => c.cost > 0).sort((a, b) => b.cost - a.cost)
      const feeMax = Math.max(...feeItems.map(c => c.cost), 1)
      const fees = feeItems.map(c => ({ description: c.description, costText: fmtMoney(c.cost), barWidth: Math.max(6, Math.round(c.cost / feeMax * 100)) }))

      // 广告
      let spend = 0, rev = 0
      adsAll.filter(a => nameSet.has(a.local_name)).forEach(a => { spend += N(a.spend); rev += N(a.revenue) })
      const ads = spend ? { spendText: fmtMoney(spend), revText: fmtMoney(rev), acos: rev ? (spend / rev * 100).toFixed(1) : '0.0' } : null

      // 退款
      let units = 0, returns = 0, refundAmt = 0
      refundAll.filter(r => nameSet.has(r.local_name)).forEach(r => { units += N(r.units); returns += N(r.returns); refundAmt += N(r.refund_amt) })
      const refund = returns ? { rate: units ? (returns / units * 100).toFixed(2) : '0', returns, amtText: fmtMoney(Math.abs(refundAmt)) } : null

      // 弹药
      let xianhuo = 0, zaitu = 0
      inventory.filter(i => nameSet.has(i.product_name)).forEach(i => { xianhuo += N(i.xianhuo); zaitu += N(i.zaitu) })
      const inv = (xianhuo || zaitu) ? { xianhuo, zaitu } : null

      // 品质
      const asins = new Set()
      names.forEach(n => ((registry.byProduct[n] || {}).asins || []).forEach(a => asins.add(a)))
      const stars = starsAll.filter(s => asins.has(s.asin))
        .map(s => ({ asin: s.asin, star: s.star, reviews: s.reviews, low: N(s.star) < 3.5 }))
        .sort((a, b) => N(a.star) - N(b.star))

      this.setData({ kpi, level0, four, settle, models, unmappedText, timeline, fees, ads, refund, inventory: inv, stars, opex, loading: false })
    } catch (e) {
      this.setData({ loading: false, error: '加载失败：' + (e.message || e) })
    }
  },

  onModelTap(e) {
    wx.navigateTo({ url: '/pages/project/project?name=' + encodeURIComponent(e.currentTarget.dataset.name) })
  },
})
