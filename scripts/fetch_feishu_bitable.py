#!/usr/bin/env python3
# 飞书多维表格取数(翻页拉全)。凭证走环境变量,不写死进 git。
# 用法:
#   export FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx
#   python3 scripts/fetch_feishu_bitable.py <app_token> <table_id> [输出.json]
# 例:python3 scripts/fetch_feishu_bitable.py FHEFb350aah9HEsuUlbca5Ghnmh tblBx4rjHDZMhK8O
import json, os, sys, urllib.request

BASE = "https://open.feishu.cn/open-apis"


def _load_dotenv():
    """读项目根 .env(KEY=VALUE),已存在的环境变量优先。凭证放这里,不进 git。"""
    p = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(p):
        return
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()
APP_ID = os.environ.get("FEISHU_APP_ID")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET")


def _post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _get(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def token():
    d = _post("/auth/v3/tenant_access_token/internal", {"app_id": APP_ID, "app_secret": APP_SECRET})
    if d.get("code") != 0:
        sys.exit("拿 token 失败: " + json.dumps(d, ensure_ascii=False))
    return d["tenant_access_token"]


def fetch_records(app_token, table_id):
    tok = token()
    items, page = [], ""
    while True:
        q = f"/bitable/v1/apps/{app_token}/tables/{table_id}/records?page_size=500"
        if page:
            q += "&page_token=" + page
        d = _get(q, tok)
        if d.get("code") != 0:
            sys.exit(f"读 records 失败(code {d.get('code')}): {d.get('msg')}")
        data = d["data"]
        items += [it["fields"] | {"_record_id": it["record_id"]} for it in data.get("items", [])]
        if not data.get("has_more"):
            break
        page = data["page_token"]
    return items


if __name__ == "__main__":
    if not (APP_ID and APP_SECRET):
        sys.exit("请先 export FEISHU_APP_ID / FEISHU_APP_SECRET")
    if len(sys.argv) < 3:
        sys.exit("用法: python3 scripts/fetch_feishu_bitable.py <app_token> <table_id> [输出.json]")
    app_token, table_id = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else "data/feishu_bitable.json"
    rows = fetch_records(app_token, table_id)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"DONE {len(rows)} 行 → {out}")
