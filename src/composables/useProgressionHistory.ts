/**
 * Fetch past set history from IndexedDB for progression suggestions.
 * Queries by exerciseSlot (program position) and exerciseName.
 */

import { ref, watch, computed } from 'vue'
import { db } from '../lib/db'
import type { SetLog } from '../types/session'

export function useProgressionHistory(
  exerciseSlot: () => string | undefined,
  exerciseName: () => string | undefined,
  currentSessionId: () => number | undefined
) {
  const slotHistory = ref<SetLog[]>([])
  const exerciseHistory = ref<SetLog[]>([])

  async function load() {
    const slot = exerciseSlot()
    const name = exerciseName()
    const sessionId = currentSessionId()
    if (!slot || !name) {
      slotHistory.value = []
      exerciseHistory.value = []
      return
    }

    try {
      const [bySlot, byName] = await Promise.all([
        db.sets.where('exerciseSlot').equals(slot).toArray(),
        db.sets.where('exerciseName').equals(name).toArray(),
      ])

      const excludeCurrent = (s: SetLog) => s.sessionId !== sessionId
      slotHistory.value = bySlot.filter(excludeCurrent).sort((a, b) => b.timestamp - a.timestamp)
      exerciseHistory.value = byName.filter(excludeCurrent).sort((a, b) => b.timestamp - a.timestamp)
    } catch (e) {
      console.error('[useProgressionHistory.load] Failed to load history', { slot, name }, e)
      slotHistory.value = []
      exerciseHistory.value = []
    }
  }

  watch(
    [exerciseSlot, exerciseName, currentSessionId],
    load,
    { immediate: true }
  )

  /** Max weight on any prior working set (slot + name history, excluding current session). For PR baseline. */
  const bestWeight = computed(() => {
    const combined = [...slotHistory.value, ...exerciseHistory.value].filter((s) => !s.isWarmup)
    if (combined.length === 0) return 0
    return Math.max(...combined.map((s) => s.weight))
  })

  return { slotHistory, exerciseHistory, bestWeight, load }
}
