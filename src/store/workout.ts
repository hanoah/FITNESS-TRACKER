/**
 * Workout store: active session state.
 *
 * Session state machine:
 *   idle → in_progress (start) → completed | abandoned
 *   in_progress + app reopen → resume prompt
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../lib/db'
import type { WorkoutSession, SetLog } from '../types/session'
import type { ResolvedExercise } from '../lib/programEngine'

export const useWorkoutStore = defineStore('workout', () => {
  const activeSession = ref<WorkoutSession | null>(null)
  const todayExercises = ref<ResolvedExercise[]>([])
  const completedSets = ref<SetLog[]>([])

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
    exercises: ResolvedExercise[],
    blockId: string,
    weekNumber: number
  ): Promise<number | null> {
    const today = new Date().toISOString().slice(0, 10)
    const session: WorkoutSession = {
      date: today,
      dayType,
      blockId,
      weekNumber,
      status: 'in_progress',
      currentExerciseIndex: 0,
      completedSetCount: 0,
      startedAt: Date.now(),
    }
    try {
      const id = await db.sessions.add(session)
      activeSession.value = { ...session, id: id as number }
      todayExercises.value = exercises
      completedSets.value = []
      return id as number
    } catch (e) {
      console.error('[workout.startWorkout] Failed to save session', { dayType, blockId, weekNumber }, e)
      return null
    }
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
    if (!session) return false
    try {
      await db.sessions.update(session.id!, {
        status: 'completed',
        completedAt: Date.now(),
      })
      activeSession.value = null
      todayExercises.value = []
      completedSets.value = []
      return true
    } catch (e) {
      console.error('[workout.completeWorkout] Failed to complete session', { sessionId: session.id }, e)
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

      const sets = await db.sets.where('sessionId').equals(inProgress.id!).toArray()
      activeSession.value = inProgress
      completedSets.value = sets
      return inProgress
    } catch (e) {
      console.error('[workout.loadResumableSession] Failed to load session', e)
      return null
    }
  }

  async function resumeSession(exercises: ResolvedExercise[]) {
    todayExercises.value = exercises
    return activeSession.value
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

  return {
    activeSession,
    todayExercises,
    completedSets,
    currentExercise,
    currentSetNumber,
    isWarmupSet,
    startWorkout,
    logSet,
    completeWorkout,
    abandonWorkout,
    loadResumableSession,
    resumeSession,
    skipExercise,
  }
})
