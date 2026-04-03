import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkoutStore, isExerciseComplete } from './workout'
import { useProgramStore } from './program'
import type { SessionExercise } from '../types/session'
import * as exerciseLibrary from '../lib/exerciseLibrary'

const mockDb = vi.hoisted(() => ({
  sessions: {
    add: vi.fn().mockResolvedValue(1),
    update: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  sets: {
    add: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  programState: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockGetScheduleDay = vi.hoisted(() => vi.fn())
vi.mock('../lib/db', () => ({ db: mockDb }))
vi.mock('../lib/sync', () => ({ enqueueSync: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/scheduleDay', () => ({ getScheduleDay: (d?: Date) => mockGetScheduleDay(d) }))

const baseExercise: SessionExercise = {
  name: 'Bench Press',
  demoUrl: '',
  intensityTechnique: 'none',
  warmupSets: 2,
  workingSets: 3,
  repRange: [6, 8],
  earlySetRPE: 6,
  lastSetRPE: 8,
  restSeconds: [180, 300],
  sub1: 'Pec Deck',
  sub2: 'Bottom-Half DB Flye',
  notes: '',
  slotKey: 'upper_strength:0',
  dayType: 'upper_strength',
}


describe('startFreeWorkout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
  })

  it('creates session with exercises: [], dayType: free, no blockId/weekNumber', async () => {
    const workoutStore = useWorkoutStore()
    const id = await workoutStore.startFreeWorkout()
    expect(id).toBe(1)
    const addArg = vi.mocked(mockDb.sessions.add).mock.calls[0][0]
    expect(addArg.dayType).toBe('free')
    expect(addArg.exercises).toEqual([])
    expect(addArg.blockId).toBeUndefined()
    expect(addArg.weekNumber).toBeUndefined()
    expect(workoutStore.todayExercises).toEqual([])
  })
})

describe('startWorkout (program path)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockClear()
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
  })

  it('stores exercises on session in DB', async () => {
    const workoutStore = useWorkoutStore()
    const id = await workoutStore.startWorkout('upper_strength', [baseExercise], 'foundation', 1)
    expect(id).toBe(1)
    const addArg = vi.mocked(mockDb.sessions.add).mock.calls[0][0]
    expect(addArg.exercises).toEqual([baseExercise])
    expect(addArg.blockId).toBe('foundation')
    expect(addArg.weekNumber).toBe(1)
    expect(workoutStore.todayExercises).toHaveLength(1)
    expect(workoutStore.todayExercises[0].name).toBe('Bench Press')
  })
})

describe('addExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('appends to session.exercises, persists to DB, slotKey = free:{n}', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startFreeWorkout()

    const newEx: SessionExercise = {
      ...baseExercise,
      name: 'Squat',
      slotKey: '',
      dayType: 'free',
    }
    const ok = await workoutStore.addExercise(newEx)
    expect(ok).toBe(true)
    expect(workoutStore.todayExercises).toHaveLength(1)
    expect(workoutStore.todayExercises[0].name).toBe('Squat')
    expect(workoutStore.todayExercises[0].slotKey).toBe('free:0')

    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
    const addEx2: SessionExercise = { ...baseExercise, name: 'Row', slotKey: '', dayType: 'free' }
    await workoutStore.addExercise(addEx2)
    expect(workoutStore.todayExercises[1].slotKey).toBe('free:1')
  })

  it('error path: db failure returns false (not silent)', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startFreeWorkout()
    vi.mocked(mockDb.sessions.update).mockRejectedValueOnce(new Error('DB write failed'))

    const newEx: SessionExercise = {
      ...baseExercise,
      name: 'Squat',
      slotKey: '',
      dayType: 'free',
    }
    const ok = await workoutStore.addExercise(newEx)
    expect(ok).toBe(false)
    expect(workoutStore.todayExercises).toEqual([])
  })
})

describe('removeExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('removes by slotKey, adjusts currentExerciseIndex when removed at or before current', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startFreeWorkout()
    const ex1: SessionExercise = { ...baseExercise, name: 'Ex1', slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Ex2', slotKey: 'free:1', dayType: 'free' }
    const ex3: SessionExercise = { ...baseExercise, name: 'Ex3', slotKey: 'free:2', dayType: 'free' }
    await workoutStore.addExercise(ex1)
    await workoutStore.addExercise(ex2)
    await workoutStore.addExercise(ex3)

    const session = workoutStore.activeSession!
    session.currentExerciseIndex = 1
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)

    const ok = await workoutStore.removeExercise('free:1')
    expect(ok).toBe(true)
    expect(workoutStore.todayExercises).toHaveLength(2)
    expect(workoutStore.todayExercises.map((e) => e.name)).toEqual(['Ex1', 'Ex3'])
    expect(workoutStore.activeSession!.currentExerciseIndex).toBe(0)
  })
})

