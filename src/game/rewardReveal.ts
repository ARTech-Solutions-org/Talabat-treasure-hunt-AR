import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

import { FALLBACK_MODEL_URL } from './config'
import type { QrTrackInfo } from './qrScan'
import { dist2D, mapQrCornersToContainer } from './videoProjection'

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Extra scale on top of QR-fitted size (slightly larger on-screen model). */
const MODEL_SCALE_BOOST = 1.28

/**
 * Reward GLB / GLTF / STL anchored to the booth QR; natural materials and idle rotation only.
 */
export class RewardChestReveal {
  private readonly wrap: HTMLElement
  private readonly videoEl: HTMLVideoElement
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private trackingGroup: THREE.Group | null = null
  private modelRoot: THREE.Group | null = null
  private mixer: THREE.AnimationMixer | null = null
  private raf = 0
  private clock = new THREE.Clock()
  private revealStart = 0
  private visible = true
  private trackingCorners: { x: number; y: number }[] | null = null
  private lastQrWorldW: number | null = null

  constructor(wrap: HTMLElement, video: HTMLVideoElement) {
    this.wrap = wrap
    this.videoEl = video
  }

  setTracking(info: QrTrackInfo | null): void {
    if (!info) return
    this.trackingCorners = mapQrCornersToContainer(this.videoEl, this.wrap, info.location)
  }

