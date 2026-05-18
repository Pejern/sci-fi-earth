# Click Wave Effect Implementation Plan

**Goal:** Add a click-triggered red ring shockwave on the dot sphere surface, with a Tweakpane parameter panel and GSAP-driven progress animation.

**Design doc:** `docs/plans/2026-04-20-click-wave-design.md`

**Architecture:**
- `DotSphere` owns the wave uniforms and node-graph term; exposes `triggerWave(worldPoint, duration, ease)`.
- New `ClickWave` module owns pointer events + raycaster against an invisible unit-sphere proxy, and drives the `progress` uniform with a GSAP tween.
- `World` wires them together and disposes them.

**Tech stack:** three.js WebGPU + TSL, Tweakpane, GSAP (new).

**Verification:** Human-in-the-loop — after each task you run `npm run dev` and eyeball the result. No automated tests.

---

## Task 1: Add GSAP dependency

**Files:**
- Modify: `package.json`

**Step 1: Install gsap**

```
npm install gsap
```

**Step 2: Verify `package.json` now contains `"gsap": "^3.x.x"` under `dependencies`.**

**Step 3: Commit**

```
git add package.json package-lock.json
git commit -m "chore: add gsap dependency for click wave tween"
```

---

## Task 2: Add wave uniforms and TSL node graph to DotSphere

No `triggerWave` yet, no GUI yet. Just make the wave renderable; it will sit at `progress=0` and be invisible. This keeps the diff small and easy to eyeball.

**Files:**
- Modify: `src/world/dotSphere.js`

**Step 1: Import additional TSL helpers**

Ensure this import line covers all needed nodes:

```js
import { float, length, positionLocal, smoothstep, uniform, uv, vec2, vec3 } from "three/tsl";
```

(Add `positionLocal` and `vec3` to the existing list.)

**Step 2: Add wave uniforms in the constructor**

Inside `constructor()`, after `this._roughnessUniform = ...`, add:

```js
this._wave = {
  clickPos:  uniform(new THREE.Vector3(0, 0, 1)),
  progress:  uniform(0),
  color:     uniform(new THREE.Color("#ff2030")),
  maxRadius: uniform(0.6),
  thickness: uniform(0.05),
  softness:  uniform(0.02),
  intensity: uniform(2.5),
  fadeTail:  uniform(0.2),
};
```

Also extend `panelParams` with the GUI-facing values (used in Task 5):

```js
this.panelParams = {
  // ...existing fields...
  waveColor:     "#ff2030",
  waveMaxRadius: 0.6,
  waveThickness: 0.05,
  waveSoftness:  0.02,
  waveIntensity: 2.5,
  waveFadeTail:  0.2,
  waveDuration:  1.2,
  waveEase:      "power2.out",
};
```

**Step 3: Extend the material node graph inside `createDotSphere()`**

Find the block starting at `const material = new THREE.MeshPhysicalNodeMaterial();`. Replace the `material.colorNode = ...` and `material.emissiveNode = ...` lines so the wave term is added. The full replacement for that block:

```js
const baseTerm = this._dotColorUniform.mul(disk);

const dist = this._wave.clickPos.sub(positionLocal).length();
const radius = this._wave.maxRadius.mul(this._wave.progress);
const inner = radius.sub(this._wave.thickness);

const ringOuter = smoothstep(radius, radius.sub(this._wave.softness), dist);
const ringInner = smoothstep(inner.sub(this._wave.softness), inner, dist);
const ring = ringOuter.mul(ringInner);

const lifeFade = float(1).sub(
  smoothstep(float(1).sub(this._wave.fadeTail), float(1), this._wave.progress)
);

const waveTerm = this._wave.color
  .mul(ring)
  .mul(this._wave.intensity)
  .mul(lifeFade)
  .mul(disk);

material.colorNode    = baseTerm.add(waveTerm);
material.emissiveNode = baseTerm.add(waveTerm);
material.opacityNode  = disk;
material.roughnessNode = this._roughnessUniform;
material.metalnessNode = this._metalnessUniform;
```

