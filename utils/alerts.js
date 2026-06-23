// 项目异常检测 —— AI 监控雏形。后续可换成云端 ML 评分。
// 规则：亏损 / ACOS 过高 / 毛利率过低，按严重度排序。

const RULES = [
  { test: p => p.profit < 0,        level: 'high', tag: '亏损',     msg: p => `毛利 ${money(p.profit)}，正在亏损` },
  { test: p => p.acos_pct > 30,     level: 'mid',  tag: 'ACOS高',  msg: p => `ACOS ${p.acos_pct}%，广告效率偏低` },
  { test: p => p.margin_pct < 15 && p.profit >= 0, level: 'mid', tag: '低毛利', msg: p => `毛利率仅 ${p.margin_pct}%` },
]

const LEVEL_WEIGHT = { high: 2, mid: 1 }

function money(n) {
  const v = Math.round(n)
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US')
}

function detect(projects) {
  const out = []
  projects.forEach(p => {
    RULES.forEach(r => {
      if (r.test(p)) out.push({ level: r.level, tag: r.tag, name: p.local_name, msg: r.msg(p) })
    })
  })
  return out.sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level])
}

module.exports = { detect }