describe('resumeSession', () => {
  let firstMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    firstMock = vi.fn().mockResolvedValue(null)
    vi.mocked(mockDb.sessions.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({ first: firstMock }),
    } as never)
    vi.mocked(mockDb.sets.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    } as never)
  })

  it('uses session.exercises when present (no program call)', async () => {
    const legacySession = {
      id: 1,
      date: '2025-03-10',
      dayType: 'upper_strength',
      status: 'in_progress' as const,
      currentExerciseIndex: 0,
      completedSetCount: 0,
      startedAt: Date.now() - 1000,
      exercises: [baseExercise],
    }
    firstMock.mockResolvedValue(legacySession)

    const workoutStore = useWorkoutStore()
    const loaded = await workoutStore.loadResumableSession()
    expect(loaded).toBeTruthy()

    const result = await workoutStore.resumeSession()
    expect(result.ok).toBe(true)
    expect(workoutStore.todayExercises).toHaveLength(1)
    expect(workoutStore.todayExercises[0].name).toBe('Bench Press')
  })

  it('falls back to program for legacy sessions (has blockId but no exercises)', async () => {
    mockGetScheduleDay.mockReturnValue({ key: 'monday', label: 'Monday' })
    vi.mocked(mockDb.programState.get).mockResolvedValue({
      id: 'current',
      blockId: 'foundation',
      weekNumber: 1,
      updatedAt: Date.now(),
    })
    const legacySession = {
      id: 1,
      date: '2025-03-10',
      dayType: 'upper_strength',
      blockId: 'foundation',
      weekNumber: 1,
      status: 'in_progress' as const,
      currentExerciseIndex: 0,
      completedSetCount: 0,
      startedAt: Date.now() - 1000,
      exercises: undefined,
    }
    firstMock.mockResolvedValue(legacySession)

    const workoutStore = useWorkoutStore()
    const programStore = useProgramStore()
    await programStore.loadProgramState()
    const loaded = await workoutStore.loadResumableSession()
    expect(loaded).toBeTruthy()

    const result = await workoutStore.resumeSession()
    expect(result.ok).toBe(true)
    expect(workoutStore.todayExercises.length).toBeGreaterThan(0)
  })

  it('returns error when no exercises and no program match', async () => {
    firstMock.mockResolvedValue({
      id: 1,
      date: '2025-03-12',
      dayType: 'unknown',
      status: 'in_progress' as const,
      currentExerciseIndex: 0,
      completedSetCount: 0,
      startedAt: Date.now() - 1000,
      exercises: undefined,
    })

    const workoutStore = useWorkoutStore()
    await workoutStore.loadResumableSession()
    const result = await workoutStore.resumeSession()
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBeTruthy()
  })
})

describe('substituteExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('resolves from exerciseLibrary, not programStore', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startWorkout('upper_strength', [baseExercise], 'foundation', 1)

    vi.spyOn(exerciseLibrary, 'getExerciseByName').mockResolvedValue({
      name: 'Pec Deck',
      source: 'library',
    })
    const result = await workoutStore.substituteExercise('upper_strength:0', 'Pec Deck')
    expect(result).toBe(true)
    expect(workoutStore.todayExercises[0].name).toBe('Pec Deck')
  })

  it('rolls back in-memory state when DB update fails', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startWorkout('upper_strength', [baseExercise], 'foundation', 1)

    vi.spyOn(exerciseLibrary, 'getExerciseByName').mockResolvedValue({
      name: 'Pec Deck',
      source: 'library',
    })
    vi.mocked(mockDb.sessions.update).mockRejectedValueOnce(new Error('DB write failed'))

    const result = await workoutStore.substituteExercise('upper_strength:0', 'Pec Deck')
    expect(result).toBe(false)
    expect(workoutStore.todayExercises[0].name).toBe('Bench Press')
  })

  it('returns false when exerciseLibrary returns null', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startWorkout('upper_strength', [baseExercise])

    vi.spyOn(exerciseLibrary, 'getExerciseByName').mockResolvedValue(null)
    const result = await workoutStore.substituteExercise('upper_strength:0', 'Unknown Exercise')
    expect(result).toBe(false)
    expect(workoutStore.todayExercises[0].name).toBe('Bench Press')
  })
})

