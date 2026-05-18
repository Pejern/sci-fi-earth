# Stardust Particles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建独立 `StardustParticles` 类，在 innerPhysicalSphere 表面附近生成缓慢漂浮的星尘 Points。使用 viewDir 平面剔除相机侧粒子，实现“没有粒子遮挡球体和相机之间”的效果。运动为轻微无规律的径向+切向 noise 扰动（像布朗运动），视觉风格为柔和星尘。

**Architecture:** 
- 新建 `src/world/stardustParticles.js`，使用 `THREE.Points` + TSL NodeMaterial + `positionNode`。
- JS 中随机均匀采样球面位置（薄壳），TSL 内计算 view-plane culling mask + multi-octave noise for Brownian motion。
- 严格单一职责：无 wave、无 gsap、无 Fibonacci、无 border texture。
- `World.js` 只做最小集成（import、实例化、debuggerInit、update、dispose）。
- 符合「简单、实用、最小变更、YAGNI」原则。

**Tech Stack:** 
- Three.js WebGPU + TSL (`MeshBasicNodeMaterial`, `positionNode`, `positionViewDirection`, `instanceIndex`, `mx_noise_float`, `dot`, `smoothstep`, `normalize`)
- 与现有 energyShield / borderDots 一致的 uniform + debug 面板风格
- 参考文件：`src/world/energyShield.js` (TSL + uniform + debug), `src/world/innerPhysicalSphere.js`, `docs/plans/2026-04-23-surface-brownian-particles-design.md`

---

### Task 1: Create StardustParticles skeleton + basic Points

**Files:**
- Create: `src/world/stardustParticles.js`
- Modify: `src/world/world.js`

**Steps:**
1. Create new file with class skeleton, constructor that creates basic `Points` with random positions on thin shell (radius 1.02-1.08).
2. Use simple `PointsMaterial` first (color, size, transparent, depthWrite=false).
3. Add to scene with appropriate renderOrder.
4. Implement minimal `update(delta)` and `dispose()`.
5. Update `world.js`: import, instantiate in constructor, add to `debuggerInit`, `update`, and `dispose`.
6. Run `npm run dev` and verify no errors, points appear around sphere.

**Commit:**
```bash
git add src/world/stardustParticles.js src/world/world.js
git commit -m "feat: create StardustParticles skeleton with basic Points"
```

### Task 2: Implement viewDir plane culling in TSL

**Files:**
- `src/world/stardustParticles.js`

**Steps:**
1. Switch to TSL `MeshBasicNodeMaterial` (or Points equivalent via nodes).
2. Add time uniform.
3. In material: compute `planeNormal ≈ positionViewDirection.normalize()`, `side = dot(normalize(positionLocal), planeNormal)`, then `cullMask = smoothstep(-0.08, 0.0, -side)`.
4. Multiply opacityNode / colorNode by cullMask.
5. Add basic size attenuation if needed.
6. Test from multiple camera angles: no particles should appear between camera and inner sphere. Only back/side visible.

**Commit:**
```bash
git commit -m "feat: implement viewDir plane culling to prevent occlusion of sphere"
```

### Task 3: Add slow Brownian-like motion with radial + tangential noise

**Files:**
- `src/world/stardustParticles.js`

**Steps:**
1. Add motion uniforms (speed, amplitude, radialRatio).
2. In TSL: use `instanceIndex` + multiple `mx_noise_float` calls with different scales, time offsets, and hash primes to generate tangential + radial offset.
3. Combine: `offset = tangentialNoise + radialNoise * normal`; `newPos = positionLocal.add(offset.mul(amplitude))`.
4. Final: `positionNode = normalize(newPos).mul(radiusUniform)`.
5. Tune defaults to be slow and organic (no obvious patterns). Use low frequencies.
6. Visual verification: particles should drift slowly like stardust, with subtle breathing (radial) and wandering (tangential).

**Commit:**
```bash
git commit -m "feat: add slow Brownian motion with multi-noise radial+tangential perturbation"
```

### Task 4: Add size variation, twinkle, polish and full debug panel

**Files:**
- `src/world/stardustParticles.js`
- `src/world/world.js`

**Steps:**
1. Add per-particle size variation using hash.
2. Implement gentle twinkle using `sin(time * speed + hash)` powered.
3. Expand debug panel with all key params: count (recreates Points), color, baseSize, motionSpeed, motionAmplitude, radialRatio, cullSoftness, twinkleIntensity, twinkleSpeed, opacity.
4. Ensure changing count rebuilds geometry+material cleanly.
5. Polish colors to soft stardust cyan/white, ensure harmony with energy shield and inner sphere.
6. Test full scene integration.

**Commit:**
```bash
git commit -m "feat: add size variation, twinkle, comprehensive debug panel and polish"
```

### Task 5: Final verification, documentation & cleanup

**Files:**
- `src/world/stardustParticles.js`
- `docs/plans/2026-04-23-surface-brownian-particles-design.md`
- `docs/plans/2026-04-23-surface-brownian-particles-implementation-plan.md`

**Steps:**
1. Tune defaults so it feels like gentle floating stardust without obvious repetition.
2. Full verification:
   - Only visible on back/sides, zero occlusion of inner sphere from any angle.
   - Slow, organic Brownian-like drifting with both radial and tangential components.
   - Debug controls all functional (especially count rebuild and motion params).
   - Performance excellent (>60fps at 12k-20k particles).
   - Clean dispose, no memory leaks.
3. Update design doc to mark as complete with final notes.
4. Run `npm run dev`, test with different camera positions.

**Commit:**
```bash
git commit -m "feat: complete stardust particles with view-plane culling and Brownian motion"
```

**Verification Checklist (run before claiming done):**
- [ ] ~10k-20k Points, soft stardust appearance, slow organic motion.
- [ ] **No particles** visible in camera-to-sphere space from any camera angle (strong plane culling verified).
- [ ] Motion feels like gentle Brownian drifting — subtle radial breathing + tangential wander, no obvious patterns or looping.
- [ ] Debug panel fully controls count (rebuilds), motion, cull, twinkle, color.
- [ ] Perfect visual harmony with InnerPhysicalSphere, EnergyShield and existing dots.
- [ ] Single responsibility class; minimal changes to world.js only.
- [ ] Stable performance and clean dispose().

---

**Plan complete.** This plan strictly follows the approved design from `2026-04-23-surface-brownian-particles-design.md`, user's clarified requirements (Points, surface-near, slow stardust Brownian motion with radial+tangential noise, strict view-plane culling), and core engineering principles.

本次使用了 **writing-plans** skill 生成详细实施计划。
本次使用了 **brainstorming** skill 确保设计和计划与用户最新视觉/运动反馈完全一致。
