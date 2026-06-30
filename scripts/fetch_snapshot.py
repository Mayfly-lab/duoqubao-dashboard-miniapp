#!/usr/bin/env python3
# 把 duoqubao-api 的接口数据预拉成本地快照 data/api_snapshot.js，
# 供小程序体验版直接 require（无需配置合法域名 / 调 tunnel）。
# 重新生成：python3 scripts/fetch_snapshot.py
import json, os, sys, time, urllib.parse, urllib.request

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


def load_existing():
    """加载现有快照做底:分段刷新时未刷的段、以及拉空/失败的键,都保留旧值(防领星锁把数据冲空)。"""
    if not os.path.exists(OUT):
        return {}
    try:
        txt = open(OUT, encoding="utf-8").read()
        i = txt.index("module.exports =")
        return json.loads(txt[i + len("module.exports ="):])
    except Exception as e:
        print("  ! 旧快照解析失败,从空开始:", str(e)[:80], flush=True)
        return {}


# 分段:global=轻量全局(几十次调用,默认刷) / products=逐产品重活(~460次,显式才刷) / daily=日报+行动 / monthly=月度销售
SECTIONS = ["global", "products", "daily", "monthly"]


def main():
    args = [a.lower() for a in sys.argv[1:] if not a.startswith("-")]
    if "all" in args:
        sects = set(SECTIONS)
    elif args:
        sects = {a for a in args if a in SECTIONS}
    else:
        sects = {"global", "daily", "monthly"}   # 默认不含逐产品重活
    snap = load_existing()
    print(f"== 快照分段刷新: {sorted(sects)} | 旧快照已加载 {len(snap)} 键 ==", flush=True)

    def put(key, val, label=None):
        """合并安全:拿到非空才覆盖;空/失败(如撞锁)保留旧值,不冲数据。"""
        if isinstance(val, dict):
            n = sum(1 for v in val.values() if v)
        elif hasattr(val, "__len__"):
            n = len(val)
        else:
            n = 1 if val else 0
        if n:
            snap[key] = val
            print(f"  ✓ {label or key}: {n}", flush=True)
        else:
            old = snap.get(key)
            oldn = len(old) if hasattr(old, "__len__") else (1 if old else 0)
            print(f"  ! {label or key} 空/失败 → 保留旧值({oldn})", flush=True)

    if "global" in sects:
        print("== global 全局接口 ==", flush=True)
        put("compare", get("/finance/projects/compare", {"days": 365, "limit": 200}))
        put("projects", get("/finance/projects"))
        for ep in ["fees", "payback", "inventory", "ads", "refund", "quality/stars", "quality/reasons", "timeline/pending"]:
            put(ep.replace("/", "_"), get("/dashboard/" + ep, {"name": ""}), ep)
        put("procurement", get("/dashboard/procurement_detail", {"name": ""}), "procurement(明细·带年份)")
        put("opex_company", get("/dashboard/opex", {"name": ""}), "opex_company")
        put("timeseries_monthly", post_sql("lingxing", _TIMESERIES_SQL), "timeseries_monthly")
        put("capital", post_sql("finance", (
            "SELECT 公司 AS company, ROUND(账上现金_cny) AS cash_cny, ROUND(平台待回款_usd) AS pending_usd, "
            "ROUND(在库货值_usd) AS stock_usd, 在库件数 AS stock_qty, ROUND(在途货值_usd) AS transit_usd "
            "FROM finance_capital_company")), "capital(资金盘)")
        put("payable_total", post_sql("finance",
            "SELECT ROUND(SUM(未结)) AS owe_cny FROM finance_v_outstanding WHERE 是否冲账=false"), "payable_total")
        # 真实利润修正:领星 per-产品 销量+领星填的成本(成本常漏填→毛利虚高);用合同真实采购单价重算
        put("profit_base", post_sql("lingxing", (
            "SELECT local_name, ROUND(SUM(net_amount)) AS sales, ROUND(SUM(gross_profit)) AS lx_profit, "
            "ROUND(ABS(SUM(purchase_costs))) AS lx_cogs, ROUND(SUM(volume)) AS qty "
            f"FROM order_profit_msku WHERE {_SCOPE} AND local_name <> '' GROUP BY local_name")), "profit_base")
        # 合同采购单价(by 规范名=公司-品类;公司前缀前端去,聚到类级均价)
        put("line_unit_cost", post_sql("finance", (
            "SELECT 规范名 AS spec, ROUND(SUM(采购总额)) AS tot, SUM(采购数量) AS qty "
            "FROM finance_dim_contract WHERE 是否子项=false AND 采购数量>0 GROUP BY 规范名")), "line_unit_cost")

    if "products" in sects:
        names = [p["local_name"] for p in snap.get("compare", [])]
        print(f"== products 逐产品（{len(names)} 个·重活·~460次调用）==", flush=True)
        pnl, timeline, pending, opex, reasons = {}, {}, {}, {}, {}
        for i, name in enumerate(names):
            pnl[name] = get("/finance/project/pnl", {"name": name, "days": 30})
            timeline[name] = get("/dashboard/timeline/payout", {"name": name})
            pending[name] = get("/dashboard/timeline/pending", {"name": name})
            opex[name] = get("/dashboard/opex", {"name": name})
            reasons[name] = get("/dashboard/quality/reasons", {"name": name})
            if (i + 1) % 10 == 0 or i + 1 == len(names):
                print(f"  {i+1}/{len(names)}", flush=True)
        put("pnl", pnl); put("timeline_payout", timeline); put("timeline_pending_by", pending)
        put("opex", opex); put("quality_reasons_by", reasons)

    if "daily" in sects:
        print("== daily 日报 + 运营行动 ==", flush=True)
        reports_list = get("/feishu/reports", {"module": "daily_report", "limit": 30})
        reports_full, seen = [], set()
        KEEP_FC = {'date', 'USD_总销售额', '回款_USD', '毛利润_USD', '库龄危险'}
        for r in reports_list:
            mid = r.get("feishu_msg_id", r["id"])
            if mid in seen:
                continue
            seen.add(mid)
            req = urllib.request.Request(BASE + f"/feishu/reports/{r['id']}", headers={"X-API-Key": KEY})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    detail = json.loads(resp.read())
                fc = detail.get("full_content") or detail.get("data", {}).get("full_content") or {}
            except Exception as e:
                print(f"  ! report {r['id']} FAIL: {e}", flush=True)
                fc = {}
            r["full_content"] = {k: v for k, v in fc.items() if k in KEEP_FC}
            reports_full.append(r)
        put("daily_reports", reports_full, "daily_reports(去重)")

        import datetime
        since = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
        KEEP_CA = {'name', 'date', 'created_at', 'category', 'summary', 'description', 'follow_up', 'product'}
        raw = get("/checkin", {"since": since, "limit": 2000})
        put("checkin_actions", [{k: v for k, v in c.items() if k in KEEP_CA} for c in raw], "checkin_actions")

    if "monthly" in sects:
        print("== monthly 月度销售（SQL）==", flush=True)
        rows = sql(
            "SELECT local_name, strftime('%Y-%m', data_date) as ym, "
            "SUM(amount) as sales, SUM(gross_profit) as profit, SUM(volume) as units "
            "FROM order_profit_msku WHERE data_date >= '2025-06-01' AND local_name != '' "
            "GROUP BY local_name, ym ORDER BY local_name, ym")
        put("monthly_sales", [{"n": r["local_name"], "ym": r["ym"],
                               "s": float(r["sales"] or 0), "p": float(r["profit"] or 0), "u": int(float(r["units"] or 0))}
                              for r in rows], "monthly_sales(产品×月)")

    snap["_generated"] = time.strftime("%Y-%m-%d %H:%M")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 自动生成的接口快照（体验版用，免调域名）。\n")
        f.write("// 用法: python3 scripts/fetch_snapshot.py [global|products|daily|monthly|all]  (默认=global daily monthly,不含逐产品重活)\n")
        f.write("module.exports = " + json.dumps(snap, ensure_ascii=False) + "\n")
    print("DONE →", os.path.abspath(OUT), flush=True)


if __name__ == "__main__":
    main()
