// 财务/项目看板 mock 数据（2026-06，占位）
// 结构对齐 duoqubao-api 的 /finance/projects/compare、/finance/project/costs 契约，
// 上线后由云函数从 duoqubao-api 拉原始数据计算后下发，按角色过滤。
// 金额单位 USD。

module.exports = {
  generated_at: '2026-06-22 09:00',
  range_days: 30,

  // 角色 → 可见项目（占位演示权限分级；真实由云函数按 openid 过滤）
  // role: boss=老板看全部 / manager=管理层看本团队 / staff=员工看自己负责
  roles: {
    boss:    { name: '王剑煌（老板）', visible: 'all' },
    manager: { name: '黄莹（多趣主管）', visible: ['移动空调', '猫砂盆', '厨余机'] },
    staff:   { name: '林梦欣（运营）', visible: ['移动空调'] },
  },

  // 项目横向对比（= /finance/projects/compare）
  projects: [
    { local_name: '移动空调', team: '多趣', owners: ['林梦欣'],        sku_count: 6,  sales: 412580, profit: 198320, ad_cost: 51200, acos_pct: 12.4, margin_pct: 48.1 },
    { local_name: '猫砂盆',   team: '多趣', owners: ['赵芬芳', '陈杰'], sku_count: 9,  sales: 286400, profit: 96250,  ad_cost: 47800, acos_pct: 16.7, margin_pct: 33.6 },
    { local_name: '厨余机',   team: '多趣', owners: ['陈翰毅'],        sku_count: 4,  sales: 158900, profit: 41200,  ad_cost: 38600, acos_pct: 24.3, margin_pct: 25.9 },
    { local_name: '鸡舍门',   team: '格致', owners: ['黄唤智'],        sku_count: 12, sales: 92300,  profit: 12800,  ad_cost: 29400, acos_pct: 31.8, margin_pct: 13.9 },
    { local_name: '剃头刀',   team: '格致', owners: ['杨宇松'],        sku_count: 7,  sales: 64100,  profit: -3200,  ad_cost: 22100, acos_pct: 34.5, margin_pct: -5.0 },
  ],

  // 项目费用拆解（= /finance/project/costs），按 local_name 索引
  costs: {
    移动空调: [
      { description: 'FBA Inventory Storage Fee', cost: 8400 },
      { description: 'CouponPerformanceFee',      cost: 5200 },
      { description: 'FBA Inbound Convenience Fee', cost: 3100 },
      { description: 'DealParticipationFee',      cost: 2600 },
      { description: 'FBA Removal Order: Removal Fee', cost: 900 },
    ],
    猫砂盆: [
      { description: 'FBA Inventory Storage Fee', cost: 11200 },
      { description: 'FBA Long-Term Storage Fee', cost: 6800 },
      { description: 'DealParticipationFee',      cost: 4100 },
      { description: 'Disposal Fee',              cost: 2300 },
    ],
    厨余机:   [{ description: 'FBA Inventory Storage Fee', cost: 5600 }, { description: 'CouponPerformanceFee', cost: 3900 }],
    鸡舍门:   [{ description: 'FBA Long-Term Storage Fee', cost: 7200 }, { description: 'FBA Removal Order: Removal Fee', cost: 2100 }],
    剃头刀:   [{ description: 'FBA Long-Term Storage Fee', cost: 4800 }, { description: 'Disposal Fee', cost: 1900 }],
  },

  // 项目盈亏趋势（= /finance/project/pnl，按日），按 local_name 索引
  pnl_trend: {
    移动空调: [
      { d: '6/16', sales: 13200, profit: 6400 }, { d: '6/17', sales: 14800, profit: 7100 },
      { d: '6/18', sales: 12600, profit: 5900 }, { d: '6/19', sales: 15900, profit: 7800 },
      { d: '6/20', sales: 14100, profit: 6700 }, { d: '6/21', sales: 16200, profit: 8100 },
      { d: '6/22', sales: 13800, profit: 6600 },
    ],
    猫砂盆: [
      { d: '6/16', sales: 9100, profit: 3000 }, { d: '6/17', sales: 9800, profit: 3300 },
      { d: '6/18', sales: 8600, profit: 2700 }, { d: '6/19', sales: 10200, profit: 3500 },
      { d: '6/20', sales: 9400, profit: 3100 }, { d: '6/21', sales: 9900, profit: 3400 },
      { d: '6/22', sales: 9300, profit: 3050 },
    ],
    厨余机: [
      { d: '6/16', sales: 5100, profit: 1300 }, { d: '6/17', sales: 5600, profit: 1450 },
      { d: '6/18', sales: 4900, profit: 1150 }, { d: '6/19', sales: 5800, profit: 1500 },
      { d: '6/20', sales: 5300, profit: 1350 }, { d: '6/21', sales: 5500, profit: 1400 },
      { d: '6/22', sales: 5200, profit: 1300 },
    ],
    鸡舍门: [
      { d: '6/16', sales: 3000, profit: 400 }, { d: '6/17', sales: 3400, profit: 480 },
      { d: '6/18', sales: 2800, profit: 350 }, { d: '6/19', sales: 3600, profit: 520 },
      { d: '6/20', sales: 3100, profit: 410 }, { d: '6/21', sales: 3300, profit: 460 },
      { d: '6/22', sales: 3100, profit: 420 },
    ],
    剃头刀: [
      { d: '6/16', sales: 2200, profit: -120 }, { d: '6/17', sales: 2400, profit: -90 },
      { d: '6/18', sales: 2000, profit: -180 }, { d: '6/19', sales: 2600, profit: -40 },
      { d: '6/20', sales: 2100, profit: -150 }, { d: '6/21', sales: 2300, profit: -110 },
      { d: '6/22', sales: 2150, profit: -130 },
    ],
  },

  // 团队管理：员工维度（依赖缺口④归属，先占位）
  // contribution = 该员工负责项目的毛利合计；actions = 近30天动作数（日报/操作）
  employees: [
    { name: '林梦欣', team: '多趣', role: 'staff',   projects: ['移动空调'],         contribution: 198320, actions: 42, ad_cost: 51200 },
    { name: '赵芬芳', team: '多趣', role: 'staff',   projects: ['猫砂盆'],           contribution: 58000,  actions: 31, ad_cost: 28000 },
    { name: '陈杰',   team: '多趣', role: 'staff',   projects: ['猫砂盆'],           contribution: 38250,  actions: 27, ad_cost: 19800 },
    { name: '陈翰毅', team: '多趣', role: 'staff',   projects: ['厨余机'],           contribution: 41200,  actions: 19, ad_cost: 38600 },
    { name: '黄唤智', team: '格致', role: 'staff',   projects: ['鸡舍门'],           contribution: 12800,  actions: 23, ad_cost: 29400 },
    { name: '杨宇松', team: '格致', role: 'staff',   projects: ['剃头刀'],           contribution: -3200,  actions: 15, ad_cost: 22100 },
  ],
}
