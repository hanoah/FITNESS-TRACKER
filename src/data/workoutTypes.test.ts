import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProgramStore } from '../store/program'
import { getScheduleDay } from '../lib/scheduleDay'
import workoutTypesData from './workoutTypes.json'

vi.mock('../lib/db', () => ({
  db: {
    programState: {
      get: vi.fn().mockResolvedValue({ blockId: 'foundation', weekNumber: 1 }),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

interface WorkoutType {
  key: string
  label: string
  description: string
  recommendedDay: string
}

const workoutTypes = workoutTypesData as WorkoutType[]

describe('workoutTypes derivation', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const programStore = useProgramStore()
    await programStore.loadProgramState()
  })

  it('has 4 workout cards', () => {
    expect(workoutTypes.length).toBe(4)
  })

  it('each card has recommendedDay matching a schedule key', () => {
    const validDays = ['monday', 'tuesday', 'thursday', 'saturday']
    for (const wt of workoutTypes) {
      expect(validDays).toContain(wt.recommendedDay)
    }
  })

  it('getScheduleDay returns key used by isRecommended', () => {
    const monday = new Date(2025, 2, 10)
    const result = getScheduleDay(monday)
    expect(result?.key).toBe('monday')
    const mondayCard = workoutTypes.find((w) => w.recommendedDay === 'monday')
    expect(mondayCard).toBeDefined()
    expect(result?.key === mondayCard?.recommendedDay).toBe(true)
  })

  it('exercise count is derived from getExercisesForDay', async () => {
    const programStore = useProgramStore()
    const mondayCount = programStore.getExercisesForDay('monday').length
    const tuesdayCount = programStore.getExercisesForDay('tuesday').length
    expect(mondayCount).toBeGreaterThan(0)
    expect(tuesdayCount).toBeGreaterThan(0)
  })
})
