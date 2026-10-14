"""價格歷史：每個型號每天的最低價，只在價格變動時記一筆，保留最近 N 天。

記錄的是網站清單顯示的價格：主件對應到型號、且不附條件（price_condition）的報價中最低者。
日期以台灣時間計（報價每天台灣 11:17 抓取）。

格式（data/prices/history/<通路>.json）：
  {"vendor": "coolpc", "keep_days": 90, "since": "2026-10-13", "updated": "2026-10-14",
   "models": {"case:x:y": [["2026-10-13", 3990], ["2026-10-20", 3790]]}}
每個型號是 [日期, 價格] 的變動點，日期遞增；某天的價格是該日或之前最後一個變動點的值，
價格為 null 表示那天起沒有報價（下架）。
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

TAIPEI = timezone(timedelta(hours=8))
KEEP_DAYS = 90


def snapshot_date(fetched_at: str) -> date:
    return datetime.fromisoformat(fetched_at.replace("Z", "+00:00")).astimezone(TAIPEI).date()


def daily_lows(prices: dict) -> dict[str, int]:
    """型號 → 當天不附條件報價的最低價。"""
    lows: dict[str, int] = {}
    for o in prices["offers"]:
        main = o["items"][0]
        mid = main.get("model_id")
        if not mid or o.get("price_condition"):
            continue
        lows[mid] = min(o["price"], lows.get(mid, o["price"]))
    return lows


def empty_history(vendor: str, keep_days: int = KEEP_DAYS) -> dict:
    return {"vendor": vendor, "keep_days": keep_days, "since": None, "updated": None, "models": {}}


def update_history(history: dict, prices: dict) -> bool:
    """以一份報價快照更新歷史，回傳是否有更新。抓取失敗（status 不是 ok）的快照不記錄。

    當天沒有報價的型號記一筆 None（下架），重新上架時再記價格；這樣價格長期不變的型號
    與已下架的型號才分得開。
    """
    if prices.get("status") != "ok" or not prices.get("fetched_at"):
        return False
    day = snapshot_date(prices["fetched_at"]).isoformat()
    if history["updated"] and day < history["updated"]:
        return False  # 比歷史舊的快照（例如重跑舊的 commit）不覆寫
    lows = daily_lows(prices)
    for mid in set(lows) | set(history["models"]):
        series = history["models"].setdefault(mid, [])
        value = lows.get(mid)
        if series and series[-1][0] == day:
            series.pop()  # 同一天重跑：以最新一次為準
        if not series or series[-1][1] != value:
            series.append([day, value])
        if not series or series == [[day, None]]:
            del history["models"][mid]  # 從未有報價的型號不記
    history["updated"] = day
    history["since"] = history["since"] or day
    prune(history, date.fromisoformat(day))
    return True


def prune(history: dict, today: date) -> None:
    """只保留 keep_days 天內的變動點；視窗開始前最後一個點移到視窗起點，保留當時的價格。
    整段視窗都是下架狀態的型號移除。"""
    cutoff = (today - timedelta(days=history["keep_days"])).isoformat()
    for mid in list(history["models"]):
        series = history["models"][mid]
        before = [p for p in series if p[0] < cutoff]
        kept = [p for p in series if p[0] >= cutoff]
        if before and (not kept or kept[0][0] > cutoff):
            kept.insert(0, [cutoff, before[-1][1]])
        if all(p[1] is None for p in kept):
            del history["models"][mid]
        else:
            history["models"][mid] = kept
    if history["since"] and history["since"] < cutoff:
        history["since"] = cutoff


def price_on(series: list, day: str) -> int | None:
    """某天的價格（該日或之前最後一個變動點）；早於第一個點或當天下架時為 None。"""
    value = None
    for d, p in series:
        if d > day:
            break
        value = p
    return value


def summarize(history: dict, low_days: int = 30, ago_days: int = 7) -> dict | None:
    """前端用的摘要：{"days": 低價統計的天數, "m": {型號: [近 days 天最低價, ago_days 天前價格或 None]}}。

    歷史不滿 ago_days 天時回傳 None（資料太少，不顯示）。
    """
    if not history["updated"] or not history["since"]:
        return None
    today = date.fromisoformat(history["updated"])
    covered = (today - date.fromisoformat(history["since"])).days
    if covered < ago_days:
        return None
    days = min(low_days, covered)
    start = (today - timedelta(days=days)).isoformat()
    ago = (today - timedelta(days=ago_days)).isoformat()
    out = {}
    for mid, series in history["models"].items():
        if series[-1][1] is None:
            continue  # 目前沒有報價
        prices = [p for d, p in series if d > start] + [price_on(series, start)]
        out[mid] = [min(p for p in prices if p is not None), price_on(series, ago)]
    return {"days": days, "m": out}


def load_history(path: Path, vendor: str) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else empty_history(vendor)


def write_history(path: Path, history: dict) -> None:
    """每個型號一行，讓每日提交的 diff 只顯示價格有變動的型號。"""
    head = {k: v for k, v in history.items() if k != "models"}
    lines = ["{"] + [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()]
    rows = [f"    {json.dumps(mid)}: {json.dumps(s, separators=(',', ':'))}"
            for mid, s in sorted(history["models"].items())]
    lines.append('  "models": {')
    lines.append(",\n".join(rows))
    lines += ["  }", "}"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