(Remove the now-replaced `material.colorNode` / `material.emissiveNode` lines from the original block.)

**Step 4: Human verify**

Run `npm run dev`. The scene should look exactly like before (wave invisible because `progress=0`). No console errors. No visual regressions on the blue dot sphere.

**Step 5: Commit**

```
git add src/world/dotSphere.js
git commit -m "feat(dotSphere): add wave uniforms and TSL ring term (dormant)"
```

---

## Task 3: Add `triggerWave` method to DotSphere

Still no pointer input yet. We will drive it by hand from the devtools console to verify the shader math.

**Files:**
- Modify: `src/world/dotSphere.js`

**Step 1: Add import**

```js
import gsap from "gsap";
```

**Step 2: Add scratch vector and tween field in the constructor**

After `this._wave = { ... };`:

```js
this._waveTween = null;
this._tmpLocal = new THREE.Vector3();
```

**Step 3: Add the method, placed right before `_applyDotColor()`:**

```js
/**
 * @param {THREE.Vector3} worldPoint
 * @param {number} [duration]
 * @param {string}  [ease]
 */
triggerWave(worldPoint, duration, ease) {
  if (!this.mesh) return;
  this._tmpLocal.copy(worldPoint);
  this.mesh.worldToLocal(this._tmpLocal);
  this._wave.clickPos.value.copy(this._tmpLocal);
  this._wave.progress.value = 0;
  this._waveTween?.kill();
  this._waveTween = gsap.to(this._wave.progress, {
    value: 1,
    duration: duration ?? this.panelParams.waveDuration,
    ease: ease ?? this.panelParams.waveEase,
  });
}
```

**Step 4: Kill tween in `_dispose()`**

Find `_dispose()`. At its top (before the `if (!this.mesh) return;` check, or right after it), add:

```js
this._waveTween?.kill();
this._waveTween = null;
```

**Step 5: Human verify via devtools**

Run `npm run dev`. In the browser devtools console, expose something or use a temporary global. Quickest path: temporarily, in `src/world/world.js`, set `window.__dotSphere = this.dotSphere` in the constructor (remove after this step). Then in devtools:

```js
__dotSphere.triggerWave(new THREE.Vector3(0, 0, 1), 1.5, "power2.out")
```

