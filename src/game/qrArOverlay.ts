import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { FALLBACK_MODEL_URL } from './config'
import { mapImagePointToVideoElement } from './videoMap'

export type QrCorners = {
  topLeftCorner: { x: number; y: number }
  topRightCorner: { x: number; y: number }
  bottomLeftCorner: { x: number; y: number }
  bottomRightCorner: { x: number; y: number }
}

/**
 * Transparent Three.js layer over the video; places a GLB roughly on the QR quad.
 */
export class QrArOverlay {
  private readonly wrap: HTMLElement
  private readonly video: HTMLVideoElement
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.OrthographicCamera | null = null
  private rootGroup: THREE.Group | null = null
  private mixer: THREE.AnimationMixer | null = null
  private raf = 0
  private clock = new THREE.Clock()
  private lastCorners: QrCorners | null = null
  private visible = false

  constructor(wrap: HTMLElement, video: HTMLVideoElement) {
    this.wrap = wrap
    this.video = video
  }

  async loadModel(modelUrl: string): Promise<void> {
    this.disposeRendererOnly()

    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(
      cw / -2,
      cw / 2,
      ch / 2,
      ch / -2,
      0.1,
      500,
    )
    camera.position.z = 100

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(cw, ch)
    renderer.domElement.className = 'qr-ar-canvas'
    this.wrap.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(0.5, 1, 1.5)
    scene.add(dir)

    const loader = new GLTFLoader()
    let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>
    try {
      gltf = await loader.loadAsync(modelUrl)
    } catch {
      gltf = await loader.loadAsync(FALLBACK_MODEL_URL)
    }

    const root = new THREE.Group()
    const model = gltf.scene
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const norm = 1 / maxDim
    model.scale.setScalar(norm)
    box.setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    model.position.sub(c)
    root.add(model)

    if (gltf.animations?.length) {
      const mixer = new THREE.AnimationMixer(model)
      gltf.animations.forEach((clip: THREE.AnimationClip) =>
        mixer.clipAction(clip).play(),
      )
      this.mixer = mixer
    }

    scene.add(root)
    this.rootGroup = root
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.visible = true

    this.showDefaultPose()

    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      this.mixer?.update(dt)
      if (this.lastCorners) this.applyPose(this.lastCorners)
      else if (this.rootGroup) this.showDefaultPose()
      if (this.scene && this.camera && this.renderer) {
        this.renderer.render(this.scene, this.camera)
      }
    }
    loop()
  }

  /** Centered model when QR corners are not available yet. */
  private showDefaultPose(): void {
    if (!this.rootGroup) return
    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240
    const s = Math.min(cw, ch) * 0.38
    this.rootGroup.position.set(0, 0, 0)
    this.rootGroup.rotation.set(0, 0, 0)
    this.rootGroup.scale.setScalar(s)
    this.rootGroup.visible = this.visible
  }

  setTracking(corners: QrCorners | null): void {
    if (corners) {
      this.lastCorners = corners
      if (this.rootGroup) this.rootGroup.visible = this.visible
    }
    /* Intentionally do not hide on null — jsQR/native often miss a frame; keeps 3D stable. */
  }

  private applyPose(loc: QrCorners): void {
    if (!this.rootGroup || !this.camera) return

    const tl = mapImagePointToVideoElement(this.video, loc.topLeftCorner.x, loc.topLeftCorner.y)
    const tr = mapImagePointToVideoElement(this.video, loc.topRightCorner.x, loc.topRightCorner.y)
    const br = mapImagePointToVideoElement(this.video, loc.bottomRightCorner.x, loc.bottomRightCorner.y)
    const bl = mapImagePointToVideoElement(this.video, loc.bottomLeftCorner.x, loc.bottomLeftCorner.y)

    const cx = (tl.x + tr.x + br.x + bl.x) / 4
    const cy = (tl.y + tr.y + br.y + bl.y) / 4

    const cw = this.wrap.clientWidth
    const ch = this.wrap.clientHeight
    const wx = cx - cw / 2
    const wy = -(cy - ch / 2)

    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y)
    const sideW = Math.hypot(bl.x - tl.x, bl.y - tl.y)
    const qrPx = Math.max(topW, sideW, 48)

    const angle = Math.atan2(-(tr.y - tl.y), tr.x - tl.x)

    const worldScale = THREE.MathUtils.clamp(
      qrPx * 0.42,
      36,
      Math.min(cw, ch) * 0.5,
    )
    this.rootGroup.position.set(wx, wy, 0)
    this.rootGroup.rotation.set(0, 0, angle)
    this.rootGroup.scale.setScalar(worldScale)

    this.rootGroup.visible = this.visible
  }

  resize(): void {
    if (!this.renderer || !this.camera) return
    const cw = this.wrap.clientWidth || 320
    const ch = this.wrap.clientHeight || 240
    this.camera.left = cw / -2
    this.camera.right = cw / 2
    this.camera.top = ch / 2
    this.camera.bottom = ch / -2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(cw, ch)
  }

  hideModel(): void {
    this.visible = false
    if (this.rootGroup) this.rootGroup.visible = false
  }

  showModel(): void {
    this.visible = true
    if (this.rootGroup) this.rootGroup.visible = true
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
    this.rootGroup = null
  }

  dispose(): void {
    this.lastCorners = null
    this.disposeRendererOnly()
  }
}
