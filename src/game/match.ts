import type { GameItem } from './types'

/** Returns true if QR/barcode payload matches this booth item. */
export function payloadMatchesItem(raw: string, item: GameItem): boolean {
  const t = raw.trim()
  if (!t) return false

  if (t === item.customId || t === item._id) return true
  if (t.toLowerCase() === item.name.trim().toLowerCase()) return true

  try {
    const u = new URL(t)
    const id =
      u.searchParams.get('customId') ??
      u.searchParams.get('id') ??
      u.searchParams.get('item')
    if (id && (id === item.customId || id === item._id)) return true
  } catch {
    /* not a URL */
  }

  try {
    const o = JSON.parse(t) as { customId?: string; id?: string; _id?: string }
    if (o.customId === item.customId) return true
    if (o.id === item._id || o._id === item._id) return true
  } catch {
    /* not JSON */
  }

  return false
}
