import './style.css'

import type { Round } from './game/types'
import { fetchRound } from './game/round'
import { postComplete } from './game/complete'
import { payloadMatchesItem } from './game/match'
import { startQrScan, startCamera, stopCamera, type QrScanHandle } from './game/qrScan'
import { RewardChestReveal } from './game/rewardReveal'

function getPlayToken(): string | null {
  return new URLSearchParams(window.location.search).get('t')
}

/** Prefer `public/models/<customId>.glb`. */
function modelUrlForCustomId(customId: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}models/${encodeURIComponent(customId)}.glb`
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (className) n.className = className
  if (text !== undefined) n.textContent = text
  return n
}

function showScreen(root: HTMLElement, id: string): void {
  root.setAttribute('data-current-screen', id)
  root.querySelectorAll('[data-screen]').forEach((s) => {
    ;(s as HTMLElement).hidden = (s as HTMLElement).dataset.screen !== id
  })
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = ''
  app.className = 'app'

  const screens = el('div', 'screens')
  const mk = (id: string, inner: HTMLElement[]) => {
    const s = el('div', 'screen')
    s.dataset.screen = id
    inner.forEach((c) => s.appendChild(c))
    return s
  }

  const loading = mk('loading', [el('p', 'status', 'Loading round…')])
  const error = mk('error', [
    el('h1', 'title', 'Something went wrong'),
    el('p', 'msg', ''),
    el('button', 'btn primary', 'Retry'),
  ])
  error.hidden = true

  const lobby = mk('lobby', [
    el('h1', 'game-title', ''),
    el('p', 'round-meta', ''),
    el('button', 'btn primary', 'Begin hunt'),
  ])
  lobby.hidden = true

  const play = mk('play', [])
  play.hidden = true
  play.classList.add('play-screen')

  const playTop = el('div', 'play-top-bar')
  const timerEl = el('div', 'timer', '0:00')
  playTop.append(timerEl)

  const hintsHeader = el('div', 'hints-header')
  const hintsImg = document.createElement('img')
  hintsImg.className = 'hints-header-img'
  hintsImg.src = `${import.meta.env.BASE_URL}brand/hints-header.png`
  hintsImg.alt = 'Hints'
  hintsHeader.append(hintsImg)

  const clueBand = el('div', 'clue-band')
  const clueBandInner = el('div', 'clue-band-inner')
  const ribbonImg = document.createElement('img')
  ribbonImg.className = 'clue-ribbon-img'
  ribbonImg.src = `${import.meta.env.BASE_URL}brand/ribbon.png`
  ribbonImg.alt = ''
  const clueText = el('p', 'clue-text', '')
  clueBandInner.append(ribbonImg, clueText)
  clueBand.append(clueBandInner)

  const scanFrame = el('div', 'scan-frame')
  const scanWrap = el('div', 'scan-wrap')
  const video = document.createElement('video')
  video.className = 'scan-video'
  video.setAttribute('playsinline', '')
  video.setAttribute('autoplay', '')
  const scanCanvas = document.createElement('canvas')
  scanCanvas.className = 'scan-canvas'
  scanCanvas.hidden = true
  scanWrap.append(video, scanCanvas)
  scanFrame.append(scanWrap)

  const playFooter = el('div', 'play-footer')
  const talabatLogo = document.createElement('img')
  talabatLogo.className = 'talabat-logo-img'
  talabatLogo.src = `${import.meta.env.BASE_URL}brand/logo.png`
  talabatLogo.alt = 'talabat'
  playFooter.append(talabatLogo)

  play.append(playTop, hintsHeader, clueBand, scanFrame, playFooter)

  const modal = el('div', 'modal')
  modal.hidden = true
  const modalBackdrop = el('div', 'modal-backdrop')
  const modalCard = el('div', 'modal-card')
  const modalTitle = el('h2', 'modal-title', 'Found!')
  const modalHint = el(
    'p',
    'modal-hint',
    'Keep the QR in frame — the reward sits on the code. Tap Continue when ready.',
  )
  const modalBtn = el('button', 'btn primary block', 'Continue')
  modalCard.append(modalTitle, modalHint, modalBtn)
  modal.append(modalBackdrop, modalCard)

  const done = mk('done', [
    el('h1', 'title', 'Finished!'),
    el('p', 'done-summary', ''),
    el('p', 'done-time', ''),
  ])
  done.hidden = true

  const tokenErr = mk('token', [
    el('h1', 'title', 'Missing play link'),
    el(
      'p',
      'msg',
      'Open the game from your registration link. It must include ?t= with your play token.',
    ),
  ])
  tokenErr.hidden = true

  screens.append(loading, error, tokenErr, lobby, play, done)
  app.append(screens, modal)

  const tokenParam = getPlayToken()
  if (!tokenParam) {
    showScreen(app, 'token')
    return
  }
  const token = tokenParam

  let round: Round | null = null
  let step = 0
  let timerStart: number | null = null
  let rafTimer = 0
  let qrHandle: QrScanHandle | null = null
  let rewardModalOpen = false
  let lastQrPayload = ''
  const rewardFx = new RewardChestReveal(scanWrap, video)

  const playedKeyFor = (roundId: string): string => `tth:played:${roundId}:${token}`

  const hasPlayedRound = (roundId: string): boolean => {
    try {
      return localStorage.getItem(playedKeyFor(roundId)) === '1'
    } catch {
      return false
    }
  }

  const markPlayedRound = (roundId: string): void => {
    try {
      localStorage.setItem(playedKeyFor(roundId), '1')
    } catch {
      /* ignore storage failures (private mode / quota) */
    }
  }

  const fitClueText = (): void => {
    // Auto-shrink hint text to fit the ribbon area.
    requestAnimationFrame(() => {
      const bandH = clueBandInner.getBoundingClientRect().height
      if (!bandH) return
      // Slightly generous height + padding prevents glyph descenders from being clipped.
      const maxH = Math.max(28, bandH * 0.7)
      clueText.style.maxHeight = `${Math.floor(maxH + 2)}px`
      clueText.style.overflow = 'hidden'

      const maxPx = Math.round(Math.min(22, bandH * 0.18))
      const minPx = 12
      let px = Math.max(minPx, maxPx)
      clueText.style.fontSize = `${px}px`

      for (let i = 0; i < 18; i += 1) {
        if (clueText.scrollHeight <= clueText.clientHeight + 1) break
        px -= 1
        if (px <= minPx) break
        clueText.style.fontSize = `${px}px`
      }
    })
  }

  const updateTimerDisplay = (): void => {
    if (timerStart === null) {
      timerEl.textContent = '0:00'
      return
    }
    const ms = performance.now() - timerStart
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const r = s % 60
    timerEl.textContent = `${m}:${r.toString().padStart(2, '0')}`
  }

  const loopTimer = (): void => {
    updateTimerDisplay()
    rafTimer = requestAnimationFrame(loopTimer)
  }

  const stopLoopTimer = (): void => {
    cancelAnimationFrame(rafTimer)
  }

  function showCurrentClue(): void {
    if (!round || step >= round.items.length) return
    clueText.textContent = round.items[step].hint
    // Preload the next model early so the "Found!" reveal is instant on scan.
    void rewardFx.preloadModel(modelUrlForCustomId(round.items[step].item.customId))
    fitClueText()
  }

  async function onQrPayload(text: string): Promise<void> {
    if (rewardModalOpen) return

    if (!round || timerStart === null) return
    lastQrPayload = text

    const row = round.items[step]
    if (!row) return

    if (!payloadMatchesItem(text, row.item)) {
      if (navigator.vibrate) navigator.vibrate(25)
      window.setTimeout(() => qrHandle?.clearLast(), 400)
      return
    }

    if (navigator.vibrate) navigator.vibrate([35, 50, 35])

    rewardModalOpen = true
    modal.hidden = false
    modalTitle.textContent = row.item.name
    await rewardFx.loadModel(modelUrlForCustomId(row.item.customId))
    rewardFx.showModel()
    requestAnimationFrame(() => rewardFx.resize())

    const onContinue = async () => {
      modalBtn.removeEventListener('click', onContinue)
      rewardModalOpen = false
      rewardFx.dispose()
      modal.hidden = true
      step += 1

      if (!round || step >= round.items.length) {
        stopLoopTimer()
        stopCamera(video)
        qrHandle?.stop()
        qrHandle = null
        showScreen(app, 'loading')
        loading.querySelector('.status')!.textContent = 'Submitting score…'

        const durationMs = timerStart !== null ? performance.now() - timerStart : 0
        try {
          const data = await postComplete(token, durationMs)
          if (round?._id) markPlayedRound(round._id)
          done.querySelector('.done-summary')!.textContent = `Great run, ${data.username}!`
          done.querySelector('.done-time')!.textContent = `Time: ${formatMs(data.completionDuration)}`
          showScreen(app, 'done')
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not submit score'
          if (msg.toLowerCase().includes('already played') && round?._id) markPlayedRound(round._id)
          modal.hidden = true
          rewardFx.dispose()
          error.querySelector('.msg')!.textContent = msg
          showScreen(app, 'error')
        }
        return
      }

      showCurrentClue()
      startPlayScan(text)
    }

    modalBtn.addEventListener('click', onContinue, { once: true })
  }

  function startPlayScan(initialLast?: string): void {
    qrHandle?.stop()
    qrHandle = startQrScan(
      video,
      scanCanvas,
      (t) => {
        void onQrPayload(t)
      },
      {
        initialLast,
        onTrackFrame: (info) => {
          if (rewardModalOpen) rewardFx.setTracking(info)
        },
      },
    )
  }

  const stopPlayCapture = (): void => {
    qrHandle?.stop()
    qrHandle = null
    stopCamera(video)
  }

  const resumePlayCapture = async (): Promise<void> => {
    if (app.getAttribute('data-current-screen') !== 'play') return
    if (!round || timerStart === null) return
    try {
      await startCamera(video)
    } catch {
      return
    }
    startPlayScan(lastQrPayload)
  }

  function formatMs(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const r = s % 60
    const frac = Math.floor(ms % 1000)
    return `${m}:${r.toString().padStart(2, '0')}.${frac.toString().padStart(3, '0')}`
  }

  async function loadRound(): Promise<void> {
    showScreen(app, 'loading')
    loading.querySelector('.status')!.textContent = 'Loading round…'
    try {
      round = await fetchRound(token)
      if (!round.isEnabled) throw new Error('This round is not available right now.')
      if (!round.items?.length) throw new Error('No booths configured for this round.')

      lobby.querySelector('.game-title')!.textContent = round.title
      lobby.querySelector('.round-meta')!.textContent = `${round.items.length} booth(s) — scan QR codes in order.`
      showScreen(app, 'lobby')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load round'
      error.querySelector('.msg')!.textContent = msg
      showScreen(app, 'error')
    }
  }

  error.querySelector('button')!.addEventListener('click', () => {
    void loadRound()
  })

  lobby.querySelector('button')!.addEventListener('click', async () => {
    if (!round) return
    if (hasPlayedRound(round._id)) {
      error.querySelector('.msg')!.textContent =
        'You already played this round. Please wait for the next round.'
      showScreen(app, 'error')
      return
    }
    step = 0
    timerStart = performance.now()
    showScreen(app, 'play')
    showCurrentClue()
    updateTimerDisplay()
    loopTimer()

    try {
      await startCamera(video)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera blocked or unavailable'
      stopLoopTimer()
      timerStart = null
      error.querySelector('.msg')!.textContent = msg
      showScreen(app, 'error')
      return
    }

    startPlayScan()
  })

  window.addEventListener('resize', () => {
    rewardFx.resize()
    fitClueText()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (app.getAttribute('data-current-screen') === 'play') stopPlayCapture()
      return
    }
    void resumePlayCapture()
  })

  window.addEventListener('pageshow', () => {
    void resumePlayCapture()
  })

  await loadRound()
}

void main()
