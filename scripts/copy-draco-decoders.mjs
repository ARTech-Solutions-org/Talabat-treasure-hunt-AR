/**
 * Copies Draco WASM/JS decoders from three.js into public/ so GLTFLoader + DRACOLoader work at runtime.
 * Run automatically via `prebuild` (see package.json).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcDir = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf')
const destDir = path.join(root, 'public', 'draco', 'gltf')

if (!fs.existsSync(srcDir)) {
  console.warn('[copy-draco] Skipping: three draco folder not found (npm install first).')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
for (const name of fs.readdirSync(srcDir)) {
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name))
}
console.log('[copy-draco] Copied Draco decoders to public/draco/gltf')
