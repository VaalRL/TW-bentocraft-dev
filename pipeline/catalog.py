"""型號辨識與規格庫對應：品牌、型號名稱、料號、變體，以及品名欄位到規格庫 schema 的轉換。

規格庫格式見 07-spec-catalog-schema.md 與 schema/catalog.schema.json。
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pipeline.extract import (
    extract_case_cooler_clearance, extract_case_gpu_clearance, extract_memory_type, extract_socket, model_key,
    split_combo,
)
from pipeline.reference import apply_reference, load_reference

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


_PROMO_PREFIX_RE = re.compile(r"^\s*(?:限搭機|任搭價|裝機價|限搭|任搭)\s*(?=｛)")


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
        if not name.strip() and head.lstrip().startswith("｛"):  # 「｛技嘉 Z890 …(E-ATX/…」：通路漏打右括號
            name = head.lstrip()[1:]
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
        elif "盒裝" in text and re.search(r"Intel", text, re.I) and not re.search(r"\d{3,5}KF?(?![A-Za-z0-9])", text):
            # 原價屋的 Intel 盒裝非 K 系列附原廠散熱器（K 系列另標「無風扇」）
            s["cooler_included"] = val(True, "title", note="品名標盒裝；Intel 盒裝非 K 系列附原廠散熱器")
        elif "盒" in text and re.search(r"\d{4}G(?![A-Za-z0-9])", text):
            s["cooler_included"] = val(True, "title", note="品名標盒裝；AMD G 系列盒裝附 Wraith 散熱器")
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
        if re.search(r"PCIe\s?5\.[01]", text, re.I):
            # PCIe CEM 5.x 定義原生 12VHPWR／12V-2x6 接頭；品名不寫數量，記為至少 1
            s["pcie_12v2x6"] = val(1, "title", note="品名標 PCIe 5.x，具原生 12V-2x6（12VHPWR）接頭；數量未標示")
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
    elif re.search(r"組裝價|裝機價|搭機價", text):
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


# ── 規格庫讀寫與索引 ─────────────────────────────────────────────

CATEGORIES = ("cpu", "motherboard", "ram", "gpu", "cooler", "case", "psu", "ssd")


def load_catalog(directory) -> dict[str, dict]:
    """讀取 data/catalog/<類別>.json；不存在的類別回傳空分片。"""
    shards = {}
    for cat in CATEGORIES:
        path = Path(directory) / f"{cat}.json"
        shards[cat] = (json.loads(path.read_text(encoding="utf-8")) if path.exists()
                       else {"schema_version": "1.0", "category": cat, "models": {}})
    return shards


def write_catalog(directory, shards: dict[str, dict]) -> None:
    """依 ID 排序寫出分片，每個型號一段，方便 PR 審查 diff。"""
    Path(directory).mkdir(parents=True, exist_ok=True)
    for cat, shard in shards.items():
        if not shard["models"]:
            continue
        doc = {**shard, "models": dict(sorted(shard["models"].items()))}
        Path(directory, f"{cat}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
                                                  encoding="utf-8")


class CatalogIndex:
    """型號鍵 → 型號 ID。已棄用型號的鍵轉址到 replaced_by。"""

    def __init__(self, shards: dict[str, dict]):
        self.ids: set[str] = set()
        self.by_key: dict[tuple[str, str], str] = {}
        for cat, shard in shards.items():
            models = shard["models"]
            for mid, m in models.items():
                self.ids.add(mid)
                target = m.get("replaced_by", mid) if m.get("status") == "deprecated" else mid
                for key in m.get("aliases", {}).get("model_keys", []):
                    self.by_key.setdefault((cat, key), target)

    def lookup(self, category: str, key: str) -> str | None:
        return self.by_key.get((category, key))


def new_models(items: list[dict], shards: dict[str, dict]) -> tuple[dict[str, dict], dict]:
    """從品項產生規格庫中尚不存在的型號（review.status = auto）。

    既有型號一律不修改：規格庫是人工審查的資料，自動流程只能新增。
    同一型號多列的規格值不一致時，型號標為 draft 並記錄衝突，留待人工判斷。
    品名沒有的功耗等欄位，以對照表（pipeline/reference.py）補上。
    回傳 ({類別: {型號 ID: 型號}}, 統計)。
    """
    index = CatalogIndex(shards)
    created: dict[str, dict] = {cat: {} for cat in CATEGORIES}
    key_to_id: dict[tuple[str, str], str] = {}
    conflicts: list[str] = []
    collisions = 0
    for item in items:
        cat = item["category"]
        key, pn = identity(item)
        if index.lookup(cat, key):
            continue
        mid = key_to_id.get((cat, key))
        if mid is None:
            brand, bslug, name = split_name(main_text(item))
            if pn:
                name = f"{name} {pn}"
            mid = f"{cat}:{bslug}:{slug(name) or short_hash(key)}"
            if mid in created[cat] or mid in index.ids:  # 不同型號鍵產生相同 ID → 加雜湊區分
                mid = f"{mid}-{short_hash(key, 4)}"
                collisions += 1
            key_to_id[(cat, key)] = mid
            created[cat][mid] = {
                "category": cat, "brand": brand, "name": name[:120], "status": "active",
                "aliases": {"model_keys": [key]}, "specs": {}, "review": {"status": "auto"},
            }
        model = created[cat][mid]
        variant = detect_variant(item["text"])
        if variant:
            model.setdefault("variants", {})[variant[0]] = variant[1]
        for field, value in specs_for(item).items():
            current = model["specs"].get(field)
            if current is None:
                model["specs"][field] = value
            elif current["value"] != value["value"]:
                conflicts.append(f"{mid} {field}: {current['value']} vs {value['value']}")
                model["review"] = {"status": "draft"}
    reference = load_reference()
    for models in created.values():
        for model in models.values():
            apply_reference(model, reference)
    stats = {"models_created": sum(len(m) for m in created.values()), "id_collisions": collisions,
             "spec_conflicts": len(conflicts), "conflicts": conflicts}
    return created, stats
