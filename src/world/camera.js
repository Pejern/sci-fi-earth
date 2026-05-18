import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'

export default class WorldCamera {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('../systems/Sizes.js').default} sizes
     */
    constructor(canvas, sizes) {
        this.sizes = sizes
        this.canvas = canvas

        /** World units for orthographic half-extent; full view height = frustum */
        this._frustum = 1.2
        const aspect = sizes.width / sizes.height
        const f = this._frustum
        this.instance = new THREE.OrthographicCamera(-f * aspect, f * aspect, f, -f, 0.1, 100)
        this.instance.position.set(6, 3, 10)

        this.controls = new OrbitControls(this.instance, canvas)
        this.controls.enableDamping = true
        this.controls.enableZoom = false

        this.zoomControls = new TrackballControls(this.instance, canvas)
        this.zoomControls.target = this.controls.target
        this.zoomControls.noRotate = true
        this.zoomControls.noPan = true

        this._debugFrustum = { size: this._frustum }
    }

    _updateOrthographicFrustum() {
        const aspect = this.sizes.width / this.sizes.height
        const f = this._frustum
        this.instance.left = -f * aspect
        this.instance.right = f * aspect
        this.instance.top = f
        this.instance.bottom = -f
        this.instance.updateProjectionMatrix()
    }

    resize() {
        this._updateOrthographicFrustum()
        this.zoomControls.handleResize()
    }

    update() {
        this.controls.update()
        this.zoomControls.update()
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Camera',
            expanded: false
        })
        if (!folder) {
            return
        }
        folder.addBinding(this._debugFrustum, 'size', { min: 0.5, max: 20, step: 0.1, label: 'Frustum' }).on('change', () => {
            this._frustum = this._debugFrustum.size
            this._updateOrthographicFrustum()
        })
    }

    dispose() {
        this.controls.dispose()
        this.zoomControls.dispose()
    }
}
