/**
 * Workout session and set log types.
 */

export type SessionStatus = 'idle' | 'in_progress' | 'completed' | 'abandoned'

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
}

export interface WorkoutSession {
  id?: number
  date: string // ISO date YYYY-MM-DD
  dayType: string
  blockId: string
  weekNumber: number
  status: SessionStatus
  currentExerciseIndex: number
  completedSetCount: number
  startedAt: number
  completedAt?: number
}
