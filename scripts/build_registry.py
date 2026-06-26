#!/usr/bin/env python3
# 把产品登记表 CSV 结构化成小程序用的 data/registry.js。
# 产品(product_name，对应领星 local_name)→ 部门/类目/负责人/权限 uid/asin。
# 重生成：python3 scripts/build_registry.py
import csv, json, os

CSV = os.path.join(os.path.dirname(__file__), "..", "data",
                   "multibot_product_registry · 产品登记表 v0.1_产品表-领星版本_总表.csv")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "registry.js")


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig")))
    by = {}
    people = {}   # uid -> name
    for r in rows:
        name = r["product_name"].strip()
        if not name:
            continue
        e = by.setdefault(name, {"dept": "", "line": "", "owner": "",
                                 "joiners": set(), "uids": set(), "names": set(), "asins": set()})
        e["dept"] = e["dept"] or r["部门"].strip()
        e["line"] = e["line"] or r["产品主线"].strip()
        e["owner"] = e["owner"] or r["主负责人"].strip()
        if r["参与运营"].strip():
            e["joiners"].add(r["参与运营"].strip())
        uids = [u.strip() for u in r["permission_uids"].split(",") if u.strip()]
        names = [n.strip() for n in r["permission_names"].split(",") if n.strip()]
        e["uids"].update(uids)
        e["names"].update(names)
        e["asins"].update(a.strip() for a in r["asin_list"].split(",") if a.strip())
        for u, n in zip(uids, names):
            people[u] = n

    out = {}
    for k, v in by.items():
        out[k] = {"dept": v["dept"], "line": v["line"], "owner": v["owner"],
                  "joiners": sorted(v["joiners"]), "uids": sorted(v["uids"]),
                  "names": sorted(v["names"]), "asins": sorted(v["asins"])}

    data = {"byProduct": out, "people": people}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 产品登记表结构化（产品→部门/类目/负责人/权限/asin）。重生成：python3 scripts/build_registry.py\n")
        f.write("module.exports = " + json.dumps(data, ensure_ascii=False) + "\n")
    print("产品:", len(out), "| 人员 uid:", len(people))


if __name__ == "__main__":
    main()
