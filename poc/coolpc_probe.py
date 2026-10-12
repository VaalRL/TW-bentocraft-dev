"""PoC：驗證 GitHub Actions 能否抓取原價屋估價頁，並量測品名規格擷取率。

用法：
    python poc/coolpc_probe.py --out poc/out            # 線上抓取
    python poc/coolpc_probe.py --html saved.html --out poc/out   # 解析本機存檔

只用標準函式庫。每次執行只對原價屋發出 robots.txt 與 evaluate.php 各一次請求。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spec_extract import REQUIRED_FIELDS, classify_category, extract  # noqa: E402

EVALUATE_URL = "https://www.coolpc.com.tw/evaluate.php"
ROBOTS_URL = "https://www.coolpc.com.tw/robots.txt"
USER_AGENT = "TW-bentocraft-PoC/0.1 (+https://github.com/VaalRL/TW-bentocraft)"
SAMPLES_PER_CATEGORY = 3
MISSING_SAMPLES = 25


def fetch(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        },
    )
    started = time.monotonic()
    result: dict = {"url": url}
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            result.update(
                status=resp.status,
                final_url=resp.geturl(),
                content_type=resp.headers.get("Content-Type"),
                server=resp.headers.get("Server"),
                body=body,
            )
    except urllib.error.HTTPError as e:
        result.update(status=e.code, error=str(e), body=e.read() or b"")
    except Exception as e:  # 連線逾時、DNS、TLS 等
        result.update(status=None, error=f"{type(e).__name__}: {e}", body=b"")
    result["elapsed_s"] = round(time.monotonic() - started, 2)
    result["bytes"] = len(result["body"])
    return result


def decode_html(body: bytes, content_type: str | None) -> tuple[str, str]:
    """依 Content-Type / meta charset 解碼；都沒有時比較 utf-8 與 cp950 的錯誤數。"""
    candidates = []
    for source in (content_type or "", body[:4096].decode("ascii", "ignore")):
        m = re.search(r"charset=[\"']?([\w-]+)", source, re.I)
        if m:
            candidates.append(m.group(1).lower())
    candidates += ["utf-8", "cp950"]
    best = None
    for enc in dict.fromkeys("cp950" if c in ("big5", "big5-hkscs") else c for c in candidates):
        try:
            text = body.decode(enc, errors="replace")
        except LookupError:
            continue
        bad = text.count("�")
        if best is None or bad < best[2]:
            best = (text, enc, bad)
        if bad == 0:
            break
    return best[0], best[1]


class SelectParser(HTMLParser):
    """收集每個 <select> 的類別標籤、optgroup 與 option 文字。

    類別標籤取 <select> 之前最近一段非空文字（估價頁通常在同一列的前一格）。
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.selects: list[dict] = []
        self._last_text = ""
        self._cur: dict | None = None
        self._group = ""
        self._opt: list[str] | None = None
        self._opt_attrs: dict = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "select":
            self._cur = {"name": a.get("name") or a.get("id") or "", "label": self._last_text, "options": []}
            self._group = ""
        elif tag == "optgroup" and self._cur is not None:
            self._group = (a.get("label") or "").strip()
        elif tag == "option" and self._cur is not None:
            self._close_option()
            self._opt = []
            self._opt_attrs = a

    def handle_endtag(self, tag):
        if tag == "option":
            self._close_option()
        elif tag == "optgroup":
            self._close_option()
            self._group = ""
        elif tag == "select" and self._cur is not None:
            self._close_option()
            self.selects.append(self._cur)
            self._cur = None

    def handle_data(self, data):
        if self._opt is not None:
            self._opt.append(data)
        elif self._cur is None:
            text = " ".join(data.split())
            if text:
                self._last_text = text[:60]

    def _close_option(self):
        if self._opt is None or self._cur is None:
            self._opt = None
            return
        text = " ".join("".join(self._opt).split())
        if text:
            self._cur["options"].append(
                {"text": text, "group": self._group, "value": self._opt_attrs.get("value"),
                 "disabled": "disabled" in self._opt_attrs}
            )
        self._opt = None


def analyse(html: str) -> dict:
    parser = SelectParser()
    parser.feed(html)
    parser.close()

    report: dict = {"select_count": len(parser.selects), "selects": [], "categories": {}}
    per_cat: dict[str, list[dict]] = defaultdict(list)
    out_of_scope: Counter = Counter()
    for sel in parser.selects:
        cat = classify_category(sel["label"])
        priced = 0
        for opt in sel["options"]:
            # 下拉選單標籤（如「封閉式｜開放式水冷」）與 optgroup 一起作為擷取上下文
            fields = extract(cat, opt["text"], opt["group"], sel["label"])
            if "price" not in fields:
                continue
            priced += 1
            if not cat:
                continue
            if fields["in_scope"]:
                per_cat[cat].append({"text": opt["text"], "group": opt["group"], **fields})
            else:
                out_of_scope[cat] += 1
        report["selects"].append(
            {"name": sel["name"], "label": sel["label"], "category": cat,
             "options": len(sel["options"]), "priced_options": priced,
             "groups": sorted({o["group"] for o in sel["options"] if o["group"]})}
        )

    for cat, items in per_cat.items():
        required = REQUIRED_FIELDS.get(cat, ())

        def ok(i):
            return all(i.get(f) for f in required)

        by_group: dict[str, list[dict]] = defaultdict(list)
        for i in items:
            by_group[i["group"]].append(i)
        report["categories"][cat] = {
            "items": len(items),
            "out_of_scope": out_of_scope[cat],
            "bundle_only": sum(1 for i in items if i["bundle_only"]),
            "combo_discount": sum(1 for i in items if i.get("combo_discount")),
            "field_coverage": {f: round(sum(1 for i in items if i.get(f)) / len(items), 3) for f in required},
            "all_required_fields": round(sum(1 for i in items if ok(i)) / len(items), 3) if required else None,
            "group_coverage": sorted(
                ((g, len(v), round(sum(1 for i in v if ok(i)) / len(v), 2)) for g, v in by_group.items()),
                key=lambda x: x[2],
            ),
            "value_counts": {
                f: Counter(str(i.get(f)) for i in items).most_common(10)
                for f in ("socket", "memory_type", "form_factor", "psu_form", "max_form_factor", "no_igpu")
                if any(f in i for i in items)
            },
            "samples": items[:SAMPLES_PER_CATEGORY],
            "missing_samples": [i["text"] for i in items if not ok(i)][:MISSING_SAMPLES],
        }
    return report


