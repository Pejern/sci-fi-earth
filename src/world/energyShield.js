import * as THREE from 'three/webgpu'
import {
    Fn, uniform, float, vec2, vec3, vec4,
    positionLocal, normalView, positionViewDirection,
    step, smoothstep, mix, mx_noise_float, max, min,
    sin, cos, abs, pow, clamp, floor, fract, dot, length,color
} from 'three/tsl'

// ─── Hex grid helpers (matches the reference GLSL) ────────────────────────────
// p is pre-scaled. Returns (edgeMask) or (cellId.xy).
const HEX_S   = vec2(1.0, 1.7320508)
const HEX_S4  = vec4(1.0, 1.7320508, 1.0, 1.7320508) // avoids .xyxy swizzle
const HEX_HALF = vec2(0.5, 0.8660254)                // HEX_S * 0.5

const hexEdge = /*#__PURE__*/ Fn(([p, w]) => {
    const q  = vec4(p.x, p.y, p.x.sub(0.5), p.y.sub(1.0))
    const hC = floor(q.div(HEX_S4)).add(0.5)
    const h  = vec4(p.sub(hC.xy.mul(HEX_S)), p.sub(hC.zw.add(0.5).mul(HEX_S)))
    const useA = step(dot(h.xy, h.xy), dot(h.zw, h.zw))
    const cell = abs(mix(h.zw, h.xy, useA))
    const d = max(dot(cell, HEX_HALF), cell.x)
    return smoothstep(float(0.5).sub(w), float(0.5), d)
})

const hexCellId = /*#__PURE__*/ Fn(([p]) => {
    const q  = vec4(p.x, p.y, p.x.sub(0.5), p.y.sub(1.0))
    const hC = floor(q.div(HEX_S4)).add(0.5)
    const h  = vec4(p.sub(hC.xy.mul(HEX_S)), p.sub(hC.zw.add(0.5).mul(HEX_S)))
    const useA = step(dot(h.xy, h.xy), dot(h.zw, h.zw))
    return mix(hC.zw.add(0.5), hC.xy, useA)
})

/**
 * Sci-fi energy shield (TSL /WebGPU port of the reference ShieldMaterial).
 * Implemented features: reveal-dissolve + edge glow, life color, fresnel,
 * triplanar hex with seam fade, per-cell flash, flow noise, bottom fade.
 */
export default class EnergyShield {
    constructor(scene) {
        this.scene = scene

        this.params = {
            color: '#689ee5',
            noiseEdgeColor: '#14a7ff',
            radius: 1.0,

            life: 1.0,
            opacity: 0.93,

            fresnelPower: 1.00,
            fresnelStrength: 0.35,

            hexScale: 12.0,
            edgeWidth: 0.06,
            hexOpacity: 0.14,

            flashSpeed: 2.9,
            flashIntensity: 0.11,

            flowScale: 4.0,
            flowSpeed: 1.5,
            flowIntensity: 4.0,

            // 0 ≈ fully visible; toward 1 the dissolve threshold moves up (needs noise ≈ reveal)
            reveal: 0.0,
            noiseScale: 1.65,
            noiseEdgeWidth: 0.02,
            noiseEdgeIntensity: 9.8,
            noiseEdgeSmoothness: 0.5,

            fadeStart: 0.17,
        }

        const p = this.params
        const u = this._u = {
            time: uniform(0),
            color: uniform(new THREE.Color(p.color)),
            noiseEdgeColor: uniform(new THREE.Color(p.noiseEdgeColor)),

            life: uniform(p.life),
            opacity: uniform(p.opacity),

            fresnelPower: uniform(p.fresnelPower),
            fresnelStrength: uniform(p.fresnelStrength),

            hexScale: uniform(p.hexScale),
            edgeWidth: uniform(p.edgeWidth),
            hexOpacity: uniform(p.hexOpacity),

            flashSpeed: uniform(p.flashSpeed),
            flashIntensity: uniform(p.flashIntensity),

            flowScale: uniform(p.flowScale),
            flowSpeed: uniform(p.flowSpeed),
            flowIntensity: uniform(p.flowIntensity),

            reveal: uniform(p.reveal),
            noiseScale: uniform(p.noiseScale),
            noiseEdgeWidth: uniform(p.noiseEdgeWidth),
            noiseEdgeIntensity: uniform(p.noiseEdgeIntensity),
            noiseEdgeSmoothness: uniform(p.noiseEdgeSmoothness),

            fadeStart: uniform(p.fadeStart),
        }

        this.geometry = new THREE.SphereGeometry(1.02, 64, 48)
        this.material = this._buildMaterial(u)

        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.scale.setScalar(p.radius)
        this.mesh.renderOrder = 10
        this.scene.add(this.mesh)
    }

