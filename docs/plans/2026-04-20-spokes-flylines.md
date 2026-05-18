# Spokes & Fly Lines Implementation Plan

**Goal:** 在 `DotSphere` 基础上扩展出 1-hub / N-target 的飞线动画：hub wave → 错峰发射飞线 → 到达触发 target wave → 持续流光。

**Architecture:** `DotSphere` 改成支持 MAX_WAVES=8 的多波叠加；新增 `FlyLines`（Ribbon Mesh + TSL 三阶段 shader）、`SpokeController`（GSAP timeline 编排）、`utils/geo.js`（经纬度→单位向量）。

**Tech Stack:** three.js WebGPU, TSL, GSAP, Tweakpane (existing debug)

**Design doc:** `docs/plans/2026-04-20-spokes-flylines-design.md`

**Verification style:** 本项目无单元测试，每个 Task 以"dev server 肉眼验证 + commit"作为交付闸门。

---

## Task 0: 准备 · 启动 dev server（一次性）

**Step 1:** 开终端跑 `npm run dev`，保持常驻。后续每个 Task 完成后刷新浏览器验证。

**Step 2:** 确认当前页面能看到：地球点阵 + 点击某处产生红色单 wave。

---

## Task 1: DotSphere 多 wave slot —— uniform 数组化

**Files:**
- Modify: `src/world/dotSphere.js`

**目标**：不改变视觉行为，先把单 wave 重写为 MAX_WAVES=8 的数组结构，让点击仍触发 1 个 wave（占 slot 0）。

**Step 1: 引入常量 + 新数据结构**

在 `dotSphere.js` 顶部（import 下方）加：

```js
const MAX_WAVES = 8;
```

把构造函数里的 `this._wave = { ... }`（约 34-43 行）替换为：

```js
this._waves = {
  clickPos: uniform(
    Array.from({ length: MAX_WAVES }, () => new THREE.Vector3(0, 0, 1))
  ),
  progress: uniform(new Float32Array(MAX_WAVES)),
  color: uniform(new THREE.Color(this.panelParams.waveColor)),
  maxRadius: uniform(this.panelParams.waveMaxRadius),
  thickness: uniform(this.panelParams.waveThickness),
  softness: uniform(this.panelParams.waveSoftness),
  intensity: uniform(this.panelParams.waveIntensity),
  fadeTail: uniform(this.panelParams.waveFadeTail),
};

this._slotTweens = new Array(MAX_WAVES).fill(null);
this._nextSlot = 0;
```

把 `this._waveTween = null;` 删除（被 `_slotTweens` 取代）。

**Step 2: 改 `_createDotSphereMaterial` shader —— 用 TSL Loop 累加 8 个 slot**

import 里加入 `Loop`、`vec3`：

```js
import { float, length, Loop, positionLocal, smoothstep, uniform, uv, vec2, vec3 } from "three/tsl";
```

把方法中从 `const waveDist = ...` 到 `const waveTerm = ...mul(disk);` 这段（约 138-154 行）替换为：

```js
const ringAccum = float(0).toVar();
Loop(MAX_WAVES, ({ i }) => {
  const prog = this._waves.progress.element(i);
  const clickPos = this._waves.clickPos.element(i);
  const waveDist = clickPos.sub(positionLocal).length();
  const waveRadius = this._waves.maxRadius.mul(prog);
  const waveInner = waveRadius.sub(this._waves.thickness);

  const ringOuter = smoothstep(waveRadius, waveRadius.sub(this._waves.softness), waveDist);
  const ringInner = smoothstep(waveInner.sub(this._waves.softness), waveInner, waveDist);
  const ring = ringOuter.mul(ringInner);

  const lifeFade = float(1).sub(
    smoothstep(float(1).sub(this._waves.fadeTail), float(1), prog),
  );

  const alive = prog.greaterThan(0).select(float(1), float(0));
  ringAccum.addAssign(ring.mul(lifeFade).mul(alive));
});

const waveTerm = this._waves.color
  .mul(ringAccum)
  .mul(this._waves.intensity)
  .mul(disk);
```

