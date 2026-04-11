import type { Round } from './types'
import { ROUND_URL } from './config'

export async function fetchRound(token: string | null): Promise<Round> {
  const url = new URL(ROUND_URL, window.location.origin)
  if (token) url.searchParams.set('token', token)

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Round failed (${res.status})`)
  }

  const json: unknown = await res.json()
  const data = json as { data?: Round }
  if (!data?.data) throw new Error('Invalid round response')
  return data.data
}
