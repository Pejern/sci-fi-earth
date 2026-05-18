# Portfolio · Particle globe & Flyline visualization (Three.js WebGPU · TSL)

A **personal portfolio** real-time 3D visualization built with **WebGPU** and the **Three.js Shading Language (TSL)**: particle landmasses, a hex-style base treatment, energy-style shell lighting, multiple **Flyline** arcs linking hubs worldwide, **Tweakpane** for live tuning, and a **TSL post pipeline** (bloom and vignette). The visual direction targets large-screen / sci‑fi FUI aesthetics while staying on a modern browser graphics stack.

### Leave a star 🌟

![Runtime screenshot: particle globe, fly lines, debug panel](docs/preview.png)

---

## Goals & positioning

- Deliver a **high-tech Earth scene** in a **single-page web** app that is presentable and easy to iterate on—suitable for demo walls, tech talks, or interview portfolio walkthroughs.
- Implement rendering and post in **TSL** on **WebGPU**, aligned with where Three.js is heading, rather than relying solely on the legacy WebGL path.

---

## Highlights 

| Area | Details |
|------|---------|
| Real-time rendering | `WebGPURenderer` async init; resolution / DPR handling |
| Shading & post | `RenderPipeline` with `pass` / `BloomNode`; vignette composed in TSL (`uv`, `smoothstep`, uniforms) |
| Scene complexity | Large-scale particle landmass; layered geometry and effects (inner sphere, borders, shield, fly lines, etc.) |
| Data & motion | Hub / target lat–lng drive fly lines; tunable delays, staggering, looping, playback controls |
| Engineering | **Vite** dev & build; modular `Experience` / `World` / `world/*.js`; grouped **Tweakpane** wiring via `debuggerInit` |

---

## Visuals & interaction (summary)

- **Particle land**: particles distributed by map threshold; adjustable count, size, falloff, brightness variation.
- **Fly lines**: arc animations from hub to multiple cities; timing and playback controls.
- **Effects**: energy shield, border dots, click wave, twinkle—toggable and tunable from the panel.
- **Interaction**: click triggers ripple behavior tied to particles / borders.

---

## Tech stack

| Piece | Notes |
|-------|-------|
| Rendering | [Three.js](https://threejs.org/) **WebGPU** (`three/webgpu`) |
| Shading / post | **TSL** (`three/tsl`) |
| Build | [Vite](https://vitejs.dev/) 5 |
| Debug UI | [Tweakpane](https://tweakpane.github.io/docs/) |
| Animation | [GSAP](https://gsap.com/) |

**Requirements:** a **WebGPU**-capable browser (recent Chrome / Edge recommended).

---

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build   # output to dist/
```

---


## References (TSL / WebGPU)

- [Three.js Shading Language (official)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [TSL Q&A](https://github.com/boytchev/tsl-textures/wiki/Q&A)
- [Three.js WebGPU examples](https://threejs.org/examples/?q=webgpu#webgpu_parallax_uv)
- [TSL editor example](https://threejs.org/examples/?q=webgpu#webgpu_tsl_editor)

---