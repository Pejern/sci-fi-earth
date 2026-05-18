# Spokes & Fly Lines — 设计文档

日期：2026-04-20

## 需求摘要

在现有 `DotSphere`（球面点阵）+ 单 wave 点击效果基础上，扩展为**一源多目标**的飞线可视化：

- 预设数据：1 个 hub（源点）+ N 个 target（目标点），用经纬度表达
- 节奏：hub 先起 wave → 按错峰依次向各 target 发射飞线 → 飞线到达 target 时触发 target wave → 飞线进入持续流光循环
- 规模：小规模（同时 ≤ 20 条飞线、≤ 8 个并发 wave），用固定长度 uniform 数组实现
- 视觉：飞线为球面大圆弧 + 空中抬升的 Ribbon Mesh，TSL shader 合成"生长 / 到达 / 流光"三阶段

## 架构

```
src/world/
├─ dotSphere.js         (改：单 wave → MAX_WAVES=8 的 slot 数组)
├─ clickWave.js         (保留：兼容旧签名，不改)
├─ flyLines.js          (新：FlyLines 容器 + 内部 FlyLine)
└─ spokeController.js   (新：GSAP timeline 编排 hub wave / spokes / target wave)

src/utils/
└─ geo.js               (新：lngLatToUnitVec3)
```

数据入口：

```js
const data = {
  hub: { lng: 116.4, lat: 39.9 },
  targets: [
    { id: 'ny',  lng: -74.0, lat: 40.7 },
    { id: 'lon', lng:  -0.1, lat: 51.5 },
    // ...
  ],
};
```

## 组件设计

### 1. `DotSphere` 多 wave 改造

- 新数据结构：
  ```js
  const MAX_WAVES = 8;
  this._waves = {
    clickPos: uniform([Vec3 * MAX_WAVES]),
    progress: uniform(Float32Array(MAX_WAVES)),
    color, maxRadius, thickness, softness, intensity, fadeTail,  // 共享样式
  };
  this._slotTweens = new Array(MAX_WAVES).fill(null);
  this._nextSlot = 0;   // ring buffer 分配
  ```
- Shader：在 `_createDotSphereMaterial` 里把 wave 计算放进 TSL `Loop(MAX_WAVES)`，对每个 slot 计算 ring 并累加；用 `prog>0` mask 屏蔽失活 slot，无分支。
- 新 API：`triggerWave(worldPoint, { duration, ease, onComplete })`；保留旧位置参数形式转发。
- 风险：需验证当前 three.js 版本 TSL 对 uniform 数组 `.element(i)` 的支持；若不行，退回展开成 8 个独立 uniform。
- Debug 面板保持不变（共享样式参数）。

### 2. `FlyLines` / `FlyLine`

**几何（一次性生成）**：

- 端点 A、B 为单位向量；沿球面 slerp 采样 N=64 个 curve point
- 抬升：`curve[i] = baseCurve[i] * (1 + arcHeight * sin(π·t))`，t = i/(N-1)
- Ribbon：每个 curve point 生成 2 顶点（侧向偏移 = `normalize(curve[i]) × tangent[i] × width`），构成三角带
- UV：`u = t ∈ [0,1]` 沿线，`v ∈ [-1,1]` 横向

**Per-line uniform**：`progress`（0→1 由 GSAP 驱动）、`flowTime`（每帧 += dt）、`color`

**共享 uniform**（FlyLines 级）：`arcHeight`, `width`, `flowSpeed`, `flowLength`, `headSoftness`, `intensity`

**TSL shader（u/v 段函数合成）**：

```
cross    = 1 - smoothstep(0.7, 1.0, |v|)                 // 横向软边
grown    = 1 - smoothstep(progress - headSoftness, progress, u)  // 生长段
flowHead = fract(flowTime * flowSpeed)
flowMask = smoothstep(flowLength, 0, fract(u - flowHead))
flowOn   = smoothstep(0.98, 1.0, progress)
a        = grown * postArriveFade * cross + flowOn * flowMask * cross
colorNode = color * a
emissiveNode = color * a * intensity
```

到达后 `postArriveFade` 由 CPU 侧 GSAP 从 1 降到较低值（约 0.3），避免"全亮弧 + 流光"叠加过亮。

**类形状**：

```js
class FlyLines {
  add(aWorld, bWorld, opts) -> FlyLine
  update(dt)   // 推进所有 flowTime
  clear()      // 清空当前所有 line（换轮时用）
  dispose(); debuggerInit(debug)
}

class FlyLine {
  play({ growth, ease, onArrive })
  update(dt)
}
```

### 3. `SpokeController`

用 GSAP timeline 编排一轮：

```js
play() {
  dotSphere.triggerWave(hubVec);                      // 1. hub wave
  targets.forEach((t, i) => {
    tl.call(() => {                                   // 2. stagger 发射
      const line = flyLines.add(hubVec, tVec);
      line.play({
        growth, ease,
        onArrive: () => dotSphere.triggerWave(tVec),  // 3. 到达 target wave
      });
    }, null, hubDelay + i * stagger);
  });
  if (loop) tl.call(() => this.play(), null, totalDuration + loopGap);
}
```

panelParams：`hubDelay`, `stagger`, `growth`, `growthEase`, `loop`, `loopGap`

### 4. `utils/geo.js`

仅导出 `lngLatToUnitVec3(lng, lat, out?)`：经纬度（度）→ 单位向量（Y 朝上）。

## 集成（`world.js`）

```js
this.dotSphere = new DotSphere(scene);
this.flyLines  = new FlyLines(scene);
this.clickWave = new ClickWave({ ..., dotSphere: this.dotSphere });

this.spokes = new SpokeController({
  dotSphere: this.dotSphere,
  flyLines:  this.flyLines,
  data: SAMPLE_DATA,
});

// update loop
this.flyLines.update(dt);

// 初始化后启动
await this.dotSphere.ready;
this.spokes.play();
```

示例数据（北京 + 5 城市）先硬编在 `world.js`。

## 实现顺序

1. **Step 1** — `DotSphere` 多 wave 改造。验证：快速点击多处，多 wave 共存互不覆盖。
2. **Step 2** — `FlyLines` 单条飞线的**生长动画**（先不做流光）。验证：球面上一条弧从 A 生长到 B。
3. **Step 3** — 加流光段 + `postArriveFade` + 到达触发 target wave。验证：生长→wave 爆开→持续流光。
4. **Step 4** — `SpokeController` + 示例数据 + 调试面板。验证：一次 `play()` 完整跑完时间轴。

每步可独立肉眼验证。

## YAGNI（现在不做）

- 每条 spoke 独立配色（共享即可）
- 运行时动态增删数据点
- 被球体遮挡部分的淡化
- 飞线 InstancedMesh（N≤20 无压力）
- 多 hub / 大圆弧>180° / Wave 每 slot 独立样式

## 已知风险

- TSL `uniform(array).element(i)` 的版本兼容；退路：展开 8 个独立 uniform。
- 生长→流光 的衔接需要实机调参（`postArriveFade` 的时长与终值）。
- 球体若后续旋转：`triggerWave` 已含 `worldToLocal`；FlyLines 挂到 dotSphere 的 mesh 下跟随旋转。
