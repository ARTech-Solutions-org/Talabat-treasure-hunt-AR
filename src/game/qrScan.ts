import jsQR from 'jsqr'

export type QrScanHandle = { stop: () => void; clearLast: () => void }

/**
 * Decodes QR codes from a video stream into canvas ImageData.
 * Calls onPayload when a new payload is seen (deduped).
 */
export function startQrScan(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onPayload: (text: string) => void,
): QrScanHandle {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable')

  let last = ''
  let raf = 0
  let stopped = false
  let frame = 0

  const tick = () => {
    if (stopped) return
    frame += 1
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const w = video.videoWidth
      const h = video.videoHeight
      if (w && h) {
        canvas.width = w
        canvas.height = h
        ctx.drawImage(video, 0, 0, w, h)
        // decode ~10 fps to save CPU
        if (frame % 3 === 0) {
          const imageData = ctx.getImageData(0, 0, w, h)
          const code = jsQR(imageData.data, w, h, {
            inversionAttempts: 'attemptBoth',
          })
          if (code?.data && code.data !== last) {
            last = code.data
            onPayload(code.data)
          }
        }
      }
    }
    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      cancelAnimationFrame(raf)
    },
    clearLast: () => {
      last = ''
    },
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    audio: false,
  })
  video.srcObject = stream
  video.playsInline = true
  await video.play()
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null
  stream?.getTracks().forEach((t) => t.stop())
  video.srcObject = null
}
