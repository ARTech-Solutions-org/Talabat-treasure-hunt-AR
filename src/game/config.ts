/**
 * Empty = same-origin `/api/...` (Vercel rewrite + Vite proxy in dev) — avoids backend CORS.
 * Set `VITE_API_BASE` only if you call the backend directly and it sends CORS headers.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

const apiRoot = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api` : '/api'

export const ROUND_URL = `${apiRoot}/game/round`
export const COMPLETE_URL = `${apiRoot}/game/complete`

/** Public GLB used when `/models/<customId>.glb` is missing (dev / placeholder). */
export const FALLBACK_MODEL_URL =
  'https://threejs.org/examples/models/gltf/Duck/glTF-Binary/Duck.glb'