后面的 `waveAlbedo = waveTerm.mul(0.35)` 等保持不变。

**Step 3: 重写 `triggerWave` —— 分配 slot + 管理 per-slot tween**

替换 `triggerWave` 方法：

```js
/**
 * @param {THREE.Vector3} worldPoint
 * @param {number|object} [durationOrOpts]   // 兼容旧的 (worldPoint, duration, ease)
 * @param {string} [ease]
 */
triggerWave(worldPoint, durationOrOpts, ease) {
  if (!this.mesh) return;

  let duration, easeVal, onComplete;
  if (typeof durationOrOpts === "object" && durationOrOpts !== null) {
    ({ duration, ease: easeVal, onComplete } = durationOrOpts);
  } else {
    duration = durationOrOpts;
    easeVal = ease;
  }

  this._tmpLocal.copy(worldPoint);
  this.mesh.worldToLocal(this._tmpLocal);

  const slot = this._nextSlot;
  this._nextSlot = (this._nextSlot + 1) % MAX_WAVES;

  this._slotTweens[slot]?.kill();

  this._waves.clickPos.value[slot].copy(this._tmpLocal);
  this._waves.progress.value[slot] = 0;

  this._slotTweens[slot] = gsap.to(this._waves.progress.value, {
    [slot]: 1,
    duration: duration ?? this.panelParams.waveDuration,
    ease: easeVal ?? this.panelParams.waveEase,
    onUpdate: () => { /* Float32Array 直接写，值已变 */ },
    onComplete: () => {
      this._waves.progress.value[slot] = 0;
      this._slotTweens[slot] = null;
      onComplete?.();
    },
  });
}
```

> 注：GSAP 对 Float32Array 按索引 key 可以 tween；若不行，改为 tween 一个代理 `{ v: 0 }` 对象，在 `onUpdate` 里写回 `progress.value[slot]`。本 Task Step 5 验证时若发现无效，按此退路改。

**Step 4: `_dispose` 和 `_applyWave` 适配**

`_dispose` 里把 `this._waveTween?.kill();` 改成：

```js
this._slotTweens.forEach(t => t?.kill());
this._slotTweens.fill(null);
```

`_applyWave` 里 `this._wave.*` 全部改为 `this._waves.*`（color/maxRadius/thickness/softness/intensity/fadeTail 同名）。

Debug 面板的 "Trigger now" 按钮（约 373-381 行）改为：

```js
waveFolder.addButton({ title: "Trigger now" }).on("click", () => {
  this.triggerWave(new THREE.Vector3(0, 0, 1));
});
```

**Step 5: 验证 + commit**

- 刷新浏览器
- 场景正常渲染，点击地球仍能触发红色 wave
- **快速连点 3~4 个不同位置**：应该看到多个 wave 同时存在（关键验证点）
- 点 "Trigger now"：在 (0,0,1) 位置产生 wave
- 控制台无报错

Commit:

```bash
git add src/world/dotSphere.js
git commit -m "refactor(dotSphere): single wave → MAX_WAVES=8 slot array"
```

**回退路径：** 若 GSAP 无法 tween Float32Array 索引 → Step 3 改用代理对象：

```js
const proxy = { v: 0 };
this._slotTweens[slot] = gsap.to(proxy, {
  v: 1, duration, ease: easeVal,
  onUpdate: () => { this._waves.progress.value[slot] = proxy.v; },
  onComplete: () => { ... },
});
```

若 TSL `Loop` / `uniform(array).element(i)` 当前版本不支持 → 退回方案：展开 8 个独立 `uniform(Vec3)` + `uniform(float)`，shader 里手写 8 段累加（体力活但稳）。

---

## Task 2: utils/geo.js

