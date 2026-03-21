import { describe, it, expect } from 'vitest'
import { suggest, getBaseIncrement } from './progression'
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

function makeSetFor(ex: ResolvedExercise, weight: number, reps: number, rpe: number, isWarmup = false): SetLog {
  return {
    sessionId: 1,
    exerciseSlot: ex.slotKey,
    exerciseName: ex.name,
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

  it('returns reps and rpe defaults when no history', () => {
    const result = suggest(baseExercise, [], [])
    expect(result.reps).toBe(6)
    expect(result.rpe).toBe(8)
    expect(result.weight).toBeUndefined()
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
    expect(result.weight).toBe(32.5)
  })

  it('handles null earlySetRPE without crash, uses lastSetRPE as fallback', () => {
    const exWithNullRPE: ResolvedExercise = {
      ...baseExercise,
      earlySetRPE: undefined as unknown as number,
    }
    const result = suggest(exWithNullRPE, [], [])
    expect(result.note).toBeDefined()
    expect(result.note).toContain('6-8 reps')
    expect(result.note).toContain('RPE 8')
  })

  it('returns lastWeight, lastReps, lastRpe, lastDate when history exists', () => {
    const ts = new Date('2025-03-11T10:00:00Z').getTime()
    const history: SetLog[] = [makeSet(150, 12, 9, false)]
    history[0].timestamp = ts
    const result = suggest(baseExercise, history, history)
    expect(result.lastWeight).toBe(150)
    expect(result.lastReps).toBe(12)
    expect(result.lastRpe).toBe(9)
    expect(result.lastDate).toBe('Mar 11')
  })

  it('uses larger increment when RPE is low (easy set)', () => {
    const history: SetLog[] = [makeSet(95, 8, 5, false)]
    const result = suggest(baseExercise, history, history)
    expect(result.weight).toBe(100)
    expect(result.note).toContain('Add weight')
  })

  it('uses smaller increment when RPE is high (hard set)', () => {
    const history: SetLog[] = [makeSet(95, 8, 10, false)]
    const result = suggest(baseExercise, history, history)
    expect(result.weight).toBe(97.5)
    expect(result.note).toContain('Add weight')
  })

  describe('body-part-aware base increment (WO-001)', () => {
    it('uses 2.5 lb base for upper arms at max reps', () => {
      const armEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Hammer Curl',
        bodyPart: 'upper arms',
        repRange: [8, 8],
      }
      const history: SetLog[] = [makeSetFor(armEx, 35, 8, 8)]
      const result = suggest(armEx, history, history)
      expect(result.weight).toBe(37.5)
    })

    it('uses 5 lb base for quadriceps at max reps', () => {
      const legEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Leg Press',
        bodyPart: 'quadriceps',
        repRange: [5, 5],
      }
      const history: SetLog[] = [makeSetFor(legEx, 135, 5, 8)]
      const result = suggest(legEx, history, history)
      expect(result.weight).toBe(140)
    })

    it('falls back to weight-tier logic when bodyPart is missing', () => {
      expect(getBaseIncrement({ ...baseExercise, bodyPart: undefined }, 100)).toBe(2.5)
      expect(getBaseIncrement({ ...baseExercise, bodyPart: 'chest' }, 135)).toBe(5)
    })

    it('arm isolation: low RPE doubles base (2.5 -> 5)', () => {
      const armEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Hammer Curl',
        bodyPart: 'upper arms',
        repRange: [8, 8],
      }
      const history: SetLog[] = [makeSetFor(armEx, 35, 8, 5)]
      const result = suggest(armEx, history, history)
      expect(result.weight).toBe(40)
    })

    it('arm isolation: high RPE halves base (rounds up)', () => {
      const armEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Hammer Curl',
        bodyPart: 'upper arms',
        repRange: [8, 8],
      }
      const history: SetLog[] = [makeSetFor(armEx, 35, 8, 10)]
      const result = suggest(armEx, history, history)
      expect(result.weight).toBe(37.5)
    })

    it('leg: low RPE doubles base (5 -> 10, capped)', () => {
      const legEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Leg Press',
        bodyPart: 'quadriceps',
        repRange: [5, 5],
      }
      const history: SetLog[] = [makeSetFor(legEx, 135, 5, 5)]
      const result = suggest(legEx, history, history)
      expect(result.weight).toBe(145)
    })

    it('leg: high RPE halves base', () => {
      const legEx: ResolvedExercise = {
        ...baseExercise,
        name: 'Leg Press',
        bodyPart: 'quadriceps',
        repRange: [5, 5],
      }
      const history: SetLog[] = [makeSetFor(legEx, 135, 5, 10)]
      const result = suggest(legEx, history, history)
      expect(result.weight).toBe(137.5)
    })
  })
})
