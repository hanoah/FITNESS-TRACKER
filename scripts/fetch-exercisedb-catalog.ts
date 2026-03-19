/**
 * Fetch exercise catalog from ExerciseDB AscendAPI (videos + images).
 *
 * - Uses cursor-based pagination (nextCursor)
 * - Writes src/data/exercisedb-catalog.json with id, name, imageUrl, bodyPart, target, equipment, etc.
 * - API key from EXERCISEDB_API_KEY env var
 *
 * Run: EXERCISEDB_API_KEY=your_key npx tsx scripts/fetch-exercisedb-catalog.ts
 *      Add --force to re-fetch even if catalog exists.
 */

import { writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const catalogPath = join(rootDir, 'src/data/exercisedb-catalog.json')

const BASE_URL = 'https://edb-with-videos-and-images-by-ascendapi.p.rapidapi.com'
const API_HOST = 'edb-with-videos-and-images-by-ascendapi.p.rapidapi.com'
const PAGE_SIZE = 50  // API may cap per-request; 50 is safe
const RATE_LIMIT_MS = 200

interface RawExercise {
  exerciseId: string
  name: string
  imageUrl?: string
  bodyParts?: string[]
  equipments?: string[]
  targetMuscles?: string[]
  secondaryMuscles?: string[]
  [key: string]: unknown
}

interface ApiResponse {
  success?: boolean
  data?: RawExercise[]
  meta?: { nextCursor?: string; hasNextPage?: boolean }
}

interface ExerciseDbEntry {
  id: string
  name: string
  imageUrl?: string
  bodyPart: string
  target: string
  equipment: string
  secondaryMuscles: string[]
}

function toEntry(raw: RawExercise): ExerciseDbEntry {
  return {
    id: raw.exerciseId,
    name: (raw.name ?? '').trim(),
    imageUrl: raw.imageUrl,
    bodyPart: Array.isArray(raw.bodyParts) && raw.bodyParts[0] ? raw.bodyParts[0] : '',
    target: Array.isArray(raw.targetMuscles) && raw.targetMuscles[0] ? raw.targetMuscles[0] : '',
    equipment: Array.isArray(raw.equipments) && raw.equipments[0] ? raw.equipments[0] : '',
    secondaryMuscles: Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : [],
  }
}

async function fetchPage(
  apiKey: string,
  after?: string
): Promise<{ entries: ExerciseDbEntry[]; nextCursor?: string; hasNextPage?: boolean }> {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  if (after) params.set('after', after)
  const url = `${BASE_URL}/api/v1/exercises?${params.toString()}`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': API_HOST,
    },
  })

  if (res.status === 429) {
    throw new Error('RATE_LIMITED')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as ApiResponse
  const data = json.data ?? []
  const entries = data.map(toEntry).filter((e) => e.id && e.name)
  return {
    entries,
    nextCursor: json.meta?.nextCursor,
    hasNextPage: json.meta?.hasNextPage,
  }
}

async function main() {
  const apiKey = process.env.EXERCISEDB_API_KEY
  if (!apiKey?.trim()) {
    console.error('Error: EXERCISEDB_API_KEY env var required.')
    console.error('Get a free key at rapidapi.com (search for ExerciseDB)')
    process.exit(1)
  }

  const force = process.argv.includes('--force')
  if (existsSync(catalogPath) && !force) {
    console.log(`Catalog already exists at ${catalogPath}. Use --force to re-fetch.`)
    return
  }

  const catalog: ExerciseDbEntry[] = []
  let cursor: string | undefined
  let retries = 0
  const maxRetries = 3

  console.log('Fetching ExerciseDB catalog (AscendAPI)...')

  while (true) {
    try {
      const { entries, nextCursor, hasNextPage } = await fetchPage(apiKey, cursor)
      if (entries.length > 0) catalog.push(...entries)

      if (!hasNextPage || !nextCursor) break
      cursor = nextCursor  // use as 'after' for next page

      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
    } catch (e) {
      if (e instanceof Error && e.message === 'RATE_LIMITED') {
        retries++
        if (retries > maxRetries) {
          console.error('Rate limited. Exiting. Re-run later to resume.')
          writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))
          process.exit(1)
        }
        const backoff = 5000 * retries
        console.log(`Rate limited. Backing off ${backoff}ms (retry ${retries}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, backoff))
        continue
      }
      throw e
    }
  }

  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))
  const withImages = catalog.filter((e) => e.imageUrl).length
  console.log(`Done. Wrote ${catalog.length} exercises (${withImages} with images) to ${catalogPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
