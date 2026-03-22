/**
 * Workout store: active session state.
 *
 * Session state machine:
 *   idle ──startWorkout──▶ in_progress ──completeWorkout──▶ completed
 *        │ startFreeWorkout           │
 *        │                            ├──endWorkout──▶ completed (early)
 *        │                            │
 *        │                            ├──addExercise (free sessions)
 *        │                            ├──removeExercise (free sessions)
 *        │                            │
 *        │                            └──resume (reopen)──▶ in_progress
 *        │                                 │
 *        │                                 ├── session.exercises? → use directly
 *        │                                 ├── session.blockId? → program fallback
 *        │                                 └── neither → error toast
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../lib/db'
import { enqueueSync } from '../lib/sync'
import { validateSetEdit } from '../lib/parseLogInput'
import { emitDebugEvent } from '../lib/debugEvents'
import { getExerciseByName, toSessionExercise, enrichSessionExercise } from '../lib/exerciseLibrary'
import { getExercisesForBlockWeekDay } from '../lib/templateLibrary'
import type { WorkoutSession, SetLog, SessionExercise } from '../types/session'

export type ResumeResult = { ok: true } | { ok: false; error: string }

/** Result of logging a set; includes PR detection when historical baseline is passed from the UI. */
export type LogSetResult =
  | { ok: true; isPR: boolean; previousBest?: number }
  | { ok: false }

export interface RestTimerSnapshot {
  sessionId: number
  endTime: number
  pausedRemaining: number | null
  initialSeconds: number
}

/** Active rest timer UI payload (full + mini share this). */
export interface RestTimerPanel {
  seconds: number
  nextExerciseHint: string
  progressPercent: number
  setLabel: string
}

