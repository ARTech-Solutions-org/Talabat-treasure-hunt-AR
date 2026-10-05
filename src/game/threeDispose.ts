import * as THREE from 'three'

/** Dispose GPU resources held by a scene graph (geometries, materials, textures). */
export function disposeObject3DDeep(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      obj.geometry?.dispose()
      const m = obj.material
      if (Array.isArray(m)) m.forEach(disposeMaterialDeep)
      else if (m) disposeMaterialDeep(m)
    }
  })
}

function disposeMaterialDeep(material: THREE.Material): void {
  material.dispose()
  for (const key of Object.keys(material)) {
    const v = (material as unknown as Record<string, unknown>)[key]
    if (v instanceof THREE.Texture) v.dispose()
  }
}
