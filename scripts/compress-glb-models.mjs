/**
 * Deploy step: Draco-compress all GLBs under public/models (in place, with .bak backup).
 * Requires: npm install (devDependency @gltf-transform/cli).
 *
 * Usage: npm run compress-models
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const modelsDir = path.join(root, 'public', 'models')

const cli = path.join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js')
if (!fs.existsSync(cli)) {
  console.error('Missing @gltf-transform/cli. Run: npm install')
  process.exit(1)
}

if (!fs.existsSync(modelsDir)) {
  console.error('Missing public/models')
  process.exit(1)
}

const files = fs.readdirSync(modelsDir).filter((f) => f.toLowerCase().endsWith('.glb'))
if (!files.length) {
  console.log('No .glb files in public/models')
  process.exit(0)
}

for (const file of files) {
  const input = path.join(modelsDir, file)
  const tmp = path.join(modelsDir, `${file}.draco.tmp`)
  const bak = path.join(modelsDir, `${file}.bak`)
  console.log(`[compress-models] Draco: ${file}`)
  // --decode-speed 10 favors faster decode on mobile (slightly larger files).
  execFileSync(process.execPath, [cli, 'draco', input, tmp, '--decode-speed', '10'], {
    stdio: 'inherit',
  })
  fs.copyFileSync(input, bak)
  fs.renameSync(tmp, input)
}
console.log('[compress-models] Done. Originals saved as *.glb.bak (remove backups when satisfied).')
