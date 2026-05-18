# Debug、Camera、Environment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `src/utils/Debug.js`（或 `debug.js`，與專案匯出慣例一致）、`src/world/WorldCamera.js`、`src/world/Environment.js`，並重構 `Experience.js` 使用上述模組；`#debug` 時由各模組 `debuggerInit` 掛 Tweakpane；行為與重構前一致且 `pnpm run build` 通過。

**Architecture:** `Debug` 僅建立根 `Pane` 並委派 `addFolder`（等）；`WorldCamera` 持有透視相機與 `OrbitControls`；`Environment` 持有霧與 `fogColor`；`Experience` 串清除色並編排 `debuggerInit`。

**Tech Stack:** `three/webgpu`、`three/tsl`、Tweakpane 4、現有 Vite。

---

### Task 1: `Debug` 類

**Files:**
- Create: `src/utils/debug.js`（或 `src/utils/Debug.js`，與 import 路徑一致即可）

**Step 1:** 實作：`active = (window.location.hash === '#debug')`；若 `active`，`this.ui = new Pane({ title: 可選 })`。  
**Step 2:** 實作 `addFolder`（及若 Tweakpane 4 需要則 `addBinding`）委派至 `this.ui`；`active` 為 false 時方法為 no-op 或僅 return。  
**Step 3:** 實作 `dispose()`：`this.ui?.dispose()`。

**Step 4:** Commit

```bash
git add src/utils/debug.js
git commit -m "feat(utils): add Debug pane root with hash gate"
```

---

### Task 2: `WorldCamera`

**Files:**
- Create: `src/world/camera.js`（預設匯出類名 `WorldCamera`）

**Step 1:** 構造：`canvas`、`sizes`；建立 `PerspectiveCamera`（參數對齊現 `Experience`）、`OrbitControls`，`this.instance` 為相機。  
**Step 2:** `resize()`：`aspect`、`updateProjectionMatrix`。  
**Step 3:** `update()`：`this.controls.update()`。  
**Step 4:** 可選 `debuggerInit(debug)`：最小綁定或空實作。

**Step 5:** Commit

```bash
git add src/world/camera.js
git commit -m "feat(world): add WorldCamera with OrbitControls"
```

---

### Task 3: `Environment`（範圍 A）

**Files:**
- Create: `src/world/environment.js`

**Step 1:** 構造接收 `scene`；建立 `fogColor`、`scene.fogNode`（與現 `Experience` 相同之 `fog` / `rangeFogFactor`）。  
**Step 2:** `debuggerInit(debug)`：`Environment` 子資料夾，綁定霧距或顏色相關（不綁 `environmentIntensity`）。  
**Step 3:** 不強制依賴 `Renderer`。

**Step 4:** Commit

```bash
git add src/world/environment.js
git commit -m "feat(world): add Environment fog and debug folder"
```

---

### Task 4: 重構 `Experience`

**Files:**
- Modify: `src/app/Experience.js`

**Step 1:** 建立 `this.debug = new Debug()`、`this.worldCamera = new WorldCamera(...)`、`this.environment = new Environment(this.scene)`；移除內聯相機／controls／霧建立邏輯。  
**Step 2:** `attachPipeline(this.scene, this.worldCamera.instance)`；`init` 內 `setClearColor(this.environment.fogColor.value)`。  
**Step 3:** `resize` 轉調 `worldCamera.resize()`；`update` 轉調 `worldCamera.update()`。  
**Step 4:** 示範 mesh 之 `tweakParams`／`Pane` 綁定改為 **`debuggerInit`**（例如在 `Experience` 私有方法 `debuggerInit()` 內，僅當 `this.debug.active` 時建立資料夾並 `addBinding`）；無 `#debug` 時維持初始 `tweakParams` 數值。  
**Step 5:** `dispose`：加入 `this.debug.dispose()`；`worldCamera.controls.dispose()` 已由 `Experience` 處理或封裝至 `WorldCamera.dispose()`（擇一寫清）。

**Step 6:** Run: `pnpm run build`  
**Expected:** 成功。

**Step 7:** Commit

```bash
git add src/app/Experience.js
git commit -m "refactor(app): wire Debug, WorldCamera, Environment in Experience"
```

---

### Task 5: 手動驗證

- [ ] `pnpm dev`：無 hash 時無 Tweakpane；`#debug` 時有根面板與子資料夾。  
- [ ] Resize、畫面、材質動畫與重構前一致。

---

**Plan saved to `docs/plans/2026-04-16-debug-camera-environment.md`.**

**Execution options:** (1) Subagent-driven in this session (2) New session with executing-plans — **choose when implementing.**
