import jsQR from 'jsqr'

import { isIOS } from './device'

export type QrTrackInfo = {
  data: string
  location: {
    topLeftCorner: { x: number; y: number }
    topRightCorner: { x: number; y: number }
    bottomLeftCorner: { x: number; y: number }
    bottomRightCorner: { x: number; y: number }
  }
}

export type QrScanHandle = { stop: () => void; clearLast: () => void }

export type QrScanOptions = {
  onTrackFrame?: (info: QrTrackInfo | null) => void
  initialLast?: string
}

const LOST_STREAK_THRESHOLD = 8

/** Downscale cap for jsQR fallback (CPU ∝ pixels). iOS Safari has no BarcodeDetector — lighter decode helps. */
const MAX_JSQR_WIDTH = isIOS() ? 480 : 720

/** Run QR detection at most this often. Slightly slower on iOS to reduce watchdog / tab kills. */
const SCAN_INTERVAL_MS = isIOS() ? 50 : 33

/** Emit tracking frames to AR overlay at most this often (matches scan rate cap). */
const TRACK_FRAME_EMIT_MS = isIOS() ? 50 : 33

function createNativeDetector(): BarcodeDetector | null {
  try {
    if (typeof BarcodeDetector === 'undefined') return null
    return new BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/** Map platform corners to the same shape jsQR uses (image pixel coords). */
function cornersFromBarcode(
  barcode: {
    rawValue: string
    cornerPoints?: DOMPointReadOnly[]
    boundingBox?: DOMRectReadOnly
  },
  vw: number,
  vh: number,
): QrTrackInfo['location'] | null {
  const pts = barcode.cornerPoints
  if (pts && pts.length >= 4) {
    return {
      topLeftCorner: { x: pts[0].x, y: pts[0].y },
      topRightCorner: { x: pts[1].x, y: pts[1].y },
      bottomRightCorner: { x: pts[2].x, y: pts[2].y },
      bottomLeftCorner: { x: pts[3].x, y: pts[3].y },
    }
  }
  const b = barcode.boundingBox
  if (b && b.width > 0 && b.height > 0) {
    const x = b.x
    const y = b.y
    const r = b.x + b.width
    const bot = b.y + b.height
    return {
      topLeftCorner: { x, y },
      topRightCorner: { x: r, y },
      bottomRightCorner: { x: r, y: bot },
      bottomLeftCorner: { x, y: bot },
    }
  }
  const s = Math.min(vw, vh) * 0.35
  const cx = vw / 2
  const cy = vh / 2
  const hs = s / 2
  return {
    topLeftCorner: { x: cx - hs, y: cy - hs },
    topRightCorner: { x: cx + hs, y: cy - hs },
    bottomRightCorner: { x: cx + hs, y: cy + hs },
    bottomLeftCorner: { x: cx - hs, y: cy + hs },
  }
}

function scaleJsQrLocation(
  loc: NonNullable<ReturnType<typeof jsQR>>['location'],
  scaleUp: number,
): QrTrackInfo['location'] {
  const m = (p: { x: number; y: number }) => ({
    x: p.x * scaleUp,
    y: p.y * scaleUp,
  })
  return {
    topLeftCorner: m(loc.topLeftCorner),
    topRightCorner: m(loc.topRightCorner),
    bottomRightCorner: m(loc.bottomRightCorner),
    bottomLeftCorner: m(loc.bottomLeftCorner),
  }
}

/**
 * Prefers native BarcodeDetector (Chrome / Edge on Android & desktop) for speed and accuracy,
 * falls back to jsQR on a downscaled frame.
 */
export function startQrScan(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onPayload: (text: string) => void,
  options?: QrScanOptions,
): QrScanHandle {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable')

  const detector = createNativeDetector()
  let last = options?.initialLast ?? ''
  let lostStreak = 0
  let raf = 0
  let stopped = false
  let inFlight = false
  let lastScanAt = 0
  let lastTrackEmit = 0

  const emitLost = () => {
    lostStreak += 1
    if (lostStreak >= LOST_STREAK_THRESHOLD) {
      last = ''
      lostStreak = 0
    }
    options?.onTrackFrame?.(null)
  }

  const handleDecode = (data: string, location: QrTrackInfo['location']) => {
    lostStreak = 0
    const now = performance.now()
    if (now - lastTrackEmit >= TRACK_FRAME_EMIT_MS) {
      lastTrackEmit = now
      options?.onTrackFrame?.({ data, location })
    }
    if (data !== last) {
      last = data
      onPayload(data)
    }
  }

  const runJsQr = () => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    const scale = Math.min(1, MAX_JSQR_WIDTH / w)
    const sw = Math.max(1, Math.floor(w * scale))
    const sh = Math.max(1, Math.floor(h * scale))
    canvas.width = sw
    canvas.height = sh
    ctx.drawImage(video, 0, 0, sw, sh)
    const imageData = ctx.getImageData(0, 0, sw, sh)
    const code = jsQR(imageData.data, sw, sh, {
      // iOS: avoid double inversion pass — faster decode for typical black-on-white QRs.
      inversionAttempts: isIOS() ? 'dontInvert' : 'attemptBoth',
    })
    if (code?.data) {
      const loc =
        scale >= 1
          ? scaleJsQrLocation(code.location, 1)
          : scaleJsQrLocation(code.location, 1 / scale)
      handleDecode(code.data, loc)
    } else {
      emitLost()
    }
  }

  const tick = () => {
    if (stopped) return
    raf = requestAnimationFrame(tick)

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    const now = performance.now()
    if (now - lastScanAt < SCAN_INTERVAL_MS) return
    lastScanAt = now

    if (detector) {
      if (inFlight) return
      inFlight = true
      detector
        .detect(video)
        .then((codes) => {
          inFlight = false
          if (stopped) return
          if (codes.length > 0) {
            const b = codes[0]
            const loc = cornersFromBarcode(b, vw, vh)
            if (loc) handleDecode(b.rawValue, loc)
          } else {
            emitLost()
          }
        })
        .catch(() => {
          inFlight = false
          if (!stopped) runJsQr()
        })
      return
    }

    runJsQr()
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
  /** Prefer 720p on Android/desktop; cap resolution on iOS to cut memory + canvas work (jsQR path). */
  const preferred: MediaStreamConstraints = isIOS()
    ? {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      }
    : {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      }

  const fallback: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 854 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  }

  const minimal: MediaStreamConstraints = {
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(preferred)
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia(fallback)
    } catch {
      stream = await navigator.mediaDevices.getUserMedia(minimal)
    }
  }

  video.srcObject = stream
  video.playsInline = true
  video.setAttribute('playsinline', '')
  await video.play()
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null
  stream?.getTracks().forEach((t) => t.stop())
  video.srcObject = null
}
