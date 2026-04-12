/**
 * Map points from video intrinsic pixel space to coordinates local to `container`
 * (same box as the overlay canvas), accounting for CSS `object-fit: cover`.
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

export function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}
