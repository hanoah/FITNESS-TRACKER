/**
 * Workout session and set log types.
 *
 * SessionExercise is the canonical exercise type used everywhere (workout store, progression, UI).
 * ResolvedExercise is an alias for backward compat with program engine.
 */

import type { IntensityTechnique } from './program'

export type SessionStatus = 'idle' | 'in_progress' | 'completed' | 'abandoned'

export interface SessionExercise {
  name: string
  slotKey: string
  dayType: string
  warmupSets: number
  workingSets: number
  repRange: [number, number]
  earlySetRPE: number
  lastSetRPE: number
  restSeconds: [number, number]
  notes: string
  demoUrl: string
  intensityTechnique?: IntensityTechnique
  imagePath?: string
  imageUrl?: string  // CDN URL for ExerciseDB images
  exerciseDbId?: string
  bodyPart?: string
  equipment?: string
  sub1?: string
  sub2?: string
}

/** Default config for exercises added from library (no program template) */
export const DEFAULT_EXERCISE_CONFIG = {
  warmupSets: 1,
  workingSets: 3,
  repRange: [8, 12] as [number, number],
  earlySetRPE: 8,
  lastSetRPE: 9,
  restSeconds: [90, 120] as [number, number],
  notes: '',
  demoUrl: '',
  intensityTechnique: 'none' as IntensityTechnique,
  dayType: 'free' as const,
  slotKey: '',
}

export interface SetLog {
  id?: number
  sessionId: number
  exerciseSlot: string
  exerciseName: string
  setNumber: number
  weight: number
  reps: number
  rpe: number
  isWarmup: boolean
  timestamp: number
  /** Audit metadata when set was edited */
  editedAt?: number
  prevWeight?: number
  prevReps?: number
  prevRpe?: number
}

export interface WorkoutSession {
  id?: number
  date: string // ISO date YYYY-MM-DD
  dayType: string
  blockId?: string
  weekNumber?: number
  status: SessionStatus
  currentExerciseIndex: number
  completedSetCount: number
  startedAt: number
  completedAt?: number
  /** Map of slotKey -> { name } for substituted exercises (persists across resume) */
  substitutions?: Record<string, { name: string }>
  /** Exercises for this session (enables resume without program; free workouts) */
  exercises?: SessionExercise[]
}
