"""從原價屋品名字串擷取價格與相容性關鍵規格（PoC 用啟發式規則）。

只用標準函式庫。每個擷取函式找不到時回傳 None，不猜預設值，
以便量測「品名可自動擷取規格」的真實比例。
"""
from __future__ import annotations

import re

CATEGORY_KEYWORDS = [
    ("cpu", ("處理器", "CPU")),
    ("motherboard", ("主機板",)),
    ("ram", ("記憶體",)),
    ("ssd", ("固態", "SSD")),
    ("gpu", ("顯示卡", "顯卡")),
    ("cooler", ("散熱器", "水冷", "空冷", "塔散")),
    ("case", ("機殼",)),
    ("psu", ("電源供應器", "電源")),
]

_NUM = r"(\d{2,3}(?:\.\d{1,2})?)"
_PRICE_RE = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d+)")
_BUNDLE_RE = re.compile(r"搭機|限搭|組裝價|任搭|搭購|搭板|搭卡")


def classify_category(label: str) -> str | None:
    for cat, words in CATEGORY_KEYWORDS:
        if any(w in label for w in words):
            return cat
    return None


def _to_mm(value: str, unit: str | None) -> float:
    v = float(value)
    if unit and unit.lower() == "cm":
        return round(v * 10, 1)
    if unit is None and v < 60:  # 無單位且數值很小，視為公分
        return round(v * 10, 1)
    return v


def extract_prices(text: str) -> dict | None:
    """回傳 {'price': 最終價, 'list_price': 原價或 None}。

    原價屋常見「$4590↘$4290」的降價寫法，最後一個金額視為現價。
    """
    found = [int(p.replace(",", "")) for p in _PRICE_RE.findall(text)]
    if not found:
        return None
    price = found[-1]
    list_price = found[0] if len(found) > 1 and found[0] != price else None
    return {"price": price, "list_price": list_price}


def extract_gpu_length_mm(text: str) -> float | None:
    m = re.search(r"(?:長|L)\s?" + _NUM + r"\s?(cm|mm|公分)", text, re.I)
    if not m:
        m = re.search(r"[/(（\s]" + _NUM + r"\s?(cm|mm|公分)", text, re.I)
    if not m:
        return None
    unit = "cm" if m.group(2) == "公分" else m.group(2)
    mm = _to_mm(m.group(1), unit)
    return mm if 100 <= mm <= 450 else None


def extract_case_gpu_clearance_mm(text: str) -> float | None:
    m = re.search(r"(?:顯卡|VGA)[^\d/]{0,4}" + _NUM + r"\s?(cm|mm)?", text, re.I)
    if not m:
        return None
    mm = _to_mm(m.group(1), m.group(2))
    return mm if 150 <= mm <= 600 else None


def extract_case_cooler_clearance_mm(text: str) -> float | None:
    m = re.search(r"(?:散熱器?|CPU|塔散)[^\d/]{0,4}" + _NUM + r"\s?(cm|mm)?", text, re.I)
    if not m:
        return None
    mm = _to_mm(m.group(1), m.group(2))
    return mm if 30 <= mm <= 220 else None


def extract_cooler_height_mm(text: str) -> float | None:
    m = re.search(r"高(?:度)?\s?" + _NUM + r"\s?(cm|mm)", text, re.I)
    if not m:
        return None
    mm = _to_mm(m.group(1), m.group(2))
    return mm if 25 <= mm <= 200 else None


def extract_radiator_mm(text: str) -> int | None:
    m = re.search(r"(?<!\d)(120|140|240|280|360|420)\s?(?:mm)?\s?(?:水冷|冷排|一體)", text)
    if not m:
        m = re.search(r"(?:水冷|冷排)[^\d]{0,6}(120|140|240|280|360|420)(?!\d)", text)
    return int(m.group(1)) if m else None


