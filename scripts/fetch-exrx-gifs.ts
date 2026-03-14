/**
 * Fetch exercise GIFs and populate gifPath in nippard.json.
 * Saves GIFs to public/gifs/{slug}.gif.
 *
 * Uses ExRx-style URL pattern. If fetch fails, gifPath is still set
 * so the app can show a fallback when the file is missing.
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
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok && res.headers.get('content-type')?.includes('image')) {
      return res.arrayBuffer()
    }
  } catch {
    // ignore
  }
  return null
}

// ExRx AnimatedEx URL pattern - adapt category/slug as needed
function exrxUrl(slug: string): string {
  return `https://exrx.net/AnimatedEx/ChestPushUp/${slug.replace(/-/g, '')}`
}

async function main() {
  const data = JSON.parse(readFileSync(nippardPath, 'utf-8'))
  const exercises = collectExercises(data.blocks)
  const nameToPath = new Map<string, string>()

  if (!existsSync(gifsDir)) {
    mkdirSync(gifsDir, { recursive: true })
  }

  for (const ex of exercises) {
    const slug = slugify(ex.name)
    const gifPath = `/gifs/${slug}.gif`
    nameToPath.set(ex.name, gifPath)

    const outPath = join(gifsDir, `${slug}.gif`)
    if (existsSync(outPath)) {
      console.log(`Skip (exists): ${slug}`)
      continue
    }

    const url = exrxUrl(slug)
    const buf = await fetchGif(url)
    if (buf) {
      writeFileSync(outPath, Buffer.from(buf))
      console.log(`Fetched: ${slug}`)
    } else {
      console.log(`No GIF for: ${ex.name} (${slug})`)
    }
  }

  walkAndSetGifPath(data.blocks, nameToPath)
  writeFileSync(nippardPath, JSON.stringify(data, null, 2))
  console.log('Updated nippard.json with gifPath')
}

main().catch(console.error)
