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


def post_sql(db, sql):
    """走 /query/sql 只读自助查询(POST),返回 data 数组。用于按时间粒度聚合等一次性取数。"""
    url = BASE + "/query/sql?" + urllib.parse.urlencode({"db": db, "limit": 10000})
    body = json.dumps({"sql": sql}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read()).get("data", [])
    except Exception as e:
        print("  ! FAIL POST /query/sql", db, str(e)[:80], flush=True)
        return []


# 部门 scope(与后端 _SCOPE 同口径,防越权读别部门)
_SCOPE = ("sid IN (SELECT sid FROM dim_store WHERE status=1 "
          "AND (name LIKE '多趣%' OR name LIKE '格致%'))")

# 产品×月 时间序列(全期):供前端按 月/季度/年 筛选 + 月柱状。带费用拆分(领星口径·USD)。
# 日柱状用快照里已有的逐日 pnl(近30天);此处补"全量按月",order_profit_msku 逐日 GROUP BY 月。
_TIMESERIES_SQL = f"""
SELECT strftime(data_date, '%Y-%m') AS ym, local_name,
       ROUND(SUM(net_amount))    AS sales,
       ROUND(SUM(gross_profit))  AS profit,
       ROUND(SUM(ABS(COALESCE(ads_sp_cost,0))+ABS(COALESCE(ads_sb_cost,0))
               +ABS(COALESCE(ads_sbv_cost,0))+ABS(COALESCE(ads_sd_cost,0)))) AS ad_cost,
       ROUND(SUM(ABS(COALESCE(selling_fee,0))))     AS commission,
       ROUND(SUM(ABS(COALESCE(fulfillment_fee,0)))) AS fba,
       ROUND(SUM(ABS(COALESCE(refund_amount,0))))   AS refund,
       ROUND(SUM(volume))        AS qty
FROM order_profit_msku
WHERE {_SCOPE} AND local_name IS NOT NULL AND local_name <> ''
GROUP BY ym, local_name
ORDER BY ym
"""