def extract_wattage(text: str) -> int | None:
    m = re.search(r"(?<!\d)(\d{3,4})\s?W(?![a-z])", text, re.I)
    if not m:
        return None
    w = int(m.group(1))
    return w if 200 <= w <= 2000 else None


def extract_socket(text: str) -> str | None:
    m = re.search(r"\b(AM4|AM5)\b", text, re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r"(?:LGA\s?)?(1700|1851)(?!\d)", text)
    return f"LGA{m.group(1)}" if m else None


def extract_memory_type(text: str) -> str | None:
    m = re.search(r"\bD(?:DR)?([45])\b", text, re.I)
    return f"DDR{m.group(1)}" if m else None


def extract_form_factor(text: str) -> str | None:
    t = text.upper().replace("-", "").replace(" ", "")
    if "EATX" in t:
        return "E-ATX"
    if "MATX" in t or "MICROATX" in t:
        return "M-ATX"
    if "ITX" in t:
        return "Mini-ITX"
    if "ATX" in t:
        return "ATX"
    return None


def extract_psu_form(text: str) -> str | None:
    t = text.upper()
    if "SFX-L" in t or "SFXL" in t:
        return "SFX-L"
    if "SFX" in t:
        return "SFX"
    return None


def extract_ram_capacity_gb(text: str) -> int | None:
    m = re.search(r"(\d{1,3})\s?G(?:B)?\s?[*xX×]\s?(\d)", text)
    if m:
        return int(m.group(1)) * int(m.group(2))
    m = re.search(r"(?<!\d)(\d{1,3})\s?GB?(?![a-z\d])", text, re.I)
    return int(m.group(1)) if m else None


def has_no_igpu(text: str) -> bool:
    return "無內顯" in text or bool(re.search(r"\d{3,5}F\b|\d{4}KF\b", text))


def is_bundle_only(text: str) -> bool:
    return bool(_BUNDLE_RE.search(text))


# 各類別「CSP 必要欄位」：PoC 量測這些欄位的自動擷取率
REQUIRED_FIELDS = {
    "cpu": ("socket",),
    "motherboard": ("socket", "memory_type", "form_factor"),
    "ram": ("memory_type", "capacity_gb"),
    "gpu": ("length_mm",),
    "cooler": ("height_or_radiator",),
    "case": ("gpu_clearance_mm", "cooler_clearance_mm"),
    "psu": ("wattage",),
    "ssd": (),
}


def extract(category: str | None, text: str, group_label: str = "") -> dict:
    """依類別擷取欄位；group_label 為所屬 optgroup 標籤（常含腳位等資訊）。"""
    ctx = f"{group_label} {text}"
    out: dict = {"bundle_only": is_bundle_only(text)}
    prices = extract_prices(text)
    if prices:
        out.update(prices)
    if category == "cpu":
        out["socket"] = extract_socket(ctx)
        out["no_igpu"] = has_no_igpu(text)
    elif category == "motherboard":
        out["socket"] = extract_socket(ctx)
        out["memory_type"] = extract_memory_type(ctx)
        out["form_factor"] = extract_form_factor(text)
    elif category == "ram":
        out["memory_type"] = extract_memory_type(ctx)
        out["capacity_gb"] = extract_ram_capacity_gb(text)
    elif category == "gpu":
        out["length_mm"] = extract_gpu_length_mm(text)
    elif category == "cooler":
        out["height_mm"] = extract_cooler_height_mm(text)
        out["radiator_mm"] = extract_radiator_mm(ctx)
        out["height_or_radiator"] = out["height_mm"] or out["radiator_mm"]
    elif category == "case":
        out["gpu_clearance_mm"] = extract_case_gpu_clearance_mm(text)
        out["cooler_clearance_mm"] = extract_case_cooler_clearance_mm(text)
        out["max_form_factor"] = extract_form_factor(text)
    elif category == "psu":
        out["wattage"] = extract_wattage(text)
        out["psu_form"] = extract_psu_form(text)
    return out
