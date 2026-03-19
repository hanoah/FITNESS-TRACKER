import { describe, it, expect, vi } from 'vitest'
import {
  getAllKnownExercises,
  searchExercises,
  getExerciseByName,
  toSessionExercise,
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
