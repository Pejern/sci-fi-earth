import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cross, float, fract, length, modelWorldMatrix,
  modelWorldMatrixInverse, normalize, positionLocal, smoothstep, uniform, uv, vec3, vec4,
} from 'three/tsl';
import gsap from 'gsap';
import { lngLatToUnitVec3 } from '../utils/geo.js';

const CURVE_SEGMENTS = 64;

/**
 * Build a ribbon BufferGeometry along the great-circle arc from aUnit to bUnit.
 * Points are lifted off the unit sphere by `arcHeight * sin(pi*t)` for a bow over the globe.
 * Each sample has two vertices at the same centerline position; lateral width is applied in
 * the vertex shader (screen-aligned / billboard).
 * per-vertex `direction`: vector toward the next sample (object space).
 * UV: u in [0,1] along arc, v in {-1,+1} used as side sign in the vertex shader and for soft edges.
 */
function buildRibbonGeometry(aUnit, bUnit, arcHeight) {
  const positions = new Float32Array(CURVE_SEGMENTS * 2 * 3);
  const directions = new Float32Array(CURVE_SEGMENTS * 2 * 3);
  const uvs = new Float32Array(CURVE_SEGMENTS * 2 * 2);
  const indices = [];

  const a = aUnit.clone().normalize();
  const b = bUnit.clone().normalize();
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega) || 1;

  const curvePoints = [];

  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const t = i / (CURVE_SEGMENTS - 1);
    const w1 = Math.sin((1 - t) * omega) / sinOmega;
    const w2 = Math.sin(t * omega) / sinOmega;
    const base = new THREE.Vector3()
      .addScaledVector(a, w1)
      .addScaledVector(b, w2);
    const lift = 1 + arcHeight * Math.sin(Math.PI * t);
    curvePoints.push(base.clone().multiplyScalar(lift));
  }

  const tmpDir = new THREE.Vector3();
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    if (i < CURVE_SEGMENTS - 1) {
      tmpDir.subVectors(curvePoints[i + 1], curvePoints[i]);
    } else {
      tmpDir.subVectors(curvePoints[i], curvePoints[i - 1]);
    }
    if (tmpDir.lengthSq() < 1e-20) {
      if (i > 0) {
        tmpDir.subVectors(curvePoints[i], curvePoints[i - 1]);
      } else {
        tmpDir.subVectors(curvePoints[1], curvePoints[0]);
      }
    }

    const p = curvePoints[i];
    const baseIdx = i * 2;
    positions.set([p.x, p.y, p.z], baseIdx * 3);
    positions.set([p.x, p.y, p.z], (baseIdx + 1) * 3);

    for (const o of [0, 1]) {
      const j = (baseIdx + o) * 3;
      directions.set([tmpDir.x, tmpDir.y, tmpDir.z], j);
    }

    const u = i / (CURVE_SEGMENTS - 1);
    uvs.set([u, 1], baseIdx * 2);
    uvs.set([u, -1], (baseIdx + 1) * 2);

    if (i < CURVE_SEGMENTS - 1) {
      const a0 = baseIdx;
      const a1 = baseIdx + 1;
      const b0 = baseIdx + 2;
      const b1 = baseIdx + 3;
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('direction', new THREE.BufferAttribute(directions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

class FlyLine {
  constructor({ scene, shared, aWorld, bWorld, color }) {
    this.scene = scene;
    this.shared = shared;
    this._arrived = false;
    this._tween = null;
    this._postFadeTween = null;

    this.uniforms = {
      progress: uniform(0),
      flowTime: uniform(0),
      postFade: uniform(1),
      color: uniform(new THREE.Color(color ?? shared.params.color)),
    };

    this.geometry = buildRibbonGeometry(
      aWorld, bWorld,
      shared.params.arcHeight,
    );

    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;

    const directionAttr = attribute('direction', 'vec3');
    const lineDirW = directionAttr.transformDirection(modelWorldMatrix).normalize();
    const pW = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const toCam = cameraPosition.sub(pW).normalize();
    const raw = cross(lineDirW, toCam);
    const rawLen = length(raw);
    const fb0 = cross(lineDirW, vec3(0, 1, 0));
    const fb1 = cross(lineDirW, vec3(1, 0, 0));
    const alt = length(fb0).greaterThan(float(1e-4)).select(normalize(fb0), normalize(fb1));
    const tangentW = rawLen.greaterThan(float(1e-4)).select(normalize(raw), alt);
    const offsetW = tangentW.mul(uv().y).mul(shared.uniforms.lineWidth);
    const pW2 = pW.add(offsetW);
    material.positionNode = modelWorldMatrixInverse.mul(vec4(pW2, 1.0)).xyz;

    const u = uv().x;
    const v = uv().y;
    const vAbs = abs(v);

    const edgeInner = float(0.55);
    const edgeOuter = float(0.95);
    const lateralMask = float(1).sub(smoothstep(edgeInner, edgeOuter, vAbs));

    const coreMask = float(1).sub(smoothstep(float(0), edgeInner, vAbs));
    const coreGlow = coreMask.pow(3.0).mul(shared.uniforms.coreBoost);

    const grown = float(1).sub(
      smoothstep(
        this.uniforms.progress.sub(shared.uniforms.headSoftness),
        this.uniforms.progress,
        u,
      ),
    );

    const flowHead = fract(this.uniforms.flowTime.mul(shared.uniforms.flowSpeed));
    const dFlow = fract(flowHead.sub(u));
    const flowMask = smoothstep(shared.uniforms.flowLength, float(0), dFlow);
    const flowOn = smoothstep(0.98, 1.0, this.uniforms.progress);

    const base = grown.mul(this.uniforms.postFade);
    const a = base.add(flowOn.mul(flowMask)).mul(lateralMask);

    const tint = this.uniforms.color.add(
      vec3(1.0, 1.0, 1.0).sub(this.uniforms.color).mul(coreGlow),
    );
    material.colorNode = tint.mul(a).mul(shared.uniforms.intensity);
    material.opacityNode = a;

    this.material = material;
    this.mesh = new THREE.Mesh(this.geometry, material);
    scene.add(this.mesh);
  }

  play({ growth, ease, onArrive } = {}) {
    this._tween?.kill();
    this.uniforms.progress.value = 0;
    this._tween = gsap.to(this.uniforms.progress, {
      value: 1,
      duration: growth ?? this.shared.params.growth,
      ease: ease ?? this.shared.params.growthEase,
      onComplete: () => {
        this._arrived = true;
        this._postFadeTween?.kill();
        this._postFadeTween = gsap.to(this.uniforms.postFade, {
          value: this.shared.params.postArriveFade,
          duration: this.shared.params.postArriveFadeDuration,
          ease: 'power1.out',
          onComplete: () => { this._postFadeTween = null; },
        });
        onArrive?.();
      },
    });
  }

  update(dt) {
    if (this._arrived) this.uniforms.flowTime.value += dt;
  }

  dispose() {
    this._tween?.kill();
    this._postFadeTween?.kill();
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export default class FlyLines {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {FlyLine[]} */
    this.lines = [];

    this.params = {
      color: '#4e87df',
      arcHeight: 0.18,
      width: 0.005,
      growth: 0.2,
      growthEase: 'power2.out',
      headSoftness: 0.05,
      flowSpeed: 2.0,
      flowLength: 0.15,
      intensity: 0.9,
      coreBoost: 1.35,
      postArriveFade: 0.3,
      postArriveFadeDuration: 0.4,
    };

    this.uniforms = {
      headSoftness: uniform(this.params.headSoftness),
      flowSpeed: uniform(this.params.flowSpeed),
      flowLength: uniform(this.params.flowLength),
      intensity: uniform(this.params.intensity),
      lineWidth: uniform(this.params.width),
      coreBoost: uniform(this.params.coreBoost),
    };

    this.shared = { params: this.params, uniforms: this.uniforms };
  }

  /**
   * @param {THREE.Vector3} aWorld unit vector on sphere
   * @param {THREE.Vector3} bWorld unit vector on sphere
   * @param {{ color?: string|number }} [opts]
   */
  add(aWorld, bWorld, opts = {}) {
    const line = new FlyLine({
      scene: this.scene,
      shared: this.shared,
      aWorld, bWorld,
      color: opts.color,
    });
    this.lines.push(line);
    return line;
  }

  clear() {
    for (const l of this.lines) l.dispose();
    this.lines.length = 0;
  }

  update(dt) {
    for (const l of this.lines) l.update(dt);
  }

  dispose() { this.clear(); }

  /**
   * @param {import('../utils/debug.js').default} debug
   */
  debuggerInit(debug) {
    if (!debug.active) return;
    const f = debug.addFolder({ title: 'Fly lines' });
    if (!f) return;

    f.addBinding(this.params, 'color', { view: 'color' });
    f.addBinding(this.params, 'arcHeight', { min: 0, max: 0.5, step: 0.01 });
    f.addBinding(this.params, 'width', { min: 0.001, max: 0.02, step: 0.001 })
      .on('change', () => { this.uniforms.lineWidth.value = this.params.width; });
    f.addBinding(this.params, 'growth', { min: 0.1, max: 3, step: 0.05 });
    f.addBinding(this.params, 'headSoftness', { min: 0, max: 0.3, step: 0.005 })
      .on('change', () => { this.uniforms.headSoftness.value = this.params.headSoftness; });
    f.addBinding(this.params, 'flowSpeed', { min: 0, max: 2, step: 0.05 })
      .on('change', () => { this.uniforms.flowSpeed.value = this.params.flowSpeed; });
    f.addBinding(this.params, 'flowLength', { min: 0.02, max: 0.5, step: 0.01 })
      .on('change', () => { this.uniforms.flowLength.value = this.params.flowLength; });
    f.addBinding(this.params, 'intensity', { min: 0, max: 6, step: 0.1 })
      .on('change', () => { this.uniforms.intensity.value = this.params.intensity; });
    f.addBinding(this.params, 'coreBoost', { min: 0, max: 4, step: 0.05 })
      .on('change', () => { this.uniforms.coreBoost.value = this.params.coreBoost; });
    f.addBinding(this.params, 'postArriveFade', { min: 0, max: 1, step: 0.05 });
    f.addBinding(this.params, 'postArriveFadeDuration', { min: 0, max: 2, step: 0.05 });
    f.addButton({ title: 'Test line (Beijing -> NY)' }).on('click', () => {
      this.clear();
      const A = lngLatToUnitVec3(116.4, 39.9);
      const B = lngLatToUnitVec3(-74.0, 40.7);
      const line = this.add(A, B);
      line.play({});
    });
  }
}
