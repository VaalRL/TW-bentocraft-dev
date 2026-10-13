"""每日報價更新：抓取原價屋估價頁 → 對應規格庫 → 寫出 data/prices/coolpc.json。

用法：
    python scripts/update_prices.py --out data/prices/coolpc.json
    python scripts/update_prices.py --html saved.html --out …   # 解析存檔，不連網

抓取失敗或解析結果異常時，保留上次成功的報價列並把 status 改為 stale（fetched_at 不變）；
只有連上次的快照都沒有時才以非零碼結束。結果寫入 GITHUB_OUTPUT 的 crawl_ok、reason，
供 workflow 決定是否開 issue。抓取成功但對應到規格庫的比例明顯偏低時（頁面改版或規格庫久未新增型號），
報價照常寫出，另以 match_warning 回報。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.catalog import CatalogIndex, load_catalog  # noqa: E402
from pipeline.coolpc import EVALUATE_URL, ROBOTS_URL, decode_html, fetch, parse_items  # noqa: E402
from pipeline.prices import build_offers, write_prices  # noqa: E402

MIN_ITEMS = 500          # PoC 實測約 2,300 列；低於此數視為頁面改版或抓到錯誤頁
MIN_RATIO_OF_PREVIOUS = 0.7
# 對應率監測（01 第三節之 3 第 4 點）：新型號每週由 bootstrap 補進規格庫，平常未對應的列應很少
MIN_MATCH_RATIO = 0.9            # 整體
MIN_CATEGORY_MATCH_RATIO = 0.8   # 單一類別（報價列至少 MIN_CATEGORY_ROWS 列才檢查）
MIN_CATEGORY_ROWS = 20


def match_warning(stats: dict) -> str:
    """對應率偏低時回傳說明，否則回傳空字串。"""
    total = sum(c["offers"] for c in stats.values())
    matched = sum(c.get("matched", 0) for c in stats.values())
    problems = []
    if total and matched / total < MIN_MATCH_RATIO:
        problems.append(f"整體 {matched / total:.0%}")
    for cat, c in stats.items():
        ratio = c.get("matched", 0) / c["offers"]
        if c["offers"] >= MIN_CATEGORY_ROWS and ratio < MIN_CATEGORY_MATCH_RATIO:
            problems.append(f"{cat} {ratio:.0%}")
    if not problems:
        return ""
    return "報價對應到規格庫的比例偏低：" + "、".join(problems) + "。可能是頁面改版，或規格庫需要新增型號（catalog-bootstrap）"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def robots_allows(body: bytes) -> bool:
    """只處理最簡單的情況：對所有 User-agent 禁止 /evaluate.php 或 / 時視為不允許。"""
    agent_all = False
    for raw in body.decode("utf-8", "replace").splitlines():
        line = raw.split("#")[0].strip()
        if line.lower().startswith("user-agent:"):
            agent_all = line.split(":", 1)[1].strip() == "*"
        elif agent_all and line.lower().startswith("disallow:"):
            path = line.split(":", 1)[1].strip()
            if path in ("/", "/evaluate.php"):
                return False
    return True


def get_page(args) -> tuple[bytes | None, str | None, str]:
    """回傳 (內容, Content-Type, 失敗原因)。"""
    if args.html:
        return Path(args.html).read_bytes(), None, ""
    robots = fetch(ROBOTS_URL)
    if robots.get("status") == 200 and not robots_allows(robots["body"]):
        return None, None, "robots.txt 不允許抓取估價頁"
    time.sleep(2)
    page = fetch(EVALUATE_URL, timeout=60)
    if page.get("status") != 200 or not page["body"]:
        return None, None, f"估價頁抓取失敗：{page.get('status')} {page.get('error', '')}".strip()
    if args.save_html:
        Path(args.save_html).write_bytes(page["body"])
    return page["body"], page.get("content_type"), ""


def set_output(**values) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            for k, v in values.items():
                f.write(f"{k}={str(v).replace(chr(10), ' ')}\n")


def summary(lines: list[str]) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    text = "\n".join(lines) + "\n"
    print(text)
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "data/prices/coolpc.json")
    ap.add_argument("--catalog-dir", type=Path, default=ROOT / "data/catalog")
    ap.add_argument("--html", help="解析本機存檔，不連網")
    ap.add_argument("--save-html", help="把抓到的估價頁另存（供規格庫初始化等後續步驟使用，避免再次請求）")
    ap.add_argument("--keep-raw-title", action="store_true", help="保留通路原始品名（預設不保留）")
    args = ap.parse_args()

    previous = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else None
    attempt = now_iso()
    body, ctype, reason = get_page(args)
    items = []
    if body is not None:
        html, _ = decode_html(body, ctype)
        items = parse_items(html)
        prev_count = len(previous["offers"]) if previous else 0
        if len(items) < MIN_ITEMS:
            reason = f"只解析出 {len(items)} 列（下限 {MIN_ITEMS}），疑似頁面改版"
        elif prev_count and len(items) < prev_count * MIN_RATIO_OF_PREVIOUS:
            reason = f"解析出 {len(items)} 列，比上次 {prev_count} 列少 {1 - len(items) / prev_count:.0%}，疑似頁面改版"

    if reason:
        set_output(crawl_ok="false", reason=reason)
        if previous is None:
            summary(["## 報價更新失敗", "", reason, "", "沒有上次的快照可沿用。"])
            return 1
        doc = {**previous, "status": "stale", "last_attempt_at": attempt}
        write_prices(args.out, doc)
        summary([f"## 報價更新失敗，沿用 {previous['fetched_at']} 的快照", "", reason])
        return 0

    index = CatalogIndex(load_catalog(args.catalog_dir))
    offers, stats = build_offers(items, index, int(attempt[:4]), keep_raw_title=args.keep_raw_title)
    doc = {
        "$schema": "../../schema/prices.schema.json",
        "schema_version": "1.0",
        "vendor": "coolpc",
        "source_url": EVALUATE_URL,
        "fetched_at": attempt,
        "status": "ok",
        "last_attempt_at": attempt,
        "offers": offers,
    }
    write_prices(args.out, doc)
    warning = match_warning(stats)
    set_output(crawl_ok="true", reason="", match_warning=warning)
    rows = ["## 報價更新成功", "", f"抓取時間：{attempt}，共 {len(offers)} 列", "",
            "| 類別 | 報價列 | 對應到規格庫 |", "| :-- | --: | --: |"]
    for cat, c in stats.items():
        rows.append(f"| {cat} | {c['offers']} | {c.get('matched', 0) / c['offers']:.0%} |")
    if warning:
        rows += ["", f"**注意**：{warning}"]
    summary(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