  private async loadMeshFromUrl(primaryUrl: string): Promise<{
    object: THREE.Object3D
    clips: THREE.AnimationClip[]
  }> {
    const gltfLoader = new GLTFLoader()
    const stlLoader = new STLLoader()

    const loadStl = async (url: string): Promise<{ object: THREE.Object3D; clips: THREE.AnimationClip[] }> => {
      const geometry = await stlLoader.loadAsync(url)
      geometry.computeVertexNormals()
      geometry.center()
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0xc8c8c8,
          metalness: 0.35,
          roughness: 0.45,
        }),
      )
      const g = new THREE.Group()
      g.add(mesh)
      return { object: g, clips: [] }
    }

    if (primaryUrl.toLowerCase().endsWith('.stl')) {
      try {
        return await loadStl(primaryUrl)
      } catch {
        const gltf = await gltfLoader.loadAsync(FALLBACK_MODEL_URL)
        return { object: gltf.scene, clips: gltf.animations }
      }
    }

    try {
      const gltf = await gltfLoader.loadAsync(primaryUrl)
      return { object: gltf.scene, clips: gltf.animations }
    } catch {
      const stlUrl = primaryUrl.replace(/\.glb$/i, '.stl').replace(/\.gltf$/i, '.stl')
      if (stlUrl !== primaryUrl) {
        try {
          return await loadStl(stlUrl)
        } catch {
          /* use duck */
        }
      }
      const gltf = await gltfLoader.loadAsync(FALLBACK_MODEL_URL)
      return { object: gltf.scene, clips: gltf.animations }
    }
  }

  private updateQrAnchor(): void {
    if (!this.trackingGroup || !this.camera) return
    const corners = this.trackingCorners
    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240
    if (!corners || corners.length < 4) {
      this.trackingGroup.visible = false
      this.lastQrWorldW = null
      return
    }

    const [tl, tr, br, bl] = corners
    const cx = (tl.x + tr.x + br.x + bl.x) / 4
    const cy = (tl.y + tr.y + br.y + bl.y) / 4
    const wPx = (dist2D(tl, tr) + dist2D(bl, br)) / 2
    const angle = Math.atan2(tr.y - tl.y, tr.x - tl.x)

    const ndcX = (cx / cw) * 2 - 1
    const ndcY = -((cy / ch) * 2 - 1)

    const cam = this.camera
    const dist = 4
    const vFOV = (cam.fov * Math.PI) / 180
    const halfH = Math.tan(vFOV / 2) * dist
    const halfW = halfH * cam.aspect
    const wx = ndcX * halfW
    const wy = ndcY * halfH

    this.trackingGroup.position.set(wx, wy, 0)
    this.trackingGroup.rotation.set(0, 0, -angle)

    const worldWide = 2 * halfW
    const qrWorldW = (wPx / Math.max(1, cw)) * worldWide
    this.lastQrWorldW = Math.max(0.08, qrWorldW)
    this.trackingGroup.visible = true
  }

  async loadModel(modelUrl: string): Promise<void> {
    this.disposeRendererOnly()

    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240
    const aspect = cw / ch

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100)
    camera.position.set(0, 0, 4)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(cw, ch)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.domElement.className = 'reward-canvas'
    this.wrap.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(2.2, 4.2, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xfff5f0, 0.45)
    fill.position.set(-2, 1.5, 2)
    scene.add(fill)

    const trackingGroup = new THREE.Group()
    scene.add(trackingGroup)

    const { object: model, clips } = await this.loadMeshFromUrl(modelUrl)

    const modelRoot = new THREE.Group()
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const norm = 1.4 / maxDim
    model.scale.setScalar(norm)
    box.setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    model.position.sub(c)
    modelRoot.add(model)

    if (clips.length) {
      const mixer = new THREE.AnimationMixer(model)
      clips.forEach((clip: THREE.AnimationClip) => mixer.clipAction(clip).play())
      this.mixer = mixer
    }

    modelRoot.scale.setScalar(0.001)
    trackingGroup.add(modelRoot)

    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.trackingGroup = trackingGroup
    this.modelRoot = modelRoot
    this.trackingCorners = null
    this.visible = true
    this.revealStart = performance.now()

    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      const now = performance.now()
      const elapsed = (now - this.revealStart) / 1000
      this.mixer?.update(dt)
      this.updateQrAnchor()
      this.updateReveal(elapsed)
      if (this.scene && this.camera && this.renderer) {
        this.renderer.render(this.scene, this.camera)
      }
    }
    loop()
  }

  private updateReveal(elapsed: number): void {
    if (!this.modelRoot) return
    const revealDur = 0.95
    const t = Math.min(1, elapsed / revealDur)
    const s = easeOutBack(t)
    const qrW = this.lastQrWorldW
    const unit = 1.4
    if (qrW != null && qrW > 1e-6) {
      this.modelRoot.scale.setScalar((qrW / unit) * s * MODEL_SCALE_BOOST)
    } else {
      const base = Math.min(this.wrap.clientWidth, this.wrap.clientHeight) * 0.0026
      this.modelRoot.scale.setScalar(base * s * MODEL_SCALE_BOOST)
    }
    if (t < 1) {
      this.modelRoot.rotation.y = (1 - t) * Math.PI * 0.65 + Math.sin(elapsed * 1.2) * 0.06
    } else {
      this.modelRoot.rotation.y = elapsed * 0.42
    }
    this.modelRoot.visible = this.visible && (this.trackingGroup?.visible ?? true)
  }

  resize(): void {
    if (!this.renderer || !this.camera) return
    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240
    this.camera.aspect = cw / ch
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(cw, ch)
  }

  hideModel(): void {
    this.visible = false
    if (this.modelRoot) this.modelRoot.visible = false
  }

  showModel(): void {
    this.visible = true
    if (this.modelRoot) this.modelRoot.visible = true
  }

  private disposeRendererOnly(): void {
    cancelAnimationFrame(this.raf)
    this.mixer = null
    if (this.renderer) {
      const el = this.renderer.domElement
      if (el.parentNode) el.parentNode.removeChild(el)
      this.renderer.dispose()
    }
    this.renderer = null
    this.scene = null
    this.camera = null
    this.trackingGroup = null
    this.modelRoot = null
    this.trackingCorners = null
    this.lastQrWorldW = null
  }

  dispose(): void {
    this.disposeRendererOnly()
  }
}