**Files:**
- Create: `src/utils/geo.js`

**Step 1: 写文件**

```js
import * as THREE from 'three/webgpu';

/**
 * 经纬度（度）→ 单位球上的向量（Y 轴向上）。
 * 约定：lng=0, lat=0 对应 +X 方向。
 * @param {number} lng
 * @param {number} lat
 * @param {THREE.Vector3} [out]
 */
export function lngLatToUnitVec3(lng, lat, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng);
  out.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
  return out;
}
```

**Step 2: 验证 + commit**

无运行时影响，暂不需要浏览器验证。

```bash
git add src/utils/geo.js
git commit -m "feat(utils): add lngLatToUnitVec3"
```

---

## Task 3: FlyLines 骨架 —— 单条飞线 + 只做生长动画

**Files:**
- Create: `src/world/flyLines.js`
- Modify: `src/world/world.js`
- Modify: `src/app/Experience.js:67-70`（传 delta 到 world.update）

**Step 1: Experience 把 delta 下传**

修改 `src/app/Experience.js` 的 `update` 方法：

```js
update(timestamp) {
    this.time.update(timestamp)
    const delta = this.time.getDelta()
    this.worldCamera.update()
    this.world.update(delta)
}
```

**Step 2: World 新增 flyLines + update 时传 delta**

修改 `src/world/world.js`：

```js
import InnerPhysicalSphere from './innerPhysicalSphere.js'
import DotSphere from './dotSphere.js'
import ClickWave from './clickWave.js'
import FlyLines from './flyLines.js'

export default class World {
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.dotSphere = new DotSphere(this.scene)
        this.innerPhysicalSphere = new InnerPhysicalSphere(this.scene)
        this.flyLines = new FlyLines(this.scene)

        this.clickWave = new ClickWave({
            canvas: experience.canvas,
            camera: experience.worldCamera.instance,
            scene: this.scene,
            dotSphere: this.dotSphere,
        })
    }

    debuggerInit(debug) {
        this.dotSphere.debuggerInit(debug)
        this.innerPhysicalSphere.debuggerInit(debug)
        this.flyLines.debuggerInit(debug)
    }

    update(delta = 0) {
        this.flyLines.update(delta)
    }

    dispose() {
        this.clickWave.dispose()
        this.innerPhysicalSphere.dispose()
        this.dotSphere.dispose()
        this.flyLines.dispose()
    }
}
```

**Step 3: 创建 `src/world/flyLines.js`（生长版）**

本 Task 先只实现 `(A)cross + (B)grown` 两段 shader；流光和 postArriveFade 留到 Task 4。

