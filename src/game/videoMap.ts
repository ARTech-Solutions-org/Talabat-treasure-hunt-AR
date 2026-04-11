/**
 * Map a point from video intrinsic pixels to coordinates relative to the
 * video element's content box (object-fit: cover).
 */
export function mapImagePointToVideoElement(
  video: HTMLVideoElement,
  ix: number,
  iy: number,
): { x: number; y: number } {
  const iw = video.videoWidth
  const ih = video.videoHeight
  const rect = video.getBoundingClientRect()
  const ew = rect.width
  const eh = rect.height
  if (!iw || !ih || !ew || !eh) return { x: 0, y: 0 }

  const scale = Math.max(ew / iw, eh / ih)
  const ox = (ew - iw * scale) / 2
  const oy = (eh - ih * scale) / 2
  return {
    x: ix * scale + ox,
    y: iy * scale + oy,
  }
}
