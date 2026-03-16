import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProgramStore } from './program'

vi.mock('../lib/db', () => ({
  db: {
    programState: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

describe('setProgramState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('rejects week > max for Foundation block (max 5)', async () => {
    const store = useProgramStore()
    await store.loadProgramState()
    const foundationId = 'foundation'
    const result = await store.setProgramState(foundationId, 6)
    expect(result).toBe(false)
  })

  it('rejects week > max for Ramping block', async () => {
    const store = useProgramStore()
    await store.loadProgramState()
    const rampingId = 'ramping'
    const result = await store.setProgramState(rampingId, 99)
    expect(result).toBe(false)
  })

  it('rejects invalid blockId', async () => {
    const store = useProgramStore()
    await store.loadProgramState()
    const result = await store.setProgramState('invalid-block', 1)
    expect(result).toBe(false)
  })

  it('rejects week < 1', async () => {
    const store = useProgramStore()
    await store.loadProgramState()
    const result = await store.setProgramState('foundation', 0)
    expect(result).toBe(false)
  })
})