export const useWorkoutStore = defineStore('workout', () => {
  const activeSession = ref<WorkoutSession | null>(null)
  const restTimerSnapshot = ref<RestTimerSnapshot | null>(null)
  /** When set, App.vue shows RestTimer / MiniTimer; survives leaving WorkoutPage. */
  const restTimerPanel = ref<RestTimerPanel | null>(null)
  const restTimerMinimized = ref(false)
  const restTimerKey = ref(0)
  const todayExercises = ref<SessionExercise[]>([])
  const completedSets = ref<SetLog[]>([])
  /** Set IDs logged as weight PRs this session (cleared on complete/end). */
  const prSetIds = ref<number[]>([])
  const resumeError = ref<string | null>(null)

  const currentExercise = computed(() => {
    if (!activeSession.value) return null
    const idx = activeSession.value.currentExerciseIndex
    return todayExercises.value[idx] ?? null
  })

  const currentSetNumber = computed(() => {
    return completedSets.value.length + 1
  })

  const totalWorkoutSets = computed(() => {
    return todayExercises.value.reduce((sum, ex) => sum + ex.warmupSets + ex.workingSets, 0)
  })

  const currentExerciseSetNumber = computed(() => {
    const ex = currentExercise.value
    if (!ex) return 0
    const setsForThisExercise = completedSets.value.filter(
      (s) => s.exerciseSlot === ex.slotKey
    )
    return setsForThisExercise.length + 1
  })

  const isWarmupSet = computed(() => {
    const ex = currentExercise.value
    if (!ex) return false
    const count = completedSets.value.filter((s) => s.exerciseSlot === ex.slotKey).length
    return count < ex.warmupSets
  })

  /** Overall workout progress: completed sets / total sets across all exercises. 0–1, clamped. */
  const workoutProgress = computed(() => {
    const exercises = todayExercises.value
    if (!exercises.length) return 0
    const total = exercises.reduce((sum, ex) => sum + ex.warmupSets + ex.workingSets, 0)
    if (total <= 0) return 0
    const completed = completedSets.value.length
    return Math.min(1, completed / total)
  })

  async function startWorkout(
    dayType: string,
    exercises: SessionExercise[],
    blockId?: string,
    weekNumber?: number
  ): Promise<number | null> {
    const today = new Date().toISOString().slice(0, 10)
    const exercisesPlain = JSON.parse(JSON.stringify(exercises))
    const session: WorkoutSession = {
      date: today,
      dayType,
      status: 'in_progress',
      currentExerciseIndex: 0,
      completedSetCount: 0,
      startedAt: Date.now(),
      exercises: exercisesPlain,
    }
    if (blockId != null) session.blockId = blockId
    if (weekNumber != null) session.weekNumber = weekNumber
    try {
      const id = await db.sessions.add(session)
      activeSession.value = { ...session, id: id as number }
      todayExercises.value = exercisesPlain
      completedSets.value = []
      prSetIds.value = []
      return id as number
    } catch (e) {
      console.error('[workout.startWorkout] Failed to save session', { dayType, blockId, weekNumber }, e)
      return null
    }
  }

  async function startFreeWorkout(): Promise<number | null> {
    return startWorkout('free', [])
  }

  /**
   * @param historicalBestWeight — max weight from prior sessions for this exercise (from useProgressionHistory.bestWeight). Used for PR detection; omit or pass 0 if unknown.
   */
  async function logSet(
    weight: number,
    reps: number,
    rpe: number,
    isWarmup?: boolean,
    historicalBestWeight?: number
  ): Promise<LogSetResult> {
    const session = activeSession.value
    const ex = currentExercise.value
    if (!session || !ex) return { ok: false }

    const resolvedWarmup = isWarmup ?? isWarmupSet.value
    const priorWorking = completedSets.value.filter(
      (s) => s.exerciseSlot === ex.slotKey && !s.isWarmup
    )
    const sessionBestBefore = priorWorking.length
      ? Math.max(...priorWorking.map((s) => s.weight))
      : 0
    const hist = historicalBestWeight ?? 0
    const bestBefore = Math.max(hist, sessionBestBefore)
    const hasPriorHistory = hist > 0 || priorWorking.length > 0
    let isPR = false
    let previousBest: number | undefined
    if (!resolvedWarmup && hasPriorHistory && weight > bestBefore) {
      isPR = true
      previousBest = bestBefore
    }

    const setLog: SetLog = {
      sessionId: session.id!,
      exerciseSlot: ex.slotKey,
      exerciseName: ex.name,
      setNumber: currentSetNumber.value,
      weight,
      reps,
      rpe,
      isWarmup: resolvedWarmup,
      timestamp: Date.now(),
    }
    try {
      const id = (await db.sets.add(setLog)) as number
      completedSets.value = [...completedSets.value, { ...setLog, id }]
      if (isPR) {
        prSetIds.value = [...prSetIds.value, id]
      }

      const setsForEx = completedSets.value.filter((s) => s.exerciseSlot === ex.slotKey)
      const workingDone = setsForEx.filter((s) => !s.isWarmup).length
      if (workingDone >= ex.workingSets) {
        const nextIdx = session.currentExerciseIndex + 1
        await db.sessions.update(session.id!, {
          currentExerciseIndex: nextIdx,
          completedSetCount: session.completedSetCount + 1,
        })
        activeSession.value = {
          ...session,
          currentExerciseIndex: nextIdx,
          completedSetCount: session.completedSetCount + 1,
        }
      }
      return { ok: true, isPR, previousBest }
    } catch (e) {
      console.error('[workout.logSet] Failed to save set', { weight, reps, rpe, sessionId: session.id }, e)
      return { ok: false }
    }
  }

  async function completeWorkout(): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false
    const sets = completedSets.value
    const completedSession = { ...session, status: 'completed' as const, completedAt: Date.now() }
    try {
      await db.sessions.update(session.id!, {
        status: 'completed',
        completedAt: completedSession.completedAt,
      })
      activeSession.value = null
      todayExercises.value = []
      completedSets.value = []
      prSetIds.value = []
      resumeError.value = null
      restTimerSnapshot.value = null
      restTimerPanel.value = null
      restTimerMinimized.value = false
      try {
        await enqueueSync(completedSession, sets)
      } catch (syncErr) {
        console.warn('[workout.completeWorkout] Sync queue failed (workout saved)', syncErr)
      }
      return true
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      const errStack = e instanceof Error ? e.stack : undefined
      console.error('[workout.completeWorkout] Failed to complete session', {
        sessionId: session.id,
        error: errMsg,
        stack: errStack,
      }, e)
      return false
    }
  }

  async function endWorkout(): Promise<boolean> {
    const session = activeSession.value
    if (!session) return false
    try {
      await db.sessions.update(session.id!, { status: 'completed', completedAt: Date.now() })
      activeSession.value = null
      todayExercises.value = []
      completedSets.value = []
      prSetIds.value = []
      resumeError.value = null
      restTimerSnapshot.value = null
      restTimerPanel.value = null
      restTimerMinimized.value = false
      return true
    } catch (e) {
      console.error('[workout.endWorkout] Failed to end session', { sessionId: session.id }, e)
      return false
    }
  }

  async function loadResumableSession(): Promise<WorkoutSession | null> {
    try {
      const inProgress = await db.sessions
        .where('status')
        .equals('in_progress')
        .first()
      if (!inProgress) return null

      if (Date.now() - (inProgress.startedAt ?? 0) > 24 * 60 * 60 * 1000) {
        await db.sessions.update(inProgress.id!, { status: 'abandoned' })
        return null
      }

      const sets = await db.sets.where('sessionId').equals(inProgress.id!).toArray()
      activeSession.value = inProgress
      completedSets.value = sets
      resumeError.value = null
      return inProgress
    } catch (e) {
      console.error('[workout.loadResumableSession] Failed to load session', e)
      return null
    }
  }

  /** Resolve exercises for resume. Uses session.exercises first, else program fallback when blockId+weekNumber. Call after loadResumableSession. */
  async function resumeSession(): Promise<ResumeResult> {
    const session = activeSession.value
    if (!session) return { ok: false, error: 'No session to resume' }

    resumeError.value = null

    if (session.exercises && session.exercises.length > 0) {
      todayExercises.value = session.exercises.map(enrichSessionExercise)
      return { ok: true }
    }

    if (session.blockId != null && session.weekNumber != null) {
      const exercises = getExercisesForBlockWeekDay(
        session.blockId,
        session.weekNumber,
        session.dayType
      )
      if (exercises && exercises.length > 0) {
        todayExercises.value = exercises.map(enrichSessionExercise)
        return { ok: true }
      }
    }

    resumeError.value = 'Could not restore exercises'
    return { ok: false, error: resumeError.value }
  }

  async function addExercise(exercise: SessionExercise): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false

    const existing = session.exercises ?? todayExercises.value
    const freeIndices = existing
      .map((e) => e.slotKey.startsWith('free:') ? parseInt(e.slotKey.slice(5), 10) : -1)
      .filter((n) => !isNaN(n) && n >= 0)
    const nextIndex = freeIndices.length > 0 ? Math.max(...freeIndices) + 1 : 0
    const slotKey = `free:${nextIndex}`
    const newEx: SessionExercise = { ...exercise, slotKey }

    const exercises = [...existing, newEx]
    const updated = { ...session, exercises }
    const prevExercises = [...todayExercises.value]

    try {
      todayExercises.value = exercises
      const exercisesPlain = JSON.parse(JSON.stringify(exercises))
      await db.sessions.update(session.id, { exercises: exercisesPlain })
      activeSession.value = updated
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      console.error('[workout.addExercise] Failed to persist', e)
      return false
    }
  }

  async function removeExercise(slotKey: string): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false

    const exercises = todayExercises.value.length > 0 ? todayExercises.value : (session.exercises ?? [])
    const idx = exercises.findIndex((e) => e.slotKey === slotKey)
    if (idx < 0) return false

    const newExercises = exercises.filter((e) => e.slotKey !== slotKey)
    const newSession = { ...session, exercises: newExercises }
    const prevExercises = [...todayExercises.value]
    const prevIdx = session.currentExerciseIndex

    let newIndex = prevIdx
    const removedWasAtOrBefore = idx <= prevIdx
    if (removedWasAtOrBefore && prevIdx > 0) {
      newIndex = prevIdx - 1
    } else if (removedWasAtOrBefore) {
      newIndex = 0
    }

    try {
      todayExercises.value = newExercises
      activeSession.value = { ...newSession, currentExerciseIndex: newIndex }
      const exercisesPlain = JSON.parse(JSON.stringify(newExercises))
      await db.sessions.update(session.id, { exercises: exercisesPlain, currentExerciseIndex: newIndex })
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      activeSession.value = { ...session, currentExerciseIndex: prevIdx }
      console.error('[workout.removeExercise] Failed to persist', e)
      return false
    }
  }

  /** Only current or future exercises (index >= currentExerciseIndex). Increments workingSets. */
  async function addSetToExercise(slotKey: string): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false

    const exercises = todayExercises.value
    const idx = exercises.findIndex((e) => e.slotKey === slotKey)
    if (idx < 0) return false
    if (idx < session.currentExerciseIndex) return false

    const newExercises = exercises.map((e, i) =>
      i === idx ? { ...e, workingSets: e.workingSets + 1 } : e
    )
    const prevExercises = [...todayExercises.value]
    const updatedSession = { ...session, exercises: newExercises }

    try {
      todayExercises.value = newExercises
      activeSession.value = updatedSession
      const exercisesPlain = JSON.parse(JSON.stringify(newExercises))
      await db.sessions.update(session.id, { exercises: exercisesPlain })
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      activeSession.value = { ...session, exercises: prevExercises }
      console.error('[workout.addSetToExercise] Failed to persist', e)
      return false
    }
  }

  /**
   * Removes one planned set (prefers decreasing workingSets, then warmupSets).
   * Cannot go below completed set count for this exercise or below 1 total set.
   */
  async function removeSetFromExercise(slotKey: string): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false

    const exercises = todayExercises.value
    const idx = exercises.findIndex((e) => e.slotKey === slotKey)
    if (idx < 0) return false
    if (idx < session.currentExerciseIndex) return false

    const ex = exercises[idx]
    const completedCount = completedSets.value.filter((s) => s.exerciseSlot === slotKey).length
    const total = ex.warmupSets + ex.workingSets

    if (total <= 1) return false
    if (total - 1 < completedCount) return false

    let { warmupSets, workingSets } = ex
    if (workingSets > 0) {
      workingSets -= 1
    } else if (warmupSets > 0) {
      warmupSets -= 1
    } else {
      return false
    }

    const newExercises = exercises.map((e, i) =>
      i === idx ? { ...e, warmupSets, workingSets } : e
    )
    const prevExercises = [...todayExercises.value]
    const updatedSession = { ...session, exercises: newExercises }

    try {
      todayExercises.value = newExercises
      activeSession.value = updatedSession
      const exercisesPlain = JSON.parse(JSON.stringify(newExercises))
      await db.sessions.update(session.id, { exercises: exercisesPlain })
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      activeSession.value = { ...session, exercises: prevExercises }
      console.error('[workout.removeSetFromExercise] Failed to persist', e)
      return false
    }
  }

  async function substituteExercise(slotKey: string, newExerciseName: string): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false

    const info = await getExerciseByName(newExerciseName)
    if (!info) return false

    const idx = todayExercises.value.findIndex((e) => e.slotKey === slotKey)
    if (idx < 0) return false

    const original = todayExercises.value[idx]
    const newEx: SessionExercise = { ...toSessionExercise(info, slotKey), slotKey, dayType: original.dayType }

    const prevExercises = [...todayExercises.value]
    const newExercises = prevExercises.map((e, i) => (i === idx ? newEx : e))
    todayExercises.value = newExercises

    const newSubs = { ...(session.substitutions ?? {}), [slotKey]: { name: newExerciseName } }
    const updated = { ...session, exercises: newExercises, substitutions: newSubs }

    try {
      const exercisesPlain = JSON.parse(JSON.stringify(newExercises))
      await db.sessions.update(session.id, { exercises: exercisesPlain, substitutions: newSubs })
      activeSession.value = updated
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      console.error('[workout.substituteExercise] Failed to persist', e)
      return false
    }
  }

  async function skipExercise(): Promise<boolean> {
    const session = activeSession.value
    if (!session) return false
    try {
      const nextIdx = session.currentExerciseIndex + 1
      await db.sessions.update(session.id!, {
        currentExerciseIndex: nextIdx,
        completedSetCount: session.completedSetCount,
      })
      activeSession.value = {
        ...session,
        currentExerciseIndex: nextIdx,
      }
      return true
    } catch (e) {
      console.error('[workout.skipExercise] Failed to skip exercise', { sessionId: session.id }, e)
      return false
    }
  }

  async function unskipExercise(): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.currentExerciseIndex <= 0) return false
    try {
      const prevIdx = session.currentExerciseIndex - 1
      await db.sessions.update(session.id!, {
        currentExerciseIndex: prevIdx,
      })
      activeSession.value = {
        ...session,
        currentExerciseIndex: prevIdx,
      }
      return true
    } catch (e) {
      console.error('[workout.unskipExercise] Failed to go back', { sessionId: session.id }, e)
      return false
    }
  }

  /** Jump to any exercise by index. Bounds-checked; reverts in-memory on DB failure. */
  async function goToExercise(index: number): Promise<boolean> {
    const session = activeSession.value
    if (!session || session.id == null) return false
    const exercises = todayExercises.value
    const idx = Math.floor(index)
    if (idx === session.currentExerciseIndex) return true
    if (idx < 0 || idx >= exercises.length) return false
    const prevIdx = session.currentExerciseIndex
    try {
      await db.sessions.update(session.id, { currentExerciseIndex: idx })
      activeSession.value = { ...session, currentExerciseIndex: idx }
      return true
    } catch (e) {
      activeSession.value = { ...session, currentExerciseIndex: prevIdx }
      console.error('[workout.goToExercise] Failed to persist', { sessionId: session.id, index: idx }, e)
      return false
    }
  }

  /** Centralized set edit: validates, applies audit metadata, updates db and in-memory completedSets if active. */
  async function updateSetLog(setId: number, weight: number, reps: number, rpe: number): Promise<boolean> {
    const validated = validateSetEdit(weight, reps, rpe)
    let set: SetLog | undefined
    try {
      set = await db.sets.get(setId)
    } catch (e) {
      console.error('[workout.updateSetLog] Failed to fetch set', { setId }, e)
      return false
    }
    if (!set) return false

    const patch = {
      weight: validated.weight,
      reps: validated.reps,
      rpe: validated.rpe,
      editedAt: Date.now(),
      prevWeight: set.weight,
      prevReps: set.reps,
      prevRpe: set.rpe,
    }
    try {
      await db.sets.update(setId, patch)
    } catch (e) {
      emitDebugEvent({ eventName: 'set_edit', setId, status: 'fail', errorCode: 'db_write', meta: { err: String(e) } })
      console.error('[workout.updateSetLog] Failed to save', { setId, patch }, e)
      return false
    }

    emitDebugEvent({ eventName: 'set_edit', setId, sessionId: set.sessionId, status: 'success', meta: { weight: patch.weight, reps: patch.reps, rpe: patch.rpe } })
    const session = activeSession.value
    if (session?.id === set.sessionId) {
      const idx = completedSets.value.findIndex((s) => s.id === setId)
      if (idx >= 0) {
        const updated = { ...completedSets.value[idx], ...patch }
        completedSets.value = [
          ...completedSets.value.slice(0, idx),
          updated,
          ...completedSets.value.slice(idx + 1),
        ]
      }
    }
    return true
  }

  function setRestTimerSnapshot(snapshot: RestTimerSnapshot) {
    restTimerSnapshot.value = snapshot
  }

  function clearRestTimerSnapshot() {
    restTimerSnapshot.value = null
  }

  function startRestTimer(opts: RestTimerPanel) {
    restTimerSnapshot.value = null
    restTimerPanel.value = opts
    restTimerMinimized.value = false
    restTimerKey.value++
  }

  function minimizeRestTimer() {
    restTimerMinimized.value = true
  }

  function expandRestTimer() {
    restTimerMinimized.value = false
  }

  function stopRestTimer() {
    restTimerPanel.value = null
    restTimerMinimized.value = false
    restTimerSnapshot.value = null
  }

  function isPRSet(setId: number | undefined): boolean {
    if (setId == null) return false
    return prSetIds.value.includes(setId)
  }

  return {
    activeSession,
    todayExercises,
    completedSets,
    prSetIds,
    isPRSet,
    currentExercise,
    currentSetNumber,
    totalWorkoutSets,
    currentExerciseSetNumber,
    isWarmupSet,
    workoutProgress,
    resumeError,
    startWorkout,
    startFreeWorkout,
    addExercise,
    removeExercise,
    logSet,
    completeWorkout,
    endWorkout,
    loadResumableSession,
    resumeSession,
    skipExercise,
    unskipExercise,
    goToExercise,
    substituteExercise,
    addSetToExercise,
    removeSetFromExercise,
    updateSetLog,
    restTimerSnapshot,
    restTimerPanel,
    restTimerMinimized,
    restTimerKey,
    setRestTimerSnapshot,
    clearRestTimerSnapshot,
    startRestTimer,
    minimizeRestTimer,
    expandRestTimer,
    stopRestTimer,
  }
})
