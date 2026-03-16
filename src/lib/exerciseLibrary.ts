/**
 * Exercise library: union of program exercises, exercise-muscles data, and user history.
 * Used for: substitution picker, add-exercise during free workout.
 */

import { db } from './db'
import { DEFAULT_EXERCISE_CONFIG } from '../types/session'
import type { SessionExercise } from '../types/session'
import type { NippardProgram } from '../types/program'

import nippardData from '../data/nippard.json'
import exerciseMusclesData from '../data/exercise-muscles.json'

const nippard = nippardData as NippardProgram

export type ExerciseSource = 'program' | 'library' | 'history'

export interface ExerciseInfo {
  name: string
  muscles?: { primary: string[]; secondary: string[] }
  imagePath?: string
  source: ExerciseSource
}

/** Flatten all exercises from nippard blocks */
function getProgramExercises(): ExerciseInfo[] {
  const seen = new Set<string>()
  const result: ExerciseInfo[] = []
  for (const block of nippard.blocks ?? []) {
    for (const week of block.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          if (ex?.name && !seen.has(ex.name)) {
            seen.add(ex.name)
            const muscles = (exerciseMusclesData as Record<string, { primary: string[]; secondary: string[] }>)[ex.name]
            result.push({
              name: ex.name,
              muscles: muscles ? { primary: muscles.primary ?? [], secondary: muscles.secondary ?? [] } : undefined,
              imagePath: ex.imagePath,
              source: 'program',
            })
          }
        }
      }
    }
  }
  return result
}

/** Exercise names + muscles from exercise-muscles.json (library only, no program) */
function getLibraryExercises(excludeNames: Set<string>): ExerciseInfo[] {
  const data = exerciseMusclesData as Record<string, { primary: string[]; secondary: string[] }>
  const result: ExerciseInfo[] = []
  for (const [name, muscles] of Object.entries(data)) {
    if (!excludeNames.has(name)) {
      result.push({
        name,
        muscles: { primary: muscles?.primary ?? [], secondary: muscles?.secondary ?? [] },
        source: 'library',
      })
    }
  }
  return result
}

/** Unique exercise names from db.sets, by most recent timestamp (early termination) */
export async function getRecentExercises(limit: number): Promise<ExerciseInfo[]> {
  try {
    const seen = new Set<string>()
    const result: ExerciseInfo[] = []
    const allSets = await db.sets.orderBy('timestamp').reverse().limit(500).toArray()
    for (const s of allSets) {
      const name = s.exerciseName || s.exerciseSlot || 'Unknown'
      if (!seen.has(name)) {
        seen.add(name)
        result.push({
          name,
          source: 'history',
        })
        if (result.length >= limit) break
      }
    }
    return result
  } catch {
    return []
  }
}

/** Unique names from db.sets (for merging into library) */
async function getHistoryExerciseNames(): Promise<string[]> {
  try {
    const sets = await db.sets.orderBy('timestamp').reverse().limit(1000).toArray()
    const seen = new Set<string>()
    const names: string[] = []
    for (const s of sets) {
      const name = s.exerciseName || s.exerciseSlot || 'Unknown'
      if (!seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
    return names
  } catch {
    return []
  }
}

/** Union of program, library, history. Deduplicates by name (program > library > history). */
export async function getAllKnownExercises(): Promise<ExerciseInfo[]> {
  const program = getProgramExercises()
  const byName = new Map<string, ExerciseInfo>()
  const programNames = new Set<string>()
  for (const ex of program) {
    byName.set(ex.name, ex)
    programNames.add(ex.name)
  }
  const library = getLibraryExercises(programNames)
  for (const ex of library) {
    if (!byName.has(ex.name)) byName.set(ex.name, ex)
  }
  const historyNames = await getHistoryExerciseNames()
  for (const name of historyNames) {
    if (!byName.has(name)) {
      byName.set(name, { name, source: 'history' })
    }
  }
  return Array.from(byName.values())
}

/** Case-insensitive substring match */
export async function searchExercises(query: string): Promise<ExerciseInfo[]> {
  const all = await getAllKnownExercises()
  if (!query.trim()) return all
  const q = query.toLowerCase()
  return all.filter((ex) => ex.name.toLowerCase().includes(q))
}

/** Lookup by exact name */
export async function getExerciseByName(name: string): Promise<ExerciseInfo | null> {
  const all = await getAllKnownExercises()
  return all.find((ex) => ex.name === name) ?? null
}

/** Unique muscle group names from exercise-muscles */
export function getMuscleGroups(): string[] {
  const data = exerciseMusclesData as Record<string, { primary: string[]; secondary: string[] }>
  const groups = new Set<string>()
  for (const entry of Object.values(data)) {
    for (const m of entry?.primary ?? []) groups.add(m)
    for (const m of entry?.secondary ?? []) groups.add(m)
  }
  return Array.from(groups).sort()
}

/** Build SessionExercise from ExerciseInfo (for add-exercise, substitute) */
export function toSessionExercise(info: ExerciseInfo, slotKey: string): SessionExercise {
  return {
    name: info.name,
    slotKey,
    dayType: DEFAULT_EXERCISE_CONFIG.dayType,
    warmupSets: DEFAULT_EXERCISE_CONFIG.warmupSets,
    workingSets: DEFAULT_EXERCISE_CONFIG.workingSets,
    repRange: [...DEFAULT_EXERCISE_CONFIG.repRange],
    earlySetRPE: DEFAULT_EXERCISE_CONFIG.earlySetRPE,
    lastSetRPE: DEFAULT_EXERCISE_CONFIG.lastSetRPE,
    restSeconds: [...DEFAULT_EXERCISE_CONFIG.restSeconds],
    notes: DEFAULT_EXERCISE_CONFIG.notes,
    demoUrl: DEFAULT_EXERCISE_CONFIG.demoUrl,
    intensityTechnique: DEFAULT_EXERCISE_CONFIG.intensityTechnique,
    imagePath: info.imagePath,
  }
}
