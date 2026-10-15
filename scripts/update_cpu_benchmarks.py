"""從 Blender Open Data 快照整理規格庫 CPU 的算圖跑分，寫入 data/benchmarks/blender-cpu.json。

用法：python scripts/update_cpu_benchmarks.py [--zip 已下載的快照.zip]
不給 --zip 時下載最新快照（約 100 MB）。結果涵蓋的型號比上一版少一半以上時視為異常，保留舊檔並以非 0 結束。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.benchmarks import MIN_SAMPLES, SNAPSHOT_URL, catalog_key, medians, pick_version, read_snapshot  # noqa: E402
from pipeline.catalog import load_catalog  # noqa: E402

OUT = ROOT / "data/benchmarks/blender-cpu.json"
USER_AGENT = "TW-bentocraft (+https://github.com/VaalRL/TW-bentocraft) benchmark fetcher"


def download(dest: Path) -> None:
    req = urllib.request.Request(SNAPSHOT_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=300) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f)


def catalog_keys() -> set[str]:
    shards = load_catalog(ROOT / "data/catalog")
    cpus = shards["cpu"]["models"]
    return {k for mid, m in cpus.items() if m.get("status") != "deprecated" and (k := catalog_key(mid, m["brand"], m["name"]))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", type=Path, help="已下載的快照 zip（省略時下載最新快照）")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    keys = catalog_keys()
    with tempfile.TemporaryDirectory() as tmp:
        path = args.zip or Path(tmp) / "opendata-latest.zip"
        if not args.zip:
            download(path)
        results, member = read_snapshot(path)
        cpu_results = list(results)  # 只留 CPU 算圖的結果（數萬筆），整份快照不放進記憶體

    version = pick_version(cpu_results, keys)
    if not version:
        print("快照中找不到規格庫 CPU 的結果", file=sys.stderr)
        return 1
    scores = {k: list(v) for k, v in sorted(medians(cpu_results, version).items()) if k in keys}
    previous = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else None
    if previous and len(scores) < len(previous.get("scores", {})) / 2:
        print(f"涵蓋型號從 {len(previous['scores'])} 降到 {len(scores)}，疑似資料異常，保留舊檔", file=sys.stderr)
        return 1

    m = re.search(r"(\d{4}-\d{2}-\d{2})", member)
    doc = {
        "source": "Blender Open Data",
        "url": "https://opendata.blender.org/",
        "license": "CC0 1.0 Universal",
        "snapshot": member,
        "snapshot_date": m.group(1) if m else None,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "blender_version": version,
        "score": "三個場景（monster、junkshop、classroom）每分鐘樣本數的總和，同型號取中位數",
        "min_samples": MIN_SAMPLES,
        "scores": scores,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = sorted(keys - set(scores))
    print(f"Blender {version}：{len(scores)}/{len(keys)} 個型號有足夠樣本（CPU 結果 {len(cpu_results)} 筆）")
    if missing:
        print("樣本不足：" + "、".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
