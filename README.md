**English** | [繁體中文](README.zh-TW.md)

# 原價煮便當 (TW-bentocraft)

[![Website](https://img.shields.io/badge/website-vaalrl.github.io%2FTW--bentocraft-brightgreen)](https://vaalrl.github.io/TW-bentocraft/)
[![GitHub Stars](https://img.shields.io/github/stars/VaalRL/TW-bentocraft?style=social)](https://github.com/VaalRL/TW-bentocraft)

**A PC part picker for Taiwan's CoolPC (原價屋) store: today's CoolPC prices, with incompatible parts filtered out as you choose.**

👉 **https://vaalrl.github.io/TW-bentocraft/** (the interface is in Traditional Chinese)

![Builder screen: categories on the left, candidate parts with specs in the middle, the quote with compatibility checks and a size diagram on the right](docs/screenshot.png)

> This is an unofficial open-source project, not affiliated with CoolPC. Prices and specs are for reference; CoolPC's own listing is authoritative.

---

## What it does

- **Filters as you pick.** Every part you choose updates the candidate lists in the other categories; incompatible parts are hidden by default (or shown and marked). If choosing a part would leave another category with no compatible option, you are told before you pick it.
- **Daily prices.** CoolPC's quote page is fetched every day at 11:17 Taiwan time. Conditional prices (time-limited deals, bundle discounts, the in-store assembly price) are kept apart and only count when their condition holds. Colour variants of one model are listed once at the lowest price, with the colour named.
- **Price trends.** Each model's price is recorded daily and kept for 90 days. Candidate lists show the change from 7 days ago, and the quote shows the 30-day low (and says so when today's price is it). Trends appear once a week of history exists.
- **Size diagram.** GPU length and air-cooler height are drawn to scale against the case limits, including conditional limits such as "with the PSU shroud installed".
- **Share and export.** One link carries the whole build (no account; the build lives in the URL), and the build can be copied in PTT PC_Shopping format. A shared link is priced with the prices of the day it is opened.
- Dark mode and a mobile layout.

### Compatibility checks

| Check | What it compares |
| :-- | :-- |
| C1 CPU ⟷ motherboard | Socket (AM4, AM5, LGA1700, LGA1851) |
| C2 Motherboard ⟷ RAM | DDR4/DDR5 generation; module count within the slot count |
| C3 Motherboard ⟷ case | Form factor (Mini-ITX ⊂ M-ATX ⊂ ATX ⊂ E-ATX) |
| C4 GPU ⟷ case | GPU length vs case limit, with listing tolerance and conditional limits |
| C5 Cooler ⟷ case | Air-cooler height; AIO radiator size vs the case's radiator mounts |
| C6 Cooler ⟷ CPU | Mounting bracket supports the socket |
| C7 PSU ⟷ build | Estimated peak load and recommended wattage |
| C8 GPU ⟷ PSU | Warns when a 16-pin (12V-2x6) GPU meets a PSU without a native cable |
| C9 PSU ⟷ case | ATX / SFX / SFX-L PSU size |
| C10 | CPU without integrated graphics and no GPU selected |
| C11 Back-connect board ⟷ case | Case supports back-connect motherboards |
| C12 | CPU sold without a cooler and no cooler selected |

Each check returns **pass, warn, fail or unknown**. Unknown means the catalog lacks the data needed to decide; it does not mean incompatible. Approximate listing values (CoolPC gives GPU length to the centimetre) warn when the result falls within their tolerance. Full rules: [`02`](02-hardware-compatibility-constraint-engine.md) (Traditional Chinese).

## Where the data comes from

- **Prices**: a GitHub Actions job fetches [CoolPC's quote page](https://www.coolpc.com.tw/evaluate.php) daily, maps each listing to the spec catalog, commits [`data/prices/coolpc.json`](data/prices/coolpc.json) and redeploys the site. If a fetch fails, the previous day's prices stay and an issue is opened; the site marks the price date as possibly stale.
- **Specs**: [`data/catalog/`](data/catalog/) holds about 1,700 models. New models are extracted from listing titles and proposed in a weekly PR; values titles don't give (power draw, DIMM slots, case radiator mounts) are added by hand from manufacturer specs. Every value records its source, and inferred values are labelled as such on the site.
- `python scripts/catalog_coverage.py` shows how complete each field is.

## Found a mistake?

Wrong specs, a price mapped to the wrong model, or a wrong compatibility result: please [open an issue](https://github.com/VaalRL/TW-bentocraft/issues/new/choose), ideally with the model and a link to the manufacturer's spec page. To edit the catalog directly, see [`CONTRIBUTING.md`](CONTRIBUTING.md) (Traditional Chinese).

---

## Local development

The frontend is in [`web/`](web/) (React + Vite + TypeScript); the data pipeline in [`pipeline/`](pipeline/) and [`scripts/`](scripts/). Requires Python 3.11+ and Node.js 22.12+.

```bash
git clone https://github.com/VaalRL/TW-bentocraft.git
cd TW-bentocraft
pip install -r requirements.txt

# tests
python -m unittest discover -s tests -t .
(cd schema && python -m unittest test_schema)
python schema/validate.py --catalog data/catalog/*.json --prices data/prices/coolpc.json

# frontend
python scripts/build_web_data.py      # writes web/public/data/ (compact catalog and prices)
cd web && npm install && npm run dev  # http://localhost:5173
npm test                              # constraint engine tests
npm run build && npm run test:e2e     # browser end-to-end tests (Playwright)
```

Fetching CoolPC and updating prices (needs access to coolpc.com.tw):

```bash
python scripts/update_prices.py --out data/prices/coolpc.json --save-html page.html
python scripts/bootstrap_catalog.py --html page.html   # add models missing from the catalog
```

## Design documents (Traditional Chinese)

| Document | Covers |
| :-- | :-- |
| [01 System architecture and data pipeline](01-system-architecture-and-data-pipeline.md) | Daily fetch, cleaning and matching; Actions schedule and failure handling |
| [02 Compatibility constraint engine](02-hardware-compatibility-constraint-engine.md) | Rules C1–C12, the four results, tolerances and conditional limits |
| [03 Frontend and deployment](03-frontend-ux-and-zero-maintenance-deployment.md) | UI conventions, share links, PTT export, GitHub Pages deployment |
| [06 Design review](06-design-review.md) | Gaps in the original design and how they were fixed; [PoC](poc/README.md) and [spot check](poc/AUDIT-2026-10-12.md) |
| [07 Catalog and price schema](07-spec-catalog-schema.md) | Model, variant and offer layers; value sources and tolerances; validators in [`schema/`](schema/) |
| [Sources](sources/README.md) | CoolPC page structure, PCPartPicker's constraint model, industry standards |

## Roadmap

Planned, not yet built:

- **3D build view** showing part placement and interference ([`04`](04-high-fidelity-3d-visualization-and-threejs-spec.md), [`05`](05-3d-interactive-spatial-pc-builder-architecture.md)). The size diagram is its 2D precursor.
- Prices from other stores such as Sinya (欣亞數位).
- Price-drop alerts.

## License

The license has not been chosen yet; a `LICENSE` file will be added once it is.
