import * as THREE from "three/webgpu";
import {
  float,
  fract,
  instanceIndex,
  length,
  normalView,
  positionGeometry,
  positionLocal,
  positionViewDirection,
  pow,
  saturate,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
} from "three/tsl";
import gsap from "gsap";

const MAX_WAVES = 8;

/**
 * Fibonacci-sampled point cloud on the unit sphere, filtered by a land mask texture.
 * Each instance is a plane; a circular footprint comes from UV radial distance in the node graph.
 */

export default class DotSphere {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    this.panelParams = {
      pointsNumber: 30000,
      landThreshold: 1.0,
      dotSize: 0.033,
      dotFalloff: 2.95,
      dotCoreBoost: 1.45,
      sizeVariation: 0.48,
      brightnessVariation: 0.13,
      edgeFadeStart: 0.13,
      edgeFadeEnd: 0.305,
      color: "#6d96cc",
      waveColor: "#ff0000",
      waveMaxRadius: 0.11,
      waveThickness: 0.025,
      waveSoftness: 0.02,
      waveIntensity: 8,
      waveFadeTail: 0.2,
      waveDuration: 1.2,
      waveEase: "power2.out",
      twinkleIntensity: 2.0,
      twinkleSpeed: 3.2,
      twinkleSharpness: 2.6,
    };

    this._dotColorUniform = uniform(new THREE.Color(this.panelParams.color));
    this._dotFalloffUniform = uniform(this.panelParams.dotFalloff);
    this._dotCoreBoostUniform = uniform(this.panelParams.dotCoreBoost);
    this._sizeVariationUniform = uniform(this.panelParams.sizeVariation);
    this._brightnessVariationUniform = uniform(this.panelParams.brightnessVariation);
    this._edgeFadeStartUniform = uniform(this.panelParams.edgeFadeStart);
    this._edgeFadeEndUniform = uniform(this.panelParams.edgeFadeEnd);

    this._twinkleIntensityUniform = uniform(this.panelParams.twinkleIntensity);
    this._twinkleSpeedUniform = uniform(this.panelParams.twinkleSpeed);
    this._twinkleSharpnessUniform = uniform(this.panelParams.twinkleSharpness);

    this._waves = {
      clickPos: Array.from({ length: MAX_WAVES }, () => uniform(new THREE.Vector3(0, 0, 1))),
      progress: Array.from({ length: MAX_WAVES }, () => uniform(0)),
      color: uniform(new THREE.Color(this.panelParams.waveColor)),
      maxRadius: uniform(this.panelParams.waveMaxRadius),
      thickness: uniform(this.panelParams.waveThickness),
      softness: uniform(this.panelParams.waveSoftness),
      intensity: uniform(this.panelParams.waveIntensity),
      fadeTail: uniform(this.panelParams.waveFadeTail),
    };

    this._slotTweens = new Array(MAX_WAVES).fill(null);
    this._nextSlot = 0;
    this._tmpLocal = new THREE.Vector3();