```js
import * as THREE from 'three/webgpu';
import { abs, float, smoothstep, uniform, uv } from 'three/tsl';
import gsap from 'gsap';

const CURVE_SEGMENTS = 64;

function buildRibbonGeometry(aUnit, bUnit, arcHeight, width) {
  const positions = new Float32Array(CURVE_SEGMENTS * 2 * 3);
  const uvs = new Float32Array(CURVE_SEGMENTS * 2 * 2);
  const indices = [];

  const a = aUnit.clone().normalize();
  const b = bUnit.clone().normalize();
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega) || 1;

  const curvePoints = [];
  const tangents = [];

  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const t = i / (CURVE_SEGMENTS - 1);
    // slerp
    const w1 = Math.sin((1 - t) * omega) / sinOmega;
    const w2 = Math.sin(t * omega) / sinOmega;
    const base = new THREE.Vector3()
      .addScaledVector(a, w1)
      .addScaledVector(b, w2);
    const lift = 1 + arcHeight * Math.sin(Math.PI * t);
    const p = base.clone().multiplyScalar(lift);
    curvePoints.push(p);
  }

  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const prev = curvePoints[Math.max(i - 1, 0)];
    const next = curvePoints[Math.min(i + 1, CURVE_SEGMENTS - 1)];
    tangents.push(next.clone().sub(prev).normalize());
  }

  const tmpSide = new THREE.Vector3();
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const p = curvePoints[i];
    const normal = p.clone().normalize();
    tmpSide.crossVectors(normal, tangents[i]).normalize().multiplyScalar(width);
    const up = p.clone().add(tmpSide);
    const dn = p.clone().sub(tmpSide);

    const baseIdx = i * 2;
    positions.set([up.x, up.y, up.z], baseIdx * 3);
    positions.set([dn.x, dn.y, dn.z], (baseIdx + 1) * 3);

    const u = i / (CURVE_SEGMENTS - 1);
    uvs.set([u, 1], baseIdx * 2);
    uvs.set([u, -1], (baseIdx + 1) * 2);

    if (i < CURVE_SEGMENTS - 1) {
      const a0 = baseIdx;
      const a1 = baseIdx + 1;
      const b0 = baseIdx + 2;
      const b1 = baseIdx + 3;
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

class FlyLine {
  constructor({ scene, shared, aWorld, bWorld, color }) {
    this.scene = scene;
    this.shared = shared;
    this._arrived = false;
    this._tween = null;

    this.uniforms = {
      progress: uniform(0),
      flowTime: uniform(0),
      color: uniform(new THREE.Color(color ?? shared.params.color)),
    };

    this.geometry = buildRibbonGeometry(
      aWorld, bWorld,
      shared.params.arcHeight,
      shared.params.width,
    );

    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;

    const u = uv().x;
    const v = uv().y;

    const cross = float(1).sub(smoothstep(0.7, 1.0, abs(v)));
    const grown = float(1).sub(
      smoothstep(
        this.uniforms.progress.sub(shared.uniforms.headSoftness),
        this.uniforms.progress,
        u,
      ),
    );
    const a = grown.mul(cross);

    material.colorNode = this.uniforms.color.mul(a);
    material.opacityNode = a;

    this.material = material;
    this.mesh = new THREE.Mesh(this.geometry, material);
    scene.add(this.mesh);
  }

  play({ growth, ease, onArrive } = {}) {
    this._tween?.kill();
    this.uniforms.progress.value = 0;
    this._tween = gsap.to(this.uniforms.progress, {
      value: 1,
      duration: growth ?? this.shared.params.growth,
      ease: ease ?? this.shared.params.growthEase,
      onComplete: () => {
        this._arrived = true;
        onArrive?.();
      },
    });
  }

  update(dt) {
    if (this._arrived) this.uniforms.flowTime.value += dt;
  }

  dispose() {
    this._tween?.kill();
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export default class FlyLines {
  constructor(scene) {
    this.scene = scene;
    this.lines = [];

    this.params = {
      color: '#6bc7ff',
      arcHeight: 0.18,
      width: 0.004,
      growth: 0.6,
      growthEase: 'power2.out',
      headSoftness: 0.05,
    };

    this.uniforms = {
      headSoftness: uniform(this.params.headSoftness),
    };

    this.shared = { params: this.params, uniforms: this.uniforms };
  }

  add(aWorld, bWorld, opts = {}) {
    const line = new FlyLine({
      scene: this.scene,
      shared: this.shared,
      aWorld, bWorld,
      color: opts.color,
    });
    this.lines.push(line);
    return line;
  }

  clear() {
    for (const l of this.lines) l.dispose();
    this.lines.length = 0;
  }

  update(dt) {
    for (const l of this.lines) l.update(dt);
  }

  dispose() { this.clear(); }

  debuggerInit(debug) {
    if (!debug.active) return;
    const f = debug.addFolder({ title: 'Fly lines' });
    if (!f) return;

    f.addBinding(this.params, 'color', { view: 'color' });
    f.addBinding(this.params, 'arcHeight', { min: 0, max: 0.5, step: 0.01 });
    f.addBinding(this.params, 'width', { min: 0.001, max: 0.02, step: 0.001 });
    f.addBinding(this.params, 'growth', { min: 0.1, max: 3, step: 0.05 });
    f.addBinding(this.params, 'headSoftness', { min: 0, max: 0.3, step: 0.005 })
      .on('change', () => { this.uniforms.headSoftness.value = this.params.headSoftness; });
    f.addButton({ title: 'Test line (Beijing → NY)' }).on('click', () => {
      this.clear();
      const A = new THREE.Vector3(0.53, 0.64, -0.56).normalize();  // 大致北京
      const B = new THREE.Vector3(-0.21, 0.65, 0.73).normalize();  // 大致纽约
      const line = this.add(A, B);
      line.play({});
    });
  }
}
```

