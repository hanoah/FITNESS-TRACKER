/**
 * Progression suggestion: double progression (reps first, then weight).
 * Pure function — receives history, returns suggestion.
 * Tracks by BOTH slot (program position) AND exercise name.
 */

import type { SetLog } from '../types/session'
import type { ResolvedExercise } from './programEngine'

export interface ProgressionSuggestion {
  weight?: number
  reps?: number
  note: string
  slotHistory?: { weight: number; reps: number; rpe: number }[]
  exerciseHistory?: { weight: number; reps: number; rpe: number }[]
}

export function suggest(
  exercise: ResolvedExercise,
  slotHistory: SetLog[],
  exerciseHistory: SetLog[]
): ProgressionSuggestion {
  const [repMin, repMax] = exercise.repRange

  const slotWorkingSets = slotHistory.filter((s) => !s.isWarmup)
  const exerciseWorkingSets = exerciseHistory.filter((s) => !s.isWarmup)

  const slotLast = slotWorkingSets[slotWorkingSets.length - 1]
  const exerciseLast = exerciseWorkingSets[exerciseWorkingSets.length - 1]

  const lastSlot = slotLast ? { weight: slotLast.weight, reps: slotLast.reps, rpe: slotLast.rpe } : null
  const lastExercise = exerciseLast
    ? { weight: exerciseLast.weight, reps: exerciseLast.reps, rpe: exerciseLast.rpe }
    : null

  const histories = {
    slotHistory: slotWorkingSets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe })),
    exerciseHistory: exerciseWorkingSets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe })),
  }

  if (!lastSlot && !lastExercise) {
    return {
      note: `Try ${exercise.repRange[0]}-${exercise.repRange[1]} reps at RPE ${exercise.earlySetRPE}-${exercise.lastSetRPE}`,
      ...histories,
    }
  }

  const last = lastSlot ?? lastExercise
  if (!last) {
    return { note: 'Start with working weight', ...histories }
  }

  if (last.reps < repMax) {
    return {
      reps: last.reps + 1,
      weight: last.weight,
      note: `Add 1 rep: ${last.weight} × ${last.reps + 1}`,
      ...histories,
    }
  }

  const increment = last.weight >= 135 ? 5 : last.weight >= 45 ? 2.5 : 1.25
  return {
    weight: last.weight + increment,
    reps: repMin,
    note: `Add weight: ${last.weight + increment} × ${repMin}-${repMax}`,
    ...histories,
  }
}
