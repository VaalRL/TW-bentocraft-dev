"""CPU 算圖效能：Blender Open Data（CC0）的使用者跑分，整理成規格庫 CPU 型號的中位數。

Blender Open Data 每筆結果是一台機器用某版 Blender 跑三個場景的成績（每分鐘樣本數）。
這裡只取 CPU 算圖的結果，以三個場景分數的總和當作該次的分數，
同一型號、同一 Blender 版本的多次結果取中位數；樣本數不足的型號不輸出。
"""
from __future__ import annotations

import re
import statistics
from collections import defaultdict
from dataclasses import dataclass

MIN_SAMPLES = 5

# 型號代碼：9800X3D、7500F、14400F、285K、250K Plus、5600X3D…
_AMD = re.compile(r"\b(?:RYZEN\s+(?:THREADRIPPER\s+)?\d\s+(?:PRO\s+)?)?(\d{4}[A-Z0-9]*)\b")
_INTEL = re.compile(r"\b(?:I[3579]-|ULTRA\s+\d\s+)(\d{3,5}[A-Z]*(?:\s+PLUS)?)\b")


@dataclass(frozen=True)
class Result:
    device: str  # CPU 名稱，如 "AMD Ryzen 7 9800X3D 8-Core Processor"
    blender: str  # Blender 版本，如 "4.5.0"
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
