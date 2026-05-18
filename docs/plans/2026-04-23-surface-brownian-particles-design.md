# Surface Brownian Stardust Particles Design

**Date:** 2026-04-23
**Status:** Approved by user
**Replaces:** Deleted `2026-04-23-rim-particles-implementation-plan.md`

## Goal

在 `innerPhysicalSphere` 周围创建一个**星尘般缓慢飘动的粒子系统**（stardust particles）。
- 粒子**随机分布在球体表面附近**（薄球壳，radius ≈ 1.02–1.08）。
- 视觉风格为 **THREE.Points**，轻柔、梦幻，像漂浮的星尘。
- 运动呈现**类似布朗运动的随机异动**：缓慢、无明显规律，同时包含轻微**切向（tangential）+ 径向（radial）**扰动。
- **严格约束**：使用“始终通过球心且与 viewDir 垂直的平面”剔除靠近相机的一半粒子，确保**没有任何粒子遮挡在球体和相机之间**。

符合核心工程原则：**简单、可读、单一职责、最小变更范围**。不修改现有 `innerPhysicalSphere`、`energyShield`、`borderDots`、`dotSphere` 等逻辑。

## Architecture

- **新独立类**：`src/world/stardustParticles.js`
  - 单一职责：只负责表面附近星尘粒子 + view-plane culling + Brownian-like motion。
  - 完全移除之前 rim-particles 计划中的 Fibonacci、border mask、waves、gsap 等。
- **生成方式**：JS 中均匀随机球面采样（非 Fibonacci），支持 debug 面板动态重建。
- **渲染**：`THREE.Points` + TSL NodeMaterial（`MeshBasicNodeMaterial` with `positionNode`）。
- **核心剔除逻辑**（TSL）：
  ```tsl
  const toCenter = positionLocal.normalize();
  const viewToCenter = positionViewDirection.normalize();  // approximates viewDir
  const side = dot(toCenter, viewToCenter);
  const cullMask = smoothstep(-0.1, 0.05, -side);  // only keep back side, soft edge
  ```
- **Brownian Motion (TSL positionNode)**：
  - per-instance hash (using `instanceIndex` + primes)。
  - 多层低频 `mx_noise_float`（不同 scale、time offset、octaves）分别驱动 tangential 和 radial 扰动。
  - 最终位置：`normalize(original + offset) * radius`。
  - 参数：缓慢（speed ≈ 0.2–0.4）、微小幅度（0.015–0.045），确保无规律感。
- **视觉参数**：
  - 柔和青白/浅蓝星尘色（可调）。
  - 轻微 size variation + twinkle（hash-based sin wave）。
  - Additive blending, transparent, depthWrite=false, renderOrder=6。
- **Debug 面板**：完整参数控制（count、color、speed、amplitude、radialRatio、cullSoftness、twinkle、opacity）。改变 count 时重建 Points。

## Data Flow

1. `World` constructor → `this.stardustParticles = new StardustParticles(scene)`
2. `debuggerInit(debug)` → 添加 "Stardust Particles" folder
3. `update(delta)` → 只更新 time uniform（运动全部在 TSL）
4. `dispose()` → 清理 Points、geometry、material

## Why This Design (Trade-offs)

**Chosen because:**
- **最简单直接**：Points + TSL `positionNode` + view-plane dot product 是项目中最自然的实现。
- **精确满足用户需求**：表面附近随机 + 缓慢星尘布朗运动 + 严格相机侧剔除 + 无规律扰动。
- **高性能**：Points 在 WebGPU 中极高效，noise 计算廉价。
- **一致性**：复用现有 TSL 工具函数（`mx_noise_float`、`positionViewDirection`、`normalView` 等）和 debug 模式。
- **可维护**：代码清晰、参数化、无外部依赖（不引入 gsap）。

**Rejected alternatives:**
- Instanced Planes with disk falloff：用户明确指定 Points 视觉风格。
- Real physics / compute shader Brownian：over-engineering，性能差。
- Pre-split two point clouds (front/back)：无法动态适应相机移动，且浪费内存。
- Texture-based mask or post-process cull：不必要，shader 内 dot product 更简单有效。

## Success Criteria / Verification

- 粒子像缓慢漂浮的星尘，仅分布在球体表面附近，无明显重复规律。
- 从任何角度看，**相机与球体之间的空间完全干净**（无粒子遮挡），仅能看到球体“背面/侧面”星尘。
- 运动平滑自然，径向+切向扰动结合良好，不会出现粒子突然跳跃或穿模。
- Debug 面板可实时调节所有参数（含重建 count）。
- 性能稳定（>60fps，即使 15000+ particles）。
- 代码符合单一职责、最小变更原则；不影响现有任何组件。

**Next Step:** Invoke `writing-plans` skill to generate detailed, task-by-task implementation plan. Then execute in isolated git worktree using `executing-plans` + `using-git-worktrees`.

---

**本次使用了 brainstorming skill**（完成全部 checklist：项目上下文探索、多次澄清用户意图、提出并迭代设计方案、获得明确批准、准备写入设计文档）。

设计已获**批准**。即将创建实施计划并开始编码。
