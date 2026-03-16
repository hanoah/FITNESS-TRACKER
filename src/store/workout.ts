/**
 * Workout store: active session state.
 *
 * Session state machine:
 *   idle ──startWorkout──▶ in_progress ──completeWorkout──▶ completed
 *        │ startFreeWorkout           │
 *        │                            ├──abandonWorkout──▶ abandoned
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
import { getExerciseByName, toSessionExercise } from '../lib/exerciseLibrary'
import { getExercisesForBlockWeekDay } from '../lib/templateLibrary'
import type { WorkoutSession, SetLog, SessionExercise } from '../types/session'

export type ResumeResult = { ok: true } | { ok: false; error: string }

export const useWorkoutStore = defineStore('workout', () => {
  const activeSession = ref<WorkoutSession | null>(null)
  const todayExercises = ref<SessionExercise[]>([])
  const completedSets = ref<SetLog[]>([])
  const resumeError = ref<string | null>(null)

  const currentExercise = computed(() => {
    if (!activeSession.value) return null
    const idx = activeSession.value.currentExerciseIndex
    return todayExercises.value[idx] ?? null
  })

  const currentSetNumber = computed(() => {
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
      return id as number
    } catch (e) {
      console.error('[workout.startWorkout] Failed to save session', { dayType, blockId, weekNumber }, e)
      return null
    }
  }

  async function startFreeWorkout(): Promise<number | null> {
    return startWorkout('free', [])
  }

  async function logSet(weight: number, reps: number, rpe: number): Promise<boolean> {
    const session = activeSession.value
    const ex = currentExercise.value
    if (!session || !ex) return false

    const setLog: SetLog = {
      sessionId: session.id!,
      exerciseSlot: ex.slotKey,
      exerciseName: ex.name,
      setNumber: currentSetNumber.value,
      weight,
      reps,
      rpe,
      isWarmup: isWarmupSet.value,
      timestamp: Date.now(),
    }
    try {
      await db.sets.add(setLog)
      completedSets.value = [...completedSets.value, setLog]

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
      return true
    } catch (e) {
      console.error('[workout.logSet] Failed to save set', { weight, reps, rpe, sessionId: session.id }, e)
      return false
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
      resumeError.value = null
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

  async function abandonWorkout(): Promise<boolean> {
    const session = activeSession.value
    if (!session) return false
    try {
      await db.sessions.update(session.id!, { status: 'abandoned' })
      activeSession.value = null
      todayExercises.value = []
      completedSets.value = []
      resumeError.value = null
      return true
    } catch (e) {
      console.error('[workout.abandonWorkout] Failed to abandon session', { sessionId: session.id }, e)
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
      todayExercises.value = session.exercises
      return { ok: true }
    }

    if (session.blockId != null && session.weekNumber != null) {
      const exercises = getExercisesForBlockWeekDay(
        session.blockId,
        session.weekNumber,
        session.dayType
      )
      if (exercises && exercises.length > 0) {
        todayExercises.value = exercises
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

    const exercises = session.exercises ?? todayExercises.value
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
      await db.sessions.update(session.id, { exercises: newExercises, currentExerciseIndex: newIndex })
      return true
    } catch (e) {
      todayExercises.value = prevExercises
      activeSession.value = { ...session, currentExerciseIndex: prevIdx }
      console.error('[workout.removeExercise] Failed to persist', e)
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
      await db.sessions.update(session.id, { exercises: newExercises, substitutions: newSubs })
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

  return {
    activeSession,
    todayExercises,
    completedSets,
    currentExercise,
    currentSetNumber,
    isWarmupSet,
    resumeError,
    startWorkout,
    startFreeWorkout,
    addExercise,
    removeExercise,
    logSet,
    completeWorkout,
    abandonWorkout,
    loadResumableSession,
    resumeSession,
    skipExercise,
    unskipExercise,
    substituteExercise,
  }
})
