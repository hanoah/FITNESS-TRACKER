/**
 * Shared composable for exercise progression data.
 * Loads all sets once (last 6 months), groups by exercise name, derives chart data.
 *
 * Refactored: refs are per-instance (not module-level) so multiple consumers
 * get independent state. Avoids loadError poisoning across components.
 */

import { ref, computed } from 'vue'
import { db } from '../lib/db'
import type { SetLog } from '../types/session'

export interface ProgressionPoint {
  date: string
  weight: number
}

export interface ExerciseProgressionGroup {
  exerciseName: string
  sets: SetLog[]
  progressionData: ProgressionPoint[]
  bestSet: { weight: number; reps: number; rpe?: number } | null
  setsByDate: Map<string, SetLog[]>
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000

/**
 * Load all sets from IndexedDB (single bulk query, last 6 months).
 * Groups in memory by exerciseName.
 */
export function useExerciseProgression() {
  const allSets = ref<SetLog[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const loaded = ref(false)

  const exercisesByGroup = computed(() => {
    const byName = new Map<string, SetLog[]>()
    for (const s of allSets.value) {
      const name = s.exerciseName || s.exerciseSlot || 'Unknown'
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(s)
    }
    return byName
  })

  /**
   * Unique exercises sorted by most recent activity (newest first).
   */
  const exercisesSortedByRecent = computed(() => {
    const names: string[] = []
    const byName = exercisesByGroup.value
    for (const [name, sets] of byName) {
      if (sets.length > 0) names.push(name)
    }
    return names.sort((a, b) => {
      const aMax = Math.max(...(exercisesByGroup.value.get(a) ?? []).map((s) => s.timestamp ?? 0))
      const bMax = Math.max(...(exercisesByGroup.value.get(b) ?? []).map((s) => s.timestamp ?? 0))
      return bMax - aMax
    })
  })

  /**
   * Build progression data for an exercise: { date, weight }[].
   * Uses SetLog.timestamp for date, groups working sets by date, takes max weight.
   */
  function buildProgressionData(sets: SetLog[]): ProgressionPoint[] {
    const byDate = new Map<string, SetLog[]>()
    for (const s of sets) {
      if (s.isWarmup) continue
      const date = s.timestamp
        ? new Date(s.timestamp).toISOString().slice(0, 10)
        : ''
      if (!date) continue
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date)!.push(s)
    }
    const points: ProgressionPoint[] = []
    for (const [date, daySets] of byDate) {
      const maxWeight = Math.max(...daySets.map((s) => s.weight))
      if (maxWeight > 0) points.push({ date, weight: maxWeight })
    }
    points.sort((a, b) => a.date.localeCompare(b.date))
    return points
  }

  function getBestSet(sets: SetLog[]): { weight: number; reps: number; rpe?: number } | null {
    const working = sets.filter((s) => !s.isWarmup)
    if (working.length === 0) return null
    const best = working.reduce((acc, s) => {
      const score = s.weight * s.reps
      return score > (acc.weight * acc.reps) ? s : acc
    }, working[0])
    return { weight: best.weight, reps: best.reps, rpe: best.rpe }
  }

  function getSetsByDate(sets: SetLog[]): Map<string, SetLog[]> {
    const byDate = new Map<string, SetLog[]>()
    for (const s of sets) {
      const date = s.timestamp
        ? new Date(s.timestamp).toISOString().slice(0, 10)
        : ''
      if (!date) continue
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date)!.push(s)
    }
    for (const arr of byDate.values()) {
      arr.sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0))
    }
    return byDate
  }

  /**
   * Get full progression group for an exercise.
   */
  function getExerciseGroup(exerciseName: string): ExerciseProgressionGroup | null {
    const sets = exercisesByGroup.value.get(exerciseName)
    if (!sets || sets.length === 0) return null
    return {
      exerciseName,
      sets,
      progressionData: buildProgressionData(sets),
      bestSet: getBestSet(sets),
      setsByDate: getSetsByDate(sets),
    }
  }

  /**
   * Load all sets from IndexedDB (last 6 months, newest first).
   * Falls back to full toArray() if indexed query fails.
   */
  async function loadAllSets(): Promise<void> {
    if (loading.value) return
    loading.value = true
    loadError.value = null
    try {
      const sixMonthsAgo = Date.now() - SIX_MONTHS_MS
      try {
        const sets = await db.sets
          .where('timestamp')
          .above(sixMonthsAgo)
          .toArray()
        allSets.value = sets.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      } catch (indexedErr) {
        console.warn('[useExerciseProgression] Indexed query failed, falling back to toArray', indexedErr)
        allSets.value = await db.sets.toArray()
        allSets.value = allSets.value
          .filter((s) => (s.timestamp ?? 0) >= sixMonthsAgo)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      }
      loaded.value = true
    } catch (e) {
      console.error('[useExerciseProgression] Failed to load sets', e)
      loadError.value = 'Failed to load sets'
    } finally {
      loading.value = false
    }
  }

  return {
    allSets,
    loaded,
    loading,
    loadError,
    exercisesByGroup,
    exercisesSortedByRecent,
    buildProgressionData,
    getExerciseGroup,
    loadAllSets,
  }
}
