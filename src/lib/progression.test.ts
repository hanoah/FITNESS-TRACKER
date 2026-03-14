import { describe, it, expect } from 'vitest'
import { suggest } from './progression'
import type { ResolvedExercise } from './programEngine'
import type { SetLog } from '../types/session'

const baseExercise: ResolvedExercise = {
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
  slotKey: 'upper_strength:0',
  dayType: 'upper_strength',
}

function makeSet(weight: number, reps: number, rpe: number, isWarmup = false): SetLog {
  return {
    sessionId: 1,
    exerciseSlot: baseExercise.slotKey,
    exerciseName: baseExercise.name,
    setNumber: 1,
    weight,
    reps,
    rpe,
    isWarmup,
    timestamp: Date.now(),
  }
}

describe('suggest', () => {
  it('returns default note when no history', () => {
    const result = suggest(baseExercise, [], [])
    expect(result.note).toContain('6-8 reps')
    expect(result.note).toContain('RPE 6-8')
  })

  it('suggests add rep when reps below max', () => {
    const history: SetLog[] = [
      makeSet(135, 6, 8, false),
      makeSet(135, 6, 8, false),
    ]
    const result = suggest(baseExercise, history, history)
    expect(result.reps).toBe(7)
    expect(result.weight).toBe(135)
    expect(result.note).toContain('Add 1 rep')
  })

  it('suggests add weight when reps at max', () => {
    const history: SetLog[] = [
      makeSet(135, 8, 8, false),
      makeSet(135, 8, 8, false),
    ]
    const result = suggest(baseExercise, history, history)
    expect(result.weight).toBe(140)
    expect(result.reps).toBe(6)
    expect(result.note).toContain('Add weight')
  })

  it('uses 5 lb increment for weight >= 135', () => {
    const history: SetLog[] = [makeSet(135, 8, 8, false)]
    const result = suggest(baseExercise, history, history)
    expect(result.weight).toBe(140)
  })

  it('uses 2.5 lb increment for 45 <= weight < 135', () => {
    const ex: ResolvedExercise = { ...baseExercise, repRange: [5, 5] }
    const history: SetLog[] = [makeSet(95, 5, 8, false)]
    const result = suggest(ex, history, history)
    expect(result.weight).toBe(97.5)
  })

  it('uses 1.25 lb increment for weight < 45', () => {
    const ex: ResolvedExercise = { ...baseExercise, repRange: [10, 10] }
    const history: SetLog[] = [makeSet(30, 10, 8, false)]
    const result = suggest(ex, history, history)
    expect(result.weight).toBe(31.25)
  })

  it('handles null earlySetRPE without crash', () => {
    const exWithNullRPE: ResolvedExercise = {
      ...baseExercise,
      earlySetRPE: undefined as unknown as number,
    }
    const result = suggest(exWithNullRPE, [], [])
    expect(result.note).toBeDefined()
    expect(result.note).toContain('6-8 reps')
  })
})
