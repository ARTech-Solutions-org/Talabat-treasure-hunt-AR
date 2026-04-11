/** Shape Detection API — not in all TS lib.dom versions yet. */
interface DetectedBarcode {
  rawValue: string
  cornerPoints?: DOMPointReadOnly[]
  boundingBox?: DOMRectReadOnly
}

declare class BarcodeDetector {
  constructor(options: { formats: string[] })
  detect(image: CanvasImageSource): Promise<DetectedBarcode[]>
}