def to_markdown(meta: dict, report: dict | None) -> str:
    lines = ["# CoolPC PoC probe", ""]
    lines.append("| 請求 | 狀態 | 位元組 | 耗時(s) | 備註 |")
    lines.append("| :-- | :-- | --: | --: | :-- |")
    for r in meta["requests"]:
        note = r.get("error") or r.get("content_type") or ""
        lines.append(f"| `{r['url']}` | {r['status']} | {r['bytes']} | {r['elapsed_s']} | {note} |")
    if meta.get("encoding"):
        lines += ["", f"偵測編碼：`{meta['encoding']}`"]
    if not report:
        return "\n".join(lines) + "\n"
    lines += ["", f"`<select>` 數量：{report['select_count']}", ""]
    lines.append("| 類別 | 範圍內品項 | 排除 | 組裝/搭機價 | 任搭折抵 | 必要欄位全數擷取 | 各欄位擷取率 |")
    lines.append("| :-- | --: | --: | --: | --: | --: | :-- |")
    for cat, c in sorted(report["categories"].items()):
        cov = ", ".join(f"{k} {v:.0%}" for k, v in c["field_coverage"].items()) or "—"
        allf = "—" if c["all_required_fields"] is None else f"{c['all_required_fields']:.0%}"
        lines.append(f"| {cat} | {c['items']} | {c['out_of_scope']} | {c['bundle_only']} | "
                     f"{c['combo_discount']} | {allf} | {cov} |")
    unmapped = [s for s in report["selects"] if not s["category"] and s["priced_options"]]
    if unmapped:
        lines += ["", "未對應類別的下拉選單：", ""]
        lines += [f"- `{s['name']}` {s['label']}（{s['priced_options']} 項）" for s in unmapped]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="解析本機 HTML 檔，不連網")
    ap.add_argument("--out", default="poc/out")
    ap.add_argument("--save-html", action="store_true", help="保存原始 HTML 至輸出目錄")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    meta: dict = {"requests": []}
    if args.html:
        body, ctype = Path(args.html).read_bytes(), None
        meta["requests"].append({"url": args.html, "status": "local", "bytes": len(body), "elapsed_s": 0})
    else:
        robots = fetch(ROBOTS_URL)
        meta["robots_txt"] = robots["body"].decode("utf-8", "replace")[:4000] if robots["status"] == 200 else None
        time.sleep(2)
        page = fetch(EVALUATE_URL, timeout=60)
        for r in (robots, page):
            meta["requests"].append({k: v for k, v in r.items() if k != "body"})
        body, ctype = page["body"], page.get("content_type")
        if page["status"] != 200 or not body:
            (out / "report.md").write_text(to_markdown(meta, None), encoding="utf-8")
            (out / "report.json").write_text(json.dumps({"meta": meta}, ensure_ascii=False, indent=2), encoding="utf-8")
            print(to_markdown(meta, None))
            return 1

    html, enc = decode_html(body, ctype)
    meta["encoding"] = enc
    if args.save_html:
        (out / "evaluate.html").write_bytes(body)
    report = analyse(html)
    md = to_markdown(meta, report)
    (out / "report.md").write_text(md, encoding="utf-8")
    (out / "report.json").write_text(json.dumps({"meta": meta, "report": report}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(md)
    if meta.get("robots_txt"):
        print("## robots.txt\n```\n" + meta["robots_txt"] + "\n```")
    # 日誌中列出少量樣本，供下一輪調整擷取規則
    for cat, c in sorted(report["categories"].items()):
        print(f"\n## {cat} value counts")
        print(json.dumps(c["value_counts"], ensure_ascii=False))
        print(f"## {cat} group coverage (group, items, all-required ratio)")
        for g in c["group_coverage"]:
            print("  ", json.dumps(g, ensure_ascii=False))
        print(f"## {cat} samples")
        for s in c["samples"]:
            print(json.dumps(s, ensure_ascii=False))
        print(f"## {cat} missing required fields")
        for t in c["missing_samples"]:
            print("  -", t)
    print("\n## selects")
    for s in report["selects"]:
        if s["priced_options"]:
            print(json.dumps({k: v for k, v in s.items() if k != "groups"}, ensure_ascii=False))
    return 0 if report["categories"] else 2


if __name__ == "__main__":
    sys.exit(main())
