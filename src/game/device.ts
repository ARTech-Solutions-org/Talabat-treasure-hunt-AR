/** True for iPhone / iPad / iPod (and iPadOS desktop UA). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true
  // iPadOS 13+ can report as Mac with touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}
