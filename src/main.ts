import './style.css'

import type { Round } from './game/types'
import { fetchRound } from './game/round'
import { postComplete } from './game/complete'
import { payloadMatchesItem } from './game/match'
import { startQrScan, startCamera, stopCamera, type QrScanHandle } from './game/qrScan'
import { ModelViewer } from './game/modelViewer'

function getPlayToken(): string | null {
  return new URLSearchParams(window.location.search).get('t')
}

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
  const playTop = el('div', 'play-top')
  const timerEl = el('div', 'timer', '0:00')
  const progressEl = el('div', 'progress', '')
  playTop.append(timerEl, progressEl)

  const cluePanel = el('div', 'clue-panel')
  const clueLabel = el('div', 'clue-label', 'Clue')
  const clueText = el('p', 'clue-text', '')
  cluePanel.append(clueLabel, clueText)

  const scanWrap = el('div', 'scan-wrap')
  const video = document.createElement('video')
  video.className = 'scan-video'
  video.setAttribute('playsinline', '')
  video.setAttribute('autoplay', '')
  const scanCanvas = document.createElement('canvas')
  scanCanvas.className = 'scan-canvas'
  scanCanvas.hidden = true
  scanWrap.append(video, scanCanvas)

  const hintScan = el('p', 'scan-hint', 'Point the camera at the booth QR code.')
  play.append(playTop, cluePanel, scanWrap, hintScan)

  const modal = el('div', 'modal')
  modal.hidden = true
  const modalBackdrop = el('div', 'modal-backdrop')
  const modalCard = el('div', 'modal-card')
  const modalTitle = el('h2', 'modal-title', 'Found!')
  const modelHost = el('div', 'model-host')
  const modalBtn = el('button', 'btn primary block', 'Continue')
  modalCard.append(modalTitle, modelHost, modalBtn)
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
  const viewer = new ModelViewer(modelHost)

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

  function updateProgress(): void {
    if (!round) return
    progressEl.textContent = `Booth ${step + 1} of ${round.items.length}`
  }

  function showCurrentClue(): void {
    if (!round || step >= round.items.length) return
    clueText.textContent = round.items[step].hint
    updateProgress()
  }

  async function onQrPayload(text: string): Promise<void> {
    if (!round || timerStart === null) return
    const row = round.items[step]
    if (!row || !payloadMatchesItem(text, row.item)) return

    qrHandle?.clearLast()
    if (qrHandle) {
      qrHandle.stop()
      qrHandle = null
    }

    modal.hidden = false
    modalTitle.textContent = row.item.name
    await viewer.showModel(modelUrlForCustomId(row.item.customId))

    const onContinue = async () => {
      modalBtn.removeEventListener('click', onContinue)
      viewer.dispose()
      modal.hidden = true
      step += 1

      if (!round || step >= round.items.length) {
        stopLoopTimer()
        stopCamera(video)
        showScreen(app, 'loading')
        loading.querySelector('.status')!.textContent = 'Submitting score…'

        const durationMs = timerStart !== null ? performance.now() - timerStart : 0
        try {
          const data = await postComplete(token, durationMs)
          done.querySelector('.done-summary')!.textContent = `Great run, ${data.username}!`
          done.querySelector('.done-time')!.textContent = `Time: ${formatMs(data.completionDuration)}`
          showScreen(app, 'done')
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not submit score'
          modal.hidden = true
          viewer.dispose()
          error.querySelector('.msg')!.textContent = msg
          showScreen(app, 'error')
        }
        return
      }

      showCurrentClue()
      qrHandle = startQrScan(video, scanCanvas, (t) => {
        void onQrPayload(t)
      })
    }

    modalBtn.addEventListener('click', onContinue, { once: true })
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
      hintScan.textContent = msg
      stopLoopTimer()
      timerStart = null
      error.querySelector('.msg')!.textContent = msg
      showScreen(app, 'error')
      return
    }

    qrHandle = startQrScan(video, scanCanvas, (t) => {
      void onQrPayload(t)
    })
  })

  window.addEventListener('resize', () => viewer.resize())

  await loadRound()
}

void main()