    this._landMaskPromise = this._loadLandMask("texture/earth.jpg");
    this.createDotSphere();
  }

  async _loadLandMask(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width: canvas.width, height: canvas.height };
  }

  _sampleIsLand(mask, u, v) {
    const x = Math.min(mask.width - 1, Math.max(0, Math.floor(u * mask.width)));

    const y = Math.min(
      mask.height - 1,
      Math.max(0, Math.floor(v * mask.height)),
    );

    const idx = (y * mask.width + x) * 4;

    const lum =
      (mask.data[idx] + mask.data[idx + 1] + mask.data[idx + 2]) / (3 * 255);

    return lum < this.panelParams.landThreshold;
  }

  _dispose() {
    this._slotTweens.forEach(t => t?.kill());
    this._slotTweens.fill(null);
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
  }

  /**
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} mask
   * @param {number} n
   * @returns {number[][]}
   */
  _getFibonacciLandPositions(mask, n) {
    const goldenRatio = (Math.sqrt(5) + 1) / 2;
    const positions = [];
  
    for (let i = 0; i < n; i++) {
      const prog = i / n;
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - 2 * prog);
  
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.sin(phi) * Math.sin(theta);
      const sz = Math.cos(phi);
  
      // 正确旋转：Z-up 数学球坐标 → Y-up Three.js 地理坐标
      // 0° 经线（格林尼治）落在 +Z（正面），90°E 落在 +X（右侧）
      const gx = sy;
      const gy = sz;
      const gz = sx;
  
      const lon = Math.atan2(gx, gz);   // 从 +Z 起算，向 +X 为正
      const lat = Math.asin(gy);
  
      const u = lon / (2 * Math.PI) + 0.5;
      const v = 0.5 - lat / Math.PI;
  
      if (this._sampleIsLand(mask, u, v)) {
        positions.push([gx, gy, gz]);
      }
    }
  
    return positions;
  }

  /**
   * @returns {THREE.MeshLambertNodeMaterial}
   */
  _createDotSphereMaterial() {
    // Stable per-instance hash in [0,1): fract(sin(idx * k)) is a classic GPU hash.
    const idxF = instanceIndex.toFloat();
    const hashSize = fract(sin(idxF.mul(12.9898)).mul(43758.5453));
    const hashBright = fract(sin(idxF.mul(78.233)).mul(43758.5453));
    const hashTwinkle = fract(sin(idxF.mul(19.1919)).mul(43758.5453));

    // Size jitter in [1 - v, 1 + v].
    const sizeFactor = float(1).add(hashSize.sub(0.5).mul(2).mul(this._sizeVariationUniform));
    // Brightness jitter in [1 - v, 1 + v].
    const brightFactor = float(1).add(hashBright.sub(0.5).mul(2).mul(this._brightnessVariationUniform));

    const uvCentered = uv().sub(vec2(0.5));
    // Normalize radial distance to [0, 1] at plane edge so falloff is size-independent.
    const d = saturate(length(uvCentered).mul(2));

    // Soft radial falloff: pow((1 - d), falloff). Larger falloff -> tighter core.
    const radial = pow(float(1).sub(d), this._dotFalloffUniform);
    // Extra bright core keeps the "glow" look without hard edges.
    const core = pow(float(1).sub(d), this._dotFalloffUniform.mul(3));
    const softDisk = saturate(radial.add(core.mul(this._dotCoreBoostUniform)));

    // Silhouette fade: dots whose normal faces away from the camera are dimmed out,
    // so the sphere's edge reads as a clean rim instead of a mushy halo of side-on planes.
    // Both vectors must live in the SAME space. positionViewDirection is in view space,
    // so we use normalView (world normal transformed by the view matrix) here.
    // Using normalWorld instead would make the mask rotate with the camera and hide the wrong dots.
    const facing = saturate(normalView.dot(positionViewDirection));
    const edgeMask = smoothstep(this._edgeFadeStartUniform, this._edgeFadeEndUniform, facing);
    const disk = softDisk.mul(edgeMask);

    const material = new THREE.MeshLambertNodeMaterial();
    material.side = THREE.DoubleSide;
    material.transparent = true;
    material.depthWrite = false;

    // Scale plane geometry per instance for size variation.
    material.positionNode = positionGeometry.mul(sizeFactor);

    const baseTerm = this._dotColorUniform.mul(disk).mul(brightFactor);

    // Per-instance phase + global time → sharp-ish sparkle on albedo/emissive; waves stay steady below.
    const twinklePhase = hashTwinkle.mul(float(Math.PI * 2));
    const twinkleWave = sin(time.mul(this._twinkleSpeedUniform).add(twinklePhase)).mul(0.5).add(0.5);
    const twinkleSparkle = pow(saturate(twinkleWave), this._twinkleSharpnessUniform);
    const twinkleMul = float(1).add(twinkleSparkle.mul(this._twinkleIntensityUniform));

    let ringAccum = float(0);
    for (let i = 0; i < MAX_WAVES; i++) {
      const prog = this._waves.progress[i];
      const clickPos = this._waves.clickPos[i];
      const waveDist = clickPos.sub(positionLocal).length();
      const waveRadius = this._waves.maxRadius.mul(prog);
      const waveInner = waveRadius.sub(this._waves.thickness);
      const ringOuter = smoothstep(waveRadius, waveRadius.sub(this._waves.softness), waveDist);
      const ringInner = smoothstep(waveInner.sub(this._waves.softness), waveInner, waveDist);
      const ring = ringOuter.mul(ringInner);
      const lifeFade = float(1).sub(
        smoothstep(float(1).sub(this._waves.fadeTail), float(1), prog),
      );
      const alive = prog.greaterThan(0).select(float(1), float(0));
      ringAccum = ringAccum.add(ring.mul(lifeFade).mul(alive));
    }

    const waveTerm = this._waves.color
      .mul(ringAccum)
      .mul(this._waves.intensity)
      .mul(disk);

    // Wave reads mainly as additive emissive so it stays visible on unlit dot faces (Lambert dims colorNode by N·L).
    const waveAlbedo = waveTerm.mul(float(0.35));

    const baseTwinkled = baseTerm.mul(twinkleMul);
    material.colorNode = baseTwinkled.add(waveAlbedo);
    material.opacityNode = disk;
    material.emissiveNode = baseTwinkled.add(waveTerm);

    return material;
  }

  /**
   * @param {THREE.InstancedMesh} instancedMesh
   * @param {number[][]} positions
   */
  _setInstanceMatricesOnSphere(instancedMesh, positions) {
    const count = positions.length;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < count; i++) {
      const [x, y, z] = positions[i];
      pos.set(x, y, z);
      normal.copy(pos).normalize();
      quat.setFromUnitVectors(zAxis, normal);
      matrix.compose(pos, quat, scale);
      instancedMesh.setMatrixAt(i, matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
  }

  async createDotSphere() {
    const mask = await this._landMaskPromise;
    this._dispose();
    const n = Math.max(1, Math.round(this.panelParams.pointsNumber));
    this.panelParams.pointsNumber = n;

    const positions = this._getFibonacciLandPositions(mask, n);
    if (positions.length === 0) return;

    const material = this._createDotSphereMaterial();
    const size = Math.max(0.001, this.panelParams.dotSize);
    this.panelParams.dotSize = size;

    const geometry = new THREE.PlaneGeometry(size, size);
    const dots = new THREE.InstancedMesh(geometry, material, positions.length);

    this._setInstanceMatricesOnSphere(dots, positions);

    this.geometry = geometry;
    this.material = material;
    this.mesh = dots;
    this.scene.add(dots);
  }

  /**
   * @param {THREE.Vector3} worldPoint
   * @param {number|object} [durationOrOpts]
   * @param {string} [ease]
   */
  triggerWave(worldPoint, durationOrOpts, ease) {
    if (!this.mesh) return;

    let duration, easeVal, onComplete;
    if (typeof durationOrOpts === "object" && durationOrOpts !== null) {
      ({ duration, ease: easeVal, onComplete } = durationOrOpts);
    } else {
      duration = durationOrOpts;
      easeVal = ease;
    }

    this._tmpLocal.copy(worldPoint);
    this.mesh.worldToLocal(this._tmpLocal);

    const slot = this._nextSlot;
    this._nextSlot = (this._nextSlot + 1) % MAX_WAVES;

    this._slotTweens[slot]?.kill();

    this._waves.clickPos[slot].value.copy(this._tmpLocal);
    this._waves.progress[slot].value = 0;

    this._slotTweens[slot] = gsap.to(this._waves.progress[slot], {
      value: 1,
      duration: duration ?? this.panelParams.waveDuration,
      ease: easeVal ?? this.panelParams.waveEase,
      onComplete: () => {
        this._waves.progress[slot].value = 0;
        this._slotTweens[slot] = null;
        onComplete?.();
      },
    });
  }

  _applyDotColor() {
    this._dotColorUniform.value.set(this.panelParams.color);
  }

  _applyDotAppearance() {
    this._dotFalloffUniform.value = this.panelParams.dotFalloff;
    this._dotCoreBoostUniform.value = this.panelParams.dotCoreBoost;
    this._sizeVariationUniform.value = this.panelParams.sizeVariation;
    this._brightnessVariationUniform.value = this.panelParams.brightnessVariation;
    this._edgeFadeStartUniform.value = this.panelParams.edgeFadeStart;
    this._edgeFadeEndUniform.value = this.panelParams.edgeFadeEnd;
  }

  _applyWave() {
    this._waves.color.value.set(this.panelParams.waveColor);
    this._waves.maxRadius.value = this.panelParams.waveMaxRadius;
    this._waves.thickness.value = this.panelParams.waveThickness;
    this._waves.softness.value = this.panelParams.waveSoftness;
    this._waves.intensity.value = this.panelParams.waveIntensity;
    this._waves.fadeTail.value = this.panelParams.waveFadeTail;
  }

  _applyTwinkle() {
    this._twinkleIntensityUniform.value = this.panelParams.twinkleIntensity;
    this._twinkleSpeedUniform.value = this.panelParams.twinkleSpeed;
    this._twinkleSharpnessUniform.value = this.panelParams.twinkleSharpness;
  }

  /**

     * @param {import('../utils/debug.js').default} debug

     */

  debuggerInit(debug) {
    if (!debug.active) return;

    const folder = debug.addFolder({ title: "Dot sphere" });

    if (!folder) return;

    folder
      .addBinding(this.panelParams, "color", { view: "color" })
      .on("change", () => {
        this._applyDotColor();
      });

    folder
      .addBinding(this.panelParams, "pointsNumber", {
        min: 100,

        max: 30000,

        step: 100,
      })
      .on("change", () => {
        this.createDotSphere();
      });

    folder
      .addBinding(this.panelParams, "landThreshold", {
        min: 0,

        max: 1,

        step: 0.01,
      })
      .on("change", () => {
        this.createDotSphere();
      });

    folder
      .addBinding(this.panelParams, "dotSize", {
        min: 0.002,

        max: 0.08,

        step: 0.001,
      })
      .on("change", () => {
        this.createDotSphere();
      });

    folder
      .addBinding(this.panelParams, "dotFalloff", { min: 0.5, max: 8, step: 0.05 })
      .on("change", () => this._applyDotAppearance());

    folder
      .addBinding(this.panelParams, "dotCoreBoost", { min: 0, max: 4, step: 0.05 })
      .on("change", () => this._applyDotAppearance());

    folder
      .addBinding(this.panelParams, "sizeVariation", { min: 0, max: 0.8, step: 0.01 })
      .on("change", () => this._applyDotAppearance());

    folder
      .addBinding(this.panelParams, "brightnessVariation", { min: 0, max: 0.8, step: 0.01 })
      .on("change", () => this._applyDotAppearance());

    folder
      .addBinding(this.panelParams, "edgeFadeStart", { min: 0, max: 1, step: 0.005 })
      .on("change", () => this._applyDotAppearance());

    folder
      .addBinding(this.panelParams, "edgeFadeEnd", { min: 0, max: 1, step: 0.005 })
      .on("change", () => this._applyDotAppearance());

    const twinkleFolder = debug.addFolder({ title: "Twinkle" });
    if (twinkleFolder) {
      twinkleFolder
        .addBinding(this.panelParams, "twinkleIntensity", {
          label: "intensity",
          min: 0,
          max: 2,
          step: 0.05,
        })
        .on("change", () => this._applyTwinkle());
      twinkleFolder
        .addBinding(this.panelParams, "twinkleSpeed", { label: "speed", min: 0.2, max: 12, step: 0.1 })
        .on("change", () => this._applyTwinkle());
      twinkleFolder
        .addBinding(this.panelParams, "twinkleSharpness", {
          label: "sharpness",
          min: 1,
          max: 8,
          step: 0.1,
        })
        .on("change", () => this._applyTwinkle());
    }

    const waveFolder = debug.addFolder({ title: "Click wave" });
    if (!waveFolder) return;

    waveFolder
      .addBinding(this.panelParams, "waveColor", { label: "color", view: "color" })
      .on("change", () => this._applyWave());

    waveFolder
      .addBinding(this.panelParams, "waveMaxRadius", {
        label: "maxRadius",
        min: 0.05,
        max: 1.5,
        step: 0.01,
      })
      .on("change", () => this._applyWave());

    waveFolder
      .addBinding(this.panelParams, "waveThickness", {
        label: "thickness",
        min: 0.005,
        max: 0.5,
        step: 0.005,
      })
      .on("change", () => this._applyWave());

    waveFolder
      .addBinding(this.panelParams, "waveSoftness", {
        label: "softness",
        min: 0,
        max: 0.1,
        step: 0.001,
      })
      .on("change", () => this._applyWave());

    waveFolder
      .addBinding(this.panelParams, "waveIntensity", {
        label: "intensity",
        min: 0,
        max: 20,
        step: 0.1,
      })
      .on("change", () => this._applyWave());

    waveFolder
      .addBinding(this.panelParams, "waveFadeTail", {
        label: "fadeTail",
        min: 0,
        max: 0.8,
        step: 0.01,
      })
      .on("change", () => this._applyWave());

    waveFolder.addBinding(this.panelParams, "waveDuration", {
      label: "duration",
      min: 0.1,
      max: 4,
      step: 0.05,
    });

    waveFolder.addBinding(this.panelParams, "waveEase", {
      label: "ease",
      options: {
        "power1.out": "power1.out",
        "power2.out": "power2.out",
        "power3.out": "power3.out",
        "expo.out": "expo.out",
        "sine.out": "sine.out",
        none: "none",
      },
    });

    waveFolder.addButton({ title: "Trigger now" }).on("click", () => {
      this.triggerWave(new THREE.Vector3(0, 0, 1));
    });
  }

  dispose() {
    this._dispose();
  }
}
