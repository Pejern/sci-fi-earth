# PhysicNodeMaterial Icosahedron Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an icosahedron with `MeshPhysicalNodeMaterial` and illuminate it with an HDR environment map.

**Architecture:** 
1. `Environment` class loads HDR using `RGBELoader` and sets `scene.environment`.
2. `World` class creates `IcosahedronGeometry` and `MeshPhysicalNodeMaterial` using TSL.
3. `Debug` UI integration for material properties.

**Tech Stack:** Three.js (WebGPU/TSL), Vite

---

### Task 1: Setup HDR Environment Lighting

**Files:**
- Modify: `src/world/environment.js`

**Step 1: Update Environment to load HDR**

```javascript
import * as THREE from 'three/webgpu'
import { color, fog, rangeFogFactor, uniform } from 'three/tsl'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

export default class Environment {
    constructor(scene) {
        this.scene = scene
        this.loader = new RGBELoader()
        
        this.fogColor = uniform(color('#ffffff'))
        this.fogRange = { near: 10, far: 15 }
        this._rebuildFog()
        
        this.loadHDR()
    }

    loadHDR() {
        this.loader.load('hdr/studio_small_08_1k.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping
            this.scene.environment = texture
            this.scene.background = texture
            this.scene.backgroundBlurriness = 0.5
        })
    }
    // ... rest of the class
}
```

**Step 2: Verify HDR loading**
Check console for any loading errors.

---

### Task 2: Create Icosahedron with PhysicNodeMaterial

**Files:**
- Modify: `src/world/world.js`

**Step 1: Implement Icosahedron in World class**

```javascript
import * as THREE from 'three/webgpu'
import { color, float } from 'three/tsl'

export default class World {
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.createIcosahedron()
    }

    createIcosahedron() {
        const geometry = new THREE.IcosahedronGeometry(1, 0)
        const material = new THREE.MeshPhysicalNodeMaterial()
        
        material.colorNode = color(0xffffff)
        material.roughnessNode = float(0.1)
        material.metalnessNode = float(1.0)

        this.mesh = new THREE.Mesh(geometry, material)
        this.scene.add(this.mesh)
    }
}
```

---

### Task 3: Add Debug Controls

**Files:**
- Modify: `src/world/world.js`

**Step 1: Add debuggerInit implementation**

```javascript
    debuggerInit(debug) {
        if (!debug.active) return

        const folder = debug.addFolder({ title: 'Icosahedron' })
        
        folder.addBinding(this.mesh.material, 'roughness', { min: 0, max: 1, step: 0.01 })
        folder.addBinding(this.mesh.material, 'metalness', { min: 0, max: 1, step: 0.01 })
    }
```
