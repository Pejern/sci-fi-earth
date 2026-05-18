# Fly Lines Billboard Ribbon Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `flyLines.js` 的飞线从 CPU 球面法线×切线展宽改为 TSL 顶点级 billboard 带（`direction` 属性 + `cross(线向, 视向)` + `vertexIndex` 选边），片元阶段保持生长/流光/`|v|` 软边行为。

**Architecture:** 单文件 `src/world/flyLines.js`：`buildRibbonGeometry` 只写中心线双顶点、填充 `direction` 与 `uv`；`FlyLine` 中 `MeshBasicNodeMaterial` 设 `positionNode` 做侧向偏移，并以 uniform 传 `width`；退化时用固定轴 fallback。

**Tech Stack:** three.js r183 `three/webgpu`、`three/tsl`、GSAP（不改）、Tweakpane debug（可微调 `width` 绑定到 uniform）。

**Prerequisite design:** @docs/plans/2026-04-22-flylines-billboard-ribbon-design.md

**Related skill:** @C:\Users\f1686533\.claude\skills\webgpu-threejs-tsl\SKILL.md（`positionNode`、TSL 导入方式）

---

### Task 1: 几何 — 同位双顶点 + `direction` 属性

**Files:**

- Modify: `src/world/flyLines.js` — 函数 `buildRibbonGeometry`（约第 13–75 行）

**Step 1: 重算 curvePoints（保留大圆+抬升）**

不删除现有 `curvePoints` 与段循环；删除或停用基于 `tmpSide` / `normal × tangents[i]` 的 `up`/`dn` 偏移，使每个 `i` 的两侧顶点都赋值为 **同一点** `p = curvePoints[i]`。

**Step 2: 填充 `direction`**

对每个采样索引 `i` 计算 `dir = curvePoints[min(i+1,N-1)] - curvePoints[i]`；若 `i === N-1`，使用 `curvePoints[i] - curvePoints[i-1]` 或与 `i-1` 同向，保证与 design 中「最后一段同向」一致。写入 `Float32Array(N*2*3)`，使同一对顶点共享相同 `direction`（6 floats × 2 vertices per i，两段相同 vec3 各写一次）。若长度接近 0，归一化前夹紧或用上一段方向（实现时选一种并注释简短理由）。

**Step 3: 注册 BufferAttribute**

`geometry.setAttribute('direction', new THREE.BufferAttribute(directions, 3))`；`position` / `uv` / `setIndex` 与现有一致；`computeBoundingSphere()`。

**Step 4: 手动验证**

`npm run dev`；打开 debug Fly lines → Test line；应仍能看到线（可能暂为线宽 0 或极细，至 Task 2 修复）。

**Step 5: Commit**

```bash
git add src/world/flyLines.js docs/plans/2026-04-22-flylines-billboard-ribbon-design.md docs/plans/2026-04-22-flylines-billboard-ribbon.md
git commit -m "docs(flyLines): billboard ribbon design; geometry centerline + direction attr"
```

若首步不拆 commit，可合并到 Task 2 一次提交；优先小步时保留此条。

---

### Task 2: TSL 顶点 — `positionNode` + 宽度 uniform

**Files:**

- Modify: `src/world/flyLines.js` — `FlyLine` 构造函数内材质（约 85–128 行）

**Step 1: 增加 uniform `lineWidth`（或 `halfWidth`）**

在 `this.uniforms` 或 `shared` 中增加 `uniform( params.width )`，`debuggerInit` 里对 `width` 的 `on('change')` 同步到该 uniform，保证调参时无需重建几何。

**Step 2: 从 `three/tsl` 引入节点**

根据 r183 现有 API 引入，例如（以实际可编译为准）：

`positionLocal, modelWorldMatrix, cameraPosition, attribute, vertexIndex, float, vec3, cross, normalize, mat3, ...`

用 `attribute('direction', 'vec3')` 或项目中等价的 BufferAttribute 绑名与类型。

**Step 3: 实现 `positionNode` 逻辑（核心）**

含以下逻辑（TSL 节点组合，或 `Fn` 包裹）：

1. 局部位置 `base = positionLocal`（与 BufferGeometry 一致）。
2. 世界位：`worldPos = modelWorldMatrix * vec4(base,1)` 的 xyz。
3. 线段方向世界空间：`lineDir = normalize( modelWorldMatrix 的 3×3 部分 * directionAttr )`；若用 `transformDirection` 类节点则用之。
4. `toCamera = normalize(cameraPosition - worldPos)`。
5. `raw = cross(lineDir, toCamera)`；`len = length(raw)`；若 `len < epsilon`，`lineDir` 与固定 `up`（如 (0,1,0)）重算正交基得到 `tangent`；否则 `tangent = normalize(raw)`。
6. `side = (floor(vertexIndex * 3 - 2) / 3) % 2` 或 design 中等价公式映射到 -0.5 / +0.5（**须与几何顶点顺序**中 v=1 / v=-1 的两顶点一致）。
7. `offsetWorld = tangent * (side * lineWidthUniform)`（注意半宽/全宽与 `params.width` 语义与旧版 `multiplyScalar(width)` 对齐）。
8. 世界位置加偏移后压回局部：`newLocal = inverse(modelWorldMatrix) * (worldPos + offsetWorld)` 的等价 TSL，或使用官方提供的 `transformXXX` 节点避免手写逆矩阵若已有封装。

`material.positionNode = newLocal`（或库要求的 vec4 形式）。

**Step 4: 保留 `colorNode` / `opacityNode`**

不修改现有 `u`/`v`/`progress` 表达式，除非 `v` 语义变化；双顶点仍对应 `uv` 的 v=±1。

**Step 5: 运行与目测**

`npm run dev`：旋转相机，带应对屏幕稳定对齐；`width` 滑条改变粗细。

**Step 6: Commit**

```bash
git add src/world/flyLines.js
git commit -m "feat(flyLines): TSL vertex billboard expand for arc ribbon"
```

---

### Task 3: 回归与收尾

**Files:**

- Optional: `docs/plans/2026-04-20-spokes-flylines-design.md` 中加一条脚注指向本设计，标明 Ribbon 展宽已改为 GPU billboard（**可选**，避免大改历史文档时只做 README 式链接即可）。

**Step 1: Spoke 流程**

在应用中触发 `SpokeController` 或等价路径，确认多条飞线无报错、无闪。

**Step 2: 边界**

极端 `width=0`、相机位于弧正上方，确认无全屏花屏；若有，再收紧 epsilon。

**Step 3: Commit（若只改 doc 脚注）**

```bash
git add docs/plans/2026-04-20-spokes-flylines-design.md
git commit -m "docs: note fly line ribbon is GPU billboard (2026-04-22)"
```

---

## 执行选项（完成后）

1. **本会话子任务式** — 每任务用 subagent 或逐步改，任务间自测。子技能：subagent-driven-development。  
2. **新会话** — 用 executing-plans 按文件逐步执行。  

本项目无自动化 e2e，以 `npm run dev` + 面板操作为主。
