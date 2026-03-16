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

/**
 * Clear all workout history (sessions and sets). Does not touch profile or program state.
 */
export async function clearAllHistory(): Promise<void> {
  await db.sets.clear()
  await db.sessions.clear()
  await db.syncQueue.clear()
}

export interface TrackerSession {
  day: string
  focus: string
  exercises: Array<{
    name: string
    weight?: string
    reps?: string
    notes?: string | null
  }>
}

export interface TrackerWeek {
  week: number
  label: string
  rpe: string
  sets: number
  sessions: TrackerSession[]
}

export interface TrackerData {
  tracker: string
  weeks: TrackerWeek[]
}

/** Parse weight string to number (lbs). "115-120 lbs" -> 117.5, "BW" -> 0, "16kg (35 lbs)" -> 35 */
function parseWeight(s: string | undefined): number {
  if (!s || !s.trim()) return 0
  const lower = s.toLowerCase()
  if (lower === 'bw' || lower.includes('bodyweight')) return 0
  // Match numbers: "115-120" -> avg 117.5, "90" -> 90, "16kg (35 lbs)" -> 35
  const ranges = s.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/)
  if (ranges) {
    const a = parseFloat(ranges[1])
    const b = parseFloat(ranges[2])
    return (a + b) / 2
  }
  const paren = s.match(/\((\d+)\s*lbs?\)/i) // "(35 lbs)"
  if (paren) return parseFloat(paren[1])
  const num = s.match(/(\d+\.?\d*)/)
  return num ? parseFloat(num[1]) : 0
}

/** Parse reps string. "8" -> 8, "8-10" -> 9 */
function parseReps(s: string | undefined, defaultVal: number): number {
  if (!s || !s.trim()) return defaultVal
  const ranges = s.match(/(\d+)\s*-\s*(\d+)/)
  if (ranges) {
    const a = parseInt(ranges[1], 10)
    const b = parseInt(ranges[2], 10)
    return Math.round((a + b) / 2)
  }
  const num = parseInt(s, 10)
  return isNaN(num) ? defaultVal : num
}

/** Parse RPE string. "7-8" -> 7.5, "10" -> 10 */
function parseRpe(s: string): number {
  const ranges = s.match(/(\d+)\s*-\s*(\d+)/)
  if (ranges) {
    const a = parseFloat(ranges[1])
    const b = parseFloat(ranges[2])
    return (a + b) / 2
  }
  const num = parseFloat(s)
  return isNaN(num) ? 9 : num
}

/**
 * Convert Noah's tracking format to BackupData. Generates realistic dates for the past 2 weeks.
 */
export function trackerToBackupData(tracker: TrackerData): BackupData {
  const sessions: (WorkoutSession & { tempId: number })[] = []
  const sets: (SetLog & { tempSessionId: number })[] = []
  let tempSessionId = 0

  const dayToOffset: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }

  const today = new Date()

  for (let weekIdx = 0; weekIdx < tracker.weeks.length; weekIdx++) {
    const w = tracker.weeks[weekIdx]
    const rpe = parseRpe(w.rpe)
    const setsPerExercise = w.sets

    const weeksAgo = tracker.weeks.length - 1 - weekIdx
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - 7 * weeksAgo)

    const tuesdayOfWeek = new Date(weekStart)
    while (tuesdayOfWeek.getDay() !== 2) {
      tuesdayOfWeek.setDate(tuesdayOfWeek.getDate() - 1)
    }

    for (const sess of w.sessions) {
      const dayName = sess.day.toLowerCase().replace(/\s/g, '')
      const dayKey = dayName as keyof typeof dayToOffset
      const targetDow = dayToOffset[dayKey] ?? 2

      const d = new Date(tuesdayOfWeek)
      d.setDate(d.getDate() + (targetDow - 2))

      tempSessionId++
      const dateStr = d.toISOString().slice(0, 10)
      const startedAt = new Date(dateStr).setHours(9, 0, 0, 0)
      const completedAt = startedAt + 45 * 60 * 1000

      sessions.push({
        tempId: tempSessionId,
        date: dateStr,
        dayType: dayName,
        blockId: 'calibration',
        weekNumber: w.week,
        status: 'completed',
        currentExerciseIndex: sess.exercises.length,
        completedSetCount: sess.exercises.length * setsPerExercise,
        startedAt,
        completedAt,
      })

      let setIdx = 0
      for (let exIdx = 0; exIdx < sess.exercises.length; exIdx++) {
        const ex = sess.exercises[exIdx]
        const weight = parseWeight(ex.weight)
        const reps = parseReps(ex.reps, 10)
        const slotKey = `free:${exIdx}`

        for (let s = 0; s < setsPerExercise; s++) {
          setIdx++
          const ts = startedAt + (setIdx * 90) * 1000
          sets.push({
            tempSessionId,
            sessionId: tempSessionId,
            exerciseSlot: slotKey,
            exerciseName: ex.name,
            setNumber: s + 1,
            weight,
            reps,
            rpe,
            isWarmup: false,
            timestamp: ts,
          })
        }
      }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: sessions.map(({ tempId, ...s }) => ({ ...s, id: tempId })),
    sets: sets.map(({ tempSessionId, ...s }) => ({ ...s, sessionId: tempSessionId })),
    userProfile: null,
    programState: null,
  }
}

/**
 * Clear all history and seed with tracker data.
 */
export async function clearAndSeedFromTracker(tracker: TrackerData): Promise<{
  sessionsImported: number
  setsImported: number
  error?: string
}> {
  await clearAllHistory()
  const data = trackerToBackupData(tracker)

  const oldToNewSessionId = new Map<number, number>()

  try {
    for (const s of data.sessions) {
      const { id: oldId, ...rest } = s
      const newId = await db.sessions.add(rest as WorkoutSession)
      if (typeof oldId === 'number') {
        oldToNewSessionId.set(oldId, newId as number)
      }
    }

    for (const set of data.sets) {
      const newSessionId = oldToNewSessionId.get(set.sessionId) ?? set.sessionId
      const { id: _oldId, ...rest } = set
      await db.sets.add({ ...rest, sessionId: newSessionId } as SetLog)
    }

    return {
      sessionsImported: data.sessions.length,
      setsImported: data.sets.length,
    }
  } catch (e) {
    console.error('[backup.clearAndSeedFromTracker]', e)
    return {
      sessionsImported: 0,
      setsImported: 0,
      error: e instanceof Error ? e.message : 'Seed failed',
    }
  }
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
