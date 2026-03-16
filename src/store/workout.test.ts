import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkoutStore } from './workout'
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
