#!/usr/bin/env python3
# 产品登记表(飞书多维表格·在线实时) → 小程序用的 data/registry.js。
# 产品(product_name,对应领星 local_name)→ 部门/主线/负责人/权限。
# asin 飞书表无 → 继承旧 registry.js(asin 基本不变;如需更新在飞书表加 asin 字段)。
#
# 用法:export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx
#       python3 scripts/build_registry.py
import json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from fetch_feishu_bitable import fetch_records  # noqa: E402

APP_TOKEN = "FHEFb350aah9HEsuUlbca5Ghnmh"      # 产品登记表(非敏感,表格标识)
TABLE_ID = "tblBx4rjHDZMhK8O"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "registry.js")


def _names(v):
    """飞书人员字段是对象数组 [{name,...}];也兼容字符串。"""
    if isinstance(v, list):
        return [p.get("name", "").strip() for p in v if p.get("name")]
    return [v.strip()] if isinstance(v, str) and v.strip() else []


def _split(v):
    return [x.strip() for x in str(v or "").split(",") if x.strip()]


def _old_asins():
    """从现有 registry.js 继承 asins(飞书表无此字段)。"""
    if not os.path.exists(OUT):
        return {}
    try:
        txt = open(OUT, encoding="utf-8").read()
        i = txt.index("module.exports =")
        data = json.loads(txt[i + len("module.exports ="):])
        return {k: v.get("asins", []) for k, v in data.get("byProduct", {}).items()}
    except Exception:
        return {}


def main():
    if not (os.environ.get("FEISHU_APP_ID") and os.environ.get("FEISHU_APP_SECRET")):
        sys.exit("请先 export FEISHU_APP_ID / FEISHU_APP_SECRET")
    rows = fetch_records(APP_TOKEN, TABLE_ID)
    asin_map = _old_asins()

    by, people = {}, {}
    for r in rows:
        name = (r.get("product_name") or "").strip()
        if not name:
            continue
        e = by.setdefault(name, {"dept": "", "line": "", "owner": "",
                                 "joiners": set(), "uids": set(), "names": set()})
        e["dept"] = e["dept"] or (r.get("部门") or "").strip()
        e["line"] = e["line"] or (r.get("产品主线") or "").strip()
        owners = _names(r.get("主负责人"))
        e["owner"] = e["owner"] or (owners[0] if owners else "")
        e["joiners"].update(_names(r.get("参与运营")))
        uids, names = _split(r.get("permission_uids")), _split(r.get("permission_names"))
        e["uids"].update(uids); e["names"].update(names)
        for u, n in zip(uids, names):
            people[u] = n

    out = {k: {"dept": v["dept"], "line": v["line"], "owner": v["owner"],
               "joiners": sorted(v["joiners"]), "uids": sorted(v["uids"]),
               "names": sorted(v["names"]), "asins": asin_map.get(k, [])}
           for k, v in by.items()}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 产品登记表结构化(飞书多维表格在线源)。重生成:python3 scripts/build_registry.py\n")
        f.write("module.exports = " + json.dumps({"byProduct": out, "people": people}, ensure_ascii=False) + "\n")
    kept = sum(1 for k in out if asin_map.get(k))
    print(f"产品: {len(out)} | 人员 uid: {len(people)} | 继承 asin 的产品: {kept}")


if __name__ == "__main__":
    main()
