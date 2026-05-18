# WebGPU 應用生命週期基建（第一版）設計

**日期:** 2026-04-16  
**範圍:** 以本倉 `threejs-tsl-template` 為母艦（WebGPU + TSL），第一版僅落地應用殼與生命週期；資源管線、除錯強化、物理／世界編排在後續里程碑搬入。

## 背景與決策

- **母艦選擇:** 在現有 `three/webgpu`、`WebGPURenderer`、`RenderPipeline` 種子上擴展，而非在舊 WebGL 倉庫上整體替換渲染器。
- **第一版優先級:** 與舊 `Experience` 類似的 **resize / update 編排** 與 **顯式 async 初始化**，渲染路徑固定 WebGPU。

## 方案結論

採用 **顯式 `bootstrap(canvas)`（或工廠 `Experience.create`）+ 類／模組拆分**，避免在 constructor 內完成 GPU 初始化。可選在開發模式掛 `window.__app` 以便控制台除錯；不強制全域單例。

## 架構與目錄邊界

- **入口:** 單一 `bootstrap`（或 `main`）負責依序建立應用、 `await renderer.init()`、啟動動畫循環、錯誤呈現。
- **應用殼:** 持有 `canvas`、`scene`、`camera`、子系統引用；暴露 `resize()`、`update()`、可選 `dispose()`。
- **系統模組:** `Sizes`（視窗尺寸與 resize）、`Time`（見下節）、`Renderer` 薄封裝（`setSize`、`setPixelRatio`、`init`、`renderPipeline.render()`），避免 WebGPU 細節散落。

## 時間驅動（你已確認的第 2 段）

時間權威使用 **`THREE.Timer`**，並在啟動時執行 **`timer.connect(document)`**，以銜接文件層級的時間／可見性等行為（依所用 `three` 版本之 `Timer` 文檔為準）。

對外仍維持與舊專案相近的體驗：例如由 `Time`（或等價模組）轉發 timer 的更新事件，供 `Experience` 的 `update()` 使用；**渲染** 仍透過 `WebGPURenderer.setAnimationLoop` 與現有 `RenderPipeline.render()` 對齊，實作計畫中明確寫清 `Timer` 與 `setAnimationLoop` 的組合方式，避免雙重 rAF 或漏調用。

## 每幀資料流

`Time`（Timer）觸發 tick → 應用殼 `update()`：`controls` / 相機 → 預留 `world`（第一版可僅示範 mesh）→ `Renderer` 只負責提交幀（`renderPipeline.render()`）。

## 錯誤處理與可銷毀性

- `bootstrap` 以 `try/catch` 包住 GPU 初始化；失敗時向 DOM 顯示簡短錯誤，不靜默失敗。
- `dispose()`：移除 resize 監聽、停止動畫循環、釋放由應用持有的 UI（如 Tweakpane）；若 `Timer` 提供斷開／銷毀 API，一併呼叫。

## 測試策略（第一版）

本里程碑以 **手動驗證**（`pnpm dev`、視窗 resize、熱更新不重複掛載）為主；`Sizes` / `Time` 保持低依賴，便於後續加 Vitest，不作為第一版阻塞項。

## 核准記錄

- 架構段（方案 2／3、目錄邊界、生命週期順序）：已核准。
- 資料流／錯誤／dispose 段：已核准，並納入 `THREE.Timer` + `timer.connect(document)`。