(You'll need `THREE` too — alternatively hardcode: `__dotSphere.triggerWave({x:0,y:0,z:1}, 1.5, "power2.out")` will NOT work because `worldToLocal` needs a real Vector3. Easiest: `await import('three/webgpu').then(m => __dotSphere.triggerWave(new m.Vector3(0,0,1),1.5,'power2.out'))`.)

Expected: a red ring expands from the (0,0,1) point on the sphere over ~1.5s, then fades.

Remove the `window.__dotSphere` debug line before committing.

**Step 6: Commit**

```
git add src/world/dotSphere.js
git commit -m "feat(dotSphere): add triggerWave method (gsap-driven)"
```

---

## Task 4: Create ClickWave module (pointer -> raycast -> triggerWave)

**Files:**
- Create: `src/world/clickWave.js`
- Modify: `src/world/world.js`

**Step 1: Create `src/world/clickWave.js`**

```js
import * as THREE from "three/webgpu";

/**
 * Handles pointerdown events on the canvas, raycasts against an invisible
 * unit-sphere proxy, and forwards the hit point to DotSphere.triggerWave().
 */
export default class ClickWave {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   camera: THREE.Camera,
   *   scene: THREE.Scene,
   *   dotSphere: import('./dotSphere.js').default,
   * }} deps
   */
  constructor({ canvas, camera, scene, dotSphere }) {
    this.canvas = canvas;
    this.camera = camera;
    this.scene = scene;
    this.dotSphere = dotSphere;

    this._hitGeometry = new THREE.SphereGeometry(1, 32, 32);
    this._hitMaterial = new THREE.MeshBasicMaterial();
    this._hitMesh = new THREE.Mesh(this._hitGeometry, this._hitMaterial);
    this._hitMesh.visible = false;
    this._hitMesh.raycast = THREE.Mesh.prototype.raycast;
    scene.add(this._hitMesh);

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this._onPointerDown = this._onPointerDown.bind(this);
    canvas.addEventListener("pointerdown", this._onPointerDown);
  }

  /** @param {PointerEvent} e */
  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._raycaster.intersectObject(this._hitMesh, false)[0];
    if (!hit) return;
    this.dotSphere.triggerWave(hit.point);
  }

  /** Manual replay from the last click position (used by GUI button). */
  replay() {
    this.dotSphere._waveTween?.kill();
    this.dotSphere._wave.progress.value = 0;
    this.dotSphere._waveTween = null;
    this.dotSphere.triggerWave(
      this._hitMesh.localToWorld(
        this.dotSphere._wave.clickPos.value.clone()
      )
    );
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.scene.remove(this._hitMesh);
    this._hitGeometry.dispose();
    this._hitMaterial.dispose();
    this._hitMesh = null;
  }
}
```

**Step 2: Wire it up in `src/world/world.js`**

Update the file to:

```js
import InnerPhysicalSphere from './innerPhysicalSphere.js'
import DotSphere from './dotSphere.js'
import ClickWave from './clickWave.js'

export default class World {
    /**
     * @param {import('../app/Experience.js').default} experience
     */
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.dotSphere = new DotSphere(this.scene)
        this.innerPhysicalSphere = new InnerPhysicalSphere(this.scene)

        this.clickWave = new ClickWave({
            canvas: experience.canvas,
            camera: experience.worldCamera.instance,
            scene: this.scene,
            dotSphere: this.dotSphere,
        })
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        this.dotSphere.debuggerInit(debug)
        this.innerPhysicalSphere.debuggerInit(debug)
    }

    update() {}

    dispose() {
        this.clickWave.dispose()
        this.innerPhysicalSphere.dispose()
        this.dotSphere.dispose()
    }
}
```

**Step 3: Human verify**

Run `npm run dev`. Click anywhere on the blue dot sphere → red ring expands from the click point and fades. Click outside sphere → nothing happens, no console errors. Rotate with OrbitControls, click again → wave still at the correct surface point. Double-click rapidly → second click restarts wave cleanly.

**Step 4: Commit**

```
git add src/world/clickWave.js src/world/world.js
git commit -m "feat: add ClickWave module wiring pointer events to dotSphere wave"
```

---

## Task 5: Add GUI "Click wave" folder in DotSphere.debuggerInit

**Files:**
- Modify: `src/world/dotSphere.js`

**Step 1: Add an `_applyWave` helper near `_applyMetalRough()`**

```js
_applyWave() {
  this._wave.color.value.set(this.panelParams.waveColor);
  this._wave.maxRadius.value = this.panelParams.waveMaxRadius;
  this._wave.thickness.value = this.panelParams.waveThickness;
  this._wave.softness.value  = this.panelParams.waveSoftness;
  this._wave.intensity.value = this.panelParams.waveIntensity;
  this._wave.fadeTail.value  = this.panelParams.waveFadeTail;
}
```

**Step 2: Append a new folder at the end of `debuggerInit`**

Right before the closing `}` of `debuggerInit`, add:

```js
const waveFolder = debug.addFolder({ title: "Click wave" });
if (!waveFolder) return;

waveFolder
  .addBinding(this.panelParams, "waveColor", { label: "color", view: "color" })
  .on("change", () => this._applyWave());

waveFolder
  .addBinding(this.panelParams, "waveMaxRadius", { label: "maxRadius", min: 0.05, max: 1.5, step: 0.01 })
  .on("change", () => this._applyWave());

waveFolder
  .addBinding(this.panelParams, "waveThickness", { label: "thickness", min: 0.005, max: 0.5, step: 0.005 })
  .on("change", () => this._applyWave());

waveFolder
  .addBinding(this.panelParams, "waveSoftness", { label: "softness", min: 0, max: 0.1, step: 0.001 })
  .on("change", () => this._applyWave());

waveFolder
  .addBinding(this.panelParams, "waveIntensity", { label: "intensity", min: 0, max: 8, step: 0.1 })
  .on("change", () => this._applyWave());

waveFolder
  .addBinding(this.panelParams, "waveFadeTail", { label: "fadeTail", min: 0, max: 0.8, step: 0.01 })
  .on("change", () => this._applyWave());

waveFolder.addBinding(this.panelParams, "waveDuration", {
  label: "duration", min: 0.1, max: 4, step: 0.05,
});

waveFolder.addBinding(this.panelParams, "waveEase", {
  label: "ease",
  options: {
    "power1.out": "power1.out",
    "power2.out": "power2.out",
    "power3.out": "power3.out",
    "expo.out":   "expo.out",
    "sine.out":   "sine.out",
    "none":       "none",
  },
});

waveFolder.addButton({ title: "Trigger now" }).on("click", () => {
  this._wave.progress.value = 0;
  this._waveTween?.kill();
  this._waveTween = gsap.to(this._wave.progress, {
    value: 1,
    duration: this.panelParams.waveDuration,
    ease: this.panelParams.waveEase,
  });
});
```

Note the Trigger-now button replays using the **current** `clickPos` uniform (last click location, or the constructor default `(0,0,1)`). It does NOT need `ClickWave.replay()`, so we can drop that helper if unused — but leave it for now, YAGNI says remove it only if truly unused. Since nothing else calls it, remove it in Step 3.

**Step 3: Remove the now-unused `replay()` method from `src/world/clickWave.js`**

Delete the `replay()` method block. It was a speculative addition.

**Step 4: Human verify**

Run `npm run dev`. Open the debug panel (assuming `Debug` is active in your setup), expand "Click wave":
- Changing `color` recolors the next ring.
- `maxRadius = 0.1` -> tiny flash near click point.
- `thickness = 0.5` with `maxRadius = 0.6` -> nearly solid disk.
- `intensity = 0` -> invisible.
- `fadeTail = 0` -> hard cutoff at end.
- `duration` + `ease` affect the Trigger-now button's tween.
- Clicking Trigger-now with no prior click plays at (0,0,1).

**Step 5: Commit**

```
git add src/world/dotSphere.js src/world/clickWave.js
git commit -m "feat(dotSphere): add Click wave GUI folder with 8 params + trigger button"
```

---

## Task 6: Final sweep

**Step 1: Re-read `src/world/dotSphere.js`, `src/world/clickWave.js`, `src/world/world.js`**

Check for:
- Unused imports (`vec3` if it ended up not used — drop it).
- Leftover `window.__dotSphere` debug line from Task 3.
- Trailing console.logs.

**Step 2: Final human verify**

Full cycle: `npm run dev` → click, rotate, click again, open GUI, try each parameter, hit Trigger-now, adjust color to something non-red and verify it takes effect on next click.

**Step 3: Commit any cleanup (only if needed)**

```
git add -A
git commit -m "chore: cleanup after click wave feature"
```

---

## Done checklist

- [ ] GSAP added to package.json
- [ ] Wave uniforms + TSL ring term in DotSphere
- [ ] `DotSphere.triggerWave()` method
- [ ] `ClickWave` module with pointerdown + invisible hit proxy
- [ ] GUI "Click wave" folder with 8 params + Trigger button
- [ ] Clean dispose (listener, tween, proxy mesh)
- [ ] Manual verification passes for all cases in `docs/plans/2026-04-20-click-wave-design.md` section 7
