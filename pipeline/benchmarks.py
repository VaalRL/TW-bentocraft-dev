"""CPU 算圖效能：Blender Open Data（CC0）的使用者跑分，整理成規格庫 CPU 型號的中位數。

Blender Open Data 每筆結果是一台機器用某版 Blender 跑三個場景的成績（每分鐘樣本數）。
這裡只取 CPU 算圖的結果，以三個場景分數的總和當作該次的分數，
同一型號、同一 Blender 版本的多次結果取中位數；樣本數不足的型號不輸出。
"""
from __future__ import annotations

import io
import json
import re
import statistics
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

MIN_SAMPLES = 5
SNAPSHOT_URL = "https://opendata.blender.org/snapshots/opendata-latest.zip"
SCENES = ("monster", "junkshop", "classroom")  # Benchmark 3.x 的三個場景

# 型號代碼：9800X3D、7500F、14400F、285K、250K Plus、5600X3D…
_AMD = re.compile(r"\b(?:RYZEN\s+(?:THREADRIPPER\s+)?\d\s+(?:PRO\s+)?)?(\d{4}[A-Z0-9]*)\b")
_INTEL = re.compile(r"\b(?:I[3579]-|ULTRA\s+\d\s+)(\d{3,5}[A-Z]*(?:\s+PLUS)?)\b")


@dataclass(frozen=True)
class Result:
    device: str  # CPU 名稱，如 "AMD Ryzen 7 9800X3D 8-Core Processor"
    blender: str  # Blender 主要版本，如 "4.5"
    score: float  # 三個場景每分鐘樣本數的總和


def cpu_key(name: str) -> str | None:
    """CPU 名稱 → 比對用的鍵（品牌＋型號代碼）。Intel 的 F（無內顯）與一般款晶片相同，算圖成績合併。"""
    s = re.sub(r"\((?:R|TM)\)", " ", name.upper())
    s = re.sub(r"\s+", " ", s)
    if "AMD" in s or "RYZEN" in s:
        m = _AMD.search(s.split("RYZEN", 1)[-1] if "RYZEN" in s else s)
        return f"amd:{m.group(1)}" if m else None
    if "INTEL" in s or "CORE" in s:
        m = _INTEL.search(s)
        if not m:
            return None
        code = m.group(1).replace(" PLUS", "PLUS")
        code = re.sub(r"(\d+K?)F(PLUS)?$", r"\1\2", code)  # 14400F→14400、245KF→245K、250KFPLUS→250KPLUS
        return f"intel:{code}"
    return None


def catalog_key(model_id: str, brand: str, name: str) -> str | None:
    """規格庫型號 → 比對用的鍵。名稱如「R7 9800X3D」「Core Ultra 5 250KF Plus」「i5-14400F」。"""
    s = re.sub(r"(盒|Tray盤|MPK)", " ", name, flags=re.I).upper()
    if brand.upper() == "AMD":
        m = re.search(r"\b(\d{4}[A-Z0-9]*)\b", s)
        return f"amd:{m.group(1)}" if m else None
    m = re.search(r"\b(?:I[3579]-|ULTRA\s+\d\s+)(\d{3,5}[A-Z]*(?:\s+PLUS)?)\b", s)
    if not m:
        return None
    code = m.group(1).replace(" PLUS", "PLUS")
    return "intel:" + re.sub(r"(\d+K?)F(PLUS)?$", r"\1\2", code)


def parse_line(line: str) -> Result | None:
    """快照的一行（一次送出的結果）→ CPU 算圖結果；不是 CPU、場景不齊、多插槽或格式不符時回傳 None。

    只處理 schema v4（Blender 3.0 以後、分數是每分鐘樣本數）；v1–v3 是舊版 Benchmark，只有算圖時間。
    判斷 CPU 或 GPU 要看 device_info.device_type：system_info.devices 會列出整台機器的所有裝置。
    """
    try:
        entry = json.loads(line)
    except ValueError:
        return None
    if entry.get("schema_version") != "v4" or not isinstance(entry.get("data"), list):
        return None
    names, versions, scores = set(), set(), {}
    for run in entry["data"]:
        info = run.get("device_info") or {}
        if info.get("device_type") != "CPU" or (run.get("system_info") or {}).get("num_cpu_sockets", 1) != 1:
            return None
        names.update(d.get("name", "").strip() for d in info.get("compute_devices") or [])
        # 修正版（4.5.0、4.5.1）的分數相同等級，以主要版本分組，樣本才夠
        m = re.match(r"(\d+\.\d+)", str((run.get("blender_version") or {}).get("version") or ""))
        versions.add(m.group(1) if m else None)
        scene = (run.get("scene") or {}).get("label")
        spm = (run.get("stats") or {}).get("samples_per_minute")
        if scene in SCENES and isinstance(spm, (int, float)) and spm > 0:
            scores[scene] = spm
    if len(names) != 1 or len(versions) != 1 or None in versions or set(scores) != set(SCENES):
        return None
    return Result(device=re.sub(r"\s+", " ", names.pop()), blender=versions.pop(), score=sum(scores.values()))


def read_snapshot(path: Path) -> tuple[Iterator[Result], str]:
    """讀快照 zip：回傳（逐行解析的結果, JSONL 檔名）。授權不是 CC0 時拒絕使用。"""
    zf = zipfile.ZipFile(path)
    members = [n for n in zf.namelist() if n.endswith(".jsonl")]
    if len(members) != 1:
        raise ValueError(f"快照裡應該剛好有一個 .jsonl，實際：{members}")
    licence = next((n for n in zf.namelist() if n.rsplit("/", 1)[-1].upper().startswith("LICENSE")), None)
    if not licence or "CC0" not in zf.read(licence).decode("utf-8", "replace"):
        raise ValueError("快照的授權檔不是 CC0，停止使用")

    def results() -> Iterator[Result]:
        with zf.open(members[0]) as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8"):
                r = parse_line(line)
                if r:
                    yield r
    return results(), members[0]


def pick_version(results: list[Result], keys: set[str], min_samples: int = MIN_SAMPLES) -> str | None:
    """選一個 Blender 版本：涵蓋最多規格庫型號（達最低樣本數）的版本，同數時取較新的。

    不同 Blender 版本的分數不能直接比較，所以整頁只用一個版本。
    """
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in results:
        k = cpu_key(r.device)
        if k in keys:
            counts[r.blender][k] += 1
    coverage = {v: sum(1 for n in c.values() if n >= min_samples) for v, c in counts.items()}
    if not coverage or max(coverage.values()) == 0:
        return None
    return max(coverage, key=lambda v: (coverage[v], _version_tuple(v)))


def medians(results: list[Result], version: str, min_samples: int = MIN_SAMPLES) -> dict[str, tuple[float, int]]:
    """各 CPU 鍵在指定 Blender 版本的中位數分數與樣本數（只輸出樣本數足夠的）。"""
    scores: dict[str, list[float]] = defaultdict(list)
    for r in results:
        k = cpu_key(r.device)
        if k and r.blender == version and r.score > 0:
            scores[k].append(r.score)
    return {k: (round(statistics.median(v), 1), len(v)) for k, v in scores.items() if len(v) >= min_samples}


def _version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])
