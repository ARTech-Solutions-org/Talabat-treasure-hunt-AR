import type { RegisterSuccess } from './types'
import { REGISTER_URL } from './config'

export async function registerPlayer(name: string): Promise<RegisterSuccess> {
  const res = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })

  const rawText = await res.text()
  let json: unknown = {}
  if (rawText) {
    try {
      json = JSON.parse(rawText) as unknown
    } catch {
      throw new Error(`Registration failed (${res.status}). ${rawText.slice(0, 200)}`)
    }
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string } | string; message?: string })
    const piece =
      (typeof err.error === 'object' ? err.error?.message : err.error) ?? err.message
    throw new Error(piece ?? `Registration failed (${res.status})`)
  }

  const d = (json as { data?: Record<string, unknown> }).data
  if (!d || typeof d.playToken !== 'string' || !d.playToken) {
    throw new Error('Registration: server did not return a play token.')
  }
  return {
    username: typeof d.username === 'string' ? d.username : name,
    playToken: d.playToken,
  }
}
