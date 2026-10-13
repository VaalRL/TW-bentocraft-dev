"""以人工整理的對照表（data/reference/specs.json）補齊規格庫缺漏的欄位。

品名通常不寫功耗、是否附散熱器等資訊，但這些值由 CPU 型號或顯卡晶片決定，
可以整理成對照表一次套用。規則：

- 只補缺漏的欄位，不覆寫既有值（品名擷取或人工確認的值優先）。
- 每個欄位都帶來源與依據（note）；顯卡依晶片推定的值標為 inferred，介面會註明。
- 已確認（verified）的型號不動，避免繞過人工審查。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data/reference/specs.json"


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


def apply_reference(model: dict, reference: dict) -> list[str]:
    """把對照表的值填入型號缺漏的欄位，回傳填入的欄位名稱。"""
    if model.get("review", {}).get("status") == "verified":
        return []
    rule = match_rule(reference, model["category"], model["name"])
    if rule is None:
        return []
    source = reference[model["category"]]["source"]
    filled = []
    for field, entry in rule["specs"].items():
        if field in model["specs"]:
            continue
        model["specs"][field] = {"value": entry["value"], "source": source, "note": entry["note"]}
        filled.append(field)
    return filled
