import * as THREE from 'three/webgpu'
import { float, length, pass, smoothstep, uniform, uv, vec2, vec4 } from 'three/tsl'
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js'

export default class Renderer {
    /**
     * @param {{ canvas: HTMLCanvasElement }} options
     */
    constructor({ canvas }) {
        this.instance = new THREE.WebGPURenderer({
            canvas,
            forceWebGL: false,
            antialias: true,
        })

        this.instance.toneMapping = THREE.ACESFilmicToneMapping

        this.params = {
            exposure: 1.27,
            bloomStrength: 0.62,
            bloomRadius: 0.55,
            bloomThreshold: 0.2,
            vignetteStrength: 0.48,
            vignetteStart: 0.45,
            vignetteEnd: 0.95,
        }

        this.instance.toneMappingExposure = this.params.exposure

        /** @type {THREE.RenderPipeline | null} */
        this.renderPipeline = null
        /** @type {import('three/examples/jsm/tsl/display/BloomNode.js').default | null} */
        this.bloomPass = null

        this._vignetteStrengthU = uniform(this.params.vignetteStrength)
        this._vignetteStartU = uniform(this.params.vignetteStart)
        this._vignetteEndU = uniform(this.params.vignetteEnd)
    }

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    attachPipeline(scene, camera) {
        const scenePass = pass(scene, camera)
        const scenePassColor = scenePass.getTextureNode('output')

        // Full-image bloom for soft global glow on emissive dots / flow lines.
        this.bloomPass = bloom(
            scenePassColor,
            this.params.bloomStrength,
            this.params.bloomRadius,
            this.params.bloomThreshold,
        )

        const composited = scenePassColor.add(this.bloomPass)

        // Radial vignette: fade the image toward the corners to focus attention on the globe.
        const d = length(uv().sub(vec2(0.5)))
        const vigMask = smoothstep(this._vignetteStartU, this._vignetteEndU, d)
        const vignette = float(1).sub(vigMask.mul(this._vignetteStrengthU))

        const output = vec4(composited.rgb.mul(vignette), composited.a)

        this.renderPipeline = new THREE.RenderPipeline(this.instance, output)
    }

    async init() {
        await this.instance.init()
    }

    /**
     * @param {{ width: number, height: number }} sizes
     */
    setSizeFromSizes(sizes) {
        this.instance.setSize(sizes.width, sizes.height)
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }

    render() {
        this.renderPipeline.render()
    }

    _applyBloom() {
        if (!this.bloomPass) return
        this.bloomPass.strength.value = this.params.bloomStrength
        this.bloomPass.radius.value = this.params.bloomRadius
        this.bloomPass.threshold.value = this.params.bloomThreshold
    }

    _applyVignette() {
        this._vignetteStrengthU.value = this.params.vignetteStrength
        this._vignetteStartU.value = this.params.vignetteStart
        this._vignetteEndU.value = this.params.vignetteEnd
    }

    _applyExposure() {
        this.instance.toneMappingExposure = this.params.exposure
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) return

        const folder = debug.addFolder({ title: 'Post processing' })
        if (!folder) return

        folder
            .addBinding(this.params, 'exposure', { min: 0.1, max: 3, step: 0.01 })
            .on('change', () => this._applyExposure())

        folder
            .addBinding(this.params, 'bloomStrength', { min: 0, max: 3, step: 0.01 })
            .on('change', () => this._applyBloom())
        folder
            .addBinding(this.params, 'bloomRadius', { min: 0, max: 1.5, step: 0.01 })
            .on('change', () => this._applyBloom())
        folder
            .addBinding(this.params, 'bloomThreshold', { min: 0, max: 2, step: 0.01 })
            .on('change', () => this._applyBloom())

        folder
            .addBinding(this.params, 'vignetteStrength', { min: 0, max: 1, step: 0.01 })
            .on('change', () => this._applyVignette())
        folder
            .addBinding(this.params, 'vignetteStart', { min: 0, max: 1, step: 0.01 })
            .on('change', () => this._applyVignette())
        folder
            .addBinding(this.params, 'vignetteEnd', { min: 0, max: 1.5, step: 0.01 })
            .on('change', () => this._applyVignette())
    }
}
