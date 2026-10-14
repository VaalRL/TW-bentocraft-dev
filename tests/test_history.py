"""價格歷史測試。"""
import json
import tempfile
import unittest
from pathlib import Path

from pipeline.history import (daily_lows, empty_history, load_history, summarize, update_history,
                              write_history)


def snapshot(day: str, prices: dict, status: str = "ok") -> dict:
    """day 為台灣日期；報價在台灣 11:17（UTC 03:17）抓取。"""
    offers = []
    for mid, p in prices.items():
        for price in (p if isinstance(p, list) else [p]):
            offers.append({"price": price, "items": [{"role": "main", "model_id": mid}]})
    return {"status": status, "fetched_at": f"{day}T03:17:00Z", "offers": offers}


class DailyLowsTest(unittest.TestCase):
    def test_lowest_unconditional_main_offer(self):
        doc = snapshot("2026-10-13", {"case:a": [3990, 3790]})
        doc["offers"] += [
            {"price": 2990, "price_condition": {"type": "assembly"}, "items": [{"role": "main", "model_id": "case:a"}]},
            {"price": 100, "items": [{"role": "main", "match": "unmatched", "text": "x"}]},
        ]
        self.assertEqual(daily_lows(doc), {"case:a": 3790})  # 組裝價、未對應的列不算


class UpdateTest(unittest.TestCase):
    def run_days(self, days, keep=90):
        h = empty_history("coolpc", keep)
        for day, prices in days:
            update_history(h, snapshot(day, prices))
        return h

    def test_records_only_changes(self):
        h = self.run_days([("2026-10-13", {"a": 100}), ("2026-10-14", {"a": 100}), ("2026-10-15", {"a": 90})])
        self.assertEqual(h["models"]["a"], [["2026-10-13", 100], ["2026-10-15", 90]])
        self.assertEqual((h["since"], h["updated"]), ("2026-10-13", "2026-10-15"))

    def test_delisting_and_relisting(self):
        h = self.run_days([("2026-10-13", {"a": 100, "b": 5}), ("2026-10-14", {"b": 5}), ("2026-10-15", {"a": 100, "b": 5})])
        self.assertEqual(h["models"]["a"], [["2026-10-13", 100], ["2026-10-14", None], ["2026-10-15", 100]])

    def test_same_day_rerun_replaces(self):
        h = self.run_days([("2026-10-13", {"a": 100}), ("2026-10-14", {"a": 90}), ("2026-10-14", {"a": 100})])
        self.assertEqual(h["models"]["a"], [["2026-10-13", 100]])

    def test_stale_or_older_snapshots_are_ignored(self):
        h = self.run_days([("2026-10-14", {"a": 100})])
        self.assertFalse(update_history(h, snapshot("2026-10-15", {"a": 1}, status="stale")))
        self.assertFalse(update_history(h, snapshot("2026-10-13", {"a": 1})))
        self.assertEqual(h["models"]["a"], [["2026-10-14", 100]])

    def test_taiwan_date(self):
        h = empty_history("coolpc")
        update_history(h, {"status": "ok", "fetched_at": "2026-10-13T17:00:00Z", "offers": []})
        self.assertEqual(h["updated"], "2026-10-14")  # UTC 17:00 = 台灣隔天 01:00

    def test_prune_keeps_price_at_window_start(self):
        h = self.run_days([("2026-01-01", {"a": 100, "b": 7}), ("2026-01-05", {"a": 90}), ("2026-01-20", {"a": 90})], keep=10)
        self.assertEqual(h["models"]["a"], [["2026-01-10", 90]])  # 窗口起點的價格仍保留
        self.assertNotIn("b", h["models"])  # 下架超過保留期間
        self.assertEqual(h["since"], "2026-01-10")


class SummaryTest(unittest.TestCase):
    def test_hidden_until_a_week_of_history(self):
        h = empty_history("coolpc")
        update_history(h, snapshot("2026-10-13", {"a": 100}))
        update_history(h, snapshot("2026-10-19", {"a": 90}))
        self.assertIsNone(summarize(h))

    def test_low_and_week_ago(self):
        h = empty_history("coolpc")
        for day, p in [("2026-10-01", 100), ("2026-10-05", 80), ("2026-10-10", 95), ("2026-10-20", 99)]:
            update_history(h, snapshot(day, {"a": p, "gone": 1} if day < "2026-10-20" else {"a": p}))
        s = summarize(h)
        self.assertEqual(s["days"], 19)
        self.assertEqual(s["m"]["a"], [80, 95])  # 近 19 天最低 80；10/13 的價格 95
        self.assertNotIn("gone", s["m"])  # 目前沒有報價的不輸出

    def test_low_uses_price_at_window_start(self):
        h = empty_history("coolpc")
        update_history(h, snapshot("2026-09-01", {"a": 70}))
        update_history(h, snapshot("2026-10-20", {"a": 99}))
        self.assertEqual(summarize(h)["m"]["a"], [70, 70])  # 9/20 起算的窗口開始時仍是 70


class FileTest(unittest.TestCase):
    def test_roundtrip(self):
        h = empty_history("coolpc")
        update_history(h, snapshot("2026-10-13", {"b": 2, "a": 1}))
        with tempfile.TemporaryDirectory() as d:
            path = Path(d, "history/coolpc.json")
            write_history(path, h)
            self.assertEqual(load_history(path, "coolpc"), h)
            self.assertEqual(json.loads(path.read_text())["models"], {"a": [["2026-10-13", 1]], "b": [["2026-10-13", 2]]})
            self.assertEqual(load_history(Path(d, "missing.json"), "coolpc"), empty_history("coolpc"))


if __name__ == "__main__":
    unittest.main()
