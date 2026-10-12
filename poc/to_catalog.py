"""把 coolpc_probe.py 輸出的 items.jsonl 轉成草稿規格庫與報價檔，並以 schema 驗證。

用法：
    python poc/to_catalog.py poc/out/items.jsonl --out poc/out/draft

輸出：
    draft/catalog/<類別>.json   規格庫分片（review.status = auto）
    draft/prices/coolpc.json     報價快照
    draft/runtime/catalog.min.json  去掉來源資訊的前端精簡版（僅用於估算體積）

目的是驗證 schema 能承載真實資料、量測檔案大小，不是正式的規格庫產生器。
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "poc"))
sys.path.insert(0, str(ROOT / "schema"))
from spec_extract import (  # noqa: E402
    extract_case_cooler_clearance, extract_case_gpu_clearance, extract_memory_type, extract_socket, model_key,
    split_combo,
)
from validate import validate  # noqa: E402

# 品牌：品名開頭字樣 → (顯示名稱, ID 用代號)。未列出的英文品牌直接用小寫代號。
BRANDS = {
    "微星": ("微星 MSI", "msi"), "技嘉": ("技嘉 GIGABYTE", "gigabyte"), "華碩": ("華碩 ASUS", "asus"),
    "華擎": ("華擎 ASRock", "asrock"), "映泰": ("映泰 BIOSTAR", "biostar"), "撼訊": ("撼訊 PowerColor", "powercolor"),
    "藍寶石": ("藍寶石 SAPPHIRE", "sapphire"), "索泰": ("ZOTAC", "zotac"), "麗臺": ("麗臺 Leadtek", "leadtek"),
    "威剛": ("威剛 ADATA", "adata"), "金士頓": ("金士頓 Kingston", "kingston"), "芝奇": ("芝奇 G.SKILL", "gskill"),
    "美光": ("美光 Micron", "micron"), "海盜船": ("海盜船 CORSAIR", "corsair"), "科賦": ("科賦 KLEVV", "klevv"),
    "十銓": ("十銓 TEAMGROUP", "teamgroup"), "宇瞻": ("宇瞻 Apacer", "apacer"), "創見": ("創見 Transcend", "transcend"),
    "三星": ("三星 Samsung", "samsung"), "利民": ("利民 Thermalright", "thermalright"),
    "九州風神": ("九州風神 DEEPCOOL", "deepcool"), "酷碼": ("酷碼 Cooler Master", "coolermaster"),
    "貓頭鷹": ("貓頭鷹 Noctua", "noctua"), "鎌刀": ("鎌刀 Scythe", "scythe"), "喬思伯": ("喬思伯 JONSBO", "jonsbo"),
    "君主": ("君主 Montech", "montech"), "恩傑": ("恩傑 NZXT", "nzxt"), "聯力": ("聯力 Lian Li", "lian-li"),
    "曜越": ("曜越 Thermaltake", "thermaltake"), "海韻": ("海韻 Seasonic", "seasonic"), "全漢": ("全漢 FSP", "fsp"),
    "振華": ("振華 Super Flower", "superflower"), "台達": ("台達 Delta", "delta"), "銀欣": ("銀欣 SilverStone", "silverstone"),
    "保銳": ("保銳 ENERMAX", "enermax"), "安鈦克": ("安鈦克 Antec", "antec"), "美洲獅": ("美洲獅 COUGAR", "cougar"),
    "首席玩家": ("1st Player", "1stplayer"), "先馬": ("先馬 SAMA", "sama"), "大飛": ("大飛 darkFlash", "darkflash"),
    "追風者": ("追風者 Phanteks", "phanteks"), "迎廣": ("迎廣 InWin", "inwin"), "火鳥": ("火鳥 BitFenix", "bitfenix"),
    "幾何未來": ("幾何未來 Geometric Future", "geometric-future"), "創氪星系": ("創氪星系 TRYX", "tryx"),
    "鈦鉭": ("鈦鉭 TCOMAS", "tcomas"), "快睿": ("快睿 CRYORIG", "cryorig"), "旋剛": ("旋剛 Sharkoon", "sharkoon"),
    "艾湃": ("Apexgaming", "apexgaming"), "宏碁": ("宏碁 Acer", "acer"), "影馳": ("影馳 GALAX", "galax"),
    "瑞昱": ("Realtek", "realtek"), "佰微": ("佰微 BIWIN", "biwin"), "鎧俠": ("鎧俠 KIOXIA", "kioxia"),
    "致態": ("致態 ZhiTai", "zhitai"), "視博通": ("視博通", "shibotong"), "希捷": ("希捷 Seagate", "seagate"), "東芝": ("東芝 Toshiba", "toshiba"),
}
# 多字英文品牌：以品名開頭比對，避免「Fractal Design」被拆成品牌 Fractal、型號 Design …
LATIN_BRANDS = {
    "fractal design": "fractal-design", "cooler master": "coolermaster", "lian li": "lian-li",
    "1st player": "1stplayer", "micron crucial": "crucial", "super flower": "superflower",
    "be quiet!": "bequiet", "g.skill": "gskill", "western digital": "wd",
}
COLORS = [
    ("燕麥", "other"), ("胡桃木", "wood"), ("木紋", "wood"), ("黑", "black"), ("白", "white"), ("銀", "silver"),
    ("灰", "gray"), ("粉", "pink"), ("藍", "blue"), ("綠", "green"), ("紅", "red"), ("紫", "purple"),
]
FF_RANK = {"Mini-ITX": 1, "M-ATX": 2, "ATX": 3, "E-ATX": 4}
REQUIRES = {"主機板": "motherboard", "CPU": "cpu", "處理器": "cpu", "顯卡": "gpu", "顯示卡": "gpu", "記憶體": "ram"}


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def short_hash(text: str, n: int = 8) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:n]


_PROMO_PREFIX_RE = re.compile(r"^\s*(?:限搭機|任搭價|限搭|任搭)\s*(?=｛)")


def main_text(item: dict) -> str:
    text = _PROMO_PREFIX_RE.sub("", item["text"])
    parts = split_combo(text)
    return parts[0]["text"] if parts else text


_PART_NO_RE = re.compile(r"｛([A-Za-z0-9][A-Za-z0-9./-]{5,})｝")


def part_number(text: str) -> str | None:
    """品名後段大括號內的料號（如記憶體「…/CL36黑｛F5-6000J3636F32GX2-RM5NRK｝」）。

    開頭的「｛型號｝」不算料號。料號比品名前段更能唯一識別商品。
    """
    if text.lstrip().startswith("｛"):
        return None
    head = re.split(r"[/(（]", text, maxsplit=1)[0]
    m = _PART_NO_RE.search(text)
    return m.group(1) if m and m.start() >= len(head) else None


def identity(item: dict) -> tuple[str, str]:
    """回傳 (型號鍵, 用於 ID 的名稱補充)。有料號時以料號為鍵，避免把不同套組併成一個型號。"""
    main = main_text(item)
    pn = part_number(main)
    return (f"PN:{pn.upper()}", pn) if pn else (model_key(main), "")


def split_name(text: str) -> tuple[str, str, str]:
    """回傳 (品牌顯示名稱, 品牌代號, 型號名稱)。型號名稱已去除顏色字樣。"""
    m = re.match(r"\s*｛([^｝]+)｝", text)
    if m:  # 「｛微星 RTX5080 …｝規格」
        name = m.group(1)
    else:
        head = re.split(r"[/(（]", text, maxsplit=1)[0]
        m = re.match(r"\s*([^｛]*)｛([^｝]+)｝", head)
        # 「三星 SAMSUNG｛9100 PRO 4TB｝」：品牌在前、型號在大括號；
        # 大括號在規格之後的（記憶體料號）不在 head 內，不影響
        name = f"{m.group(1).strip()} {m.group(2)}" if m else head.split("｛")[0]
    name = re.sub(r"^\[[^\]]*\]\s*", "", name).strip()
    for latin, code in LATIN_BRANDS.items():
        if name.lower().startswith(latin):
            return name[: len(latin)], code, _strip_colors(name[len(latin):].strip()) or text[:40]
    first = name.split()[0] if name.split() else name
    brand, bslug = None, None
    for zh, (disp, code) in BRANDS.items():
        if first.startswith(zh):
            brand, bslug = disp, code
            name = name[len(zh):].strip()
            latin = disp[len(zh):].strip() if disp.startswith(zh) else disp
            if latin and re.match(re.escape(latin) + r"(\s|$)", name, re.I):  # 「宏碁 ACER｛RE100｝」不重複品牌
                name = name[len(latin):].strip()
            break
    if brand is None:
        ascii_brand = re.match(r"[A-Za-z0-9.]+", first)
        if ascii_brand and len(name.split()) > 1:
            brand, bslug = ascii_brand.group(0), slug(ascii_brand.group(0)) or "unknown"
            name = name[len(first):].strip()
        else:
            brand, bslug = "unknown", "unknown"
    return brand, bslug, _strip_colors(name) or text[:40]


def _strip_colors(name: str) -> str:
    for zh, _ in COLORS:  # 型號名稱不含顏色
        name = re.sub(zh + r"(?:色|化版|版)?(?=\s|$)", "", name).strip()
    return re.sub(r"\s+", " ", name).strip()


def detect_variant(text: str) -> tuple[str, dict] | None:
    head = main_text({"text": text})
    m = re.match(r"\s*｛([^｝]+)｝", head)
    name = m.group(1) if m else head[:40]
    for zh, color in COLORS:
        if re.search(zh + r"(?:色|化版|版)?(?:\s|$|\)|）)", name) or f"({zh})" in name:
            return color if color != "other" else slug(zh) or "other", {"label": zh, "color": color}
    return None


def val(value, source: str, **extra) -> dict:
    out = {"value": value, "source": source}
    out.update({k: v for k, v in extra.items() if v is not None})
    return out


def src_of(func, text: str, value) -> str:
    """欄位值若能單從品名取得則為 title，否則來自 optgroup。"""
    return "title" if func(text) == value else "optgroup"


def specs_for(item: dict) -> dict:
    cat, text, sel = item["category"], main_text(item), item.get("select_label", "")
    s: dict = {}
    if cat == "cpu":
        if item.get("socket"):
            s["socket"] = val(item["socket"], src_of(extract_socket, text, item["socket"]))
        if item.get("igpu") is not None:
            s["igpu"] = val(item["igpu"], "title")
        if re.search(r"含風扇|MPK", text):
            s["cooler_included"] = val(True, "title")
        elif "無風扇" in text:
            s["cooler_included"] = val(False, "title")
        m = re.search(r"(?<![\d.])(\d{2,3})\s?[Ww](?![a-z])", text)
        if m:
            s["tdp_w"] = val(int(m.group(1)), "title")
    elif cat == "motherboard":
        for f, func in (("socket", extract_socket), ("memory_type", extract_memory_type)):
            if item.get(f):
                s[f] = val(item[f], src_of(func, text, item[f]))
        if item.get("form_factor") in FF_RANK:
            s["form_factor"] = val(item["form_factor"], "title")
        m = re.search(r"(?<![A-Z0-9])([ABHQWXZ]\d{3}E?)(?:M|I)?(?![0-9])", text)
        if m:
            s["chipset"] = val(m.group(1), "title")
        m = re.search(r"(\d)\s?DIMM|(\d)\s?\*\s?DDR", text)
        if m:
            s["dimm_slots"] = val(int(m.group(1) or m.group(2)), "title")
        if re.search(r"背插|BTF", text):
            s["back_connect"] = val(True, "title")
    elif cat == "ram":
        if item.get("memory_type"):
            s["memory_type"] = val(item["memory_type"], src_of(extract_memory_type, text, item["memory_type"]))
        if item.get("capacity_gb"):
            s["capacity_gb"] = val(item["capacity_gb"], "title")
        m = re.search(r"\d+\s?G(?:B)?\s?[*xX×]\s?(\d)", text)
        if m:
            s["modules"] = val(int(m.group(1)), "title")
        elif "單條" in text:
            s["modules"] = val(1, "title")
        m = re.search(r"D(?:DR)?[45][-\s]?(\d{4})", text)
        if m:
            s["speed_mts"] = val(int(m.group(1)), "title")
    elif cat == "gpu":
        if item.get("length_mm"):
            s["length_mm"] = val(item["length_mm"], "title", tolerance=10)
        if re.search(r"Low Profile|(?<![A-Za-z])LP(?![A-Za-z])|半高", text):
            s["low_profile"] = val(True, "title")
        if "外接" in text:
            s["external"] = val(True, "title")
    elif cat == "cooler":
        if item.get("radiator_mm") or "水冷" in sel:
            s["cooler_type"] = val("aio", "title" if "水冷" in text else "optgroup")
            if item.get("radiator_mm"):
                s["radiator_mm"] = val(item["radiator_mm"], "title")
            m = re.search(r"厚:?\s?(\d(?:\.\d)?)\s?(?:cm)?", text)
            if m:
                s["radiator_thickness_mm"] = val(round(float(m.group(1)) * 10, 1), "title")
        elif item.get("height_mm"):
            s["cooler_type"] = val("air", "inferred", note="品名有高度、無冷排")
            s["height_mm"] = val(item["height_mm"], "title")
        m = re.search(r"【([WXYZ]{1,4})】", text)
        if m:
            s["mount_codes"] = val(m.group(1), "title")
        m = re.search(r"TDP:?\s?(\d{2,3})", text)
        if m:
            s["tdp_rating_w"] = val(int(m.group(1)), "title")
    elif cat == "case":
        ff = item.get("max_form_factor")
        if ff in FF_RANK:
            s["max_mb_form_factor"] = val(ff, "title")
        # 直接從本列主件品名擷取；probe 階段從同型號繼承來的值不算本列來源，
        # 同型號的值會在合併型號時自然取得
        for f, func in (("gpu_clearance_mm", extract_case_gpu_clearance),
                        ("cooler_clearance_mm", extract_case_cooler_clearance)):
            value, alt = func(text)
            if value:
                s[f] = val(value, "title")
                if alt:
                    s[f]["conditions"] = [{"value": alt, "when": "unspecified", "source": "title"}]
        if re.search(r"SFX-L", text):
            s["psu_form_factors"] = val(["SFX", "SFX-L"], "title")
        elif "SFX" in text:
            s["psu_form_factors"] = val(["SFX"], "title")
        elif ff in ("M-ATX", "ATX", "E-ATX"):
            s["psu_form_factors"] = val(["ATX"], "inferred", note="品名未標 SFX")
        m = re.search(r"背插\s?[(（]?限\s?(M-ATX|ATX|E-ATX)", text)
        if m:
            s["back_connect_max_form_factor"] = val(m.group(1), "title")
        elif "背插" in text and ff in FF_RANK:
            s["back_connect_max_form_factor"] = val(ff, "title")
        m = re.search(r"內附\s?(\d{3,4})W", text)
        if m:
            s["included_psu_w"] = val(int(m.group(1)), "title")
    elif cat == "psu":
        if item.get("wattage"):
            s["wattage"] = val(item["wattage"], "title")
        if item.get("psu_form"):
            s["form_factor"] = val(item["psu_form"], "title")
        elif "SFX" in item.get("group", ""):
            s["form_factor"] = val("SFX", "optgroup")
        else:
            s["form_factor"] = val("ATX", "inferred", note="品名未標 SFX")
        for zh, eff in (("鈦金", "titanium"), ("白金", "platinum"), ("金牌", "gold"), ("銀牌", "silver"), ("銅牌", "bronze")):
            if zh in text:
                s["efficiency"] = val(eff, "title")
                break
        m = re.search(r"ATX\s?(3(?:\.\d)?)", text)
        if m:
            s["atx_version"] = val(m.group(1), "title")
    elif cat == "ssd":
        g = item.get("group", "")
        m = re.search(r"PCIe\s?([345])\.0", g)
        if m:
            s["interface"] = val(f"pcie{m.group(1)}", "optgroup")
        elif "SATA" in g:
            s["interface"] = val("sata", "optgroup")
        if "2.5吋" in g:
            s["form_factor"] = val("2.5in", "optgroup")
        else:
            m = re.search(r"22(30|42|80)", g + " " + text)
            if m:
                s["form_factor"] = val(f"m2-22{m.group(1)}", "optgroup" if m.group(0) in g else "title")
        m = re.search(r"(\d+(?:\.\d+)?)\s?(TB|GB|G|T)(?![a-z])", text)
        if m:
            n = float(m.group(1)) * (1000 if m.group(2).startswith("T") else 1)
            s["capacity_gb"] = val(int(n), "title")
    return s


def price_fields(item: dict, fetched_year: int) -> dict:
    text = item["text"]
    out: dict = {"price": item["price"]}
    if item.get("list_price"):
        out["list_price"] = item["list_price"]
    m = re.search(r"現省\s?\$?(\d+)", text)
    if m:
        out["savings"] = int(m.group(1))
    if item.get("combo_discount"):
        out["combo_discount"] = item["combo_discount"]
    m = re.search(r"【任搭([^】]+)】", text)
    if m and REQUIRES.get(m.group(1)):
        out["price_condition"] = {"type": "requires_category", "requires": [REQUIRES[m.group(1)]], "note": m.group(0)}
    elif re.search(r"組裝價|搭機價", text):
        out["price_condition"] = {"type": "assembly"}
    elif item.get("bundle_only"):
        out["price_condition"] = {"type": "unspecified", "note": (re.search(r"[*【]?\S*任搭\S*|限搭\S*|搭機\S*", text) or [""])[0][:80]}
    if item.get("gift"):
        out["gift"] = {"text": item["gift"][:80]}
    m = re.search(r"下殺到\s?(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})", text)
    if m:
        mo, d, h, mi = (int(x) for x in m.groups())
        out["valid_until"] = f"{fetched_year:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00+08:00"
    return out


def build(items: list[dict], meta: dict) -> tuple[dict[str, dict], dict, dict]:
    year = int(meta["fetched_at"][:4])
    shards: dict[str, dict] = defaultdict(lambda: {})
    key_to_id: dict[tuple[str, str], str] = {}
    stats: Counter = Counter()
    conflicts: list[str] = []
    offers = []
    unknown_brands: Counter = Counter()

    for item in items:
        cat = item["category"]
        main = main_text(item)
        key, pn = identity(item)
        brand, bslug, name = split_name(main)
        if pn:
            name = f"{name} {pn}"
        if bslug == "unknown":
            unknown_brands[(main.split() or ["?"])[0][:12]] += 1
        mid = key_to_id.get((cat, key))
        if mid is None:
            base = slug(name) or short_hash(key)
            mid = f"{cat}:{bslug}:{base}"
            if mid in shards[cat]:  # 不同型號鍵卻產生相同 ID → 加雜湊區分
                mid = f"{mid}-{short_hash(key, 4)}"
                stats["id_collisions"] += 1
            key_to_id[(cat, key)] = mid
            shards[cat][mid] = {
                "category": cat, "brand": brand, "name": name[:120], "status": "active",
                "aliases": {"model_keys": [key]}, "specs": {}, "review": {"status": "auto"},
            }
        model = shards[cat][mid]
        variant = detect_variant(item["text"])
        if variant:
            model.setdefault("variants", {})[variant[0]] = variant[1]
        for f, v in specs_for(item).items():
            cur = model["specs"].get(f)
            if cur is None:
                model["specs"][f] = v
            elif cur["value"] != v["value"]:
                conflicts.append(f"{mid} {f}: {cur['value']} vs {v['value']}")
        if item.get("vendor_ref"):
            refs = model["aliases"].setdefault("vendor_refs", {}).setdefault("coolpc", [])
            if item["vendor_ref"] not in refs:
                refs.append(item["vendor_ref"])

        offer_items = [{"role": "main", "model_id": mid, "match": "model_key"}]
        if variant:
            offer_items[0]["variant"] = variant[0]
        for part in (split_combo(item["text"]) or [])[1:]:
            offer_items.append({"role": part["kind"], "match": "unmatched", "text": part["text"][:120]})
            stats["combo_parts"] += 1
        ref = item.get("vendor_ref")
        oid = f"coolpc:{ref}" if ref and re.fullmatch(r"[A-Za-z0-9_.-]+", ref) else f"coolpc:h{short_hash(item['text'])}"
        offers.append({
            "offer_id": oid, "category": cat,
            "vendor_section": {"id": item.get("select", ""), "group": item.get("group", "")},
            "raw_title": item["text"], **price_fields(item, year), "items": offer_items,
        })

    # offer_id 必須唯一：通路代碼重複時改用品名雜湊
    counts = Counter(o["offer_id"] for o in offers)
    stats["vendor_ref_duplicates"] = sum(1 for c in counts.values() if c > 1)
    for o in offers:
        if counts[o["offer_id"]] > 1:
            o["offer_id"] = f"coolpc:h{short_hash(o['raw_title'])}"
    # 品名完全相同的列（重複上架）仍可能重複：加序號
    seen: Counter = Counter()
    for o in offers:
        seen[o["offer_id"]] += 1
        if seen[o["offer_id"]] > 1:
            o["offer_id"] += f"-{seen[o['offer_id']]}"

    catalog = {
        cat: {"schema_version": "1.0", "category": cat, "generated_at": meta["fetched_at"],
              "models": dict(sorted(models.items()))}
        for cat, models in shards.items()
    }
    prices = {
        "schema_version": "1.0", "vendor": "coolpc", "source_url": meta["source_url"],
        "fetched_at": meta["fetched_at"], "status": "ok", "offers": offers,
    }
    stats["models"] = sum(len(m) for m in shards.values())
    stats["offers"] = len(offers)
    stats["spec_conflicts"] = len(conflicts)
    stats["offers_with_vendor_ref"] = sum(1 for i in items if i.get("vendor_ref"))
    return catalog, prices, {"stats": stats, "conflicts": conflicts, "unknown_brands": unknown_brands}


def runtime_bundle(catalog: dict[str, dict]) -> dict:
    """前端精簡版：只留值，近似值（有 tolerance 或來源為 title/inferred 的間隙與長度）以 ~ 標記。"""
    out = {}
    for cat, shard in catalog.items():
        rows = {}
        for mid, m in shard["models"].items():
            specs = {}
            for f, v in m["specs"].items():
                specs[f] = v["value"]
                if v.get("tolerance") or v.get("conditions"):
                    specs[f + "~"] = [v.get("tolerance", 0)] + [c["value"] for c in v.get("conditions", [])]
            rows[mid] = [m["brand"], m["name"], specs]
        out[cat] = rows
    return out


def write_json(path: Path, doc: dict, compact: bool = False) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":") if compact else None,
                     indent=None if compact else 1).encode("utf-8")
    path.write_bytes(raw)
    return len(raw), len(gzip.compress(raw, 9))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("items", type=Path)
    ap.add_argument("--out", type=Path, default=Path("poc/out/draft"))
    args = ap.parse_args()
    lines = [json.loads(line) for line in args.items.read_text(encoding="utf-8").splitlines() if line.strip()]
    meta, items = lines[0]["meta"], lines[1:]

    catalog, prices, info = build(items, meta)
    sizes = {}
    for cat, shard in catalog.items():
        sizes[f"catalog/{cat}.json"] = write_json(args.out / "catalog" / f"{cat}.json", shard)
    sizes["prices/coolpc.json"] = write_json(args.out / "prices" / "coolpc.json", prices)
    no_title = {**prices, "offers": [{k: v for k, v in o.items() if k != "raw_title"} for o in prices["offers"]]}
    sizes["prices/coolpc.json（不含 raw_title，compact）"] = write_json(args.out / "prices" / "coolpc.min.json", no_title, compact=True)
    sizes["runtime/catalog.min.json"] = write_json(args.out / "runtime" / "catalog.min.json", runtime_bundle(catalog), compact=True)

    errors = validate(sorted((args.out / "catalog").glob("*.json")), [args.out / "prices" / "coolpc.json"])

    print("# 草稿規格庫產生結果\n")
    print("| 項目 | 數量 |\n| :-- | --: |")
    for k, v in sorted(info["stats"].items()):
        print(f"| {k} | {v} |")
    print("\n| 類別 | 型號數 | 有變體 | 各欄位涵蓋率 |\n| :-- | --: | --: | :-- |")
    for cat, shard in sorted(catalog.items()):
        ms = shard["models"].values()
        fields = Counter(f for m in ms for f in m["specs"])
        cov = "、".join(f"{f} {n / len(ms):.0%}" for f, n in fields.most_common())
        print(f"| {cat} | {len(ms)} | {sum(1 for m in ms if m.get('variants'))} | {cov} |")
    print("\n| 檔案 | 原始 | gzip |\n| :-- | --: | --: |")
    total_raw = total_gz = 0
    for name, (raw, gz) in sizes.items():
        print(f"| {name} | {raw / 1024:.0f} KB | {gz / 1024:.0f} KB |")
        if name.startswith("catalog/"):
            total_raw += raw
            total_gz += gz
    print(f"| catalog/*.json 合計 | {total_raw / 1024:.0f} KB | {total_gz / 1024:.0f} KB |")
    print(f"\nschema 驗證錯誤：{len(errors)}")
    for e in errors[:30]:
        print("  -", e)
    print(f"\n規格衝突（同型號不同列的值不一致）：{len(info['conflicts'])}")
    for c in info["conflicts"][:40]:
        print("  -", c)
    print("\n未辨識品牌（開頭字樣, 列數）：", info["unknown_brands"].most_common(30))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
