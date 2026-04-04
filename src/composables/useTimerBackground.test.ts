import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectCaps, useTimerBackground } from './useTimerBackground'
import { ref } from 'vue'

vi.mock('../lib/debugEvents', () => ({
  emitDebugEvent: vi.fn(),
}))

let mockVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  get: () => mockVisibilityState,
  configurable: true,
})

let mockHidden = false
Object.defineProperty(document, 'hidden', {
  get: () => mockHidden,
  configurable: true,
})

describe('detectCaps', () => {
  it('detects available platform APIs', () => {
    const caps = detectCaps()
    expect(caps).toHaveProperty('wakeLock')
    expect(caps).toHaveProperty('mediaSession')
    expect(caps).toHaveProperty('notification')
    expect(caps).toHaveProperty('audioElement')
    expect(caps.audioElement).toBe(true)
  })
})

describe('useTimerBackground', () => {
  let mockWakeLockSentinel: { release: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockVisibilityState = 'visible'
    mockHidden = false

    mockWakeLockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    }

    vi.stubGlobal('navigator', {
      ...navigator,
      wakeLock: {
        request: vi.fn().mockResolvedValue(mockWakeLockSentinel),
      },
      mediaSession: {
        metadata: null,
        playbackState: 'none',
      },
      vibrate: vi.fn(),
    })

    vi.stubGlobal('Notification', class MockNotification {
      static permission = 'granted' as NotificationPermission
      static requestPermission = vi.fn().mockResolvedValue('granted')
      close = vi.fn()
      constructor(public title: string, public options?: NotificationOptions) {}
    })

    vi.stubGlobal('MediaMetadata', class MockMediaMetadata {
      constructor(public init: { title: string; artist: string; album: string }) {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ── Audio chime ──────────────────────────────────────────────

  describe('audio chime', () => {
    it('preloadChime creates an audio element', () => {
      const bg = useTimerBackground()
      bg.preloadChime()
      expect(bg.chimeReady.value).toBe(false)
    })

    it('playChime returns false when no audio preloaded', async () => {
      const bg = useTimerBackground()
      const result = await bg.playChime()
      expect(result).toBe(false)
    })

    it('playChime attempts to play the audio element', async () => {
      const bg = useTimerBackground()
      const mockPlay = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('Audio', class MockAudio {
        src = ''
        preload = ''
        currentTime = 0
        load = vi.fn()
        play = mockPlay
        pause = vi.fn()
        addEventListener = vi.fn()
      })
      bg.preloadChime()
      const result = await bg.playChime()
      expect(result).toBe(true)
      expect(mockPlay).toHaveBeenCalled()
    })

    it('playChime returns false when play() rejects', async () => {
      const bg = useTimerBackground()
      vi.stubGlobal('Audio', class MockAudio {
        src = ''
        preload = ''
        currentTime = 0
        load = vi.fn()
        play = vi.fn().mockRejectedValue(new Error('not allowed'))
        pause = vi.fn()
        addEventListener = vi.fn()
      })
      bg.preloadChime()
      const result = await bg.playChime()
      expect(result).toBe(false)
    })
  })

  // ── Wake Lock ────────────────────────────────────────────────

  describe('wake lock', () => {
    it('requestWakeLock acquires a screen lock', async () => {
      const bg = useTimerBackground()
      await bg.requestWakeLock()
      expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
    })

    it('releaseWakeLock releases the sentinel', async () => {
      const bg = useTimerBackground()
      await bg.requestWakeLock()
      await bg.releaseWakeLock()
      expect(mockWakeLockSentinel.release).toHaveBeenCalled()
    })

    it('releaseWakeLock is safe to call when no lock held', async () => {
      const bg = useTimerBackground()
      await bg.releaseWakeLock()
    })

    it('skips when wakeLock API not available', async () => {
      vi.stubGlobal('navigator', { ...navigator })
      const bg = useTimerBackground()
      await bg.requestWakeLock()
    })

    it('reacquires on visibility change when visible', async () => {
      const bg = useTimerBackground()
      await bg.requestWakeLock()
      await bg.releaseWakeLock()

      mockVisibilityState = 'visible'
      await bg.reacquireWakeLockIfVisible()
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2)
    })

    it('does not reacquire when hidden', async () => {
      const bg = useTimerBackground()
      mockVisibilityState = 'hidden'
      await bg.reacquireWakeLockIfVisible()
      expect(navigator.wakeLock.request).not.toHaveBeenCalled()
    })
  })

  // ── Media Session ────────────────────────────────────────────

  describe('media session', () => {
    it('setMediaSession sets metadata and playbackState', () => {
      const bg = useTimerBackground()
      bg.setMediaSession(45, 90)
      expect(navigator.mediaSession.playbackState).toBe('playing')
      expect(navigator.mediaSession.metadata).toBeTruthy()
    })

    it('clearMediaSession resets metadata', () => {
      const bg = useTimerBackground()
      bg.setMediaSession(45, 90)
      bg.clearMediaSession()
      expect(navigator.mediaSession.metadata).toBeNull()
      expect(navigator.mediaSession.playbackState).toBe('none')
    })

    it('skips when mediaSession API not available', () => {
      vi.stubGlobal('navigator', { ...navigator, mediaSession: undefined })
      const bg = useTimerBackground()
      bg.setMediaSession(45, 90)
    })
  })

  // ── Notifications ────────────────────────────────────────────

  describe('notifications', () => {
    it('requestNotificationPermission calls Notification.requestPermission', async () => {
      const bg = useTimerBackground()
      const result = await bg.requestNotificationPermission()
      expect(result).toBe('granted')
      expect(Notification.requestPermission).toHaveBeenCalled()
    })

    it('fireNotification creates a Notification when hidden and granted', () => {
      mockHidden = true
      const bg = useTimerBackground()
      bg.fireNotification()
    })

    it('fireNotification is suppressed when document is visible', () => {
      mockHidden = false
      const constructorSpy = vi.fn()
      vi.stubGlobal('Notification', class {
        static permission = 'granted'
        static requestPermission = vi.fn()
        close = vi.fn()
        constructor(title: string) { constructorSpy(title) }
      })
      const bg = useTimerBackground()
      bg.fireNotification()
      expect(constructorSpy).not.toHaveBeenCalled()
    })

    it('fireNotification is suppressed when permission not granted', () => {
      mockHidden = true
      const constructorSpy = vi.fn()
      vi.stubGlobal('Notification', class {
        static permission = 'denied' as NotificationPermission
        static requestPermission = vi.fn()
        close = vi.fn()
        constructor(title: string) { constructorSpy(title) }
      })
      const bg = useTimerBackground()
      bg.fireNotification()
      expect(constructorSpy).not.toHaveBeenCalled()
    })

    it('returns null when Notification API not available', async () => {
      vi.stubGlobal('Notification', undefined)
      const bg = useTimerBackground()
      const result = await bg.requestNotificationPermission()
      expect(result).toBeNull()
    })
  })

  // ── Visibility change ────────────────────────────────────────

  describe('visibility change', () => {
    it('registers a visibilitychange listener', () => {
      const spy = vi.spyOn(document, 'addEventListener')
      const bg = useTimerBackground()
      bg.onVisibilityChange(() => {})
      expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })

    it('calls callback when page becomes visible', () => {
      const callback = vi.fn()
      const bg = useTimerBackground()
      bg.onVisibilityChange(callback)

      mockVisibilityState = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      expect(callback).toHaveBeenCalled()
    })

    it('does not call callback when page becomes hidden', () => {
      const callback = vi.fn()
      const bg = useTimerBackground()
      bg.onVisibilityChange(callback)

      mockVisibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ── Cleanup ──────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes visibilitychange listener and releases wake lock', async () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const bg = useTimerBackground()
      bg.onVisibilityChange(() => {})
      await bg.requestWakeLock()
      bg.cleanup()
      expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(mockWakeLockSentinel.release).toHaveBeenCalled()
    })
  })

  // ── All APIs unavailable ─────────────────────────────────────

  describe('graceful degradation', () => {
    it('does not crash when all platform APIs are missing', async () => {
      vi.stubGlobal('navigator', {})
      vi.stubGlobal('Notification', undefined)
      vi.stubGlobal('MediaMetadata', undefined)

      const bg = useTimerBackground()
      bg.preloadChime()
      await bg.playChime()
      await bg.requestWakeLock()
      await bg.releaseWakeLock()
      bg.setMediaSession(10, 60)
      bg.clearMediaSession()
      await bg.requestNotificationPermission()
      bg.fireNotification()
      bg.cleanup()
    })
  })
})