**Step 4: 验证 + commit**

- 刷新浏览器
- 打开 Tweakpane，找到 "Fly lines" folder，点 "Test line (Beijing → NY)" 按钮
- 期望：一条青色弧线从一点出发生长到另一点；到达后保持全亮（因为还没做 postArriveFade）
- 调 `arcHeight`、`width`、`growth` 检查参数生效（注意：调这些会影响**下次** add 的 line，已存在的不会变 —— 这是预期行为，见 5.1 Section 3.5 共享 vs per-line 约定）
- 控制台无报错

Commit:

```bash
git add src/utils/geo.js src/world/flyLines.js src/world/world.js src/app/Experience.js
git commit -m "feat(flyLines): growing arc ribbon with TSL shader"
```

---

## Task 4: FlyLines 流光段 + postArriveFade

**Files:**
- Modify: `src/world/flyLines.js`

**Step 1: 在 `FlyLines` 共享 params + uniforms 里加入流光参数**

`this.params` 追加：

```js
flowSpeed: 0.6,
flowLength: 0.15,
postArriveFade: 0.3,   // 到达后底色衰减到的终值（0~1）
postArriveFadeDuration: 0.4,
intensity: 2.0,
```

`this.uniforms` 追加：

```js
flowSpeed: uniform(this.params.flowSpeed),
flowLength: uniform(this.params.flowLength),
intensity: uniform(this.params.intensity),
```

`debuggerInit` 里追加对应 bindings（每个 on change 时更新对应 uniform；`postArriveFade` 和 `postArriveFadeDuration` 无 uniform，直接修改 params 即可）。

**Step 2: `FlyLine` 新增 `postFade` uniform + 改 shader**

构造函数 `this.uniforms` 追加：

```js
postFade: uniform(1),    // 生长时保持 1，到达后 gsap 降到 shared.params.postArriveFade
```

import 追加 `fract`：

```js
import { abs, float, fract, smoothstep, uniform, uv } from 'three/tsl';
```

shader 合成部分替换为：

```js
const u = uv().x;
const v = uv().y;

const cross = float(1).sub(smoothstep(0.7, 1.0, abs(v)));

const grown = float(1).sub(
  smoothstep(
    this.uniforms.progress.sub(shared.uniforms.headSoftness),
    this.uniforms.progress,
    u,
  ),
);

const flowHead = fract(this.uniforms.flowTime.mul(shared.uniforms.flowSpeed));
const dFlow = fract(u.sub(flowHead));
const flowMask = smoothstep(shared.uniforms.flowLength, float(0), dFlow);
const flowOn = smoothstep(0.98, 1.0, this.uniforms.progress);

const base = grown.mul(this.uniforms.postFade);
const a = base.add(flowOn.mul(flowMask)).mul(cross);

material.colorNode = this.uniforms.color.mul(a).mul(shared.uniforms.intensity);
material.opacityNode = a;
```

**Step 3: `play()` 里加 postFade 的 gsap**

在 `onComplete` 里（标记 arrived 之前/之后都行）加一段：

```js
onComplete: () => {
  this._arrived = true;
  gsap.to(this.uniforms.postFade, {
    value: this.shared.params.postArriveFade,
    duration: this.shared.params.postArriveFadeDuration,
    ease: 'power1.out',
  });
  onArrive?.();
},
```

