"""補齊規格庫缺漏的欄位：人工整理的對照表（data/reference/specs.json）與可由既有欄位推導的值。

品名通常不寫功耗、是否附散熱器等資訊，但這些值由 CPU 型號或顯卡晶片決定，
可以整理成對照表一次套用。散熱器品名的【WXZ】扣具代碼則可依原價屋圖例換成支援腳位，
Mini-ITX 主機板的記憶體插槽數固定為 2。規則：

- 只補缺漏的欄位，不覆寫既有值（品名擷取或人工確認的值優先）。
- 每個欄位都帶來源與依據（note）；顯卡依晶片推定的值標為 inferred，介面會註明。
- 已確認（verified）的型號不動，避免繞過人工審查。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data/reference/specs.json"

# 原價屋散熱器分類開頭的圖例（2026-10-13 估價頁）：
# 「散熱器支援腳位:【W=115X/1200腳位,X=AM4/AM5腳位,Z=1700/1851腳位】」，水冷另有 Y=sTR4/5。
# 115X 中只有 LGA1151 在 socket 列舉內（LGA1150/1155/1156 已停產，不收錄）。
MOUNT_CODE_SOCKETS = {
    "W": ["LGA1151", "LGA1200"],
    "X": ["AM4", "AM5"],
    "Y": ["sTR4", "sTR5"],
    "Z": ["LGA1700", "LGA1851"],
}
MOUNT_CODE_NOTE = "依原價屋扣具代碼圖例：W=115X/1200、X=AM4/AM5、Y=sTR4/5、Z=1700/1851"
MOUNT_CODE_REF = "https://www.coolpc.com.tw/evaluate.php"


def load_reference(path=REFERENCE_PATH) -> dict:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    for table in (v for k, v in doc.items() if not k.startswith("$")):
        for rule in table["rules"]:
            rule["_re"] = re.compile(rule["match"], re.IGNORECASE)
    return doc


def match_rule(reference: dict, category: str, name: str) -> dict | None:
    table = reference.get(category)
    if not table:
        return None
    return next((r for r in table["rules"] if r["_re"].search(name)), None)


def sockets_from_mount_codes(codes: str) -> list[str]:
    """「WXZ」→ 支援腳位；含未知代碼時回傳空串列（不猜）。"""
    if not codes or any(c not in MOUNT_CODE_SOCKETS for c in codes):
        return []
    return [s for c in sorted(set(codes)) for s in MOUNT_CODE_SOCKETS[c]]


def apply_reference(model: dict, reference: dict) -> list[str]:
    """把對照表與推導的值填入型號缺漏的欄位，回傳填入的欄位名稱。"""
    if model.get("review", {}).get("status") == "verified":
        return []
    filled = []
    specs = model["specs"]
    if model["category"] == "cooler" and "mount_codes" in specs and "sockets" not in specs:
        sockets = sockets_from_mount_codes(specs["mount_codes"]["value"])
        if sockets:
            specs["sockets"] = {"value": sockets, "source": "retailer_spec", "ref": MOUNT_CODE_REF,
                                "note": MOUNT_CODE_NOTE}
            filled.append("sockets")
    if (model["category"] == "motherboard" and "dimm_slots" not in specs
            and specs.get("form_factor", {}).get("value") == "Mini-ITX"):
        specs["dimm_slots"] = {"value": 2, "source": "inferred", "note": "Mini-ITX 主機板只有 2 條記憶體插槽"}
        filled.append("dimm_slots")
    rule = match_rule(reference, model["category"], model["name"])
    if rule is None:
        return filled
    source = reference[model["category"]]["source"]
    for field, entry in rule["specs"].items():
        if field in model["specs"]:
            continue
        model["specs"][field] = {"value": entry["value"], "source": source, "note": entry["note"]}
        filled.append(field)
    return filled