describe('goToExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sessions.update).mockClear()
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('jumps to valid index and persists', async () => {
    const workoutStore = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, name: 'Ex1', slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Ex2', slotKey: 'free:1', dayType: 'free' }
    const ex3: SessionExercise = { ...baseExercise, name: 'Ex3', slotKey: 'free:2', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex1, ex2, ex3])
    expect(workoutStore.currentExercise?.name).toBe('Ex1')

    const ok = await workoutStore.goToExercise(2)
    expect(ok).toBe(true)
    expect(workoutStore.currentExercise?.name).toBe('Ex3')
    const updateCalls = vi.mocked(mockDb.sessions.update).mock.calls
    const lastCall = updateCalls[updateCalls.length - 1]
    expect(lastCall[1]).toEqual({ currentExerciseIndex: 2 })
  })

  it('returns true for same index (no-op)', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startWorkout('free', [baseExercise])
    vi.mocked(mockDb.sessions.update).mockClear()
    const ok = await workoutStore.goToExercise(0)
    expect(ok).toBe(true)
    expect(mockDb.sessions.update).not.toHaveBeenCalled()
  })

  it('returns false for out-of-bounds index', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startWorkout('free', [baseExercise])
    vi.mocked(mockDb.sessions.update).mockClear()
    const ok = await workoutStore.goToExercise(5)
    expect(ok).toBe(false)
    expect(workoutStore.currentExercise?.name).toBe('Bench Press')
    expect(mockDb.sessions.update).not.toHaveBeenCalled()
  })

  it('reverts in-memory when DB update fails', async () => {
    const workoutStore = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, name: 'Ex1', slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Ex2', slotKey: 'free:1', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex1, ex2])
    vi.mocked(mockDb.sessions.update).mockRejectedValueOnce(new Error('DB fail'))

    const ok = await workoutStore.goToExercise(1)
    expect(ok).toBe(false)
    expect(workoutStore.currentExercise?.name).toBe('Ex1')
  })
})

describe('logSet isWarmup override', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.add).mockClear()
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
  })

  it('uses explicit false when auto would mark warm-up', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 2, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    expect(workoutStore.isWarmupSet).toBe(true)

    await workoutStore.logSet(135, 10, 9, false)

    const payload = vi.mocked(mockDb.sets.add).mock.calls[0][0] as { isWarmup: boolean }
    expect(payload.isWarmup).toBe(false)
  })

  it('uses explicit true when auto would mark working set', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    expect(workoutStore.isWarmupSet).toBe(false)

    await workoutStore.logSet(135, 10, 9, true)

    const payload = vi.mocked(mockDb.sets.add).mock.calls[0][0] as { isWarmup: boolean }
    expect(payload.isWarmup).toBe(true)
  })
})

