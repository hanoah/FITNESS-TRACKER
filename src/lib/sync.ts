/**
 * Sync queue: enqueue workout data for Apps Script, flush to Google Sheet.
 */

import { db } from './db'
import type { WorkoutSession } from '../types/session'
import type { SetLog } from '../types/session'

export interface SyncPayload {
  session: WorkoutSession
  sets: SetLog[]
}

export async function enqueueSync(session: WorkoutSession, sets: SetLog[]): Promise<void> {
  await db.syncQueue.add({
    payload: { session, sets } as SyncPayload,
    timestamp: Date.now(),
    synced: false,
  })
}

export async function getPendingCount(): Promise<number> {
  return db.syncQueue.filter((q) => !q.synced).count()
}

export async function flushSyncQueue(appsScriptUrl: string): Promise<{
  synced: number
  failed: number
  errors: string[]
}> {
  const pending = await db.syncQueue.filter((q) => !q.synced).toArray()
  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const item of pending) {
    try {
      const payload = item.payload as SyncPayload
      const body = JSON.stringify(payload)
      const res = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      let ok = false
      try {
        const data = await res.json()
        ok = data?.success === true
      } catch {
        ok = res.ok
      }
      if (ok) {
        await db.syncQueue.update(item.id!, { synced: true })
        synced++
      } else {
        await db.syncQueue.update(item.id!, {
          error: `Unexpected response`,
          synced: false,
        })
        failed++
        errors.push(`Item ${item.id}: Unexpected response`)
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      await db.syncQueue.update(item.id!, {
        error: errMsg,
        synced: false,
      })
      failed++
      errors.push(`Item ${item.id}: ${errMsg}`)
      console.error('[sync] Failed to sync item', item.id, e)
    }
  }

  return { synced, failed, errors }
}
