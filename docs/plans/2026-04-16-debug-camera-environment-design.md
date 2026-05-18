# Debug、Camera、Environment 模組設計

**日期:** 2026-04-16  
**狀態:** 已定稿

## 目標與範圍

在既有 WebGPU 應用殼（`Experience` / `bootstrap` / `Sizes` / `Time` / `Renderer`）之上：

- 新增 **`src/utils/debug.js`**：只負責在條件滿足時建立**全域根** Tweakpane 實例。
- 新增 **`src/world/camera.js`**：相機與軌道控制之 `resize` / `update`。
- 新增 **`src/world/environment.js`**：**範圍 A**——場景氛圍（霧、`fogNode`、與清除色同步所需之 uniform）；不含 HDRI / PMREM / `scene.environment` 貼圖管線。

## 目錄約定（已確認）

- `src/world/camera.js`、`src/world/environment.js`
- `src/utils/debug.js`

## Debug：職責與 API（方案 2）

- **啟用條件:** `window.location.hash === '#debug'` → `active === true`，並建立**一個**根 `Pane`（內部可命名為 `ui`）。
- **職責邊界:** `Debug` **不**預先建立 Environment / Camera 等子資料夾；只負責根實例與 `active`。
- **委派:** 為與呼叫端 `this.debug.addFolder(...)` 對齊，在 `active` 時將 `addFolder`（及按需之 `addBinding` 等）委派至內部 `Pane`；非 `active` 時不建立 `Pane`。
- **擴展方式:** 各模組實作 **`debuggerInit()`**：內部 `if (!this.debug.active) return`（或使用共用的 `debugActive` 讀取），再使用 `this.debug.addFolder({ title: 'Environment', ... })` 等建立子面板。示例中的 `scene.environmentIntensity` 屬 **IBL / 範圍 B**；目前 **範圍 A** 下，`Environment.debuggerInit` 應綁定霧、清除色相關或暫留空資料夾，待升級 B 再接 `environmentIntensity`。

## Camera / Environment

### 對外命名

- **`src/world/camera.js`** 之類別建議匯出名 **`WorldCamera`**（或等價名稱），避免與 `THREE.Camera` 混淆；文件與實作一致即可。

### `WorldCamera`

- 構造：接收 `canvas`、`Sizes`（與現有 `PerspectiveCamera` + `OrbitControls` 參數對齊）。
- 持有：`PerspectiveCamera` 實例（對外如 **`instance`**）、`OrbitControls`。
- 方法：`resize()`、`update()`（內含 `controls.update()`）。
- `debuggerInit(debug)`：**可選**第一版最小集或暫空。
- `Renderer.attachPipeline(scene, camera)` 使用 **`worldCamera.instance`**（或文件約定名）。

### `Environment`

- 構造：接收 `scene`；建立 **A 範圍**內之 `fogColor`（`uniform(color(...))`）、`scene.fogNode = fog(..., rangeFogFactor(...))`。
- **清除色:** `Environment` 暴露 **`fogColor`**（或等價）；由 **`Experience.init()`** 在 `renderer.init()` 之後執行 `renderer.instance.setClearColor(this.environment.fogColor.value)`，避免 `Environment` 直接依賴 `Renderer` 類型（除非你明確改為注入 `renderer`）。

### `Experience` 編排

1. 建立 `Debug` → `WorldCamera` → `Environment`（需 `scene`）→ 其餘示範內容。  
2. `init()`：`attachPipeline(scene, worldCamera.instance)` → `await renderer.init()` → `time.connectDocument` → resize 訂閱 → **同步清除色** → 首次 `resize()`。  
3. 當 `debug.active` 時，依序呼叫各模組 **`debuggerInit`**（建議順序：Environment → Camera → 示範／材質相關之 `debuggerInit`）。  
4. `update()`：`time.update` → `worldCamera.update()` → `renderer.render()`。

## 第 3 段：銷毀、測試、非目標

**銷毀順序:** `setAnimationLoop(null)` → 取消 resize 訂閱 → `controls.dispose()` → **`debug.ui` 若存在則 `dispose()`** → 幾何／材質 → `sizes` / `time` → `renderer.instance.dispose`（若存在）。`Environment` / `WorldCamera` 第一版若無額外監聽則可不實作獨立 `dispose()`。

**手動測試:** 無 `#debug` 無根面板；有 `#debug` 有根面板與各 `debuggerInit` 子面板；resize 正確。

**非目標:** `hashchange` 動態切換；`environmentIntensity` / HDRI / PMREM（範圍 B）。