describe('workoutProgress', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
  })

  it('returns 0 when no exercises', async () => {
    const workoutStore = useWorkoutStore()
    await workoutStore.startFreeWorkout()
    expect(workoutStore.workoutProgress).toBe(0)
  })

  it('returns completed/total ratio', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 1, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    expect(workoutStore.workoutProgress).toBe(0)

    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    await workoutStore.logSet(135, 10, 9)
    await workoutStore.logSet(140, 10, 9)
    expect(workoutStore.workoutProgress).toBeCloseTo(2 / 4, 5)
  })

  it('addSetToExercise increments workingSets for current exercise', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    const ok = await workoutStore.addSetToExercise('free:0')
    expect(ok).toBe(true)
    expect(workoutStore.todayExercises[0].workingSets).toBe(4)
  })

  it('addSetToExercise returns false for past exercise index', async () => {
    const workoutStore = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, name: 'A', slotKey: 'free:0', dayType: 'free', workingSets: 2, warmupSets: 0 }
    const ex2: SessionExercise = { ...baseExercise, name: 'B', slotKey: 'free:1', dayType: 'free', workingSets: 2, warmupSets: 0 }
    await workoutStore.startWorkout('free', [ex1, ex2])
    workoutStore.activeSession!.currentExerciseIndex = 1
    const ok = await workoutStore.addSetToExercise('free:0')
    expect(ok).toBe(false)
  })

  it('removeSetFromExercise decrements when sets remain unlogged', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 4, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    const ok = await workoutStore.removeSetFromExercise('free:0')
    expect(ok).toBe(true)
    expect(workoutStore.todayExercises[0].workingSets).toBe(3)
  })

  it('removeSetFromExercise returns false when all sets logged', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 1, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    await workoutStore.logSet(100, 10, 8)
    const ok = await workoutStore.removeSetFromExercise('free:0')
    expect(ok).toBe(false)
  })

  it('logSet marks PR when weight beats historical and session prior', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    const r1 = await workoutStore.logSet(130, 10, 8, false, 125)
    expect(r1.ok).toBe(true)
    if (r1.ok) expect(r1.isPR).toBe(true)
    const r2 = await workoutStore.logSet(130, 10, 8, false, 125)
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.isPR).toBe(false)
  })

  it('logSet does not mark PR without prior history', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    const r = await workoutStore.logSet(200, 5, 8, false, 0)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.isPR).toBe(false)
  })

  it('isPRSet returns true for logged PR set IDs', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(42)
    await workoutStore.logSet(200, 5, 8, false, 150)
    expect(workoutStore.isPRSet(42)).toBe(true)
    expect(workoutStore.isPRSet(999)).toBe(false)
    expect(workoutStore.isPRSet(undefined)).toBe(false)
  })

  it('addSetToExercise rolls back on DB failure', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sessions.update).mockRejectedValueOnce(new Error('DB fail'))
    const ok = await workoutStore.addSetToExercise('free:0')
    expect(ok).toBe(false)
    expect(workoutStore.todayExercises[0].workingSets).toBe(3)
  })

  it('removeSetFromExercise decrements warmupSets when workingSets is 0', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 2, workingSets: 0, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    const ok = await workoutStore.removeSetFromExercise('free:0')
    expect(ok).toBe(true)
    expect(workoutStore.todayExercises[0].warmupSets).toBe(1)
    expect(workoutStore.todayExercises[0].workingSets).toBe(0)
  })

  it('removeSetFromExercise rolls back on DB failure', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 4, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sessions.update).mockRejectedValueOnce(new Error('DB fail'))
    const ok = await workoutStore.removeSetFromExercise('free:0')
    expect(ok).toBe(false)
    expect(workoutStore.todayExercises[0].workingSets).toBe(4)
  })

  it('clamps to 1 when completed exceeds total', async () => {
    const workoutStore = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 2, slotKey: 'free:0', dayType: 'free' }
    await workoutStore.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    await workoutStore.logSet(135, 10, 9)
    await workoutStore.logSet(140, 10, 9)
    workoutStore.completedSets.push({
      id: 99,
      sessionId: workoutStore.activeSession!.id!,
      exerciseSlot: ex.slotKey,
      exerciseName: ex.name,
      setNumber: 3,
      weight: 145,
      reps: 10,
      rpe: 9,
      isWarmup: false,
      timestamp: Date.now(),
    })
    expect(workoutStore.workoutProgress).toBe(1)
  })
})

