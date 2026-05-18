# Click Wave Effect — Design

Date: 2026-04-20
Status: Approved (brainstorming)

## 1. Goal

When the user clicks the dot sphere, a red ring-shaped shockwave expands across
the sphere surface from the click point, then fades out. The effect must be
controllable through a Tweakpane GUI with a reasonable but not bloated set of
parameters.

## 2. Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Concurrency | **Single wave** — new click cancels and restarts the previous wave |
| 2 | Color blending | **Additive** — base dot color stays visible; wave is added to both `colorNode` and `emissiveNode` for a glowing ring |
| 3 | Wave shape | **Ring** — hollow center, controllable thickness; matches reference image |
| 4 | Click capture | Invisible unit-sphere proxy mesh + raycaster |
| 5 | Distance metric | 3D Euclidean (chord) — matches reference, accurate enough for `maxRadius <= 1` on a unit sphere |
| 6 | Animation | GSAP tween of a single `progress` uniform from 0 to 1 |

## 3. Architecture

| File | Change |
|------|--------|
| `package.json` | Add dependency `gsap` |
| `src/world/dotSphere.js` | Add wave uniforms, wave term in node graph, `triggerWave()` method, GUI folder |
| `src/world/clickWave.js` *(new)* | Raycaster + invisible hit mesh + GSAP tween. Calls `dotSphere.triggerWave()` |
| `src/world/world.js` | Instantiate `ClickWave`, wire `dotSphere` + `camera` + `canvas`; dispose properly |

**Responsibility boundaries**

- `DotSphere` exposes "I have a wave; give me a point and parameters and I'll play it." It knows nothing about pointer events, camera, or raycasting.
- `ClickWave` translates pointer input into a 3D point on the sphere and drives the tween. It knows nothing about material internals.

## 4. TSL node graph (wave term)

Uniforms added to `DotSphere`:

```
clickPos   : vec3   (local space, on unit sphere)
progress   : float  (0 -> 1, GSAP-driven)
color      : color  (#ff2030)
maxRadius  : float  (0.6)
thickness  : float  (0.05)
softness   : float  (0.02)
intensity  : float  (2.5)
fadeTail   : float  (0.2)
```

Computation per fragment:

```
dist       = clickPos.sub(positionLocal).length()
radius     = maxRadius * progress              // current outer edge
inner      = radius - thickness                // current inner edge
ringOuter  = smoothstep(radius, radius - softness, dist)   // outer fall-off (1 -> 0)
ringInner  = smoothstep(inner - softness, inner, dist)     // inner fall-off (0 -> 1)
ring       = ringOuter * ringInner

lifeFade   = 1 - smoothstep(1 - fadeTail, 1, progress)     // tail fade-out
waveTerm   = color * ring * intensity * lifeFade

material.colorNode    = baseDotColor * disk + waveTerm * disk
material.emissiveNode = baseDotColor * disk + waveTerm * disk
material.opacityNode  = disk
```

`waveTerm * disk` keeps the wave inside each dot's circular footprint (no leakage onto the plane corners).

## 5. Interaction layer

- A `THREE.Mesh(SphereGeometry(1, 32, 32), MeshBasicMaterial({ visible: false }))` is added to the scene as a hit proxy. `visible = false` removes it from rendering; `raycast` is preserved explicitly.
- On `pointerdown`: convert event to NDC, `Raycaster.setFromCamera`, intersect proxy; on hit, call `dotSphere.triggerWave(point, duration, ease)`.
- `triggerWave`:
  - Convert world point to dot-sphere local space via `mesh.worldToLocal()`.
  - `wave.clickPos.value.copy(local)`
  - `wave.progress.value = 0`
  - `tween?.kill(); tween = gsap.to(wave.progress, { value: 1, duration, ease })`
- Misses (raycast returns nothing) are ignored silently.

## 6. GUI parameters (Tweakpane "Click wave" folder)

| Parameter | Range / type | Default |
|-----------|--------------|---------|
| `color` | color picker | `#ff2030` |
| `maxRadius` | 0.05 - 1.5, step 0.01 | 0.6 |
| `thickness` | 0.005 - 0.5, step 0.005 | 0.05 |
| `softness` | 0 - 0.1, step 0.001 | 0.02 |
| `intensity` | 0 - 8, step 0.1 | 2.5 |
| `fadeTail` | 0 - 0.8, step 0.01 | 0.2 |
| `duration` | 0.1 - 4 s, step 0.05 | 1.2 |
| `ease` | list: `power1.out` / `power2.out` / `power3.out` / `expo.out` / `sine.out` / `none` | `power2.out` |
| **Trigger now** | button | replay from current `clickPos` |

All numeric/color params write directly to uniforms (no rebuild needed).

## 7. Verification

- Click sphere -> red ring expands from hit point and fades out.
- After OrbitControls rotation, click still hits the correct surface point (validates `worldToLocal`).
- Rapid double-click restarts wave; no residue from previous tween.
- `thickness` near `maxRadius` -> solid disk; `intensity = 0` -> invisible; `maxRadius = 0.1` -> tiny localized flash; `fadeTail = 0` -> hard cut at end.
- Click outside sphere -> no error, no effect.
- Dispose: `canvas.removeEventListener`, `tween.kill()`, proxy mesh + geometry disposed.

## 8. Out of scope (YAGNI)

- Multiple concurrent waves (Q1 -> A).
- Per-instance hit detection (proxy sphere is visually identical for points on the unit sphere).
- Geodesic distance (chord is fine for `maxRadius <= 1`).
- Touch / hover triggers (only `pointerdown` for now; can be extended later in `ClickWave`).
