"""以當天的報價快照更新價格歷史（data/prices/history/<通路>.json），格式見 pipeline/history.py。

每日報價流程在提交快照前執行。抓取失敗（status: stale）的快照不記錄。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.history import load_history, update_history, write_history  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prices", type=Path, default=ROOT / "data/prices/coolpc.json")
    ap.add_argument("--history", type=Path, default=ROOT / "data/prices/history/coolpc.json")
    args = ap.parse_args()

    prices = json.loads(args.prices.read_text(encoding="utf-8"))
    history = load_history(args.history, prices.get("vendor", "coolpc"))
    if not update_history(history, prices):
        print(f"未更新價格歷史（報價狀態 {prices.get('status')}，日期 {prices.get('fetched_at')}）")
        return 0
    write_history(args.history, history)
    print(f"價格歷史：{len(history['models'])} 個型號，{history['since']} 至 {history['updated']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
