/**
 * Dexie.js IndexedDB schema.
 *
 * TABLE RELATIONSHIPS:
 *   UserProfile (1) ──── (*) WorkoutSession
 *   WorkoutSession (1) ──── (*) SetLog
 *   ProgramState (1) — current block/week
 *   SyncQueue (n) — pending payloads for Apps Script
 *
 * INDEXES:
 *   sessions: by date, status, dayType, blockId, weekNumber
 *   sets: by sessionId, exerciseSlot, exerciseName, timestamp
 */

import Dexie, { type Table } from 'dexie'
import type { WorkoutSession, SetLog, SessionExercise } from '../types/session'

export interface WorkoutTemplate {
  id?: number
  name: string
  exercises: SessionExercise[]
  createdAt: number
}

export interface UserProfile {
  id: string
  heightCm?: number
  weightKg?: number
  age?: number
  unit: 'lb' | 'kg'
  strengthLevel?: 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'
  appsScriptUrl?: string
  updatedAt: number
}

export interface ProgramState {
  id: string
  blockId: string
  weekNumber: number
  updatedAt: number
}

export interface SyncQueueItem {
  id?: number
  payload: unknown
  timestamp: number
  synced: boolean
  error?: string
}

export class WorkoutDb extends Dexie {
  userProfile!: Table<UserProfile, string>
  sessions!: Table<WorkoutSession, number>
  sets!: Table<SetLog, number>
  programState!: Table<ProgramState, string>
  syncQueue!: Table<SyncQueueItem, number>
  templates!: Table<WorkoutTemplate, number>

  constructor() {
    super('WorkoutApp')
    this.version(1).stores({
      userProfile: 'id',
      sessions: '++id, date, status, dayType, blockId, weekNumber',
      sets: '++id, sessionId, exerciseSlot, exerciseName, timestamp',
      programState: 'id',
      syncQueue: '++id, timestamp, synced',
    })
    this.version(2).stores({
      userProfile: 'id',
      sessions: '++id, date, status, dayType, blockId, weekNumber',
      sets: '++id, sessionId, exerciseSlot, exerciseName, timestamp',
      programState: 'id',
      syncQueue: '++id, timestamp, synced',
    })
    this.version(3).stores({
      userProfile: 'id',
      sessions: '++id, date, status, dayType, blockId, weekNumber',
      sets: '++id, sessionId, exerciseSlot, exerciseName, timestamp',
      programState: 'id',
      syncQueue: '++id, timestamp, synced',
      templates: '++id, name, createdAt',
    })
  }
}

export const db = new WorkoutDb()
