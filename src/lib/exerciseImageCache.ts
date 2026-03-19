/**
 * Runtime image fetch from ExerciseDB CDN with IndexedDB caching.
 * Fetches from imageUrl (public CDN) on cache miss, stores blob for offline use.
 * No API key needed for images - they are served from cdn.exercisedb.dev.
 */

import { db } from './db'

const FETCH_TIMEOUT_MS = 8000

/**
 * Returns an object URL for the exercise image (cache hit or fresh fetch from imageUrl).
 * Caller must call URL.revokeObjectURL() on unmount to avoid leaks.
 * Returns null if no imageUrl, offline, or fetch fails.
 */
export async function getExerciseImage(exerciseDbId: string, imageUrl?: string): Promise<string | null> {
  if (!exerciseDbId?.trim()) return null

  try {
    const cached = await db.exerciseImages.get(exerciseDbId)
    if (cached?.blob) {
      return URL.createObjectURL(cached.blob)
    }
  } catch (e) {
    console.warn('[exerciseImageCache] Cache read failed, falling through to CDN', { exerciseDbId }, e)
  }

  if (!imageUrl?.trim()) return null

  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn('[exerciseImageCache] Fetch failed', { exerciseDbId, status: res.status })
      return null
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('image')) {
      console.warn('[exerciseImageCache] Non-image response', { exerciseDbId })
      return null
    }

    const blob = await res.blob()
    try {
      await db.exerciseImages.put({
        exerciseDbId,
        blob,
        fetchedAt: Date.now(),
      })
    } catch (putErr) {
      console.warn('[exerciseImageCache] Cache write failed (image still returned)', { exerciseDbId }, putErr)
    }

    return URL.createObjectURL(blob)
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') {
      console.warn('[exerciseImageCache] Fetch timeout', { exerciseDbId })
    } else {
      console.warn('[exerciseImageCache] Fetch failed', { exerciseDbId }, e)
    }
    return imageUrl ?? null
  }
}