    _buildMaterial(u) {
        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide,
        })

        // ── Reveal / dissolve ─────────────────────────────────────────────────
        // noise in [0,1]; revealMask = 0 below threshold, 1 above
        const noise = mx_noise_float(positionLocal.mul(u.noiseScale)).mul(0.5).add(0.5)
        const revealMask = smoothstep(u.reveal.sub(u.noiseEdgeWidth), u.reveal, noise)

        // Thin lit band along the dissolve edge
        const innerFade  = mix(float(0.98), float(0.15), u.noiseEdgeSmoothness)
        const edgeLow    = smoothstep(
            u.reveal.sub(u.noiseEdgeWidth),
            u.reveal.sub(u.noiseEdgeWidth.mul(innerFade)),
            noise,
        )
        const edgeHigh   = smoothstep(u.reveal.sub(u.noiseEdgeWidth.mul(0.15)), u.reveal, noise)
        const revealEdge = edgeLow.mul(edgeHigh.oneMinus())

        // ── Fresnel ───────────────────────────────────────────────────────────
        const ndv = normalView.dot(positionViewDirection).saturate()
        const fresnelStrengthOsc = u.fresnelStrength.add(float(0.25).mul(cos(u.time.mul(2.0))))
        const fresnel = pow(ndv.oneMinus(), u.fresnelPower).mul(fresnelStrengthOsc)

        // ── Flow noise (2 octaves) ────────────────────────────────────────────
        const t = u.time.mul(u.flowSpeed)
        const fn1 = mx_noise_float(
            positionLocal.mul(u.flowScale).add(vec3(t, t.mul(0.6), t.mul(0.4)))
        )
        const fn2 = mx_noise_float(
            positionLocal.mul(u.flowScale.mul(2.1))
                .add(vec3(t.mul(-0.5), t.mul(0.9), t.mul(0.3)))
        )
        const flowNoise = fn1.mul(0.6).add(fn2.mul(0.4)).mul(0.5).add(0.5)

        // ── Hex: cube-face select + seam fade ─────────────────────────────────
        const absN = abs(positionLocal)
        const dominance = max(absN.x, max(absN.y, absN.z))
        const hexFade   = smoothstep(float(0.65), float(0.85), dominance)

        // Pick the face's UV as the reference does (priority X > Y > Z)
        const isX = step(max(absN.y, absN.z), absN.x)
        const isY = step(absN.z, absN.y).mul(isX.oneMinus())
        const faceUV = positionLocal.yz.mul(isX)
            .add(positionLocal.xz.mul(isY))
            .add(positionLocal.xy.mul(isX.add(isY).oneMinus()))

        const scaledUV = faceUV.mul(u.hexScale)
        const hex      = hexEdge(scaledUV, u.edgeWidth).mul(hexFade)
        const cellId   = hexCellId(scaledUV)

        // ── Cell flash (per-hex random phase pulse) ───────────────────────────
        const rnd   = fract(sin(dot(cellId, vec2(127.1, 311.7))).mul(43758.5453))
        const phase = rnd.mul(6.2831)
        const speed = rnd.mul(1.5).add(0.5)
        const flash = smoothstep(
            float(0.6), float(1.0),
            sin(u.time.mul(u.flashSpeed).mul(speed).add(phase)),
        ).mul(u.flashIntensity).mul(hexFade)

        // ── Life color (red when drained, main color when full) ───────────────
        const lColor = mix(vec3(1.0, 0.08, 0.04), u.color, u.life)

        // ── Compose ───────────────────────────────────────────────────────────
        const intensity = hex
            .mul(u.hexOpacity)
            .mul(fresnel.mul(0.7).add(0.3))
            .add(fresnel.mul(0.4))
            .add(flash)

        const shieldColor = lColor.mul(intensity).mul(2.0)
            .add(lColor.mul(flowNoise).mul(fresnel).mul(u.flowIntensity))

        const edgeColor = mix(u.noiseEdgeColor, lColor, u.life.oneMinus())
        const edgeGlow  = edgeColor.mul(revealEdge).mul(u.noiseEdgeIntensity)

        let alpha = clamp(
            intensity.mul(1.0).mul(revealMask)
                .add(revealEdge.mul(u.noiseEdgeIntensity)),
            0.0, 1.0,
        )

        // Bottom fade: positionLocal is unit-sphere space so .y ∈ [-1, 1]

        alpha = alpha
            .mul(smoothstep(float(-1.0), u.fadeStart, positionLocal.y))
            .mul(u.opacity)

        material.colorNode  = shieldColor.add(edgeGlow)
        material.opacityNode = alpha
        return material
    }

    update(delta = 0) {
        this._u.time.value += delta
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) return
        const folder = debug.addFolder({ title: 'Energy shield' })
        if (!folder) return

        const p = this.params
        const u = this._u
        // sync a color-type param into its uniform
        const syncColor = (key, uk) => () => u[uk].value.set(p[key])
        // sync a float-type param into its uniform
        const syncFloat = (key, uk) => () => { u[uk].value = p[key] }

        folder.addBinding(p, 'color', { view: 'color' }).on('change', syncColor('color', 'color'))
        folder.addBinding(p, 'noiseEdgeColor', { view: 'color' })
            .on('change', syncColor('noiseEdgeColor', 'noiseEdgeColor'))
        folder.addBinding(p, 'radius', { min: 1.0, max: 1.2, step: 0.005 })
            .on('change', () => this.mesh.scale.setScalar(p.radius))

        folder.addBinding(p, 'life',    { min: 0.0, max: 1.0, step: 0.01 }).on('change', syncFloat('life', 'life'))
        folder.addBinding(p, 'opacity', { min: 0.0, max: 2.0, step: 0.01 }).on('change', syncFloat('opacity', 'opacity'))

        folder.addBinding(p, 'fresnelPower',    { min: 0.1, max: 8.0, step: 0.05 }).on('change', syncFloat('fresnelPower', 'fresnelPower'))
        folder.addBinding(p, 'fresnelStrength', { min: 0.0, max: 4.0, step: 0.05 }).on('change', syncFloat('fresnelStrength', 'fresnelStrength'))

        folder.addBinding(p, 'hexScale',   { min: 0.5, max: 20.0, step: 0.1 }).on('change', syncFloat('hexScale', 'hexScale'))
        folder.addBinding(p, 'edgeWidth',  { min: 0.005, max: 0.3, step: 0.005 }).on('change', syncFloat('edgeWidth', 'edgeWidth'))
        folder.addBinding(p, 'hexOpacity', { min: 0.0, max: 1.0, step: 0.01 }).on('change', syncFloat('hexOpacity', 'hexOpacity'))

        folder.addBinding(p, 'flashSpeed',     { min: 0.0, max: 5.0, step: 0.05 }).on('change', syncFloat('flashSpeed', 'flashSpeed'))
        folder.addBinding(p, 'flashIntensity', { min: 0.0, max: 1.0, step: 0.01 }).on('change', syncFloat('flashIntensity', 'flashIntensity'))

        folder.addBinding(p, 'flowScale',     { min: 0.1, max: 10.0, step: 0.05 }).on('change', syncFloat('flowScale', 'flowScale'))
        folder.addBinding(p, 'flowSpeed',     { min: 0.0, max: 4.0, step: 0.01 }).on('change', syncFloat('flowSpeed', 'flowSpeed'))
        folder.addBinding(p, 'flowIntensity', { min: 0.0, max: 8.0, step: 0.05 }).on('change', syncFloat('flowIntensity', 'flowIntensity'))

        folder.addBinding(p, 'reveal',              { min: 0.0, max: 1.0, step: 0.01 }).on('change', syncFloat('reveal', 'reveal'))
        folder.addBinding(p, 'noiseScale',          { min: 0.1, max: 5.0, step: 0.05 }).on('change', syncFloat('noiseScale', 'noiseScale'))
        folder.addBinding(p, 'noiseEdgeWidth',      { min: 0.001, max: 0.2, step: 0.001 }).on('change', syncFloat('noiseEdgeWidth', 'noiseEdgeWidth'))
        folder.addBinding(p, 'noiseEdgeIntensity',  { min: 0.0, max: 20.0, step: 0.1 }).on('change', syncFloat('noiseEdgeIntensity', 'noiseEdgeIntensity'))
        folder.addBinding(p, 'noiseEdgeSmoothness', { min: 0.0, max: 1.0, step: 0.01 }).on('change', syncFloat('noiseEdgeSmoothness', 'noiseEdgeSmoothness'))

        folder.addBinding(p, 'fadeStart', { min: -1.0, max: 1.0, step: 0.01 }).on('change', syncFloat('fadeStart', 'fadeStart'))
    }

    dispose() {
        if (!this.mesh) return
        this.scene.remove(this.mesh)
        this.geometry.dispose()
        this.material.dispose()
        this.mesh = null
        this.geometry = null
        this.material = null
    }
}