describe('updateSetLog', () => {
  const storedSet = {
    id: 10,
    sessionId: 1,
    exerciseSlot: 'free:0',
    exerciseName: 'Bench Press',
    setNumber: 1,
    weight: 135,
    reps: 10,
    rpe: 8,
    isWarmup: false,
    timestamp: Date.now(),
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.get).mockReset()
    vi.mocked(mockDb.sets.update).mockReset()
    vi.mocked(mockDb.sets.get).mockResolvedValue({ ...storedSet })
    vi.mocked(mockDb.sets.update).mockResolvedValue(undefined)
  })

  it('updates weight/reps/rpe and returns true', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8)

    const ok = await store.updateSetLog(10, 140, 12, 9)
    expect(ok).toBe(true)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.weight).toBe(140)
    expect(patch.reps).toBe(12)
    expect(patch.rpe).toBe(9)
  })

  it('stores prevWeight/prevReps/prevRpe audit fields', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8)

    await store.updateSetLog(10, 140, 12, 9)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.prevWeight).toBe(135)
    expect(patch.prevReps).toBe(10)
    expect(patch.prevRpe).toBe(8)
  })

  it('sets editedAt timestamp', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8)

    const before = Date.now()
    await store.updateSetLog(10, 140, 12, 9)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.editedAt).toBeGreaterThanOrEqual(before)
  })

  it('updates in-memory completedSets for active session', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8)

    await store.updateSetLog(10, 140, 12, 9)
    const updated = store.completedSets.find((s) => s.id === 10)
    expect(updated?.weight).toBe(140)
    expect(updated?.reps).toBe(12)
    expect(updated?.rpe).toBe(9)
  })

  it('returns false when set ID not found', async () => {
    const store = useWorkoutStore()
    vi.mocked(mockDb.sets.get).mockResolvedValue(undefined)
    const ok = await store.updateSetLog(999, 140, 12, 9)
    expect(ok).toBe(false)
    expect(mockDb.sets.update).not.toHaveBeenCalled()
  })

  it('returns false on DB read failure', async () => {
    const store = useWorkoutStore()
    vi.mocked(mockDb.sets.get).mockRejectedValue(new Error('DB read error'))
    const ok = await store.updateSetLog(10, 140, 12, 9)
    expect(ok).toBe(false)
    expect(mockDb.sets.update).not.toHaveBeenCalled()
  })

  it('returns false on DB write failure', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8)
    vi.mocked(mockDb.sets.update).mockRejectedValue(new Error('DB write error'))

    const ok = await store.updateSetLog(10, 140, 12, 9)
    expect(ok).toBe(false)
    const original = store.completedSets.find((s) => s.id === 10)
    expect(original?.weight).toBe(135)
  })

  it('isWarmup=true flips working set to warm-up in DB and memory', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8, false)

    const ok = await store.updateSetLog(10, 135, 10, 8, true)
    expect(ok).toBe(true)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.isWarmup).toBe(true)
    const updated = store.completedSets.find((s) => s.id === 10)
    expect(updated?.isWarmup).toBe(true)
  })

  it('isWarmup=false flips warm-up to working set', async () => {
    vi.mocked(mockDb.sets.get).mockResolvedValue({ ...storedSet, isWarmup: true })
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 1, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8, true)

    const ok = await store.updateSetLog(10, 135, 10, 8, false)
    expect(ok).toBe(true)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.isWarmup).toBe(false)
    const updated = store.completedSets.find((s) => s.id === 10)
    expect(updated?.isWarmup).toBe(false)
  })

  it('isWarmup undefined leaves isWarmup unchanged', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8, false)

    await store.updateSetLog(10, 140, 12, 9)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.isWarmup).toBeUndefined()
    const updated = store.completedSets.find((s) => s.id === 10)
    expect(updated?.isWarmup).toBe(false)
  })

  it('prevIsWarmup audit field stored correctly', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sets.add).mockResolvedValue(10)
    await store.logSet(135, 10, 8, false)

    await store.updateSetLog(10, 135, 10, 8, true)
    const patch = vi.mocked(mockDb.sets.update).mock.calls[0][1] as Record<string, unknown>
    expect(patch.prevIsWarmup).toBe(false)
  })
})

describe('isExerciseComplete', () => {
  const makeEx = (warmup: number, working: number): SessionExercise => ({
    ...baseExercise,
    warmupSets: warmup,
    workingSets: working,
    slotKey: 'free:0',
    dayType: 'free',
  })

  const makeSet = (isWarmup: boolean): import('../types/session').SetLog => ({
    id: 1,
    sessionId: 1,
    exerciseSlot: 'free:0',
    exerciseName: 'Bench Press',
    setNumber: 1,
    weight: 135,
    reps: 10,
    rpe: 8,
    isWarmup,
    timestamp: Date.now(),
  })

  it('returns true when workingDone >= workingSets', () => {
    const ex = makeEx(2, 3)
    const sets = [makeSet(true), makeSet(true), makeSet(false), makeSet(false), makeSet(false)]
    expect(isExerciseComplete(ex, sets)).toBe(true)
  })

  it('returns true when totalDone >= totalPlanned (warmup edge case)', () => {
    const ex = makeEx(2, 3)
    const sets = [makeSet(true), makeSet(true), makeSet(true), makeSet(false), makeSet(false)]
    expect(isExerciseComplete(ex, sets)).toBe(true)
  })

  it('returns false when neither condition met', () => {
    const ex = makeEx(2, 3)
    const sets = [makeSet(true), makeSet(false), makeSet(false)]
    expect(isExerciseComplete(ex, sets)).toBe(false)
  })
})

