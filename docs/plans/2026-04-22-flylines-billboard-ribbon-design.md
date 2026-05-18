# Fly Lines：Billboard Ribbon（螢幕對齊帶寬）— 设计文档

日期：2026-04-22

## 需求摘要

将 `src/world/flyLines.js` 中飞线的 Ribbon 从 **球面法线 × 切线在 CPU 上展开宽度** 改为 **视角相关的侧向偏移**：中心线仍为大圆弧采样 + 抬升，几何上每采样点只保留**中心位置（双写两顶点于同一点）**，宽度在 **TSL 顶点阶段** 用 `cross(线段方向, 视向)` 做 billboard 展开，使带状几何始终面向相机（屏幕对齐），单一路径、无可切换旧模式。

## 架构

- **数据（CPU，`buildRibbonGeometry`）**  
  - 保留现有大圆 + `arcHeight` 抬升与 `CURVE_SEGMENTS` 采样。  
  - 每采样点 **两个顶点，position 相同**（不再在 CPU 做侧向 `±width`）。  
  - 新增 per-vertex `direction`（`vec3`）：自当前点指向**下一**采样点的向量（**局部/模型空间**；父节点为旋转球体时与现有 mesh 空间一致）。最后一点沿用倒数第二段的方向，避免未定义。  
  - 保留 `uv`：`u` 沿线 [0,1]，`v` 为 +1 / -1，供片元阶段 `abs(v)` 等逻辑不变。  
  - 三角索引与现有一致：沿带 quad strip，每段 6 个 index。

- **材质（TSL，`MeshBasicNodeMaterial`）**  
  - **片元/外观**：`colorNode`、`opacityNode` 保持现有 `progress`、`flowTime`、`headSoftness`、`*uv().x*/*abs(v)*` 合成，无行为性改动目标。  
  - **顶点**：通过 `positionNode`（或项目 three r183 中等价的顶点位置节点）在局部空间输出 **原局部位置 + 经模型逆变换回局部的侧向 offset**（或直接在 TSL 中由 `positionLocal` → 世界、算 offset、再回局部，与主代码风格一致即可）。  
  - 世界空间：线段方向 `normalize(transformDirection(direction, modelWorldMatrix))`；`toCamera` 为自顶点到 `cameraPosition` 的归一化向量。  
  - `tangent = normalize(cross(lineDir, toCamera))`；若长度接近 0（线与视线近平行），使用 **固定 fallback 轴**（如世界 up）与 `toCamera` 重正交化，避免 NaN/闪烁。  
  - 左右侧：`vertexIndex` 或等价方式区分成对顶点的 `±0.5`，乘 **半宽**（由现有 `width` 参数/uniform 提供）。  
  - 将 `width` 以 **uniform** 传入 TSL，便于与 debug 面板同步（若目前仅从 `params` 读一次进几何，需改为每帧/变更时与 uniform 一致）。

## 與舊文檔的關係

- `docs/plans/2026-04-20-spokes-flylines-design.md` 中「Ribbon：侧向偏移 = `normalize(curve[i]) × tangent[i] × width`」一節**被本設計替代**；其餘（大圓、抬升、生長/流光、Spoke 編排）不變。

## 風險與驗收

- **風險**：極少數視角下 cross 退化 — 已用 fallback 緩解。  
- **驗收**：Debug「Test line」、Spoke 流程下弧線、流光與到達後漸隱**行為**與改前一致；**視覺**差異僅帶寬隨相機轉向而保持屏幕对齐。

## 狀態

- 本設計已經產品方確認（單一 billboard 模式，無雙模切換）。
