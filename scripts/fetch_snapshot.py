#!/usr/bin/env python3
# 把 duoqubao-api 的接口数据预拉成本地快照 data/api_snapshot.js，
# 供小程序体验版直接 require（无需配置合法域名 / 调 tunnel）。
# 重新生成：python3 scripts/fetch_snapshot.py
import json, os, time, urllib.parse, urllib.request

BASE = "https://associates-please-compaq-org.trycloudflare.com"
KEY = "f84dcbe9c50806233671945b2025c191559082bf4c2aab02b835cbd55ccaf160"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "api_snapshot.js")
PROC_YEAR = 2026   # 采购收口年份(当年款);换年改这里。见下方 procurement 拉取处口径说明。


def get(path, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"X-API-Key": KEY})
    try:
        with urllib.request.urlopen(req, timeout=70) as r:
            return json.loads(r.read()).get("data", [])
    except Exception as e:
        print("  ! FAIL", path, params, str(e)[:80], flush=True)
        return []


def main():
    snap = {}
    print("== 全量接口（空 name 一次拿全部）==", flush=True)
    # 全期口径:days 上限 365(覆盖 2025-06 硬地板至今的全生命周期)。
    # limit 取 200 拿全集(实测 ~112 个有销售产品;旧值 100 会截断漏 13 个长尾 → 标题"全公司盈亏"对不上)。
    snap["compare"] = get("/finance/projects/compare", {"days": 365, "limit": 200})
    snap["projects"] = get("/finance/projects")
    for ep in ["fees", "payback", "inventory", "ads", "refund", "quality/stars", "quality/reasons",
               "timeline/pending"]:
        key = ep.replace("/", "_")
        snap[key] = get("/dashboard/" + ep, {"name": ""})
        print(f"  {ep}: {len(snap[key])} 行", flush=True)

    # 采购按当年款收口(治款混):全期采购含 24/25 旧款,但领星回款 2025-06 才有数据(旧款回款=0),
    # 全期采购÷"全期"回款会被旧款单方面稀释。按 PROC_YEAR 限款,两侧同代,回本率才成立(对齐 demo 2026款)。
    snap["procurement"] = get("/dashboard/procurement", {"name": "", "year": PROC_YEAR})
    print(f"  procurement(year={PROC_YEAR}): {len(snap['procurement'])} 行", flush=True)

    snap["opex_company"] = get("/dashboard/opex", {"name": ""})
    print(f"  opex(公司级): {len(snap['opex_company'])} 行", flush=True)

    names = [p["local_name"] for p in snap["compare"]]
    print(f"== 逐产品 pnl + 时间轴 + opex（{len(names)} 个）==", flush=True)
    pnl, timeline, opex, reasons = {}, {}, {}, {}
    for i, name in enumerate(names):
        pnl[name] = get("/finance/project/pnl", {"name": name, "days": 30})
        timeline[name] = get("/dashboard/timeline/payout", {"name": name})
        opex[name] = get("/dashboard/opex", {"name": name})
        reasons[name] = get("/dashboard/quality/reasons", {"name": name})
        if (i + 1) % 10 == 0 or i + 1 == len(names):
            print(f"  {i+1}/{len(names)}", flush=True)
    snap["pnl"] = pnl
    snap["timeline_payout"] = timeline
    snap["opex"] = opex
    snap["quality_reasons_by"] = reasons
    snap["_generated"] = time.strftime("%Y-%m-%d %H:%M")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 自动生成的接口快照（体验版用，免调域名）。重生成：python3 scripts/fetch_snapshot.py\n")
        f.write("module.exports = " + json.dumps(snap, ensure_ascii=False) + "\n")
    print("DONE →", os.path.abspath(OUT), flush=True)


if __name__ == "__main__":
    main()