describe('logSet auto-advance', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.add).mockClear()
    vi.mocked(mockDb.sets.add).mockResolvedValue(1)
    vi.mocked(mockDb.sessions.update).mockClear()
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('auto-advances when exercise is complete', async () => {
    const store = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 2, slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Squat', warmupSets: 0, workingSets: 2, slotKey: 'free:1', dayType: 'free' }
    await store.startWorkout('free', [ex1, ex2])
    expect(store.activeSession!.currentExerciseIndex).toBe(0)

    await store.logSet(135, 10, 8)
    expect(store.activeSession!.currentExerciseIndex).toBe(0)

    await store.logSet(135, 10, 8)
    expect(store.activeSession!.currentExerciseIndex).toBe(1)
  })

  it('does NOT auto-advance when exercise is incomplete', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])

    await store.logSet(135, 10, 8)
    expect(store.activeSession!.currentExerciseIndex).toBe(0)
  })
})

describe('completedSetsBySlot', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.add).mockClear()
    let setId = 1
    vi.mocked(mockDb.sets.add).mockImplementation(() => Promise.resolve(setId++))
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('returns empty Map with no sets', async () => {
    const store = useWorkoutStore()
    await store.startWorkout('free', [{ ...baseExercise, slotKey: 'free:0', dayType: 'free' }])
    expect(store.completedSetsBySlot.size).toBe(0)
  })

  it('groups sets by slotKey', async () => {
    const store = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Squat', warmupSets: 0, workingSets: 3, slotKey: 'free:1', dayType: 'free' }
    await store.startWorkout('free', [ex1, ex2])

    await store.logSet(135, 10, 8)
    await store.logSet(140, 8, 9)

    const map = store.completedSetsBySlot
    expect(map.get('free:0')?.length).toBe(2)
    expect(map.get('free:1')).toBeUndefined()
  })

  it('reacts to new sets being logged', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])

    expect(store.completedSetsBySlot.get('free:0')).toBeUndefined()
    await store.logSet(100, 10, 8)
    expect(store.completedSetsBySlot.get('free:0')?.length).toBe(1)
  })
})

describe('totalSetsForCurrentExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
  })

  it('returns 0 with no active exercise', async () => {
    const store = useWorkoutStore()
    await store.startFreeWorkout()
    expect(store.totalSetsForCurrentExercise).toBe(0)
  })

  it('returns warmup + working sets', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 2, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    expect(store.totalSetsForCurrentExercise).toBe(5)
  })

  it('updates after addSetToExercise', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
    await store.addSetToExercise('free:0')
    expect(store.totalSetsForCurrentExercise).toBe(4)
  })
})

describe('currentExerciseSetNumber', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.add).mockClear()
    let setId = 1
    vi.mocked(mockDb.sets.add).mockImplementation(() => Promise.resolve(setId++))
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
  })

  it('returns 0 with no active exercise', async () => {
    const store = useWorkoutStore()
    await store.startFreeWorkout()
    expect(store.currentExerciseSetNumber).toBe(0)
  })

  it('starts at 1 and increments per exercise', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    expect(store.currentExerciseSetNumber).toBe(1)

    await store.logSet(135, 10, 8)
    expect(store.currentExerciseSetNumber).toBe(2)
  })

  it('resets to 1 when navigating to a new exercise', async () => {
    const store = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Squat', warmupSets: 0, workingSets: 5, slotKey: 'free:1', dayType: 'free' }
    await store.startWorkout('free', [ex1, ex2])

    await store.logSet(135, 10, 8)
    await store.logSet(140, 8, 9)
    expect(store.currentExerciseSetNumber).toBe(3)

    await store.goToExercise(1)
    expect(store.currentExerciseSetNumber).toBe(1)
  })
})

