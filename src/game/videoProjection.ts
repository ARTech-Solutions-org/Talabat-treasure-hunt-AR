import type { QrTrackInfo } from './qrScan'

/**
 * Map points from video intrinsic pixel space to coordinates local to `container`
 * (same box as the overlay canvas), accounting for CSS `object-fit: cover`.
 * Prefer {@link mapQrCornersToContainer} when mapping all four corners — it calls
 * `getBoundingClientRect` twice total instead of eight times.
 */
export function videoPointToContainerLocal(
  video: HTMLVideoElement,
  container: HTMLElement,
  vx: number,
  vy: number,
): { x: number; y: number } {
  const vr = video.getBoundingClientRect()
  const cr = container.getBoundingClientRect()
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return { x: 0, y: 0 }

  const scale = Math.max(vr.width / vw, vr.height / vh)
  const dispW = vw * scale
  const dispH = vh * scale
  const offsetX = vr.left + (vr.width - dispW) / 2
  const offsetY = vr.top + (vr.height - dispH) / 2

  const x = offsetX + vx * scale
  const y = offsetY + vy * scale
  return {
    x: x - cr.left,
    y: y - cr.top,
  }
}

/**
 * Map all four QR corners in one pass (two layout reads instead of eight).
 */
export function mapQrCornersToContainer(
  video: HTMLVideoElement,
  container: HTMLElement,
  location: QrTrackInfo['location'],
): { x: number; y: number }[] {
  const vr = video.getBoundingClientRect()
  const cr = container.getBoundingClientRect()
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]
  }

  const scale = Math.max(vr.width / vw, vr.height / vh)
  const dispW = vw * scale
  const dispH = vh * scale
  const offsetX = vr.left + (vr.width - dispW) / 2
  const offsetY = vr.top + (vr.height - dispH) / 2

  const map = (vx: number, vy: number) => ({
    x: offsetX + vx * scale - cr.left,
    y: offsetY + vy * scale - cr.top,
  })

  return [
    map(location.topLeftCorner.x, location.topLeftCorner.y),
    map(location.topRightCorner.x, location.topRightCorner.y),
    map(location.bottomRightCorner.x, location.bottomRightCorner.y),
    map(location.bottomLeftCorner.x, location.bottomLeftCorner.y),
  ]
}

export function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}
