**English** | [繁體中文](README.zh-TW.md)

# ComputerboxTW (TW-bentocraft): Zero-Maintenance Open-Source 3D PC Compatibility & Pricing Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen)](https://vaalrl.github.io/TW-bentocraft/)
[![GitHub Stars](https://img.shields.io/github/stars/VaalRL/TW-bentocraft?style=social)](https://github.com/VaalRL/TW-bentocraft)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Donate-yellow.svg?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/username)

> 🍱 **ComputerboxTW (Repo: `TW-bentocraft` / 中文品牌: 原價煮便當)** is an open-source, serverless 3D PC building estimator and hardware compatibility engine tailored for Taiwan's retail hardware ecosystem (CoolPC / Sinya).  
> 
> 🎨 **Design System & Aesthetics**:
> - **Style Archetype**: **Model Kit Studio (Gunpla / Maker Workbench)** with runner snap aesthetics and tactical precision.
> - **Default Light Theme**: **White-Gold-Emerald** (Crisp workbench white, emerald verification badges, elegant gold accents).
> - **Dark Theme**: **Black-Crimson-Gold** (Obsidian metal chassis, bronze-gold frames, crimson collision alert meshes).
> 
> It runs 100% on **client-side edge (GitHub Pages)** with **zero hosting costs**, powered by an automated daily **GitHub Actions ETL crawler**, a deterministic **Constraint Satisfaction Engine (CSP)**, and a **React Three Fiber (R3F) Spatial 3D Assembly Stage** with clickable component hot-zones and smooth camera fly-to choreography.


---

## ⚡ Core Value Proposition: Legacy Evaluators vs. OpenPCBuilder

| Dimension | Traditional Store Evaluators (CoolPC / Sinya) | Typical Commercial Builders (PCPartPicker) | **OpenPCBuilder TW (This Project)** |
| :--- | :--- | :--- | :--- |
| **Hosting & Ops Cost** | Heavy dedicated web servers ($$$) | Massive AWS cloud infrastructure ($$$$) | **$0 / month (100% Serverless GitHub Pages + Actions)** |
| **Compatibility Filtering** | None (Allows buying incompatible parts) | High (US/Global retail data focus) | **Real-time Bidirectional CSP Engine on Taiwan local parts** |
| **User Experience (UX)** | Cluttered, 1990s table, ads, no clearance checks | Ad-heavy, complex affiliate redirects | **Default Clean Light UI, dynamic dark toggle, zero ads** |
| **Menu Sharing** | Ephemeral, easily expired server sessions | Requires account login or database link | **Database-Free Compressed URL Hash sharing (LZ-String)** |
| **Open Source & Extensible** | Closed source, proprietary | Closed source commercial | **100% MIT Licensed, Community Spec Ontology PRs** |

---

## 🏗️ System Architecture Topology

```mermaid
flowchart TD
    subgraph Pipeline["1. GitHub Actions (Daily Cron 03:17 UTC)"]
        Cron["⏰ Daily Scheduler"] --> Runner["🐧 Ubuntu Runner (Free Tier)"]
        Runner --> Crawler["📡 Scrape CoolPC evaluate.php / Retail APIs"]
        Crawler --> SpecMatch["🧹 Three-Tier Sanitization & Spec Fingerprint Mapping"]
        SpecMatch <--> SpecCatalog["📚 Immutable Spec Ontology (spec_catalog.json)"]
        SpecMatch --> Snapshot["📦 Validate & commit data/prices/coolpc.json"]
        Snapshot --> DeployPages["🚀 Build & deploy in the same workflow (actions/deploy-pages)"]
    end

    subgraph Distribution["2. Fastly Global Edge CDN"]
        DeployPages --> CDN["🌐 GitHub Pages Edge CDN"]
        CDN --> StaticAssets["📄 Single Page App (index.html + bundle.js)"]
    end

    subgraph ClientEdge["3. Client Browser (100% Zero-Latency CSP)"]
        Browser["💻 User Browser"] --> LoadApp["⚡ Instant Load (< 300 KB Gzip)"]
        LoadApp --> CSPEngine["🧠 Reactive Constraint Propagation Engine"]
        
        CSPEngine --> SocketCheck["🔲 Socket Match (AM5 / LGA1700)"]
        CSPEngine --> RAMCheck["💾 Memory Generation & Slot Limit (DDR4 vs DDR5)"]
        CSPEngine --> CaseClearance["📦 Form Factor Inclusion & GPU Clearance (mm)"]
        CSPEngine --> CoolerCheck["❄️ Air Cooler Height & Radiator Clearance"]
        CSPEngine --> PowerBudget["⚡ Dynamic TDP Power Budgeting & Safety Factor"]
        CSPEngine --> ThreeJSStage["🎮 Three.js 3D Virtual Assembly (Snap-to-Fit & Collision Red Mesh)"]
        
        CSPEngine --> UI["🖥️ Modern Responsive UI (Default Light Mode)"]
        ThreeJSStage --> UI
        UI --> Share["🔗 One-Click URL Hash Sharing (LZ-String Compressed)"]
    end

    Pipeline --> Distribution --> ClientEdge
```

---

## 🧩 Hardware Compatibility Constraint Matrix

The browser-based engine evaluates candidate parts against currently selected parts. Each check returns pass, warn, fail or unknown: missing specs yield unknown instead of a default value, and approximate values (GPU lengths from listings are only accurate to the centimetre) warn within their tolerance. The core dimensions are below; the full list, including PSU form factor vs case, CPUs without integrated graphics and back-connect boards, is in [02](02-hardware-compatibility-constraint-engine.md).

```mermaid
graph LR
    CPU["CPU"] <-->|"Socket Match"| MB["Motherboard"]
    MB <-->|"DDR Gen & Slots"| RAM["RAM"]
    MB <-->|"Form Factor (ATX/M-ATX/ITX)"| Case["Case"]
    GPU["GPU"] <-->|"Length Clearance (mm)"| Case
    Cooler["Cooler"] <-->|"Height & Radiator Size"| Case
    CPU & GPU -->|"Dynamic Peak Wattage × 1.25"| PSU["PSU"]
```

1. **CPU ⟷ Motherboard**: Exact Socket Match (`AM4`, `AM5`, `LGA1700`, `LGA1851`). Prevents pin mismatch.
2. **Motherboard ⟷ RAM**: Strict memory generation parity (`DDR4` vs `DDR5`) and slot count enforcement.
3. **Case ⟷ Motherboard**: Form factor hierarchy enclosure (`E-ATX` $\supset$ `ATX` $\supset$ `M-ATX` $\supset$ `Mini-ITX`).
4. **Case ⟷ GPU**: Physical clearance check (`GPU.length_mm` $\le$ `Case.max_gpu_length_mm`).
5. **Cooler ⟷ CPU / Case**: Air cooler height limit (`Cooler.height_mm` $\le$ `Case.max_cooler_height_mm`) and liquid radiator mounts.
6. **PSU ⟷ Whole Build**: Dynamic peak wattage budget + 25% safety overhead + PCIe 12V-2x6 connector verification.

---

## 🚀 Quickstart & Local Development

The frontend is not implemented yet. What runs today is the daily price pipeline ([`pipeline/`](pipeline/), [`scripts/`](scripts/)), the PoC (see [`poc/README.md`](poc/README.md)) and the spec catalog validation.

### Prerequisites
- Python 3.11+
- `jsonschema` (catalog validation)

### 1. Clone
```bash
git clone https://github.com/VaalRL/TW-bentocraft.git
cd TW-bentocraft
pip install -r requirements.txt
```

### 2. Run Tests
```bash
python -m unittest discover -s tests -t .
(cd schema && python -m unittest test_schema)
```

### 3. Fetch CoolPC and Update the Price Snapshot (needs access to coolpc.com.tw)
```bash
python scripts/update_prices.py --out data/prices/coolpc.json --save-html page.html
python scripts/bootstrap_catalog.py --html page.html   # add models missing from the catalog (review via PR)
```

---

## ☕ Support & Sponsor

If this project saved your time building PCs or helped you avoid purchasing incompatible hardware, consider buying the maintainers a coffee!

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Donate-yellow.svg?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/username)

---

## 📄 License
Released under the [MIT License](LICENSE).
