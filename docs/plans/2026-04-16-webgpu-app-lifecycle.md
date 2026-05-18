# WebGPU 應用生命週期基建 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `threejs-tsl-template` 中抽出 WebGPU 應用殼（顯式 `bootstrap`、`Experience`、Sizes / Time（`THREE.Timer` + `connect(document)`）、Renderer 薄封裝），將現有 `src/script.js` 示範邏輯遷入該結構並可 `pnpm dev` / `pnpm build` 驗證。

**Architecture:** 入口只負責 `bootstrap`；GPU 初始化在 `await renderer.init()`；每幀由 `setAnimationLoop` 驅動 `update()` 與 `renderPipeline.render()`；`Time` 封裝 `THREE.Timer` 並 `timer.connect(document)`，對外提供與現有 tick 需求等價的更新來源（實作時依 `three` 的 `Timer` API 接線，避免重複 rAF）。

**Tech Stack:** `three` ^0.183.x（`three/webgpu`、`three/tsl`）、Vite 5、現有 Tweakpane 可選保留在 `Experience` 或示範場景模組。

---

### Task 1: 目錄與 `Sizes` 模組

**Files:**
- Create: `src/systems/Sizes.js`
- Modify: （本 task 僅新增檔案，尚不掛載）

**Step 1:** 實作 `Sizes`：讀取 `window.innerWidth` / `innerHeight`，監聽 `resize`，對外暴露 `width` / `height` 與 `on('resize', fn)` 或等價極小事件 API（與專案其餘風格一致）。

**Step 2:** 手動檢查：暫時在任意 scratch 中 new Sizes 後改變視窗，確認 callback 觸發。

**Step 3:** Commit

```bash
git add src/systems/Sizes.js
git commit -m "feat(systems): add Sizes for window dimensions and resize events"
```

---

### Task 2: `Time` 模組（`THREE.Timer`）

**Files:**
- Create: `src/systems/Time.js`

**Step 1:** 自 `three` 匯入 `Timer`（若套件 export 路徑為 `three/addons/...` 或核心 `Timer`，以實際 `node_modules/three` 為準）。建立類或工廠：`connect(document)` 在構造或 `start()` 內呼叫一次；對外暴露 `onTick(cb)` / `offTick` 或與 `Sizes` 對稱的 API。

**Step 2:** 閱讀 `Timer` 的更新語意（是否需主動 `timer.update()`、是否與 `setAnimationLoop` 重疊）；在程式碼註解中寫明選定的一種組合（單一驅動源）。

**Step 3:** Commit

```bash
git add src/systems/Time.js
git commit -m "feat(systems): add Time wrapper for THREE.Timer"
```

---

### Task 3: Renderer 薄封裝

**Files:**
- Create: `src/renderer/Renderer.js`（或 `src/systems/WebGPURendererLayer.js`，全專案統一命名即可）

**Step 1:** 封裝 `WebGPURenderer`：`constructor({ canvas })`、`async init()`、`setSizeFromSizes(sizes)`、`get renderPipeline()` 或 `render()` 內部呼叫 `renderPipeline.render()`；保留 `setPixelRatio` 策略與現有 `script.js` 一致。

**Step 2:** 確認不暴露多餘全域狀態。

**Step 3:** Commit

```bash
git add src/renderer/Renderer.js
git commit -m "feat(renderer): add WebGPU renderer wrapper with init and render"
```

---

### Task 4: `Experience` 與 `bootstrap`

**Files:**
- Create: `src/app/Experience.js`
- Create: `src/app/bootstrap.js`
- Modify: `src/script.js`（縮為 import bootstrap + `bootstrap(document.querySelector('canvas.webgl'))`）
- Modify: `src/index.html`（若 entry 仍為 `script.js` 則可不改）

**Step 1:** `Experience` 構造函式接收 `canvas`，建立 `scene`、`camera`、`controls`（與現有示範一致）、`Sizes`、`Time`、`Renderer`；**不在** constructor 內 `await init`。

**Step 2:** `Experience.init()`：`this.renderer.init()`，然後 `this.time` 連接 document（若尚未連接）、註冊 `sizes.on('resize', () => this.resize())`。

**Step 3:** `bootstrap(canvas)`：`const exp = new Experience(canvas);` → `try { await exp.init(); exp.start(); } catch (e) { /* DOM 錯誤訊息 */ }`。`start()` 內 `renderer.setAnimationLoop`：每幀 `exp.update()`。

**Step 4:** 將現有 torus、Tweakpane、fog、`RenderPipeline` 建立從 `script.js` 移入 `Experience`（或 `src/demo/scene.js` 子模組以保持 `Experience` 精簡——二選一，優先 YAGNI：可直接放 `Experience` 直至第二個示範出現再拆）。

**Step 5:** Run: `pnpm run build`  
**Expected:** 成功產出 `dist`，無未解析模組。

**Step 6:** Run: `pnpm dev`，瀏覽器確認畫面與 Tweakpane 仍可用。

**Step 7:** Commit

```bash
git add src/app/Experience.js src/app/bootstrap.js src/script.js
git commit -m "feat(app): add Experience shell and bootstrap with WebGPU lifecycle"
```

---

### Task 5: `dispose` 與錯誤 UI

**Files:**
- Modify: `src/app/Experience.js`
- Modify: `src/app/bootstrap.js`
- Modify: `src/index.html`（可選：增加一個 `#error` 節點供 bootstrap 寫入）

**Step 1:** 實作 `Experience.dispose()`：移除 resize listener、`renderer.setAnimationLoop(null)`、銷毀 pane（若存在）、若 `Timer` 有 disconnect 則呼叫。

**Step 2:** `bootstrap` catch 分支向頁面寫入簡短錯誤字串。

**Step 3:** 手動：於 devtools 暫時拋錯或模擬 init 失敗，確認錯誤可見。

**Step 4:** Commit

```bash
git add src/app/Experience.js src/app/bootstrap.js src/index.html
git commit -m "feat(app): add dispose hooks and bootstrap error surface"
```

---

## 驗證清單（完成全部 tasks 後）

- [ ] `pnpm run build` 通過  
- [ ] `pnpm dev` 場景與互動與重構前等價  
- [ ] 視窗 resize 後相機 aspect 與 renderer 尺寸正確  
- [ ] 設計文檔已於 `docs/plans/2026-04-16-webgpu-app-lifecycle-design.md` 並納入版本控制  

---

**Plan complete and saved to `docs/plans/2026-04-16-webgpu-app-lifecycle.md`. Two execution options:**

**1. Subagent-Driven (this session)** — 每個 task 派子代理並在 task 間審閱  

**2. Parallel Session (separate)** — 新會話使用 executing-plans，批次執行與檢查點  

**Which approach?**
