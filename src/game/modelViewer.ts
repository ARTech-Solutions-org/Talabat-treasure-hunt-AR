import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { FALLBACK_MODEL_URL } from './config'

export class ModelViewer {
  private readonly container: HTMLElement
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private controls: OrbitControls | null = null
  private mixer: THREE.AnimationMixer | null = null
  private raf = 0
  private clock = new THREE.Clock()

  constructor(container: HTMLElement) {
    this.container = container
  }

  async showModel(modelUrl: string): Promise<void> {
    this.dispose()

    const w = this.container.clientWidth || 320
    const h = this.container.clientHeight || 280

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1117)

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    camera.position.set(0, 1.2, 2.8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    this.container.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(2, 4, 3)
    scene.add(dir)

    const loader = new GLTFLoader()
    let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>
    try {
      gltf = await loader.loadAsync(modelUrl)
    } catch {
      gltf = await loader.loadAsync(FALLBACK_MODEL_URL)
    }
    const root = gltf.scene
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const scale = 1.6 / maxDim
    root.scale.setScalar(scale)
    box.setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.sub(center)

    scene.add(root)

    if (gltf.animations?.length) {
      const mixer = new THREE.AnimationMixer(root)
      gltf.animations.forEach((clip: THREE.AnimationClip) =>
        mixer.clipAction(clip).play(),
      )
      this.mixer = mixer
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.4, 0)

    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.controls = controls

    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      this.mixer?.update(dt)
      this.controls?.update()
      if (this.scene && this.camera) renderer.render(this.scene, this.camera)
    }
    loop()
  }

  resize(): void {
    if (!this.renderer || !this.camera) return
    const w = this.container.clientWidth || 320
    const h = this.container.clientHeight || 280
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.mixer = null
    this.controls?.dispose()
    this.controls = null
    if (this.renderer) {
      this.container.removeChild(this.renderer.domElement)
      this.renderer.dispose()
    }
    this.renderer = null
    this.scene = null
    this.camera = null
  }
}
