/**
 * Fetch exercise GIFs and populate gifPath in nippard.json.
 * Saves GIFs to public/gifs/{slug}.gif.
 *
 * Uses ExRx AnimatedEx URL pattern with per-muscle-group categories.
 * If fetch fails, gifPath is still set so the app can show a fallback when missing.
 *
 * ExRx URL format: https://exrx.net/AnimatedEx/{Category}/{ExerciseName}
 * Categories: ChestPushUp, ChestFly, BackPullUp, BackRow, ShoulderPress, ShoulderLateralRaise,
 *             TricepsExtension, BicepsCurl, Waist, ThighLeg, ThighHip, Calf, etc.
 *
 * Fallback: If ExRx blocks or returns 404, GIFs won't download. gifPath remains set for
 * future population from alternative sources (e.g. musclewiki, wger).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const nippardPath = join(rootDir, 'src/data/nippard.json')
const gifsDir = join(rootDir, 'public/gifs')

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** ExRx category by exercise name patterns (order matters - first match wins) */
const CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /rear delt|rear deltoid/i, category: 'ShoulderLateralRaise' },
  { pattern: /bench press|incline.*press|chest press|pec deck/i, category: 'ChestPushUp' },
  { pattern: /flye|fly\b|crossover/i, category: 'ChestFly' },
  { pattern: /pull-up|pulldown|lat.*pulldown|pull.?up/i, category: 'BackPullUp' },
  { pattern: /row|shrug/i, category: 'BackRow' },
  { pattern: /shoulder press|overhead press|lateral raise/i, category: 'ShoulderPress' },
  { pattern: /triceps|skull crusher|pressdown|kickback|extension.*bar/i, category: 'TricepsExtension' },
  { pattern: /leg curl|hyperextension|rdl|deadlift/i, category: 'ThighHip' },
  { pattern: /hip adduction|hip abduction/i, category: 'ThighHip' },
  { pattern: /curl|preacher|concentration|hammer curl|bayesian/i, category: 'BicepsCurl' },
  { pattern: /crunch|cable crunch|leg raise|ab wheel|rollout/i, category: 'Waist' },
  { pattern: /squat|leg press|leg extension|hack squat|lunge|split squat/i, category: 'ThighLeg' },
  { pattern: /calf|calves/i, category: 'Calf' },
]

function getExRxCategory(name: string): string {
  for (const { pattern, category } of CATEGORY_RULES) {
    if (pattern.test(name)) return category
  }
  return 'ChestPushUp'
}

/** Convert slug to ExRx-style PascalCase (e.g. barbell-bench-press -> BarbellBenchPress) */
function toExRxSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('')
}

interface ProgramExercise {
  name: string
  gifPath?: string
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

function walkAndSetGifPath(
  blocks: { weeks?: { days?: { exercises?: ProgramExercise[] }[] }[] },
  nameToPath: Map<string, string>
): void {
  for (const b of blocks || []) {
    for (const w of b.weeks || []) {
      for (const d of w.days || []) {
        for (const e of d.exercises || []) {
          if (e?.name) {
            const path = nameToPath.get(e.name)
            if (path) e.gifPath = path
          }
        }
      }
    }
  }
}

async function fetchGif(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'WorkoutApp/1.0 (GIF fetch script)' },
    })
    if (res.ok && res.headers.get('content-type')?.includes('image')) {
      return res.arrayBuffer()
    }
  } catch {
    // ignore
  }
  return null
}

function exrxUrl(slug: string, category: string): string {
  const exRxName = toExRxSlug(slug)
  return `https://exrx.net/AnimatedEx/${category}/${exRxName}`
}

async function main() {
  const data = JSON.parse(readFileSync(nippardPath, 'utf-8'))
  const exercises = collectExercises(data.blocks)
  const nameToPath = new Map<string, string>()

  if (!existsSync(gifsDir)) {
    mkdirSync(gifsDir, { recursive: true })
  }

  let fetched = 0
  for (const ex of exercises) {
    const slug = slugify(ex.name)
    const gifPath = `/gifs/${slug}.gif`
    nameToPath.set(ex.name, gifPath)

    const outPath = join(gifsDir, `${slug}.gif`)
    if (existsSync(outPath)) {
      console.log(`Skip (exists): ${slug}`)
      continue
    }

    const category = getExRxCategory(ex.name)
    const url = exrxUrl(slug, category)
    const buf = await fetchGif(url)
    if (buf) {
      writeFileSync(outPath, Buffer.from(buf))
      console.log(`Fetched: ${slug} (${category})`)
      fetched++
    } else {
      console.log(`No GIF: ${ex.name} [${category}/${toExRxSlug(slug)}]`)
    }
  }

  walkAndSetGifPath(data.blocks, nameToPath)
  writeFileSync(nippardPath, JSON.stringify(data, null, 2))
  console.log(`Updated nippard.json with gifPath. Fetched ${fetched} new GIFs.`)
}

main().catch(console.error)
