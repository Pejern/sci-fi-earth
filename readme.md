# Portfolio · Particle globe & Flyline visualization (Three.js WebGPU · TSL)

A **personal portfolio** real-time 3D visualization built with **WebGPU** and the **Three.js Shading Language (TSL)**: particle landmasses, a hex-style base treatment, energy-style shell lighting, multiple **Flyline** arcs linking hubs worldwide, **Tweakpane** for live tuning, and a **TSL post pipeline** (bloom and vignette). The visual direction targets large-screen / sci‑fi FUI aesthetics while staying on a modern browser graphics stack.

### Leave a star 🌟

![Runtime screenshot: particle globe, fly lines, debug panel](docs/preview.png)

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
