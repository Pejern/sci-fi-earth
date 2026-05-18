# Remove Fog and Add Environment Control Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fog from the scene and add a UI pane to control environment background properties.

**Architecture:** Modify `Environment` class to remove fog-related properties and methods, and add a new `envParams` object for environment settings, which will be bound to the debug UI.

**Tech Stack:** Three.js (WebGPU), TSL, Tweakpane (via Debug utility).

---

### Task 1: Clean up Environment class and remove Fog

**Files:**
- Modify: `src/world/environment.js`

- [ ] **Step 1: Remove fog-related properties and methods**

```javascript
import * as THREE from 'three/webgpu'
import { color, uniform } from 'three/tsl' // Remove fog, rangeFogFactor
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

export default class Environment {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene

        this.loader = new RGBELoader()

        // New environment parameters
        this.envParams = {
            backgroundBlurriness: 0.5,
            backgroundIntensity: 1.0,
            environmentIntensity: 1.0
        }

        this.loadHDR()
    }

    loadHDR() {
        this.loader.load('hdr/studio_small_08_1k.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping
            this.scene.environment = texture
            this.scene.background = texture
            
            // Apply initial parameters
            this.scene.backgroundBlurriness = this.envParams.backgroundBlurriness
            this.scene.backgroundIntensity = this.envParams.backgroundIntensity
            this.scene.environmentIntensity = this.envParams.environmentIntensity
        })
    }

    // _rebuildFog() removed
}
```

- [ ] **Step 2: Update debuggerInit with environment controls**

```javascript
    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Environment',
            expanded: true // Changed to true for better visibility
        })
        if (!folder) {
            return
        }

        folder.addBinding(this.envParams, 'backgroundBlurriness', { min: 0, max: 1, step: 0.01, label: 'Bg Blurriness' }).on('change', (ev) => {
            this.scene.backgroundBlurriness = ev.value
        })
        folder.addBinding(this.envParams, 'backgroundIntensity', { min: 0, max: 5, step: 0.1, label: 'Bg Intensity' }).on('change', (ev) => {
            this.scene.backgroundIntensity = ev.value
        })
        folder.addBinding(this.envParams, 'environmentIntensity', { min: 0, max: 5, step: 0.1, label: 'Env Intensity' }).on('change', (ev) => {
            this.scene.environmentIntensity = ev.value
        })
    }
```

- [ ] **Step 3: Commit changes**

```bash
git add src/world/environment.js
git commit -m "feat: remove fog and add environment control pane"
```

### Task 2: Clean up Experience class

**Files:**
- Modify: `src/app/Experience.js`

- [ ] **Step 1: Remove fog color reference**

```javascript
// Around line 44 in src/app/Experience.js
// Remove: this.renderer.instance.setClearColor(this.environment.fogColor.value)
```

- [ ] **Step 2: Commit changes**

```bash
git add src/app/Experience.js
git commit -m "fix: remove fog color reference in Experience"
```
