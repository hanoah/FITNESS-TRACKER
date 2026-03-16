/**
 * Strength standards scraper for strengthlevel.com.
 *
 * Run: npx tsx scripts/scrape-strength-standards.ts
 *
 * strengthlevel.com uses Male "By Bodyweight" tables with BW 130, 150, 170, 190, 210
 * and levels: Beginner, Novice, Intermediate, Advanced, Elite.
 *
 * Manual fetch workflow:
 * 1. Visit https://strengthlevel.com/strength-standards/{exercise-slug}/lb
 * 2. Find "Male" > "By Bodyweight" table
 * 3. Extract rows for 130, 150, 170, 190, 210 (Beg, Nov, Int, Adv, Elite)
 *
 * Current mappings (program exercise -> strengthlevel slug):
 * - Barbell Bench Press -> bench-press
 * - Smith Machine Squat -> squat (slight scaling)
 * - Barbell RDL -> deadlift (RDL ~85% of DL)
 * - 45° Incline Barbell Press -> incline-barbell-press
 * - 45° Incline DB Press -> incline-dumbbell-bench-press
 * - Machine Chest Press -> bench-press (machine variant)
 * - Leg Press -> sled-leg-press
 * - Hack Squat -> squat
 * - Machine/Seated DB Shoulder Press -> shoulder-press
 * - Rows (Pendlay, Chest-Supported, T-Bar, Smith) -> bent-over-row
 * - Curls (Barbell, EZ-Bar, Bayesian, DB Concentration) -> barbell-curl, dumbbell-curl
 * - Leg Extension -> leg-press * 0.3
 * - Leg Curl -> derived
 * - Lat Pulldowns -> bent-over-row * 0.75
 * - 45° Hyperextension -> RDL * 0.45
 *
 * The bundled src/data/strength-standards.json contains 26 exercises populated
 * from strengthlevel.com (as of script creation).
 *
 * To add more: fetch the page, extract table data, add to strength-standards.json
 * with the program's exercise name as key.
 */

import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

const EXERCISE_SLUGS = [
  'bench-press',
  'squat',
  'deadlift',
  'shoulder-press',
  'pull-ups',
  'dumbbell-bench-press',
  'dumbbell-curl',
  'sled-leg-press',
  'barbell-curl',
  'incline-dumbbell-bench-press',
  'bent-over-row',
]

const OUTPUT_PATH = join(process.cwd(), 'src/data/strength-standards.json')

async function main() {
  console.log('Strength standards are in src/data/strength-standards.json')
  console.log(`Currently ${EXERCISE_SLUGS.length} source exercises on strengthlevel.com`)
  console.log('')
  console.log('To update:')
  console.log('1. Visit https://strengthlevel.com/strength-standards/{slug}/lb')
  console.log('2. Copy Male By Bodyweight table (130,150,170,190,210 x beg,nov,int,adv,elite)')
  console.log('3. Add/merge into strength-standards.json with program exercise name as key')
  console.log('')
  const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
  const count = Object.keys(existing).length
  console.log(`strength-standards.json has ${count} exercises`)
}

main().catch(console.error)
