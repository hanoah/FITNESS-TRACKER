import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useExerciseProgression } from './useExerciseProgression'
import type { SetLog } from '../types/session'

const { mockSets, mockWhereAboveToArray, mockToArray } = vi.hoisted(() => {
  const sets: SetLog[] = [
    {
      sessionId: 1,
      exerciseSlot: 'upper:0',
      exerciseName: 'Bench Press',
      setNumber: 1,
      weight: 135,
      reps: 8,
      rpe: 8,
      isWarmup: false,
      timestamp: new Date('2025-03-10').getTime(),
    },
    {
      sessionId: 1,
      exerciseSlot: 'upper:0',
      exerciseName: 'Bench Press',
      setNumber: 2,
      weight: 140,
      reps: 6,
      rpe: 9,
      isWarmup: false,
      timestamp: new Date('2025-03-10').getTime(),
    },
    {
      sessionId: 2,
      exerciseSlot: 'upper:0',
      exerciseName: 'Bench Press',
      setNumber: 1,
      weight: 145,
      reps: 6,
      rpe: 8,
      isWarmup: false,
      timestamp: new Date('2025-03-13').getTime(),
    },
    {
      sessionId: 3,
      exerciseSlot: 'lower:0',
      exerciseName: 'Squat',
      setNumber: 1,
      weight: 225,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      timestamp: new Date('2025-03-15').getTime(),
    },
  ]
  return {
    mockSets: sets,
    mockWhereAboveToArray: vi.fn().mockResolvedValue(sets),
    mockToArray: vi.fn().mockResolvedValue(sets),
  }
})

vi.mock('../lib/db', () => ({
  db: {
    sets: {
      where: () => ({
        above: () => ({
          toArray: mockWhereAboveToArray,
        }),
      }),
      toArray: mockToArray,
    },
  },
}))

describe('useExerciseProgression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhereAboveToArray.mockResolvedValue(mockSets)
    mockToArray.mockResolvedValue(mockSets)
  })

  it('groups sets by exercise name', async () => {
    const { loadAllSets, getExerciseGroup } = useExerciseProgression()
    await loadAllSets()
    const bench = getExerciseGroup('Bench Press')
    expect(bench).not.toBeNull()
    expect(bench!.exerciseName).toBe('Bench Press')
    expect(bench!.sets.length).toBe(3)
  })

  it('sorts exercises by most recent activity', async () => {
    const { loadAllSets, exercisesSortedByRecent } = useExerciseProgression()
    await loadAllSets()
    const names = exercisesSortedByRecent.value
    expect(names[0]).toBe('Squat')
    expect(names[1]).toBe('Bench Press')
  })

  it('returns null for unknown exercise', async () => {
    const { loadAllSets, getExerciseGroup } = useExerciseProgression()
    await loadAllSets()
    const unknown = getExerciseGroup('Unknown Exercise')
    expect(unknown).toBeNull()
  })

  it('builds progression data from working sets only', async () => {
    const { loadAllSets, getExerciseGroup } = useExerciseProgression()
    await loadAllSets()
    const bench = getExerciseGroup('Bench Press')
    expect(bench!.progressionData.length).toBe(2)
    expect(bench!.progressionData[0]).toEqual({ date: '2025-03-10', weight: 140 })
    expect(bench!.progressionData[1]).toEqual({ date: '2025-03-13', weight: 145 })
  })

  it('returns best set (highest weight×reps)', async () => {
    const { loadAllSets, getExerciseGroup } = useExerciseProgression()
    await loadAllSets()
    const bench = getExerciseGroup('Bench Press')
    expect(bench!.bestSet).toEqual({ weight: 135, reps: 8, rpe: 8 })
  })

  it('separate instances have independent loadError state', async () => {
    mockWhereAboveToArray.mockRejectedValueOnce(new Error('indexed fail'))
    mockToArray.mockRejectedValueOnce(new Error('fallback fail'))
    const prog1 = useExerciseProgression()
    await prog1.loadAllSets()
    expect(prog1.loadError.value).toBe('Failed to load sets')

    mockWhereAboveToArray.mockResolvedValue(mockSets)
    mockToArray.mockResolvedValue(mockSets)
    const prog2 = useExerciseProgression()
    await prog2.loadAllSets()
    expect(prog2.loadError.value).toBeNull()
    expect(prog2.allSets.value.length).toBe(4)
  })
})
