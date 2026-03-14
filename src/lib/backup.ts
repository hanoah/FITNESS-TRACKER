/**
 * Backup & restore: export/import workout history for recovery after incognito or device change.
 */

import { db } from './db'
import type { WorkoutSession, SetLog } from '../types/session'
import type { UserProfile } from './db'
import type { ProgramState } from './db'

export interface BackupData {
  version: 1
  exportedAt: string // ISO
  sessions: WorkoutSession[]
  sets: SetLog[]
  userProfile?: UserProfile | null
  programState?: ProgramState | null
}

export async function exportAll(): Promise<BackupData> {
  const [sessions, sets, userProfile, programState] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.userProfile.get('current'),
    db.programState.get('current'),
  ])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    sets,
    userProfile: userProfile ?? null,
    programState: programState ?? null,
  }
}

export async function downloadBackup(): Promise<void> {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workout-backup-${data.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Parse CSV exported from Google Sheet (sync format).
 * Rows: session (5 cols) = date, dayType, blockId, weekNumber, status
 *       set (9 cols) = sessionId, exerciseSlot, exerciseName, setNumber, weight, reps, rpe, isWarmup, timestamp
 * Sessions and sets alternate: session then its sets, then next session, etc.
 */
export function parseSheetCsv(csvText: string): BackupData {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim())
  const sessions: WorkoutSession[] = []
  const sets: SetLog[] = []
  let currentSessionTempId = 0

  const dateLike = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length >= 5 && parts.length <= 6) {
      // Session row (skip header: first col should look like date)
      const [date, dayType, blockId, weekStr, status] = parts
      if (date.toLowerCase() === 'date' || !dateLike(date)) continue
      const weekNumber = parseInt(weekStr || '1', 10) || 1
      currentSessionTempId++
      const session: WorkoutSession & { id?: number } = {
        date: date || new Date().toISOString().slice(0, 10),
        dayType: dayType || 'unknown',
        blockId: blockId || 'unknown',
        weekNumber,
        status: (status as WorkoutSession['status']) || 'completed',
        currentExerciseIndex: 0,
        completedSetCount: 0,
        startedAt: Date.now(),
      }
      session.id = currentSessionTempId
      sessions.push(session)
    } else if (parts.length >= 9 && currentSessionTempId > 0) {
      // Set row - belongs to current session
      const [_sessionId, exerciseSlot, exerciseName, setNumStr, weightStr, repsStr, rpeStr, isWarmupStr, tsStr] = parts
      const set: SetLog = {
        sessionId: currentSessionTempId,
        exerciseSlot: exerciseSlot || '',
        exerciseName: exerciseName || '',
        setNumber: parseInt(setNumStr || '1', 10) || 1,
        weight: parseFloat(weightStr || '0') || 0,
        reps: parseInt(repsStr || '0', 10) || 0,
        rpe: parseFloat(rpeStr || '0') || 0,
        isWarmup: isWarmupStr === 'true',
        timestamp: tsStr ? new Date(tsStr).getTime() : Date.now(),
      }
      sets.push(set)
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    sets,
    userProfile: null,
    programState: null,
  }
}

/**
 * Import from a previously exported JSON backup.
 * Replaces existing sessions and sets; merges profile and programState.
 */
export async function importFromJson(json: string): Promise<{
  sessionsImported: number
  setsImported: number
  profileRestored: boolean
  programStateRestored: boolean
  error?: string
}> {
  let data: BackupData
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid backup: not an object')
    }
    data = {
      version: 1,
      exportedAt: (parsed.exportedAt as string) ?? new Date().toISOString(),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      sets: Array.isArray(parsed.sets) ? parsed.sets : [],
      userProfile: (parsed.userProfile as UserProfile | null) ?? null,
      programState: (parsed.programState as ProgramState | null) ?? null,
    }
  } catch (e) {
    return {
      sessionsImported: 0,
      setsImported: 0,
      profileRestored: false,
      programStateRestored: false,
      error: e instanceof Error ? e.message : 'Invalid JSON',
    }
  }

  const oldToNewSessionId = new Map<number, number>()

  try {
    // Insert sessions, collect id mapping
    for (const s of data.sessions) {
      const { id: _oldId, ...rest } = s
      const newId = await db.sessions.add(rest as WorkoutSession)
      if (typeof s.id === 'number') {
        oldToNewSessionId.set(s.id, newId as number)
      }
    }

    // Insert sets with mapped sessionIds
    for (const set of data.sets) {
      const newSessionId = oldToNewSessionId.get(set.sessionId) ?? set.sessionId
      const { id: _oldId, ...rest } = set
      await db.sets.add({ ...rest, sessionId: newSessionId } as SetLog)
    }

    let profileRestored = false
    if (data.userProfile && typeof data.userProfile === 'object') {
      await db.userProfile.put({
        ...data.userProfile,
        id: 'current',
        updatedAt: Date.now(),
      })
      profileRestored = true
    }

    let programStateRestored = false
    if (data.programState && typeof data.programState === 'object') {
      await db.programState.put({
        ...data.programState,
        id: 'current',
        updatedAt: Date.now(),
      })
      programStateRestored = true
    }

    return {
      sessionsImported: data.sessions.length,
      setsImported: data.sets.length,
      profileRestored,
      programStateRestored,
    }
  } catch (e) {
    console.error('[backup.importFromJson]', e)
    return {
      sessionsImported: 0,
      setsImported: 0,
      profileRestored: false,
      programStateRestored: false,
      error: e instanceof Error ? e.message : 'Import failed',
    }
  }
}
