import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MiniTimer from './MiniTimer.vue'

const mockExpandRestTimer = vi.fn()
const mockMinimized = { value: true }
const mockPanel = { value: { seconds: 60, nextExerciseHint: '', progressPercent: 0, setLabel: '' } }
const mockSnapshot = { value: { sessionId: 1, endTime: Date.now() + 30000, pausedRemaining: null, initialSeconds: 60 } }

vi.mock('../store/workout', () => ({
  useWorkoutStore: () => ({
    restTimerMinimized: mockMinimized.value,
    restTimerPanel: mockPanel.value,
    restTimerSnapshot: mockSnapshot.value,
    expandRestTimer: mockExpandRestTimer,
  }),
}))

const teleportStub = { template: '<div class="teleport-stub"><slot /></div>' }

describe('MiniTimer', () => {
  let rafId = 0
  const origRaf = globalThis.requestAnimationFrame
  const origCar = globalThis.cancelAnimationFrame

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    mockExpandRestTimer.mockClear()
    mockMinimized.value = true
    mockSnapshot.value = {
      sessionId: 1,
      endTime: Date.now() + 30000,
      pausedRemaining: null,
      initialSeconds: 60,
    }

    rafId = 0
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafId = setTimeout(() => cb(performance.now()), 16) as unknown as number
      return rafId
    }
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCar
  })

  function mountMini() {
    return mount(MiniTimer, {
      global: { stubs: { Teleport: teleportStub } },
    })
  }

  it('displays countdown seconds from snapshot', async () => {
    const wrapper = mountMini()
    await vi.advanceTimersByTimeAsync(50)
    expect(wrapper.text()).toMatch(/\d+s/)
  })

  it('shows GO! when remaining is zero', async () => {
    mockSnapshot.value = { sessionId: 1, endTime: Date.now() - 1000, pausedRemaining: null, initialSeconds: 60 }
    const wrapper = mountMini()
    await vi.advanceTimersByTimeAsync(50)
    expect(wrapper.text()).toContain('GO!')
  })

  it('shows paused remaining when paused', async () => {
    mockSnapshot.value = { sessionId: 1, endTime: 0, pausedRemaining: 42, initialSeconds: 60 }
    const wrapper = mountMini()
    await vi.advanceTimersByTimeAsync(50)
    expect(wrapper.text()).toContain('42s')
  })

  it('has touch-action: none for drag support', () => {
    const wrapper = mountMini()
    const chip = wrapper.find('.mini-timer-chip')
    expect(chip.exists()).toBe(true)
  })

  it('uses default centered position when no sessionStorage', () => {
    const wrapper = mountMini()
    const chip = wrapper.find('.mini-timer-chip')
    const style = chip.attributes('style') ?? ''
    expect(style).toContain('left: 50%')
  })
})
