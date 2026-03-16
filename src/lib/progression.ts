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
  rpe?: number
  note: string
  lastWeight?: number
  lastReps?: number
  lastRpe?: number
  lastDate?: string
  slotHistory?: { weight: number; reps: number; rpe: number }[]
  exerciseHistory?: { weight: number; reps: number; rpe: number }[]
}

function formatDateFromTimestamp(ts: number): string {
  const d = new Date(ts)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}`
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

  const lastSet = lastSlot
    ? slotWorkingSets[slotWorkingSets.length - 1]
    : exerciseWorkingSets[exerciseWorkingSets.length - 1]
  const lastTimestamp = lastSet?.timestamp

  if (!lastSlot && !lastExercise) {
    const rpeText =
      exercise.earlySetRPE != null && exercise.earlySetRPE !== exercise.lastSetRPE
        ? `RPE ${exercise.earlySetRPE}-${exercise.lastSetRPE}`
        : `RPE ${exercise.lastSetRPE}`
    return {
      reps: repMin,
      rpe: exercise.lastSetRPE,
      note: `Enter starting weight for ${repMin}-${repMax} reps at ${rpeText}`,
      ...histories,
    }
  }

  const last = lastSlot ?? lastExercise
  if (!last) {
    return { note: 'Start with working weight', ...histories }
  }

  const lastDate = lastTimestamp ? formatDateFromTimestamp(lastTimestamp) : undefined

  if (last.reps < repMax) {
    return {
      reps: last.reps + 1,
      weight: last.weight,
      rpe: exercise.lastSetRPE,
      note: `Add 1 rep: ${last.weight} × ${last.reps + 1}`,
      lastWeight: last.weight,
      lastReps: last.reps,
      lastRpe: last.rpe,
      lastDate,
      ...histories,
    }
  }

  const increment = last.weight >= 135 ? 5 : last.weight >= 45 ? 2.5 : 1.25
  const newWeight = last.weight + increment
  return {
    weight: newWeight,
    reps: repMin,
    rpe: exercise.lastSetRPE,
    note: `Add weight: ${newWeight} × ${repMin}-${repMax}`,
    lastWeight: last.weight,
    lastReps: last.reps,
    lastRpe: last.rpe,
    lastDate,
    ...histories,
  }
}
