#!/usr/bin/env python3
# 爬妙搭「使用数据」看板(SSR HTML)→ data/usage_snapshot.js。
# cookie 会过期,从环境变量传(别硬编码)。
# 用法: MIAODA_COOKIE='X-Force-Runtime-Session=...; suda_web_did=...; suda-csrf-token=...' python3 scripts/fetch_usage.py
import os, re, json, urllib.request

URL = "https://kvwl7f2a7c.aiforce.cloud/app/app_4kae3kd5shw8s/"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "usage_snapshot.js")


def main():
    cookie = os.environ.get("MIAODA_COOKIE", "")
    if not cookie:
        raise SystemExit("需要 MIAODA_COOKIE 环境变量(浏览器 F12 复制 cookie)")
    req = urllib.request.Request(URL, headers={"Cookie": cookie, "User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    if 'class="kpi' not in html:
        raise SystemExit(f"HTML 无数据(cookie 可能过期),长度={len(html)}")

    # KPI: <div class="kpi kN"><div class="v">值</div><div class="l">标签</div>
    kpi = {}
    for v, l in re.findall(r'<div class="kpi[^"]*"><div class="v">([^<]*)</div><div class="l">([^<]*)</div>', html):
        kpi[l.strip()] = v.strip()

    # 趋势柱: <div class="xb" title="日期 · 成本 · token tok"><i style="height:N%">
    trend = []
    for title, h in re.findall(r'<div class="xb" title="([^"]*)"><i style="height:(\d+)%"', html):
        parts = [p.strip() for p in title.split('·')]
        trend.append({
            "date": parts[0] if parts else "",
            "cost": parts[1] if len(parts) > 1 else "",
            "token": parts[2].replace("tok", "").strip() if len(parts) > 2 else "",
            "height": int(h),
        })

    # KPI 的 token/成本妙搭页面渲染成空(—),从趋势求和补上
    def pcost(s):
        m = re.search(r'\$([\d.]+)', s); return float(m.group(1)) if m else 0
    def ptok(s):
        m = re.search(r'([\d.]+)\s*(亿|万)?', s)
        if not m: return 0
        n = float(m.group(1)); u = m.group(2)
        return n * 1e8 if u == '亿' else (n * 1e4 if u == '万' else n)
    tot_cost = sum(pcost(t['cost']) for t in trend)
    tot_tok = sum(ptok(t['token']) for t in trend)
    fmt_tok = lambda n: (f'{n/1e8:.2f}亿' if n >= 1e8 else f'{n/1e4:.0f}万')
    kpi_en = {
        "total_users": kpi.get('累计使用过的运营', '—'),
        "active_7d": kpi.get('近 7 天活跃', '—'),
        "total_messages": kpi.get('累计提问 / 指令数', '—'),
        "token_total": fmt_tok(tot_tok) if tot_tok else '—',
        "token_cost_usd": (f'${tot_cost:.0f}' if tot_cost else '—'),
        "top_user_messages": kpi.get('最活跃单人提问数', '—'),
    }
    snap = {"kpi": kpi_en, "raw_kpi": kpi, "trend": trend,
            "crawled_at": __import__("time").strftime("%Y-%m-%d %H:%M")}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 妙搭使用数据快照(scripts/fetch_usage.py 爬取 SSR HTML)。\n")
        f.write("// 重爬: MIAODA_COOKIE='...' python3 scripts/fetch_usage.py\n")
        f.write("module.exports = " + json.dumps(snap, ensure_ascii=False) + "\n")
    print("KPI:", len(kpi), "项 | 趋势:", len(trend), "根 →", os.path.abspath(OUT))
    for k, v in kpi.items():
        print(f"  {k} = {v}")

    # 直接改写 dashboard_data.js(kpi + trend_14d + generated_at),index 不靠运行时 merge
    DD = os.path.join(os.path.dirname(__file__), "..", "data", "dashboard_data.js")
    dd = open(DD, encoding="utf-8").read()
    dd = re.sub(r'"kpi":\s*\{[^}]*\}',
                '"kpi": ' + json.dumps(kpi_en, ensure_ascii=False, indent=4), dd, count=1)
    recent = trend[-14:]   # 最近 14 天,count = 每日成本(妙搭真实有的)
    td = [{"date_label": t["date"], "count": round(pcost(t["cost"]))} for t in recent]
    dd = re.sub(r'"trend_14d":\s*\[[^\]]*\]',
                '"trend_14d": ' + json.dumps(td, ensure_ascii=False), dd, count=1, flags=re.S)
    dd = re.sub(r'"generated_at":\s*"[^"]*"',
                '"generated_at": "' + snap["crawled_at"] + '"', dd, count=1)
    open(DD, "w", encoding="utf-8").write(dd)
    print("已改写 dashboard_data.js: kpi(真实) + trend_14d(最近14天·每日成本$) + generated_at")


if __name__ == "__main__":
    main()