**Step 4: 验证 + commit**

- 刷新浏览器，点 "Test line" 按钮
- 期望：弧线生长到达 → 底色淡下来 → 一个小段"流星"沿弧线循环
- 调 `flowSpeed` / `flowLength` / `intensity` / `postArriveFade`，参数应实时生效（对已存在的 line 也生效，因为是 shared uniforms）
- 控制台无报错

Commit:

```bash
git add src/world/flyLines.js
git commit -m "feat(flyLines): add flow-light + post-arrive fade"
```

---

## Task 5: SpokeController + 示例数据

**Files:**
- Create: `src/world/spokeController.js`
- Modify: `src/world/world.js`

**Step 1: 创建 `src/world/spokeController.js`**

```js
import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import { lngLatToUnitVec3 } from '../utils/geo.js';

export default class SpokeController {
  /**
   * @param {{
   *   dotSphere: import('./dotSphere.js').default,
   *   flyLines: import('./flyLines.js').default,
   *   data: { hub:{lng:number,lat:number}, targets:Array<{id?:string,lng:number,lat:number}> }
   * }} deps
   */
  constructor({ dotSphere, flyLines, data }) {
    this.dotSphere = dotSphere;
    this.flyLines = flyLines;
    this.data = data;

    this.params = {
      hubDelay: 0.0,
      stagger: 0.25,
      loop: false,
      loopGap: 2.0,
    };

    this._timeline = null;
    this._hubVec = new THREE.Vector3();
    this._tVec = new THREE.Vector3();
  }

  play() {
    this._timeline?.kill();
    this.flyLines.clear();

    const { hub, targets } = this.data;
    lngLatToUnitVec3(hub.lng, hub.lat, this._hubVec);

    this.dotSphere.triggerWave(this._hubVec.clone());

    const tl = gsap.timeline();
    const growth = this.flyLines.params.growth;

    targets.forEach((t, i) => {
      const tVec = lngLatToUnitVec3(t.lng, t.lat, new THREE.Vector3());
      const startAt = this.params.hubDelay + i * this.params.stagger;

      tl.call(() => {
        const line = this.flyLines.add(this._hubVec.clone(), tVec);
        line.play({
          onArrive: () => this.dotSphere.triggerWave(tVec.clone()),
        });
      }, null, startAt);
    });

    if (this.params.loop) {
      const total =
        this.params.hubDelay +
        (targets.length - 1) * this.params.stagger +
        growth +
        this.params.loopGap;
      tl.call(() => this.play(), null, total);
    }

    this._timeline = tl;
  }

  stop() {
    this._timeline?.kill();
    this._timeline = null;
  }

  dispose() {
    this.stop();
  }

  debuggerInit(debug) {
    if (!debug.active) return;
    const f = debug.addFolder({ title: 'Spokes' });
    if (!f) return;
    f.addBinding(this.params, 'hubDelay', { min: 0, max: 2, step: 0.05 });
    f.addBinding(this.params, 'stagger', { min: 0, max: 1, step: 0.05 });
    f.addBinding(this.params, 'loop');
    f.addBinding(this.params, 'loopGap', { min: 0, max: 5, step: 0.1 });
    f.addButton({ title: 'Play' }).on('click', () => this.play());
    f.addButton({ title: 'Stop' }).on('click', () => { this.stop(); this.flyLines.clear(); });
  }
}
```

**Step 2: World 接入 + 硬编示例数据**

修改 `src/world/world.js`：

