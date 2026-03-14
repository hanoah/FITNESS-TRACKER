/**
 * Strength standards lookup.
 * Returns target weight (lbs) for a given exercise, body weight, and level.
 */

import standardsData from '../data/strength-standards.json'

type Level = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'

interface StandardsTable {
  [exerciseName: string]: {
    [bodyWeight: string]: { [K in Level]?: number }
  }
}

const standards = standardsData as StandardsTable

function findExerciseKey(name: string): string | null {
  if (standards[name]) return name
  const nameLower = name.toLowerCase()
  for (const key of Object.keys(standards)) {
    if (key.toLowerCase() === nameLower) return key
    if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower)) {
      return key
    }
  }
  return null
}

function nearestBodyWeight(lbs: number): string {
  const weights = [130, 150, 170, 190, 210]
  let best = weights[0].toString()
  let bestDiff = Math.abs(lbs - weights[0])
  for (const w of weights) {
    const d = Math.abs(lbs - w)
    if (d < bestDiff) {
      bestDiff = d
      best = w.toString()
    }
  }
  return best
}

/**
 * Get target weight (lbs) for an exercise at given body weight and level.
 */
export function getGoal(
  exerciseName: string,
  bodyWeightLbs: number,
  level: Level
): number | null {
  const key = findExerciseKey(exerciseName)
  if (!key) return null

  const byWeight = standards[key]
  if (!byWeight) return null

  const bwKey = nearestBodyWeight(bodyWeightLbs)
  const levels = byWeight[bwKey]
  if (!levels) return null

  const target = levels[level]
  return target ?? null
}

export const STRENGTH_LEVELS: Level[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite']
