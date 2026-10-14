# 肆、高程度 3D 圖像化與 Three.js 虛擬裝機實驗規格 (High-Fidelity 3D Visualization & Assembly Stage)

> **設計核心**：將傳統生硬的「下拉選單 ＋ 文字警告」，升級為**「即時 3D 虛擬機殼拼裝舞台（Interactive 3D Assembly Stage）」**。  
> 利用 **Three.js / WebGL** 在瀏覽器純客戶端運行，當使用者選取硬體時，零件即時「磁吸（Snap-to-Fit）」裝入虛擬機殼；當發生硬體物理干涉（顯卡過長撞前板、塔散過高頂側蓋）時，以 **3D 紅色高亮線框（Visual Collision Feedback）** 直觀反饋。
>
> 2026-10 依 [設計審查](06-design-review.md) 修訂：
> - **3D 只負責呈現 [`02`](02-hardware-compatibility-constraint-engine.md) 約束引擎的結果，不自行做幾何碰撞計算**，避免出現「3D 標紅、清單卻說相容」的不一致；
> - 本文第四節的原生 Three.js 程式碼已由 [`05`](05-3d-interactive-spatial-pc-builder-architecture.md) 的 React Three Fiber 方案取代，保留作為底層參考；
> - Draco 解碼器改為自行託管；3D 相關程式碼一律延遲載入，不計入首次載入預算；
> - 3D 屬於 MVP 之後的階段（見第五節）。

---

## 一、GitHub Pages 部署 Three.js 之可行性與工程邊界審計

### 1. 可行性判定：【100% 完全可行，零伺服器門檻】
* **運作本質**：Three.js、WebGL、WebGPU 以及 3D 模型格式（`.glb` / `.gltf`）**本質上全都是在使用者瀏覽器客戶端（Client GPU）執行的靜態資產**。
* **託管無縫相容**：GitHub Pages 是一個純靜態 Web 伺服器，對 HTML、JS Bundle、WASM 與 `.glb` 檔案具有原生支援與標準 MIME 類型對齊（`model/gltf-binary`）。
* **先例**：Three.js 官方範例庫（`https://threejs.org/examples/`）即部署於 GitHub Pages。實際幀率取決於使用者裝置與模型複雜度，需以本專案的模型實測。

### 2. 靜態部署關鍵防禦與資產輕量化標準

| 挑戰維度 | 潛在瓶頸 | 生產級工程防禦解法 |
| :--- | :--- | :--- |
| **3D 模型體積** | 傳統未壓縮 OBJ/FBX 動輒數十 MB，拖慢首次載入 | **強制採用 GLB ＋ Draco 幾何壓縮 ＋ KTX2 (Basis) 紋理壓縮**。單一零件模型體積壓制在 **100 KB ~ 800 KB**。全套主流零組件庫總體積 $< 15\text{ MB}$。 |
| **多模型並發載入** | 同時加載多個零組件造成網路瀑布流阻塞 | **按需漸進式流式載入（Lazy Progressive Streaming）**：未選取的零件不載入 3D 模型；首次僅載入當前選中之零組件。 |
| **行動端與低階裝置效能** | 無獨立顯卡之後段設備可能卡頓或掉幀 | **雙軌動態切換（Adaptive LOD & Fallback）**：<br>1. 高階桌面：完整 PBR 材質、動態陰影、抗鋸齒。<br>2. 輕量/行動端：無光影 Flat Shading 或降級為 2D 向量拓撲圖。 |
| **快取利用率** | 每次重新整理重複下載 3D 模型浪費流量 | 利用 Fastly CDN 靜態快取 ＋ 瀏覽器 `CacheStorage` / `IndexedDB` 快取 GLB 二進位數據，二次造訪從本機讀取。 |
| **程式碼體積** | three ＋ R3F ＋ drei 壓縮後約 220 KB，與「整站首次載入 < 300 KB gzip」的預算衝突 | **3D 舞台拆成獨立 chunk**，使用者開啟 3D 檢視時才以動態 `import()` 載入；首次載入只含 2D 配單介面、規格庫與報價（實測資料約 71 KB gzip）。 |
| **外部依賴** | 從 gstatic CDN 載入 Draco／KTX2 解碼器，違反「零外部依賴、可離線」 | 解碼器隨網站自行託管於 `/public/draco/`、`/public/basis/`。 |

---

## 二、3D 虛擬裝機舞台架構 (Interactive 3D Assembly Stage)

