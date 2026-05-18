import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import { lngLatToUnitVec3 } from '../utils/geo.js';

export default class SpokeController {
  /**
   * @param {{
   *   dotSphere: import('./dotSphere.js').default,
   *   flyLines: import('./flyLines.js').default,
   *   data: { hub:{lng:number,lat:number}, targets:Array<{id?:string,lng:number,lat:number}> }
   * }} deps
   */
  constructor({ dotSphere, flyLines, data }) {
    this.dotSphere = dotSphere;
    this.flyLines = flyLines;
    this.data = data;

    this.params = {
      hubDelay: 0.0,
      stagger: 0.25,
      loop: false,
      loopGap: 2.0,
    };

    this._timeline = null;
    this._hubVec = new THREE.Vector3();
  }

  play() {
    this._timeline?.kill();
    this.flyLines.clear();

    const { hub, targets } = this.data;
    lngLatToUnitVec3(hub.lng, hub.lat, this._hubVec);

    this.dotSphere.triggerWave(this._hubVec.clone());

    const tl = gsap.timeline();
    const growth = this.flyLines.params.growth;

    targets.forEach((t, i) => {
      const tVec = lngLatToUnitVec3(t.lng, t.lat, new THREE.Vector3());
      const startAt = this.params.hubDelay + i * this.params.stagger;

      tl.call(() => {
        const line = this.flyLines.add(this._hubVec.clone(), tVec);
        line.play({
          onArrive: () => this.dotSphere.triggerWave(tVec.clone()),
        });
      }, null, startAt);
    });

    if (this.params.loop) {
      const total =
        this.params.hubDelay +
        (targets.length - 1) * this.params.stagger +
        growth +
        this.params.loopGap;
      tl.call(() => this.play(), null, total);
    }

    this._timeline = tl;
  }

  stop() {
    this._timeline?.kill();
    this._timeline = null;
  }

  dispose() {
    this.stop();
  }

  /**
   * @param {import('../utils/debug.js').default} debug
   */
  debuggerInit(debug) {
    if (!debug.active) return;
    const f = debug.addFolder({ title: 'Spokes' });
    if (!f) return;
    f.addBinding(this.params, 'hubDelay', { min: 0, max: 2, step: 0.05 });
    f.addBinding(this.params, 'stagger', { min: 0, max: 1, step: 0.05 });
    f.addBinding(this.params, 'loop');
    f.addBinding(this.params, 'loopGap', { min: 0, max: 5, step: 0.1 });
    f.addButton({ title: 'Play' }).on('click', () => this.play());
    f.addButton({ title: 'Stop' }).on('click', () => { this.stop(); this.flyLines.clear(); });
  }
}
