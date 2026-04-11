import type { CompleteSuccess } from './types'
import { COMPLETE_URL } from './config'

export async function postComplete(
  token: string,
  durationMs: number,
): Promise<CompleteSuccess> {
  const res = await fetch(COMPLETE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, durationMs: Math.round(durationMs) }),
  })

  const json: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = json as { message?: string; error?: string }
    throw new Error(err.message ?? err.error ?? `Complete failed (${res.status})`)
  }

  const body = json as { data?: CompleteSuccess }
  if (!body.data) throw new Error('Invalid complete response')
  return body.data
}