```mermaid
flowchart TD
    subgraph Viewport["3D 虛擬裝機畫布 (Three.js WebGL Canvas)"]
        Scene["🌍 3D 主場景 (Scene)"]
        Camera["🎥 軌道控制器 (OrbitControls: 旋轉/縮放/平移)"]
        Lighting["💡 攝影棚燈光 (環境光 + 三點定向光 + 接地陰影)"]
    end

    subgraph HardwareNodes["零組件 3D 實體節點 (Anchor Hierarchy)"]
        CaseNode["📦 機殼主實體 (半透明側板 / 鋼板線框)"]
        MBNode["🟩 主機板 (自動磁吸於機殼銅柱錨點 Case.mb_standoffs)"]
        CPUNode["🔲 CPU (磁吸於主機板 CPU_Socket 錨點)"]
        CoolerNode["❄️ 散熱器 (磁吸於 CPU 上表面 / 機殼頂部冷排位)"]
        GPUNode["🎮 顯示卡 (磁吸於主機板 PCIe_Slot_1 錨點)"]
        PSUNode["🔌 電源供應器 (磁吸於機殼下置電源倉)"]
    end

    subgraph CollisionEngine["呈現約束引擎結果（不另做幾何計算）"]
        GPUCollision{"C4 顯卡限長結果？"}
        CoolerCollision{"C5 散熱器限高結果？"}
        
        GPUCollision -->|不通過| AlertGPU["🔴 顯卡紅色高亮<br>（提示：超出上限 N mm，數值來自約束引擎）"]
        GPUCollision -->|警告| WarnGPU["🟡 顯卡黃色高亮<br>（如：裝上電源護罩時上限 280 mm）"]
        CoolerCollision -->|不通過| AlertCooler["🔴 散熱器紅色高亮<br>（提示：超出限高 N mm）"]
    end

    Scene --> CaseNode
    CaseNode --> MBNode --> CPUNode --> CoolerNode
    MBNode --> GPUNode
    CaseNode --> PSUNode
    
    GPUNode --> CollisionEngine
    CoolerNode --> CollisionEngine
```

---

## 三、高程度圖像化的三大核心視覺體驗

### 1. 錨點磁吸拼裝系統 (Snap-to-Mount Anchor System)
每個 3D 模型皆定義標準化的**局部空間座標錨點（Transform Anchors）**：
- **機殼模型 (`case.glb`)**：
  - `mb_mount`: 主機板銅柱基準點 `(x, y, z)`。
  - `psu_bay`: 電源倉槽位 `(x, y, z)`。
  - `top_radiator_mount`: 頂部冷排鎖孔座標。
- **主機板模型 (`motherboard.glb`)**：
  - `socket_center`: CPU 核心插槽位置。
  - `pcie_slot_1`: 第一條 PCIe x16 插槽中心線（顯卡金手指對齊點）。
  - `dimm_slots`: 記憶體插槽位置。
- **效果**：使用者在左側選單點選零件時，3D 舞台中的硬體會以平滑的 Lerp 動畫「飛入」並精準卡入對應槽位，產生宛如組裝鋼彈/樂高的沉浸式成就感。

### 2. 3D 干涉警示：呈現約束引擎的結果
- **判斷來源**：是否超出、超出多少，一律取自 [`02`](02-hardware-compatibility-constraint-engine.md) 的 C4、C5 檢查結果（已含規格誤差與條件式上限）。3D 不從模型邊界框另外計算，因為：
  - 基底機殼模型只有 5 ~ 8 款，與使用者實際選的機殼內部結構不同，以模型幾何算出的數字不可信；
  - 兩套判斷並存時，3D 與清單的結論可能互相矛盾。
- **顯卡長度超標**：
  - `fail`：顯卡模型以 **ShaderMaterial 脈衝式半透明紅色**呈現，並以標註引線顯示約束引擎給出的文字，例如「⚠️ 超出機殼上限 23 mm」。
  - `warn`：黃色呈現，例如「裝上電源護罩時上限僅 280 mm」；機殼若有多段條件上限，在機殼內畫出對應的限制線。
- **風冷散熱器過高**：機殼側板輪廓線依 C5 結果亮紅色或黃色，提示「散熱器過高，側板無法安裝」。
- **示意性質**：零件位置以通用模型等比例縮放，超出的「位置」只是示意；精確數字以文字標註為準。

### 3. 透視模式與爆炸圖檢視 (X-Ray & Exploded View)
- **透視模式 (X-Ray Mode)**：一鍵切換機殼外殼為半透明玻璃或低多邊形線框（Wireframe），讓使用者能 360 度無死角檢視內部風道、走線空間與插槽分佈。
- **爆炸視角 (Exploded Assembly)**：拉動滑桿，所有零件由中心沿法線方向向外等比炸開，清晰呈現「機殼 ➔ 主板 ➔ CPU ➔ 扣具 ➔ 散熱器」的層疊安裝關係。

---

## 四、前端代碼架構：Three.js 核心渲染器實現

> 本節為原生 Three.js 版本，**已由 [`05`](05-3d-interactive-spatial-pc-builder-architecture.md) 的 React Three Fiber 方案取代**，保留作為底層原理參考。

