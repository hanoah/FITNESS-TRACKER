/**
 * Fetch past set history from IndexedDB for progression suggestions.
 * Queries by exerciseSlot (program position) and exerciseName.
 */

import { ref, watch } from 'vue'
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

    const [bySlot, byName] = await Promise.all([
      db.sets.where('exerciseSlot').equals(slot).toArray(),
      db.sets.where('exerciseName').equals(name).toArray(),
    ])

    const excludeCurrent = (s: SetLog) => s.sessionId !== sessionId
    slotHistory.value = bySlot.filter(excludeCurrent).sort((a, b) => b.timestamp - a.timestamp)
    exerciseHistory.value = byName.filter(excludeCurrent).sort((a, b) => b.timestamp - a.timestamp)
  }

  watch(
    [exerciseSlot, exerciseName, currentSessionId],
    load,
    { immediate: true }
  )

  return { slotHistory, exerciseHistory, load }
}
