import * as THREE from "three/webgpu";

/**
 * Handles pointerdown events on the canvas, raycasts against an invisible
 * unit-sphere proxy, and forwards the hit point to DotSphere.triggerWave().
 */
export default class ClickWave {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   camera: THREE.Camera,
   *   scene: THREE.Scene,
   *   dotSphere: import('./dotSphere.js').default,
   * }} deps
   */
  constructor({ canvas, camera, scene, dotSphere }) {
    this.canvas = canvas;
    this.camera = camera;
    this.scene = scene;
    this.dotSphere = dotSphere;

    this._hitGeometry = new THREE.SphereGeometry(1, 32, 32);
    this._hitMaterial = new THREE.MeshBasicMaterial();
    this._hitMesh = new THREE.Mesh(this._hitGeometry, this._hitMaterial);
    this._hitMesh.visible = false;
    this._hitMesh.raycast = THREE.Mesh.prototype.raycast;
    scene.add(this._hitMesh);

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this._onPointerDown = this._onPointerDown.bind(this);
    canvas.addEventListener("pointerdown", this._onPointerDown);
  }

  /** @param {PointerEvent} e */
  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._raycaster.intersectObject(this._hitMesh, false)[0];
    if (!hit) return;
    this.dotSphere.triggerWave(hit.point);
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.scene.remove(this._hitMesh);
    this._hitGeometry.dispose();
    this._hitMaterial.dispose();
    this._hitMesh = null;
  }
}