```typescript
// viewer/PCAssemblyViewer.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class PCAssemblyViewer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private loader: GLTFLoader;

  // 零件模型掛接實體
  private caseMesh: THREE.Object3D | null = null;
  private mbMesh: THREE.Object3D | null = null;
  private gpuMesh: THREE.Object3D | null = null;
  private coolerMesh: THREE.Object3D | null = null;

  constructor(canvasContainer: HTMLElement) {
    // 1. 初始化場景與攝影機
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc); // 預設明亮淺色底

    this.camera = new THREE.PerspectiveCamera(
      45,
      canvasContainer.clientWidth / canvasContainer.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(400, 300, 500);

    // 2. WebGL 渲染器配置
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(this.renderer.domElement);

    // 3. 軌道控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // 4. 攝影棚級燈光
    this.setupStudioLighting();

    // 5. 配置支援 Draco 幾何壓縮的載入器
    const dracoLoader = new DRACOLoader();
    // 自行託管，不依賴外部 CDN；GitHub Pages 專案站台位於 /TW-bentocraft/ 底下，須帶基底路徑
    dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(dracoLoader);

    this.animate();
  }

  private setupStudioLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(300, 500, 300);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x90b0ff, 0.5);
    fillLight.position.set(-300, 200, -300);
    this.scene.add(fillLight);
  }

  /**
   * 掛接並展示選取的顯示卡；status 為約束引擎 C4 的結果（不在 3D 端另行計算）
   */
  public mountGPU(gpuModelUrl: string, status: 'pass' | 'warn' | 'fail' | 'unknown') {
    this.loader.load(gpuModelUrl, (gltf) => {
      if (this.gpuMesh) this.scene.remove(this.gpuMesh);
      this.gpuMesh = gltf.scene;

      // 磁吸定位至主機板 PCIe 插槽錨點
      const pcieSlotAnchor = new THREE.Vector3(50, 80, 20);
      this.gpuMesh.position.copy(pcieSlotAnchor);

      if (status === 'fail' || status === 'warn') {
        // 覆寫為半透明警告材質：不通過為紅色、警告為琥珀色
        this.gpuMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
              color: status === 'fail' ? 0xef4444 : 0xf59e0b,
              transparent: true,
              opacity: 0.85,
              wireframe: true
            });
          }
        });
      }

      this.scene.add(this.gpuMesh);
    });
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
```

---

## 五、分階段落地路線圖 (Milestone Roadmap)

* **Phase 1 (MVP 當前基石)**：2D 視覺化卡片、原價屋每日報價快照、[`02`](02-hardware-compatibility-constraint-engine.md) 的約束引擎（含「未知」與誤差帶）、GitHub Pages 部署。**3D 不在 MVP 範圍內**，避免拖慢第一版。
* **Phase 2 (高程度圖像化 2.5D 尺寸比例尺)**：引入 SVG / Canvas 2D 比例尺，繪製機殼斷面圖與顯卡/塔散實體公差填充色塊（毫米級真實比例直觀對比）。
  > **實作狀態（2026-10）**：估價單內的「尺寸比例」（[`web/src/ui/FitDiagram.tsx`](web/src/ui/FitDiagram.tsx)）以 SVG 依毫米等比例畫出顯卡長度、風冷高度與機殼上限，誤差範圍以淡色區段、條件式上限以虛線標示；顏色與結論一律取自 C4／C5 結果。另有機殼側視示意圖（[`web/src/ui/CaseSchematic.tsx`](web/src/ui/CaseSchematic.tsx)）：機殼外形為通用模型，主機板、顯卡、電源與冷排依規格尺寸等比例畫入，顏色取自 C3／C4／C5／C9。真實外形的機殼斷面圖待有機殼內部尺寸資料後再做。
  > **Phase 3（3D）**：擬真 WebGL 版本暫緩，因為規格庫沒有機殼外部尺寸與內部配置，且 three ＋ R3F ＋ drei 會讓整站下載量變成約三倍。改以程式產生的等角 SVG 線稿做通用外形的分解圖（[`web/src/ui/ExplodedView.tsx`](web/src/ui/ExplodedView.tsx)、[`isometric.ts`](web/src/ui/isometric.ts)）：零件是長方體加表面細節，依視角正投影並由遠到近繪製；點零件開啟該類別清單，增加約 7 KB（gzip）。
* **Phase 3 (R3F 3D 虛擬機殼實驗沙盒)**：依 [`05`](05-3d-interactive-spatial-pc-builder-architecture.md) 的 R3F 架構，引入 5 款代表性機殼與通用零件之低多邊形（Low-Poly）Draco 壓縮 GLB 模型，實現 3D 磁吸拼裝，並呈現約束引擎的干涉結果。3D 程式碼延遲載入，不影響 2D 介面的首次載入。