describe('deleteSetLog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(mockDb.sessions.add).mockResolvedValue(1)
    vi.mocked(mockDb.sets.add).mockClear()
    vi.mocked(mockDb.sets.delete).mockClear()
    vi.mocked(mockDb.sets.delete).mockResolvedValue(undefined)
    vi.mocked(mockDb.sessions.update).mockClear()
    vi.mocked(mockDb.sessions.update).mockResolvedValue(undefined)
    let setId = 100
    vi.mocked(mockDb.sets.add).mockImplementation(() => Promise.resolve(setId++))
  })

  it('removes a logged set from memory and DB', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    await store.logSet(135, 10, 8)
    expect(store.completedSets).toHaveLength(1)
    const setId = store.completedSets[0].id!

    const ok = await store.deleteSetLog(setId)
    expect(ok).toBe(true)
    expect(store.completedSets).toHaveLength(0)
    expect(mockDb.sets.delete).toHaveBeenCalledWith(setId)
  })

  it('returns false when set ID not found', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    const ok = await store.deleteSetLog(999)
    expect(ok).toBe(false)
  })

  it('returns false when no active session', async () => {
    const store = useWorkoutStore()
    const ok = await store.deleteSetLog(1)
    expect(ok).toBe(false)
  })

  it('removes PR set ID from prSetIds', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    await store.logSet(200, 5, 8, false, 150)
    const setId = store.completedSets[0].id!
    expect(store.isPRSet(setId)).toBe(true)

    await store.deleteSetLog(setId)
    expect(store.isPRSet(setId)).toBe(false)
  })

  it('rolls back auto-advance when no sets on new exercise', async () => {
    const store = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 2, slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Squat', warmupSets: 0, workingSets: 3, slotKey: 'free:1', dayType: 'free' }
    await store.startWorkout('free', [ex1, ex2])

    await store.logSet(135, 10, 8)
    await store.logSet(140, 8, 9)
    expect(store.activeSession!.currentExerciseIndex).toBe(1)

    const lastSetId = store.completedSets[1].id!
    await store.deleteSetLog(lastSetId)
    expect(store.activeSession!.currentExerciseIndex).toBe(0)
  })

  it('does NOT roll back when sets exist on the new exercise', async () => {
    const store = useWorkoutStore()
    const ex1: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 2, slotKey: 'free:0', dayType: 'free' }
    const ex2: SessionExercise = { ...baseExercise, name: 'Squat', warmupSets: 0, workingSets: 3, slotKey: 'free:1', dayType: 'free' }
    await store.startWorkout('free', [ex1, ex2])

    await store.logSet(135, 10, 8)
    await store.logSet(140, 8, 9)
    expect(store.activeSession!.currentExerciseIndex).toBe(1)

    await store.logSet(200, 5, 8)
    expect(store.completedSets).toHaveLength(3)

    const firstExSetId = store.completedSets[0].id!
    await store.deleteSetLog(firstExSetId)
    expect(store.activeSession!.currentExerciseIndex).toBe(1)
  })

  it('reverts on DB failure', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    await store.logSet(135, 10, 8)
    const setId = store.completedSets[0].id!

    vi.mocked(mockDb.sets.delete).mockRejectedValueOnce(new Error('DB fail'))
    const ok = await store.deleteSetLog(setId)
    expect(ok).toBe(false)
    expect(store.completedSets).toHaveLength(1)
    expect(store.completedSets[0].id).toBe(setId)
  })

  it('updates completedSetsBySlot after deletion', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    await store.logSet(135, 10, 8)
    await store.logSet(140, 8, 9)
    expect(store.completedSetsBySlot.get('free:0')?.length).toBe(2)

    const setId = store.completedSets[0].id!
    await store.deleteSetLog(setId)
    expect(store.completedSetsBySlot.get('free:0')?.length).toBe(1)
  })

  it('deleting a warmup set updates isWarmupSet', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 1, workingSets: 3, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    expect(store.isWarmupSet).toBe(true)

    await store.logSet(95, 10, 5, true)
    expect(store.isWarmupSet).toBe(false)

    const setId = store.completedSets[0].id!
    await store.deleteSetLog(setId)
    expect(store.isWarmupSet).toBe(true)
  })

  it('deleting last set for exercise brings count back to 0', async () => {
    const store = useWorkoutStore()
    const ex: SessionExercise = { ...baseExercise, warmupSets: 0, workingSets: 5, slotKey: 'free:0', dayType: 'free' }
    await store.startWorkout('free', [ex])
    await store.logSet(135, 10, 8)
    const setId = store.completedSets[0].id!

    await store.deleteSetLog(setId)
    expect(store.completedSetsBySlot.get('free:0')).toBeUndefined()
    expect(store.currentExerciseSetNumber).toBe(1)
  })
})