```js
import InnerPhysicalSphere from './innerPhysicalSphere.js'
import DotSphere from './dotSphere.js'
import ClickWave from './clickWave.js'
import FlyLines from './flyLines.js'
import SpokeController from './spokeController.js'

const SAMPLE_DATA = {
    hub: { lng: 116.4, lat: 39.9 },
    targets: [
        { id: 'ny',  lng: -74.0,  lat: 40.7 },
        { id: 'lon', lng:  -0.1,  lat: 51.5 },
        { id: 'tok', lng: 139.7,  lat: 35.7 },
        { id: 'sfo', lng: -122.4, lat: 37.8 },
        { id: 'syd', lng: 151.2,  lat: -33.9 },
    ],
}

export default class World {
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.dotSphere = new DotSphere(this.scene)
        this.innerPhysicalSphere = new InnerPhysicalSphere(this.scene)
        this.flyLines = new FlyLines(this.scene)

        this.clickWave = new ClickWave({
            canvas: experience.canvas,
            camera: experience.worldCamera.instance,
            scene: this.scene,
            dotSphere: this.dotSphere,
        })

        this.spokes = new SpokeController({
            dotSphere: this.dotSphere,
            flyLines: this.flyLines,
            data: SAMPLE_DATA,
        })
    }

    debuggerInit(debug) {
        this.dotSphere.debuggerInit(debug)
        this.innerPhysicalSphere.debuggerInit(debug)
        this.flyLines.debuggerInit(debug)
        this.spokes.debuggerInit(debug)
    }

    update(delta = 0) {
        this.flyLines.update(delta)
    }

    dispose() {
        this.clickWave.dispose()
        this.innerPhysicalSphere.dispose()
        this.dotSphere.dispose()
        this.flyLines.dispose()
        this.spokes.dispose()
    }
}
```

**Step 3: 验证 + commit**

- 刷新浏览器
- 打开 Tweakpane，找到 "Spokes" folder，点 "Play"
- 期望顺序：
  1. 北京位置先起一个 wave
  2. 每隔 `stagger` 秒依次生长一条飞线到 ny / lon / tok / sfo / syd
  3. 每条到达时目标位置起 wave
  4. 到达后飞线进入流光循环
- 打开 `loop`，再点 Play：一轮结束后自动重新开始
- 点 "Stop"：时间轴中断，现有飞线清空
- 控制台无报错

**注意**：若 DotSphere 还在加载 land mask 时调用 `triggerWave`，会因为 `this.mesh` 未创建而 early return —— 这在 Play 按钮驱动下不会发生（用户手动点时通常已加载完）。无需额外处理。

Commit:

```bash
git add src/world/spokeController.js src/world/world.js
git commit -m "feat(world): SpokeController with hub-wave → spokes → target-wave timeline"
```

---

## Task 6: 整体联调 + 调参 commit

**Files:** （仅可能微调 `flyLines.js` / `spokeController.js` / `dotSphere.js` 中的默认 panelParams 数值）

**Step 1: 端到端 smoke test**

- 刷新，点 "Play" 看一轮完整效果
- 同时做：点击地球任意位置（`ClickWave` 路径）—— 多个 wave 和飞线目标 wave 应共存不冲突（关键验证 MAX_WAVES=8 的容量够用）
- 镜头旋转一圈，观察飞线弧线在球体背面时是否穿模（预期轻微、可接受）

**Step 2: 若需微调默认值（例如弧高、宽度、流光速度），改动对应 panelParams 默认，commit**

```bash
git add -A
git commit -m "chore: tune default params for spokes & fly lines"
```

（若无需调整，跳过本步。）

---

## 完成标准

- [ ] Task 1-5 全部 commit
- [ ] 浏览器一次 "Play" 能看到完整的：hub wave → 5 条生长飞线 → 5 个 target wave → 稳定流光
- [ ] 点击地球仍工作，和 spoke 共存无冲突
- [ ] 调试面板可实时调参
- [ ] 控制台无错误

## 参考

- 设计文档：`docs/plans/2026-04-20-spokes-flylines-design.md`
- `@skills/webgpu-threejs-tsl`（TSL 语法、`Loop`、`uniform(array).element()`）
