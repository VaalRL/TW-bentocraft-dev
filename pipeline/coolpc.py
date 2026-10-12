"""原價屋估價頁的抓取與解析。

只用標準函式庫。估價頁一次請求即包含全部類別（約 1 MB、Big5 編碼）。
"""
from __future__ import annotations

import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser

from pipeline.extract import classify_category, extract

EVALUATE_URL = "https://www.coolpc.com.tw/evaluate.php"
ROBOTS_URL = "https://www.coolpc.com.tw/robots.txt"
USER_AGENT = "TW-bentocraft/1.0 (+https://github.com/VaalRL/TW-bentocraft)"


def fetch(url: str, timeout: int = 30, user_agent: str = USER_AGENT) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
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


def parse_items(html: str) -> list[dict]:
    """解析估價頁，回傳 8 大類別中「有現價且在範圍內」的品項。

    每個品項含原文、所屬 optgroup 與下拉選單、通路 option value，以及 extract() 擷取的欄位。
    """
    parser = SelectParser()
    parser.feed(html)
    parser.close()
    items = []
    for sel in parser.selects:
        cat = classify_category(sel["label"])
        if not cat:
            continue
        for opt in sel["options"]:
            fields = extract(cat, opt["text"], opt["group"], sel["label"])
            if "price" in fields and fields["in_scope"]:
                items.append({"category": cat, "text": opt["text"], "group": opt["group"], "select": sel["name"],
                              "select_label": sel["label"], "vendor_ref": opt["value"], **fields})
    return items
