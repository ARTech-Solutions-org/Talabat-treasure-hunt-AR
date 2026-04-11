import type { CompleteSuccess } from './types'
import { COMPLETE_URL } from './config'

function parseCompleteJson(json: unknown): CompleteSuccess | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>
    if (
      typeof d.username === 'string' &&
      typeof d.finishTime === 'string' &&
      typeof d.completionDuration === 'number'
    ) {
      return {
        username: d.username,
        finishTime: d.finishTime,
        completionDuration: d.completionDuration,
      }
    }
  }
  /* Some APIs return fields at top level */
  if (
    typeof o.username === 'string' &&
    typeof o.finishTime === 'string' &&
    typeof o.completionDuration === 'number'
  ) {
    return {
      username: o.username,
      finishTime: o.finishTime,
      completionDuration: o.completionDuration,
    }
  }
  return null
}

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

  const rawText = await res.text()
  let json: unknown = {}
  if (rawText) {
    try {
      json = JSON.parse(rawText) as unknown
    } catch {
      throw new Error(
        `Score submit failed (${res.status}). Server did not return JSON. ${rawText.slice(0, 200)}`,
      )
    }
  }

  if (!res.ok) {
    const errObj = json as {
      message?: string
      error?: string
      errors?: unknown
    }
    const piece =
      errObj.message ??
      errObj.error ??
      (typeof errObj.errors === 'string' ? errObj.errors : undefined)
    throw new Error(
      piece ??
        `Score submit failed (${res.status}). ${rawText ? rawText.slice(0, 300) : 'Empty response'}`,
    )
  }

  const parsed = parseCompleteJson(json)
  if (!parsed) {
    throw new Error(
      `Score submit: unexpected response shape. Expected { data: { username, finishTime, completionDuration } }. Got: ${rawText.slice(0, 400)}`,
    )
  }
  return parsed
}
