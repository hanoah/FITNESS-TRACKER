/**
 * Exercise library: union of program exercises, ExerciseDB catalog, exercise-muscles data, and user history.
 * Used for: substitution picker, add-exercise during free workout.
 */

import { db } from './db'
import { DEFAULT_EXERCISE_CONFIG } from '../types/session'
import type { SessionExercise } from '../types/session'
import type { NippardProgram } from '../types/program'

import nippardData from '../data/nippard.json'
import exerciseMusclesData from '../data/exercise-muscles.json'
import exercisedbCatalogData from '../data/exercisedb-catalog.json'

const nippard = nippardData as NippardProgram

interface ExerciseDbEntry {
  id: string
  name: string
  imageUrl?: string
  bodyPart: string
  target: string
  equipment: string
  secondaryMuscles: string[]
  instructions?: string[]
  difficulty?: string
  category?: string
}

const exercisedbCatalog = exercisedbCatalogData as ExerciseDbEntry[]

/** Lookup map from normalized name → ExerciseDB entry for cross-referencing. */
const exercisedbByNormName = new Map<string, ExerciseDbEntry>()
for (const ex of exercisedbCatalog) {
  if (ex?.id && ex?.name) {
    exercisedbByNormName.set(normalizeName(ex.name), ex)
  }
}

/**
 * Find an ExerciseDB match for a given exercise name.
 * Tries exact normalized match, then substring containment (e.g. "Barbell Bench Press" contains "Bench Press").
 */
function findExerciseDbMatch(name: string): ExerciseDbEntry | null {
  const norm = normalizeName(name)
  const exact = exercisedbByNormName.get(norm)
  if (exact) return exact
  for (const [key, entry] of exercisedbByNormName) {
    if (norm.includes(key) || key.includes(norm)) return entry
  }
  return null
}

export type ExerciseSource = 'program' | 'library' | 'history' | 'exercisedb'

export interface ExerciseInfo {
  name: string
  muscles?: { primary: string[]; secondary: string[] }
  imagePath?: string
  imageUrl?: string  // CDN URL for ExerciseDB (direct image, no API key needed)
  exerciseDbId?: string
  bodyPart?: string
  equipment?: string
  source: ExerciseSource
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

/** Flatten all exercises from nippard blocks. Cross-references with ExerciseDB catalog for image data. */
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
            const dbMatch = !ex.imagePath ? findExerciseDbMatch(ex.name) : null
            result.push({
              name: ex.name,
              muscles: muscles ? { primary: muscles.primary ?? [], secondary: muscles.secondary ?? [] } : undefined,
              imagePath: ex.imagePath,
              imageUrl: dbMatch?.imageUrl,
              exerciseDbId: dbMatch?.id,
              bodyPart: dbMatch?.bodyPart,
              equipment: dbMatch?.equipment,
              source: 'program',
            })
          }
        }
      }
    }
  }
  return result
}

/** ExerciseDB catalog entries (exclude names already in program) */
function getExerciseDbExercises(excludeNormalizedNames: Set<string>): ExerciseInfo[] {
  if (!Array.isArray(exercisedbCatalog) || exercisedbCatalog.length === 0) return []
  const result: ExerciseInfo[] = []
  for (const ex of exercisedbCatalog) {
    if (!ex?.id || !ex?.name) continue
    const norm = normalizeName(ex.name)
    if (excludeNormalizedNames.has(norm)) continue
    const primary = ex.target ? [ex.target] : []
    const secondary = Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : []
    result.push({
      name: ex.name,
      muscles: { primary, secondary },
      exerciseDbId: ex.id,
      imageUrl: ex.imageUrl,
      bodyPart: ex.bodyPart,
      equipment: ex.equipment,
      source: 'exercisedb',
    })
  }
  return result
}

