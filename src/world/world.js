import InnerPhysicalSphere from './innerPhysicalSphere.js'
import DotSphere from './dotSphere.js'
import BorderDots from './borderDots.js'
import ClickWave from './clickWave.js'
import FlyLines from './flyLines.js'
import SpokeController from './spokeController.js'
import EnergyShield from './energyShield.js'

const SAMPLE_DATA = {
    hub: { lng: 116.4, lat: 39.9 },
    targets: [
        // 构建更多的大量目标城市节点
        { id: 'ny',  lng: -74.0,  lat: 40.7 },
        { id: 'lon', lng:  -0.1,  lat: 51.5 },
        { id: 'tok', lng: 139.7,  lat: 35.7 },
        { id: 'sfo', lng: -122.4, lat: 37.8 },
        { id: 'syd', lng: 151.2,  lat: -33.9 },
        { id: 'par', lng:   2.35, lat: 48.86 },
        { id: 'ber', lng:  13.4,  lat: 52.52 },
        { id: 'dub', lng:  55.27, lat: 25.2 },
        { id: 'jnb', lng:  28.0,  lat: -26.2 },
        { id: 'sin', lng: 103.8,  lat: 1.35 },
        { id: 'gru', lng: -46.6,  lat: -23.5 },
        { id: 'mex', lng: -99.1,  lat: 19.4 },
        { id: 'bom', lng:  72.8,  lat: 19.08 },
    ],
}

export default class World {
    /**
     * @param {import('../app/Experience.js').default} experience
     */
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.dotSphere = new DotSphere(this.scene)
        this.borderDots = new BorderDots(this.scene)
        this.innerPhysicalSphere = new InnerPhysicalSphere(this.scene)
        this.energyShield = new EnergyShield(this.scene)
        this.flyLines = new FlyLines(this.scene)

        this.clickWave = new ClickWave({
            canvas: experience.canvas,
            camera: experience.worldCamera.instance,
            scene: this.scene,
            dotSphere: this.dotSphere,
            borderDots: this.borderDots,
        })

        this.spokes = new SpokeController({
            dotSphere: this.dotSphere,
            flyLines: this.flyLines,
            data: SAMPLE_DATA,
        })
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        this.dotSphere.debuggerInit(debug)
        this.borderDots.debuggerInit(debug)
        this.innerPhysicalSphere.debuggerInit(debug)
        this.energyShield.debuggerInit(debug)
        this.flyLines.debuggerInit(debug)
        this.spokes.debuggerInit(debug)
    }

    update(delta = 0) {
        this.energyShield.update(delta)
        this.flyLines.update(delta)
        this.borderDots.update(delta)
    }

    dispose() {
        this.clickWave.dispose()
        this.innerPhysicalSphere.dispose()
        this.energyShield.dispose()
        this.dotSphere.dispose()
        this.borderDots.dispose()
        this.flyLines.dispose()
        this.spokes.dispose()
    }
}
