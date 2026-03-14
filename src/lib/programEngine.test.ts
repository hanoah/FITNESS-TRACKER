import { describe, it, expect } from 'vitest'
import { getDayExercises, getCurrentBlockAndWeek } from './programEngine'
import type { NippardProgram } from '../types/program'
import type { ScheduleConfig } from '../types/schedule'

const minimalProgram: NippardProgram = {
  blocks: [
    {
      id: 'foundation',
      name: 'Foundation',
      weeks: [
        {
          number: 1,
          isDeload: false,
          days: [
            {
              id: 'upper_strength',
              name: 'Upper',
              exercises: [
                {
                  name: 'Bench Press',
                  demoUrl: '',
                  intensityTechnique: 'none',
                  warmupSets: 2,
                  workingSets: 3,
                  repRange: [6, 8],
                  earlySetRPE: 6,
                  lastSetRPE: 8,
                  restSeconds: [180, 300],
                  sub1: '',
                  sub2: '',
                  notes: '',
                },
                {
                  name: 'Row',
                  demoUrl: '',
                  intensityTechnique: 'none',
                  warmupSets: 2,
                  workingSets: 3,
                  repRange: [8, 10],
                  earlySetRPE: 7,
                  lastSetRPE: 9,
                  restSeconds: [90, 120],
                  sub1: '',
                  sub2: '',
                  notes: '',
                },
              ],
            },
            {
              id: 'lower_strength',
              name: 'Lower',
              exercises: [
                {
                  name: 'Squat',
                  demoUrl: '',
                  intensityTechnique: 'none',
                  warmupSets: 3,
                  workingSets: 3,
                  repRange: [5, 7],
                  earlySetRPE: 6,
                  lastSetRPE: 8,
                  restSeconds: [180, 240],
                  sub1: '',
                  sub2: '',
                  notes: '',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const schedule: ScheduleConfig = {
  monday: [{ day: 'lower_strength' }],
  tuesday: [{ day: 'upper_strength' }],
  thursday: [
    { day: 'upper_strength' },
    { day: 'lower_strength' },
  ],
  saturday: [{ day: 'lower_strength' }],
}

describe('getDayExercises', () => {
  it('returns exercises for valid schedule', () => {
    const result = getDayExercises('monday', schedule, minimalProgram, 'foundation', 1)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Squat')
    expect(result[0].slotKey).toBe('lower_strength:0')
    expect(result[0].dayType).toBe('lower_strength')
  })

  it('throws on missing block', () => {
    expect(() =>
      getDayExercises('monday', schedule, minimalProgram, 'nonexistent', 1)
    ).toThrow('Block nonexistent not found')
  })

  it('throws on missing week', () => {
    expect(() =>
      getDayExercises('monday', schedule, minimalProgram, 'foundation', 99)
    ).toThrow('Week 99 not found in block foundation')
  })

  it('throws on missing day', () => {
    const badSchedule: ScheduleConfig = {
      ...schedule,
      monday: [{ day: 'nonexistent_day' }],
    }
    expect(() =>
      getDayExercises('monday', badSchedule, minimalProgram, 'foundation', 1)
    ).toThrow('Day nonexistent_day not found')
  })

  it('returns empty array for empty schedule entry', () => {
    const emptySchedule: ScheduleConfig = {
      monday: [],
      tuesday: [],
      thursday: [],
      saturday: [],
    }
    const result = getDayExercises('monday', emptySchedule, minimalProgram, 'foundation', 1)
    expect(result).toEqual([])
  })

  it('applies exercise index filter', () => {
    const filteredSchedule: ScheduleConfig = {
      ...schedule,
      tuesday: [{ day: 'upper_strength', exerciseIndices: [0] }],
    }
    const result = getDayExercises('tuesday', filteredSchedule, minimalProgram, 'foundation', 1)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bench Press')
  })

  it('merges multiple days (e.g. thursday = upper + lower)', () => {
    const result = getDayExercises('thursday', schedule, minimalProgram, 'foundation', 1)
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('Bench Press')
    expect(result[1].name).toBe('Row')
    expect(result[2].name).toBe('Squat')
    expect(result[0].dayType).toBe('upper_strength')
    expect(result[2].dayType).toBe('lower_strength')
  })
})

describe('getCurrentBlockAndWeek', () => {
  it('returns existing state when provided', () => {
    const result = getCurrentBlockAndWeek(minimalProgram, {
      blockId: 'foundation',
      weekNumber: 1,
    })
    expect(result).toEqual({ blockId: 'foundation', weekNumber: 1 })
  })

  it('returns first block week 1 when state is null', () => {
    const result = getCurrentBlockAndWeek(minimalProgram, null)
    expect(result).toEqual({ blockId: 'foundation', weekNumber: 1 })
  })

  it('throws when program has no blocks', () => {
    const emptyProgram: NippardProgram = { blocks: [] }
    expect(() => getCurrentBlockAndWeek(emptyProgram, null)).toThrow('Program has no blocks')
  })
})
