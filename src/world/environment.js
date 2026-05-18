import * as THREE from 'three/webgpu'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

export default class Environment {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene

        this.loader = new HDRLoader()

        this.envParams = {
            environmentIntensity: 1.0 *0.7
        }

        this.ambientLight = new THREE.AmbientLight(0x8844ff, 0.1)
        this.scene.add(this.ambientLight)

        this.loadHDR()
    }

    loadHDR() {
        this.loader.load('./hdr/rogland_clear_night_1k.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping
            this.scene.environment = texture
            this.scene.background = null
            this.scene.environmentIntensity = this.envParams.environmentIntensity
        })
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Environment',
            expanded: true
        })
        if (!folder) {
            return
        }

        folder.addBinding(this.envParams, 'environmentIntensity', { min: 0, max: 5, step: 0.1 }).on('change', () => {
            this.scene.environmentIntensity = this.envParams.environmentIntensity
        })
    }
}
