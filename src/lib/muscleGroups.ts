/**
 * Maps individual muscles to body regions for exercise grouping.
 *
 * Used by the "By Exercise" history view to build a
 * Region → Muscle → Exercise hierarchy.
 */

import muscleData from '../data/exercise-muscles.json'

const MUSCLE_TO_REGION: Record<string, string> = {
  Chest: 'Chest',
  Lats: 'Back',
  Trapezius: 'Back',
  Shoulders: 'Shoulders',
  'Serratus anterior': 'Shoulders',
  Biceps: 'Arms',
  Brachialis: 'Arms',
  Triceps: 'Arms',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  Calves: 'Legs',
  Soleus: 'Legs',
  Abs: 'Core',
}

const REGION_ORDER = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Other']

const data = muscleData as Record<string, { primary: string[]; secondary: string[] }>

/**
 * Keyword → muscle fallback for custom exercise names not in the JSON.
 * Order matters: first match wins. More specific patterns come first.
 */
const KEYWORD_MUSCLE: [RegExp, string][] = [
  [/\blat pull/i, 'Lats'],
  [/\bpull.?up/i, 'Lats'],
  [/\bpull.?down/i, 'Lats'],
  [/\brow\b/i, 'Lats'],
  [/\bface pull/i, 'Shoulders'],
  [/\blateral raise/i, 'Shoulders'],
  [/\bshrug/i, 'Trapezius'],
  [/\bohp\b|\boverhead press/i, 'Shoulders'],
  [/\bshoulder press/i, 'Shoulders'],
  [/\bmilitary press/i, 'Shoulders'],
  [/\bbarbell press/i, 'Shoulders'],
  [/\bincline.*press/i, 'Chest'],
  [/\bbench/i, 'Chest'],
  [/\bchest\b|flye|fly\b|pec\b/i, 'Chest'],
  [/\bpress\b/i, 'Chest'],
  [/\btricep/i, 'Triceps'],
  [/\bskull crush/i, 'Triceps'],
  [/\bpushdown|push.?down/i, 'Triceps'],
  [/\bkickback/i, 'Triceps'],
  [/\bleg curl|hamstring/i, 'Hamstrings'],
  [/\bcurl/i, 'Biceps'],
  [/\bhammer/i, 'Biceps'],
  [/\bsquat/i, 'Quads'],
  [/\bleg press/i, 'Quads'],
  [/\bleg ext/i, 'Quads'],
  [/\blunge/i, 'Quads'],
  [/\bsplit squat/i, 'Quads'],
  [/\bhack\b/i, 'Quads'],
  [/\brdl\b|deadlift/i, 'Hamstrings'],
  [/\bglute|hip thrust/i, 'Glutes'],
  [/\babduct/i, 'Glutes'],
  [/\badduct/i, 'Glutes'],
  [/\bcalf|calves/i, 'Calves'],
  [/\bab\b|abs\b|crunch|sit.?up|plank|rollout|leg raise|hanging/i, 'Abs'],
  [/\bhyperext/i, 'Hamstrings'],
]

function inferMuscle(name: string): string | null {
  for (const [pattern, muscle] of KEYWORD_MUSCLE) {
    if (pattern.test(name)) return muscle
  }
  return null
}

function getPrimaryMuscle(exerciseName: string): string | null {
  const entry = data[exerciseName]
  if (entry?.primary?.length) return entry.primary[0]
  return inferMuscle(exerciseName)
}

function getRegion(muscle: string): string {
  return MUSCLE_TO_REGION[muscle] ?? 'Other'
}

export interface MuscleEntry {
  muscle: string
  exercises: string[]
}

export interface BodyRegionGroup {
  region: string
  muscles: MuscleEntry[]
}

/**
 * Groups a list of exercise names into Region → Muscle → Exercises.
 * Only includes regions/muscles that have at least one exercise in the list.
 */
export function groupByBodyRegion(exerciseNames: string[]): BodyRegionGroup[] {
  const regionMap = new Map<string, Map<string, string[]>>()

  for (const name of exerciseNames) {
    const muscle = getPrimaryMuscle(name) ?? 'General'
    const region = muscle === 'General' ? 'Other' : getRegion(muscle)

    if (!regionMap.has(region)) regionMap.set(region, new Map())
    const muscleMap = regionMap.get(region)!
    if (!muscleMap.has(muscle)) muscleMap.set(muscle, [])
    muscleMap.get(muscle)!.push(name)
  }

  const result: BodyRegionGroup[] = []
  for (const region of REGION_ORDER) {
    const muscleMap = regionMap.get(region)
    if (!muscleMap) continue
    const muscles: MuscleEntry[] = []
    for (const [muscle, exercises] of muscleMap) {
      muscles.push({ muscle, exercises })
    }
    result.push({ region, muscles })
  }

  return result
}