def sql(query):
    url = BASE + "/query/sql?db=lingxing"
    body = json.dumps({"sql": query}).encode()
    req = urllib.request.Request(url, data=body, headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=70) as r:
            return json.loads(r.read()).get("data", [])
    except Exception as e:
        print("  ! SQL FAIL", str(e)[:80], flush=True)
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

    # 采购明细(全量·带 PID×采购年份):前端按"每条线活跃代年份(采购额最大年)"逐线收口,
    # 治款混又不打骨折——空调活跃代=2026,保险箱=2025,猫砂盆=2024…各线不同,不能全局卡一年。
    # (全期采购含多代,但领星回款只覆盖当前在卖代;取活跃代采购,两侧同代,回本率才成立。)
    snap["procurement"] = get("/dashboard/procurement_detail", {"name": ""})
    print(f"  procurement_detail(全量·带年份): {len(snap['procurement'])} 行", flush=True)

    snap["opex_company"] = get("/dashboard/opex", {"name": ""})
    print(f"  opex(公司级): {len(snap['opex_company'])} 行", flush=True)

    # 产品×月 时间序列(全期·领星口径·USD):前端按 月/季度/年 筛选 + 月柱状(费用拆分)
    snap["timeseries_monthly"] = post_sql("lingxing", _TIMESERIES_SQL)
    print(f"  timeseries_monthly(产品×月): {len(snap['timeseries_monthly'])} 行", flush=True)

    names = [p["local_name"] for p in snap["compare"]]
    print(f"== 逐产品 pnl + 时间轴 + opex（{len(names)} 个）==", flush=True)
    pnl, timeline, pending, opex, reasons = {}, {}, {}, {}, {}
    for i, name in enumerate(names):
        pnl[name] = get("/finance/project/pnl", {"name": name, "days": 30})
        timeline[name] = get("/dashboard/timeline/payout", {"name": name})
        pending[name] = get("/dashboard/timeline/pending", {"name": name})  # 在途预计到账(未来~1-2月)
        opex[name] = get("/dashboard/opex", {"name": name})
        reasons[name] = get("/dashboard/quality/reasons", {"name": name})
        if (i + 1) % 10 == 0 or i + 1 == len(names):
            print(f"  {i+1}/{len(names)}", flush=True)
    snap["pnl"] = pnl
    snap["timeline_payout"] = timeline
    snap["timeline_pending_by"] = pending
    snap["opex"] = opex
    snap["quality_reasons_by"] = reasons

    print("== 日报 + 运营行动 ==", flush=True)
    # 日报：取最近 30 条，逐条补全 full_content
    reports_list = get("/feishu/reports", {"module": "daily_report", "limit": 30})
    reports_full = []
    seen_dates = set()
    for r in reports_list:
        # 日报按用户多条推送同内容，按 feishu_msg_id 去重只保留每天一条
        mid = r.get("feishu_msg_id", r["id"])
        if mid in seen_dates:
            continue
        seen_dates.add(mid)
        url = BASE + f"/feishu/reports/{r['id']}"
        req = urllib.request.Request(url, headers={"X-API-Key": KEY})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                detail = json.loads(resp.read())
            r["full_content"] = detail.get("full_content") or detail.get("data", {}).get("full_content") or {}
        except Exception as e:
            print(f"  ! report {r['id']} full_content FAIL: {e}", flush=True)
            r["full_content"] = {}
        # 只保留 UI 用到的字段，大幅缩减包体 (raw_rows 等 ~1.2 MB 完全未用)
        KEEP_FC = {'date', 'USD_总销售额', '回款_USD', '毛利润_USD'}
        r["full_content"] = {k: v for k, v in r.get("full_content", {}).items() if k in KEEP_FC}
        reports_full.append(r)
    snap["daily_reports"] = reports_full
    print(f"  daily_reports: {len(reports_full)} 条（去重后）", flush=True)

    # 运营行动：最近 14 天（大 limit 一次拿完，避免单日量多被截断）
    import datetime
    since = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    raw_checkins = get("/checkin", {"since": since, "limit": 2000})
    # 只保留 UI 用到的字段，去除 action_id/date_ms/source/open_id 等冗余字段
    KEEP_CA = {'name', 'date', 'created_at', 'category', 'summary', 'description', 'follow_up', 'product'}
    snap["checkin_actions"] = [{k: v for k, v in c.items() if k in KEEP_CA} for c in raw_checkins]
    print(f"  checkin_actions: {len(snap['checkin_actions'])} 行", flush=True)

    # 月度销售（按产品×月聚合，用于前端日期筛选后显示销售/毛利趋势）
    print("== 月度销售（SQL GROUP BY）==", flush=True)
    monthly_rows = sql(
        "SELECT local_name, strftime('%Y-%m', data_date) as ym, "
        "SUM(amount) as sales, SUM(gross_profit) as profit, SUM(volume) as units "
        "FROM order_profit_msku "
        "WHERE data_date >= '2025-06-01' AND local_name != '' "
        "GROUP BY local_name, ym ORDER BY local_name, ym"
    )
    snap["monthly_sales"] = [
        {"n": r["local_name"], "ym": r["ym"],
         "s": float(r["sales"] or 0), "p": float(r["profit"] or 0), "u": int(float(r["units"] or 0))}
        for r in monthly_rows
    ]
    print(f"  monthly_sales: {len(snap['monthly_sales'])} 行（产品×月）", flush=True)

    snap["_generated"] = time.strftime("%Y-%m-%d %H:%M")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 自动生成的接口快照（体验版用，免调域名）。重生成：python3 scripts/fetch_snapshot.py\n")
        f.write("module.exports = " + json.dumps(snap, ensure_ascii=False) + "\n")
    print("DONE →", os.path.abspath(OUT), flush=True)


if __name__ == "__main__":
    main()
