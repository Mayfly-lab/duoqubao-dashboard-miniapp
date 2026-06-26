# duoqubao-dashboard-miniapp — 多趣猫盈亏看板小程序

> 项目背景与上下文(给人和 Claude Code 自动加载用)。详细需求/实施拆解见文末 @import。

## 1. 项目定位

基于客户「移动空调全生命周期看板」demo(`移动空调-demo 数据/`)做的**全公司版盈亏看板小程序**。回答「钱→货→费用→卖→回款→盈余」,支持老板/管理层/员工三视角。**原生微信小程序、纯前端、无后端**。

## 2. 数据来源(重要)

- 小程序**还没认证、配不了合法域名** → 走**本地快照** `data/api_snapshot.js`(免域名,体验版可跑)。
- 快照由 `scripts/fetch_snapshot.py` 通过 **duoqubao-api(客户部署机内网穿透 tunnel)** 预拉。⚠️ trycloudflare 是临时域名会变,换了改脚本里 `BASE`。
- 产品/人员/权限:`scripts/build_registry.py` 把 `data/multibot_product_registry...csv` 结构化成 `data/registry.js`(399 产品/49 人员,含 部门/类目/负责人/权限/asin)。
- 后端 = **duoqubao-api**(只读领星 + 金蝶财务,走 ssh→macmini DuckDB,详见其自带 CLAUDE.md)。

## 3. 信息架构(三层)

- **产品类**(= registry「产品主线」line,25 类)→ **型号**(local_name)→ **详情**。
- 移动空调类 = [移动空调/欧伦移动空调AO16TA/A018B移动空调],正好对上 `01-看板-mockup.html`。
- 老板首页看**产品类**;类/型号详细看板对齐 `移动空调-demo 数据/01-看板-mockup.html`。

## 4. 人员 / 权限

- **老板 = 陈翰毅**;高级管理层 = 王剑煌(权限同老板,身份非老板,看板需求拍板人);运营示例 = 林梦欣。
- 部门:多趣 / 格致。三视角 **tab 切换**,不上登录态(已定)。
- 权限演示口径硬编码:老板/管理层=全部,员工=自己负责产品(registry owner/joiner)。

## 5. opex(运营费用 / 报销 / 费用动作)

- **2026-06-26 打通**:finance-bot 接金蝶 API + 常驻管线(LaunchAgent `ai.dokicat.finance-mirror-sync`,每天定时全量拉,每晚 21:00 北京)。
- 按「对方会计科目」出**费用动作**:测评费用(=刷单/测评)、链接费用、品牌商标、研发、差旅…
- ⚠️ **口径坑**:归属靠「摘要 ILIKE 产品名」,**型号级偏漏**(如 `猫砂盆-中山1号` opex 空,但 `猫砂` 类有数据)→ **opex 适合在「类」层级展示,型号级会漏**。无报销人列,员工维度靠 registry 产品→负责人**间接**(不是 opex 直接带人)。

## 6. 关键文件

- 页面:`pages/finance`(老板总览)/ `pages/project`(产品下钻)/ `pages/team`(团队)
- 数据层:`utils/api.js`(读快照,签名仿 wx.request)/ `data/api_snapshot.js`(快照)/ `data/registry.js`(产品维度)
- 脚本:`scripts/fetch_snapshot.py`(重拉快照)/ `scripts/build_registry.py`(重建 registry)

## 7. 数据更新

- 快照:tunnel 活时 `python3 scripts/fetch_snapshot.py`(数据非实时,静态快照)。
- registry:CSV 变动后 `python3 scripts/build_registry.py`。
- 认证 + 固定域名后,可把 `utils/api.js` 切回实时 `wx.request`(函数签名不变)。

---

详细需求与分期实施拆解(P1 类层级+交互 / P2 看板对齐 mockup / P3 团队页+样式):
@看板大版本-需求与实施拆解-2026-06-26.md
