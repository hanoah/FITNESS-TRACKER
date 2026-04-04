/**
 * Platform API layer for the rest timer: audio chime, wake lock, media session,
 * notifications, and visibility change handling.
 *
 * Audio fallback chain:
 *   <audio> element (primary) -> Web Audio oscillator (fallback) -> vibrate (last resort)
 *
 * All APIs are feature-detected and best-effort. The timer MUST count down and
 * show GO regardless of what the platform supports.
 */
import { ref, onUnmounted } from 'vue'
import { emitDebugEvent } from '../lib/debugEvents'

export interface TimerBackgroundCaps {
  wakeLock: boolean
  mediaSession: boolean
  notification: boolean
  audioElement: boolean
}

export function detectCaps(): TimerBackgroundCaps {
  return {
    wakeLock: 'wakeLock' in navigator,
    mediaSession: 'mediaSession' in navigator,
    notification: 'Notification' in window,
    audioElement: typeof Audio !== 'undefined',
  }
}

export function useTimerBackground() {
  const caps = detectCaps()

  let wakeLockSentinel: WakeLockSentinel | null = null
  let audioEl: HTMLAudioElement | null = null
  const chimeReady = ref(false)

  // ── Audio chime ──────────────────────────────────────────────
  function preloadChime(): void {
    if (!caps.audioElement) return
    try {
      audioEl = new Audio()
      audioEl.src = `${import.meta.env.BASE_URL}audio/chime.wav`
      audioEl.preload = 'auto'
      audioEl.load()
      audioEl.addEventListener('canplaythrough', () => { chimeReady.value = true }, { once: true })
    } catch {
      audioEl = null
    }
  }

  async function playChime(): Promise<boolean> {
    if (!audioEl) return false
    try {
      audioEl.currentTime = 0
      await audioEl.play()
      return true
    } catch {
      emitDebugEvent({ eventName: 'chime_audio_failed', meta: { reason: 'play_rejected' } })
      return false
    }
  }

  // ── Wake Lock ────────────────────────────────────────────────
  async function requestWakeLock(): Promise<void> {
    if (!caps.wakeLock) return
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen')
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null
      })
    } catch {
      emitDebugEvent({ eventName: 'wake_lock_failed', meta: { reason: 'request_rejected' } })
    }
  }

  async function releaseWakeLock(): Promise<void> {
    if (!wakeLockSentinel) return
    try {
      await wakeLockSentinel.release()
    } catch { /* already released */ }
    wakeLockSentinel = null
  }

  async function reacquireWakeLockIfVisible(): Promise<void> {
    if (!caps.wakeLock || wakeLockSentinel) return
    if (document.visibilityState !== 'visible') return
    await requestWakeLock()
  }

  // ── Media Session ────────────────────────────────────────────
  function setMediaSession(remaining: number, total: number): void {
    if (!caps.mediaSession) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Rest Timer',
        artist: `${remaining}s remaining`,
        album: 'Workout App',
      })
      navigator.mediaSession.playbackState = 'playing'
    } catch { /* best-effort */ }
  }

  function clearMediaSession(): void {
    if (!caps.mediaSession) return
    try {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
    } catch { /* best-effort */ }
  }

  // ── Notifications ────────────────────────────────────────────
  async function requestNotificationPermission(): Promise<NotificationPermission | null> {
    if (!caps.notification) return null
    try {
      const result = await Notification.requestPermission()
      emitDebugEvent({ eventName: 'notification_permission', meta: { result } })
      return result
    } catch {
      return null
    }
  }

  function fireNotification(): void {
    if (!caps.notification) return
    if (!document.hidden) return
    if (Notification.permission !== 'granted') return
    try {
      const n = new Notification('Rest complete', {
        body: 'Time to lift.',
        icon: `${import.meta.env.BASE_URL}icon-192x192.png`,
        tag: 'rest-timer',
        requireInteraction: false,
      })
      setTimeout(() => n.close(), 5000)
    } catch {
      emitDebugEvent({ eventName: 'notification_failed' })
    }
  }

  // ── Visibility change ────────────────────────────────────────
  type VisibilityCallback = () => void
  let visibilityHandler: (() => void) | null = null

  function onVisibilityChange(onVisible: VisibilityCallback): void {
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        onVisible()
        reacquireWakeLockIfVisible()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  // ── Cleanup ──────────────────────────────────────────────────
  function cleanup(): void {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    releaseWakeLock()
    clearMediaSession()
    if (audioEl) {
      audioEl.pause()
      audioEl.src = ''
      audioEl = null
    }
    chimeReady.value = false
  }

  onUnmounted(cleanup)

  return {
    caps,
    chimeReady,
    preloadChime,
    playChime,
    requestWakeLock,
    releaseWakeLock,
    reacquireWakeLockIfVisible,
    setMediaSession,
    clearMediaSession,
    requestNotificationPermission,
    fireNotification,
    onVisibilityChange,
    cleanup,
  }
}
