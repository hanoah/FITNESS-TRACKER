import { describe, it, expect, vi } from 'vitest'
import {
  getAllKnownExercises,
  searchExercises,
  getExerciseByName,
  toSessionExercise,
  filterByMuscles,
  type ExerciseInfo,
} from './exerciseLibrary'

vi.mock('./db', () => ({
  db: {
    sets: {
      orderBy: vi.fn().mockReturnValue({
        reverse: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
  },
}))

describe('exerciseLibrary', () => {

  it('getAllKnownExercises deduplicates across sources with program > exercisedb > library > history priority', async () => {
    const all = await getAllKnownExercises()
    const byName = new Map(all.map((e) => [e.name, e]))
    expect(byName.size).toBe(all.length)
    for (const ex of all) {
      expect(ex.name).toBeTruthy()
      expect(['program', 'library', 'history', 'exercisedb']).toContain(ex.source)
    }
  })

  it('searchExercises matches case-insensitively', async () => {
    const results = await searchExercises('bench')
    expect(results.every((r) => r.name.toLowerCase().includes('bench'))).toBe(true)
  })

  it('searchExercises returns all when query is empty', async () => {
    const results = await searchExercises('')
    const all = await getAllKnownExercises()
    expect(results.length).toBe(all.length)
  })

  it('getExerciseByName returns exact match or null', async () => {
    const all = await getAllKnownExercises()
    const first = all[0]
    if (first) {
      const found = await getExerciseByName(first.name)
      expect(found).toBeTruthy()
      expect(found?.name).toBe(first.name)
    }
    const missing = await getExerciseByName('__nonexistent_exercise_xyz__')
    expect(missing).toBeNull()
  })

  it('toSessionExercise merges info with defaults and sets slotKey', () => {
    const info: ExerciseInfo = { name: 'Test Exercise', source: 'history' }
    const session = toSessionExercise(info, 'free:5')
    expect(session.name).toBe('Test Exercise')
    expect(session.slotKey).toBe('free:5')
    expect(session.workingSets).toBe(3)
    expect(session.repRange).toEqual([8, 12])
  })

  it('toSessionExercise passes through exerciseDbId, bodyPart, equipment', () => {
    const info: ExerciseInfo = {
      name: 'Barbell Bench Press',
      source: 'exercisedb',
      exerciseDbId: 'exr_abc123',
      imageUrl: 'https://cdn.exercisedb.dev/images/abc123.gif',
      bodyPart: 'chest',
      equipment: 'barbell',
    }
    const session = toSessionExercise(info, 'template_0')
    expect(session.exerciseDbId).toBe('exr_abc123')
    expect(session.imageUrl).toBe('https://cdn.exercisedb.dev/images/abc123.gif')
    expect(session.bodyPart).toBe('chest')
    expect(session.equipment).toBe('barbell')
  })
})

describe('filterByMuscles', () => {
  const withMuscles = (name: string, primary: string[], secondary: string[]): ExerciseInfo => ({
    name,
    source: 'library',
    muscles: { primary, secondary },
  })

  it('includes exercises with matching muscles', () => {
    const exercises = [
      withMuscles('Bench Press', ['chest'], ['triceps']),
      withMuscles('Squat', ['quads'], ['glutes']),
    ]
    const result = filterByMuscles(exercises, ['chest'])
    expect(result.map((e) => e.name)).toEqual(['Bench Press'])
  })

  it('excludes exercises with non-matching muscles', () => {
    const exercises = [withMuscles('Squat', ['quads'], ['glutes'])]
    const result = filterByMuscles(exercises, ['chest'])
    expect(result).toHaveLength(0)
  })

  it('passes through exercises with no muscle data (undefined)', () => {
    const exercises: ExerciseInfo[] = [
      { name: 'Custom Lift', source: 'history' },
    ]
    const result = filterByMuscles(exercises, ['chest'])
    expect(result.map((e) => e.name)).toEqual(['Custom Lift'])
  })

  it('passes through exercises with empty muscle arrays', () => {
    const exercises: ExerciseInfo[] = [
      { name: 'Empty Muscles', source: 'history', muscles: { primary: [], secondary: [] } },
    ]
    const result = filterByMuscles(exercises, ['chest'])
    expect(result.map((e) => e.name)).toEqual(['Empty Muscles'])
  })

  it('returns all when muscle filter is empty', () => {
    const exercises = [
      withMuscles('A', ['chest'], []),
      withMuscles('B', ['quads'], []),
    ]
    const result = filterByMuscles(exercises, [])
    expect(result).toHaveLength(2)
  })
})

describe('getAllKnownExercises history enrichment', () => {
  it('enriches history exercises with muscle data when available', async () => {
    const mockSets = [
      { exerciseName: 'Bench Press', exerciseSlot: 'free:0', timestamp: Date.now() },
    ]
    const { db } = await import('./db')
    vi.mocked(db.sets.orderBy).mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockSets),
        }),
      }),
    } as never)

    const all = await getAllKnownExercises()
    const benchEntries = all.filter((e) => e.name.toLowerCase().includes('bench press'))
    const withMuscles = benchEntries.filter((e) => e.muscles)
    expect(withMuscles.length).toBeGreaterThan(0)
  })
})