/** Exercise names + muscles from exercise-muscles.json (library only, exclude if normalized name already taken). Cross-references with ExerciseDB for images. */
function getLibraryExercises(excludeNormalizedNames: Set<string>): ExerciseInfo[] {
  const data = exerciseMusclesData as Record<string, { primary: string[]; secondary: string[] }>
  const result: ExerciseInfo[] = []
  for (const [name, muscles] of Object.entries(data)) {
    if (!excludeNormalizedNames.has(normalizeName(name))) {
      const dbMatch = findExerciseDbMatch(name)
      result.push({
        name,
        muscles: { primary: muscles?.primary ?? [], secondary: muscles?.secondary ?? [] },
        imageUrl: dbMatch?.imageUrl,
        exerciseDbId: dbMatch?.id,
        bodyPart: dbMatch?.bodyPart,
        equipment: dbMatch?.equipment,
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

/** Union of program, exercisedb, library, history. Deduplicates by normalized name (program > exercisedb > library > history). */
export async function getAllKnownExercises(): Promise<ExerciseInfo[]> {
  const program = getProgramExercises()
  const byNormalizedName = new Map<string, ExerciseInfo>()
  const programNormalizedNames = new Set<string>()
  for (const ex of program) {
    const norm = normalizeName(ex.name)
    byNormalizedName.set(norm, ex)
    programNormalizedNames.add(norm)
  }
  const exercisedb = getExerciseDbExercises(programNormalizedNames)
  const exercisedbNormalizedNames = new Set(exercisedb.map((ex) => normalizeName(ex.name)))
  for (const ex of exercisedb) {
    const norm = normalizeName(ex.name)
    if (!byNormalizedName.has(norm)) byNormalizedName.set(norm, ex)
  }
  const excludeForLibrary = new Set([
    ...programNormalizedNames,
    ...exercisedbNormalizedNames,
  ])
  const library = getLibraryExercises(excludeForLibrary)
  for (const ex of library) {
    const norm = normalizeName(ex.name)
    if (!byNormalizedName.has(norm) && !excludeForLibrary.has(norm)) {
      byNormalizedName.set(norm, ex)
    }
  }
  const historyNames = await getHistoryExerciseNames()
  for (const name of historyNames) {
    const norm = normalizeName(name)
    if (!byNormalizedName.has(norm)) {
      byNormalizedName.set(norm, { name, source: 'history' })
    }
  }
  return Array.from(byNormalizedName.values())
}

let cachedExercises: ExerciseInfo[] | null = null

/** Cached exercise list. Call loadCachedExercises() once, then use this for fast local filtering. */
export function getCachedExercises(): ExerciseInfo[] {
  return cachedExercises ?? []
}

/** Load and cache exercise list. Call on picker mount. */
export async function loadCachedExercises(): Promise<ExerciseInfo[]> {
  cachedExercises = await getAllKnownExercises()
  return cachedExercises
}

/** Clear cache (e.g. after backup restore). */
export function clearExerciseCache() {
  cachedExercises = null
}

/** Case-insensitive substring match. Uses cache when available. */
export async function searchExercises(query: string): Promise<ExerciseInfo[]> {
  const all = cachedExercises ?? (await getAllKnownExercises())
  if (!query.trim()) return all
  const q = query.toLowerCase()
  return all.filter((ex) => ex.name.toLowerCase().includes(q))
}

/** Filter exercises by relevant muscles (primary or secondary). */
export function filterByMuscles(exercises: ExerciseInfo[], muscles: string[]): ExerciseInfo[] {
  if (!muscles.length) return exercises
  const set = new Set(muscles.map((m) => m.toLowerCase()))
  return exercises.filter((ex) => {
    const primary = ex.muscles?.primary ?? []
    const secondary = ex.muscles?.secondary ?? []
    return primary.some((m) => set.has(m.toLowerCase())) || secondary.some((m) => set.has(m.toLowerCase()))
  })
}

/** Lookup by exact name or normalized name */
export async function getExerciseByName(name: string): Promise<ExerciseInfo | null> {
  const all = await getAllKnownExercises()
  const exact = all.find((ex) => ex.name === name)
  if (exact) return exact
  const norm = normalizeName(name)
  return all.find((ex) => normalizeName(ex.name) === norm) ?? null
}

/** Primary muscles for an exercise (for substitution context filtering). Checks exercise-muscles and ExerciseDB catalog. */
export function getMusclesForExercise(name: string): string[] {
  const data = exerciseMusclesData as Record<string, { primary?: string[]; secondary?: string[] }>
  const entry = data[name]
  if (entry) {
    return [...(entry.primary ?? []), ...(entry.secondary ?? [])]
  }
  const norm = normalizeName(name)
  const exercisedbEx = exercisedbCatalog.find((ex) => normalizeName(ex.name) === norm)
  if (exercisedbEx) {
    const primary = exercisedbEx.target ? [exercisedbEx.target] : []
    const secondary = Array.isArray(exercisedbEx.secondaryMuscles) ? exercisedbEx.secondaryMuscles : []
    return [...primary, ...secondary]
  }
  return []
}

/** Unique muscle group names from exercise-muscles and ExerciseDB catalog */
export function getMuscleGroups(): string[] {
  const groups = new Set<string>()
  const data = exerciseMusclesData as Record<string, { primary?: string[]; secondary?: string[] }>
  for (const entry of Object.values(data)) {
    for (const m of entry?.primary ?? []) groups.add(m)
    for (const m of entry?.secondary ?? []) groups.add(m)
  }
  for (const ex of exercisedbCatalog) {
    if (ex.target) groups.add(ex.target)
    for (const m of ex.secondaryMuscles ?? []) groups.add(m)
  }
  return Array.from(groups).sort()
}

/** Backfill imageUrl/exerciseDbId on a session exercise from the ExerciseDB catalog if missing. */
export function enrichSessionExercise(ex: SessionExercise): SessionExercise {
  if (ex.imageUrl || ex.imagePath) return ex
  const dbMatch = findExerciseDbMatch(ex.name)
  if (!dbMatch) return ex
  return {
    ...ex,
    imageUrl: dbMatch.imageUrl,
    exerciseDbId: dbMatch.id,
    bodyPart: ex.bodyPart ?? dbMatch.bodyPart,
    equipment: ex.equipment ?? dbMatch.equipment,
  }
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
    imageUrl: info.imageUrl,
    exerciseDbId: info.exerciseDbId,
    bodyPart: info.bodyPart,
    equipment: info.equipment,
  }
}
