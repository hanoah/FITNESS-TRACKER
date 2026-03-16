/**
 * Fetch exercise images and muscle data from wger.de API.
 *
 * - Reads scripts/wger-exercise-mapping.json (nippard exercise name → wger exerciseinfo ID)
 * - For each mapped exercise: fetches exerciseinfo, downloads main image to public/images/wger/{slug}.png
 * - Updates imagePath in nippard.json for exercises that get an image
 * - Generates src/data/exercise-muscles.json: { exerciseName: { primary: string[], secondary: string[] } }
 *
 * Run: npx tsx scripts/fetch-wger-images.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const nippardPath = join(rootDir, 'src/data/nippard.json')
const mappingPath = join(rootDir, 'scripts/wger-exercise-mapping.json')
const imagesDir = join(rootDir, 'public/images/wger')
const musclesOutPath = join(rootDir, 'src/data/exercise-muscles.json')

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface WgerImage {
  id: number
  image: string
  is_main: boolean
  [key: string]: unknown
}

interface WgerMuscle {
  id: number
  name: string
  name_en: string
  [key: string]: unknown
}

interface WgerExerciseInfo {
  id: number
  muscles: WgerMuscle[]
  muscles_secondary: WgerMuscle[]
  images: WgerImage[]
  [key: string]: unknown
}

interface ProgramExercise {
  name: string
  imagePath?: string
  [key: string]: unknown
}

function collectExercises(blocks: { weeks?: { days?: { exercises?: ProgramExercise[] }[] }[] }): ProgramExercise[] {
  const seen = new Set<string>()
  const result: ProgramExercise[] = []
  for (const b of blocks || []) {
    for (const w of b.weeks || []) {
      for (const d of w.days || []) {
        for (const e of d.exercises || []) {
          if (e?.name && !seen.has(e.name)) {
            seen.add(e.name)
            result.push(e)
          }
        }
      }
    }
  }
  return result
}

function walkAndSetImagePath(
  blocks: { weeks?: { days?: { exercises?: ProgramExercise[] }[] }[] },
  nameToPath: Map<string, string>
): void {
  for (const b of blocks || []) {
    for (const w of b.weeks || []) {
      for (const d of w.days || []) {
        for (const e of d.exercises || []) {
          if (e?.name) {
            const path = nameToPath.get(e.name)
            if (path) e.imagePath = path
          }
        }
      }
    }
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'WorkoutApp/1.0 (wger fetch)' },
    })
    if (res.ok) return (await res.json()) as T
  } catch (e) {
    console.error(`Fetch error ${url}:`, e)
  }
  return null
}

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'WorkoutApp/1.0 (wger fetch)' },
    })
    if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
      return res.arrayBuffer()
    }
  } catch {
    // ignore
  }
  return null
}

function getImageUrl(img: WgerImage): string {
  const u = img.image
  if (u.startsWith('http')) return u
  return `https://wger.de${u.startsWith('/') ? '' : '/'}${u}`
}

async function main() {
  const mapping: Record<string, number> = JSON.parse(readFileSync(mappingPath, 'utf-8'))
  const data = JSON.parse(readFileSync(nippardPath, 'utf-8'))
  const exercises = collectExercises(data.blocks)
  const nameToPath = new Map<string, string>()
  const exerciseMuscles: Record<string, { primary: string[]; secondary: string[] }> = {}

  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }

  let fetched = 0
  let skipped = 0
  let noImage = 0
  let failed = 0

  for (const ex of exercises) {
    const wgerId = mapping[ex.name]
    if (wgerId == null) {
      skipped++
      continue
    }

    const info = await fetchJson<WgerExerciseInfo>(
      `https://wger.de/api/v2/exerciseinfo/${wgerId}/?format=json`
    )
    if (!info) {
      console.log(`Fail: ${ex.name} (id ${wgerId})`)
      failed++
      continue
    }

    // Build muscle data
    const primary = (info.muscles || []).map((m) => m.name_en || m.name).filter(Boolean)
    const secondary = (info.muscles_secondary || []).map((m) => m.name_en || m.name).filter(Boolean)
    exerciseMuscles[ex.name] = { primary, secondary }

    // Download main image
    const images = info.images || []
    const mainImg = images.find((i) => i.is_main) || images[0]
    const slug = slugify(ex.name)
    const imagePath = `/images/wger/${slug}.png`

    if (!mainImg) {
      noImage++
      continue
    }

    const outPath = join(imagesDir, `${slug}.png`)
    if (existsSync(outPath)) {
      nameToPath.set(ex.name, imagePath)
      continue
    }

    const imgUrl = getImageUrl(mainImg)
    const buf = await fetchImage(imgUrl)
    if (buf) {
      writeFileSync(outPath, Buffer.from(buf))
      nameToPath.set(ex.name, imagePath)
      fetched++
      console.log(`Fetched: ${ex.name}`)
    } else {
      noImage++
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200))
  }

  walkAndSetImagePath(data.blocks, nameToPath)
  writeFileSync(nippardPath, JSON.stringify(data, null, 2))
  writeFileSync(musclesOutPath, JSON.stringify(exerciseMuscles, null, 2))

  console.log(`\nDone. Fetched ${fetched} images, ${noImage} had no image, ${skipped} unmapped, ${failed} API errors.`)
  console.log(`Updated nippard.json with imagePath for ${nameToPath.size} exercises.`)
  console.log(`Wrote ${musclesOutPath} with muscle data for ${Object.keys(exerciseMuscles).length} exercises.`)
}

main().catch(console.error)
