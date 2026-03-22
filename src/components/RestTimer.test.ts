import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RestTimer from './RestTimer.vue'

const mockSetRestTimerSnapshot = vi.fn()
const mockClearRestTimerSnapshot = vi.fn()
const mockStopRestTimer = vi.fn()
const mockMinimizeRestTimer = vi.fn()

vi.mock('../store/workout', () => ({
  useWorkoutStore: () => ({
    restTimerSnapshot: null,
    setRestTimerSnapshot: mockSetRestTimerSnapshot,
    clearRestTimerSnapshot: mockClearRestTimerSnapshot,
    stopRestTimer: mockStopRestTimer,
    minimizeRestTimer: mockMinimizeRestTimer,
  }),
}))

vi.mock('../lib/debugEvents', () => ({
  emitDebugEvent: vi.fn(),
}))

/** Minimal AudioContext mock so playBeep() does not throw in jsdom. */
class MockAudioContext {
  currentTime = 0
  destination = {}
  createOscillator() {
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { value: 880 },
      type: 'sine',
    }
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    }
  }
  resume() {
    return Promise.resolve()
  }
}

const teleportStub = { template: '<div class="teleport-stub"><slot /></div>' }
/** Single root so parent @click="handler" from RestTimer falls through once (no $emit — that doubled handlers). */
const rButtonStub = {
  props: ['variant', 'type', 'class'],
  template: '<button type="button" class="r-btn-stub"><slot /></button>',
}
const rTextStub = {
  props: ['tag'],
  template: '<component :is="tag || \'span\'" class="r-text-stub"><slot /></component>',
}

describe('RestTimer', () => {
  let rafId = 0
  const origRaf = globalThis.requestAnimationFrame
  const origCar = globalThis.cancelAnimationFrame

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext)
    mockSetRestTimerSnapshot.mockClear()
    mockClearRestTimerSnapshot.mockClear()
    mockStopRestTimer.mockClear()
    mockMinimizeRestTimer.mockClear()

    rafId = 0
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafId = setTimeout(() => cb(performance.now()), 16) as unknown as number
      return rafId
    }
    globalThis.cancelAnimationFrame = (id: number) => {
      clearTimeout(id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCar
  })

  function mountTimer(props: Record<string, unknown>) {
    return mount(RestTimer, {
      props,
      global: {
        stubs: { Teleport: teleportStub, RButton: rButtonStub, RText: rTextStub },
      },
    })
  }

  async function runUntilGo(wrapper: ReturnType<typeof mount>) {
    let guard = 0
    while (!wrapper.text().includes('GO') && guard++ < 500) {
      await vi.advanceTimersByTimeAsync(50)
      await flushPromises()
    }
  }

  it('shows countdown then GO after rest ends', async () => {
    const wrapper = mountTimer({
      seconds: 2,
      sessionId: 1,
      setLabel: 'Set 2 of 5',
      nextExerciseHint: 'Next: Set 3',
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Rest')
    expect(wrapper.text()).toContain('Set 2 of 5')

    await runUntilGo(wrapper)

    expect(wrapper.text()).toContain('GO')
    expect(wrapper.text()).toContain('Start next set')
    expect(wrapper.text()).toContain('Set 2 of 5')
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('emits done when Start next set is clicked on GO screen', async () => {
    const wrapper = mountTimer({ seconds: 1, sessionId: 1 })
    await flushPromises()
    await runUntilGo(wrapper)

    const btn = wrapper.findAll('.r-btn-stub').find((b) => b.text().includes('Start next set'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')

    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(mockStopRestTimer).toHaveBeenCalled()
  })

  it('emits skip when Skip is clicked during countdown', async () => {
    const wrapper = mountTimer({ seconds: 60, sessionId: 1 })
    await flushPromises()

    const skip = wrapper.findAll('.r-btn-stub').find((b) => b.text().trim() === 'Skip')
    expect(skip).toBeDefined()
    await skip!.trigger('click')

    expect(wrapper.emitted('skip')).toHaveLength(1)
    expect(mockStopRestTimer).toHaveBeenCalled()
  })

  it('pauses and resumes countdown', async () => {
    const wrapper = mountTimer({ seconds: 60, sessionId: 1 })
    await flushPromises()

    const pause = wrapper.findAll('.r-btn-stub').find((b) => b.text().trim() === 'Pause')
    await pause!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Resume')

    const resume = wrapper.findAll('.r-btn-stub').find((b) => b.text().trim() === 'Resume')
    await resume!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Pause')
  })

  it('still shows GO when AudioContext constructor throws', async () => {
    vi.stubGlobal('AudioContext', () => {
      throw new Error('no audio')
    })

    const wrapper = mountTimer({ seconds: 1, sessionId: 1 })
    await flushPromises()
    await runUntilGo(wrapper)

    expect(wrapper.text()).toContain('GO')
  })
})
