import * as THREE from 'three/webgpu'
import { float, uniform } from 'three/tsl'

/**
 * Solid sphere with {@link THREE.MeshPhysicalNodeMaterial}, centered like the dot sphere (unit shell),
 * with radius smaller than 1 so it sits inside the point cloud.
 */
export default class InnerPhysicalSphere {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene

        this.panelParams = {
            color: '#0f1a32',
            radius: 1.0
        }

        this._colorUniform = uniform(new THREE.Color(this.panelParams.color))

        this.geometry = new THREE.SphereGeometry(1, 48, 32)
        const material = new THREE.MeshPhysicalNodeMaterial()
        material.colorNode = this._colorUniform
        material.roughnessNode = float(0.2)
        material.metalnessNode = float(0.0)
        material.clearcoatNode = float(1.0)
        material.clearcoatRoughnessNode = float(0.0)

        this.mesh = new THREE.Mesh(this.geometry, material)
        this.mesh.scale.setScalar(this.panelParams.radius)
        this.scene.add(this.mesh)

        this.material = material
    }

    _applyColor() {
        this._colorUniform.value.set(this.panelParams.color)
    }

    _applyRadius() {
        this.mesh.scale.setScalar(this.panelParams.radius)
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({ title: 'Inner physical sphere' })
        if (!folder) {
            return
        }

        folder.addBinding(this.panelParams, 'color', { view: 'color' }).on('change', () => {
            this._applyColor()
        })
        folder.addBinding(this.panelParams, 'radius', { min: 0.95, max: 1.01, step: 0.01 }).on('change', () => {
            this._applyRadius()
        })
    }

    dispose() {
        if (!this.mesh) {
            return
        }
        this.scene.remove(this.mesh)
        this.geometry.dispose()
        this.material.dispose()
        this.mesh = null
        this.geometry = null
        this.material = null
    }
}
