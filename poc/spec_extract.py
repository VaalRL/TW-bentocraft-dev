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
_NUM1 = r"(\d{1,3}(?:\.\d{1,2})?)"  # 允許個位數：「CPU高5.5」「U高7」
_PROMO_COMBO_RE = re.compile(r"^\s*\[(?:加購|合購)")  # 跨類別合購促銷，不是單一零件
_PRICE_RE = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d+)")
# 原價屋品名結尾為「…, $現價 ◆ ★」；「原價$X」為原價，「現省$X」為折扣金額
_LIST_PRICE_RE = re.compile(r"原價\s?\$\s?(\d{1,3}(?:,\d{3})+|\d+)")
# 不可單買的價格（組裝價 / 搭機價）；「↓任搭290↓」是任意搭配時再折抵，不算限定
_BUNDLE_RE = re.compile(r"組裝價|搭機價|限搭|搭機|搭購價")
_COMBO_RE = re.compile(r"任搭\s?(\d+)")
_NOT_ALNUM_BEFORE = r"(?<![A-Za-z0-9])"
_NOT_DIGIT_AFTER = r"(?![0-9])"

# 各類別下拉選單內混有配件與非消費級產品，以 optgroup / 品名排除（PoC 階段的範圍界定）
OUT_OF_SCOPE = {
    "cpu": re.compile(r"Threadripper|Xeon|4677|sTR5"),
    "motherboard": re.compile(r"TRX50|WRX90|W790|sTR5|4677"),
    "ram": re.compile(r"伺服器|筆記型|NB |DDR3|RDIMM|ECC"),
    "gpu": re.compile(r"周邊|配件|支撐架|支架|專業級|工作站"),
    "cooler": re.compile(r"SSD|散熱膏|散熱墊|導熱|矽脂|硅脂|散熱片"),
    "case": re.compile(r"機架式|NAS"),
}


def classify_category(label: str) -> str | None:
    if "風扇" in label or "配件" in label:  # 「機殼風扇｜機殼配件」不是機殼
        return None
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


def _int(v: str) -> int:
    return int(v.replace(",", ""))


def extract_prices(text: str) -> dict | None:
    """回傳 {'price': 現價, 'list_price': 原價或 None, 'combo_discount': 任搭折抵或 None}。"""
    # 現價取最後一個「, $」之後的最後一個金額（可涵蓋「, $4590↘$4290」降價寫法）
    tail = text[text.rfind(", $"):] if ", $" in text else text
    finals = _PRICE_RE.findall(tail)
    if not finals:
        return None
    lp = _LIST_PRICE_RE.search(text)
    combo = _COMBO_RE.search(text)
    return {
        "price": _int(finals[-1]),
        "list_price": _int(lp.group(1)) if lp else None,
        "combo_discount": int(combo.group(1)) if combo else None,
    }


def is_in_scope(category: str | None, group_label: str, text: str) -> bool:
    if _PROMO_COMBO_RE.search(text):
        return False
    rule = OUT_OF_SCOPE.get(category or "")
    return not (rule and (rule.search(group_label) or rule.search(text)))


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
    m = re.search(r"(?:散熱器?|CPU|U|塔散)高?[^\d/]{0,4}" + _NUM1 + r"\s?(cm|mm)?", text, re.I)
    if not m:
        return None
    mm = _to_mm(m.group(1), m.group(2))
    return mm if 30 <= mm <= 220 else None


def extract_cooler_height_mm(text: str) -> float | None:
    # 原價屋常省略單位：「高15.7」為公分
    m = re.search(r"高(?:度)?\s?" + _NUM1 + r"\s?(cm|mm)?", text, re.I)
    if not m:
        return None
    mm = _to_mm(m.group(1), m.group(2))
    return mm if 25 <= mm <= 200 else None


def extract_radiator_mm(text: str, liquid: bool = False) -> int | None:
    if liquid:  # 已知為水冷品項時，品名中獨立出現的冷排尺寸即可採用
        m = re.search(r"(?<![\d.])(120|140|240|280|360|420)(?![\d.]|\s?W)", text)
        if m:
            return int(m.group(1))
    m = re.search(r"(?<!\d)(120|140|240|280|360|420)\s?(?:mm)?\s?(?:水冷|冷排|一體)", text)
    if not m:
        m = re.search(r"(?:水冷|冷排)[^\d]{0,6}(120|140|240|280|360|420)(?!\d)", text)
    return int(m.group(1)) if m else None


def extract_wattage(text: str) -> int | None:
    m = re.search(r"(?<!\d)(\d{3,4})\s?W(?![a-z])", text, re.I)
    if not m:
        return None
    w = int(m.group(1))
    return w if 200 <= w <= 3000 else None


def extract_socket(text: str) -> str | None:
    # 中文字屬於 \w，「AM5腳位」不能用 \b 判斷邊界
    m = re.search(_NOT_ALNUM_BEFORE + r"(AM4|AM5)" + _NOT_DIGIT_AFTER, text, re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r"(?:LGA\s?)?(?<!\d)(1151|1200|1700|1851)" + _NOT_DIGIT_AFTER, text)
    return f"LGA{m.group(1)}" if m else None


def extract_memory_type(text: str) -> str | None:
    m = re.search(_NOT_ALNUM_BEFORE + r"D(?:DR)?([345])" + _NOT_DIGIT_AFTER, text, re.I)
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


def extract(category: str | None, text: str, group_label: str = "", select_label: str = "") -> dict:
    """依類別擷取欄位。

    group_label 為所屬 optgroup 標籤（常含腳位等資訊），也用於範圍界定；
    select_label 為下拉選單標籤（如「封閉式｜開放式水冷」），只作擷取上下文。
    """
    ctx = f"{select_label} {group_label} {text}"
    out: dict = {"bundle_only": is_bundle_only(text), "in_scope": is_in_scope(category, group_label, text)}
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
        out["radiator_mm"] = extract_radiator_mm(text, liquid="水冷" in ctx)
        out["height_or_radiator"] = out["height_mm"] or out["radiator_mm"]
    elif category == "case":
        out["gpu_clearance_mm"] = extract_case_gpu_clearance_mm(text)
        out["cooler_clearance_mm"] = extract_case_cooler_clearance_mm(text)
        out["max_form_factor"] = extract_form_factor(text)
    elif category == "psu":
        out["wattage"] = extract_wattage(text)
        out["psu_form"] = extract_psu_form(text)
    return out
