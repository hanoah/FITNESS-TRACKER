/**
 * Template library: pre-built program hierarchy + custom template CRUD.
 *
 * Data flow:
 *   getPrebuiltHierarchy() → TemplatePicker (drill-down)
 *   dayToSessionExercises(day) → SessionExercise[] for startWorkout
 *   saveTemplate / loadTemplates / deleteTemplate → IndexedDB templates table
 */

import { db, type WorkoutTemplate } from './db'
import nippardData from '../data/nippard.json'
import type { NippardProgram, Block, Day, ProgramExercise } from '../types/program'
import type { SessionExercise } from '../types/session'

const program = nippardData as NippardProgram

export interface PrebuiltSource {
  id: string
  name: string
  blocks: Block[]
}

export interface PrebuiltHierarchy {
  sources: PrebuiltSource[]
}

/** Returns the nippard program wrapped as a browseable hierarchy for the template picker. */
export function getPrebuiltHierarchy(): PrebuiltHierarchy {
  return {
    sources: [
      {
        id: 'jeff-nippard',
        name: 'Jeff Nippard',
        blocks: program.blocks,
      },
    ],
  }
}

/** Converts a ProgramExercise to SessionExercise with slotKey and dayType. */
export function programExerciseToSession(
  ex: ProgramExercise,
  dayId: string,
  index: number
): SessionExercise {
  return {
    ...ex,
    slotKey: `template:${dayId}:${index}`,
    dayType: dayId,
  }
}

/** Maps all exercises in a day to SessionExercise[]. */
export function dayToSessionExercises(day: Day): SessionExercise[] {
  return day.exercises.map((ex, i) => programExerciseToSession(ex, day.id, i))
}

/** Resolves exercises for a legacy session (blockId + weekNumber + dayType). Returns null if not found. */
export function getExercisesForBlockWeekDay(
  blockId: string,
  weekNumber: number,
  dayType: string
): SessionExercise[] | null {
  const block = program.blocks.find((b) => b.id === blockId)
  if (!block) return null
  const week = block.weeks.find((w) => w.number === weekNumber)
  if (!week) return null
  const day = week.days.find((d) => d.id === dayType)
  if (!day) return null
  return dayToSessionExercises(day)
}

/** Saves a custom template. Allows duplicate names. */
export async function saveTemplate(
  name: string,
  exercises: SessionExercise[]
): Promise<number> {
  const plain = JSON.parse(JSON.stringify(exercises))
  const id = await db.templates.add({
    name,
    exercises: plain,
    createdAt: Date.now(),
  })
  return id as number
}

/** Loads all custom templates, newest first. */
export async function loadTemplates(): Promise<WorkoutTemplate[]> {
  try {
    const all = await db.templates.orderBy('createdAt').reverse().toArray()
    return all
  } catch (e) {
    console.error('[templateLibrary] Failed to load templates', e)
    return []
  }
}

/** Deletes a custom template by id. */
export async function deleteTemplate(id: number): Promise<void> {
  await db.templates.delete(id)
}

const BUILT_IN_TEMPLATES: { name: string; exercises: SessionExercise[] }[] = [
  {
    name: 'Going Heavy',
    exercises: [
      {
        name: 'Lunge Hold Calf Raise',
        slotKey: 'going-heavy:0',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 3,
        repRange: [10, 15],
        earlySetRPE: 6,
        lastSetRPE: 7,
        restSeconds: [30, 45],
        notes: 'Circuit with next 3 exercises. Hold lunge position while performing calf raises.',
        demoUrl: '',
        sub1: 'Standing Calf Raise',
        sub2: 'Seated Calf Raise',
      },
      {
        name: 'Press Up',
        slotKey: 'going-heavy:1',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 3,
        repRange: [10, 15],
        earlySetRPE: 6,
        lastSetRPE: 7,
        restSeconds: [30, 45],
        notes: 'Circuit with surrounding exercises. Full range of motion.',
        demoUrl: '',
        sub1: 'Incline Press Up',
        sub2: 'Knee Press Up',
      },
      {
        name: 'Side Lunge',
        slotKey: 'going-heavy:2',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 3,
        repRange: [10, 12],
        earlySetRPE: 6,
        lastSetRPE: 7,
        restSeconds: [30, 45],
        notes: 'Circuit. Push hips back and keep trailing leg straight.',
        demoUrl: '',
        sub1: 'Cossack Squat',
        sub2: 'Curtsy Lunge',
      },
      {
        name: 'Mountain Climber',
        slotKey: 'going-heavy:3',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 3,
        repRange: [15, 20],
        earlySetRPE: 7,
        lastSetRPE: 7,
        restSeconds: [60, 90],
        notes: 'Last exercise in circuit. Drive knees to chest with pace. Rest after full round.',
        demoUrl: '',
        sub1: 'High Knees',
        sub2: 'Burpee',
      },
      {
        name: 'Banded Side Lunge',
        slotKey: 'going-heavy:4',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [10, 12],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 90],
        notes: 'Superset with Pull Up. Band around knees for glute activation.',
        demoUrl: '',
        equipment: 'stretch band',
        sub1: 'Banded Lateral Walk',
        sub2: 'Side Lunge',
      },
      {
        name: 'Pull Up',
        slotKey: 'going-heavy:5',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [6, 10],
        earlySetRPE: 8,
        lastSetRPE: 9,
        restSeconds: [90, 120],
        notes: 'Superset with Banded Side Lunge. Full dead hang at bottom.',
        demoUrl: '',
        equipment: 'pull-up bar',
        sub1: 'Lat Pulldown',
        sub2: 'Assisted Pull Up',
      },
      {
        name: 'Straight Leg Deadlift',
        slotKey: 'going-heavy:6',
        dayType: 'going_heavy',
        warmupSets: 1,
        workingSets: 2,
        repRange: [8, 10],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [90, 120],
        notes: 'Superset with Walking Calf Raises. Hinge at hips, slight knee bend.',
        demoUrl: '',
        equipment: 'barbell',
        sub1: 'Romanian Deadlift',
        sub2: 'Dumbbell Stiff Leg Deadlift',
      },
      {
        name: 'Loaded Walking Calf Raises',
        slotKey: 'going-heavy:7',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [12, 15],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [90, 120],
        notes: 'Superset with Straight Leg Deadlift. Walk on toes with dumbbells.',
        demoUrl: '',
        equipment: 'dumbbell',
        sub1: 'Standing Calf Raise',
        sub2: 'Farmer Walk on Toes',
      },
      {
        name: 'Seated Barbell Press',
        slotKey: 'going-heavy:8',
        dayType: 'going_heavy',
        warmupSets: 1,
        workingSets: 2,
        repRange: [6, 8],
        earlySetRPE: 7,
        lastSetRPE: 9,
        restSeconds: [90, 120],
        notes: 'Superset with Step Down. Seated on bench, press overhead.',
        demoUrl: '',
        equipment: 'barbell',
        sub1: 'Dumbbell Shoulder Press',
        sub2: 'Machine Shoulder Press',
      },
      {
        name: 'Step Down',
        slotKey: 'going-heavy:9',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [8, 10],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [90, 120],
        notes: 'Superset with Seated Barbell Press. Use a bench. Control the descent.',
        demoUrl: '',
        equipment: 'bench',
        sub1: 'Bulgarian Split Squat',
        sub2: 'Step Up',
      },
      {
        name: 'Figure of 8s',
        slotKey: 'going-heavy:10',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [10, 12],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 90],
        notes: 'Superset with Hip Drop. Move weight in a figure-8 pattern.',
        demoUrl: '',
        equipment: 'dumbbell',
        sub1: 'Around the World',
        sub2: 'Woodchop',
      },
      {
        name: 'Hip Drop',
        slotKey: 'going-heavy:11',
        dayType: 'going_heavy',
        warmupSets: 0,
        workingSets: 2,
        repRange: [10, 12],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 90],
        notes: 'Superset with Figure of 8s. Side plank position, drop and raise hips.',
        demoUrl: '',
        sub1: 'Side Plank',
        sub2: 'Oblique Crunch',
      },
    ],
  },
  {
    name: 'Monday Upper Feel Good',
    exercises: [
      {
        name: '45° Incline Barbell Press',
        slotKey: 'quick-upper:0',
        dayType: 'quick_upper',
        warmupSets: 1,
        workingSets: 2,
        repRange: [8, 10],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [90, 120],
        notes: '1 second pause at the bottom. Keep tension on the pecs.',
        demoUrl: '',
        sub1: '45° Incline DB Press',
        sub2: '45° Incline Machine Press',
        imagePath: '/images/wger/45-incline-barbell-press.png',
      },
      {
        name: 'Chest-Supported Row',
        slotKey: 'quick-upper:1',
        dayType: 'quick_upper',
        warmupSets: 1,
        workingSets: 2,
        repRange: [8, 10],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 90],
        notes: 'Squeeze shoulder blades at the top. Slow negative.',
        demoUrl: '',
        sub1: 'Seated Cable Row',
        sub2: 'Smith Machine Row',
        imagePath: '/images/wger/chest-supported-machine-row.png',
      },
      {
        name: 'DB Shoulder Press',
        slotKey: 'quick-upper:2',
        dayType: 'quick_upper',
        warmupSets: 1,
        workingSets: 2,
        repRange: [10, 12],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 90],
        notes: 'Seated or standing. Full range of motion.',
        demoUrl: '',
        sub1: 'Machine OHP',
        sub2: 'Standing Barbell Press',
        imagePath: '/images/wger/seated-db-shoulder-press.png',
      },
      {
        name: 'Cable Crossover Ladder',
        slotKey: 'quick-upper:3',
        dayType: 'quick_upper',
        warmupSets: 0,
        workingSets: 2,
        repRange: [10, 12],
        earlySetRPE: 7,
        lastSetRPE: 8,
        restSeconds: [60, 60],
        notes: 'Pick your favourite cable height. Chest pump.',
        demoUrl: '',
        sub1: 'Pec Deck',
        sub2: 'Bottom-Half DB Flye',
      },
      {
        name: 'Face Pull',
        slotKey: 'quick-upper:4',
        dayType: 'quick_upper',
        warmupSets: 0,
        workingSets: 2,
        repRange: [12, 15],
        earlySetRPE: 7,
        lastSetRPE: 7,
        restSeconds: [60, 60],
        notes: 'External rotation at the top. Shoulder health finisher.',
        demoUrl: '',
        sub1: 'High-Cable Lateral Raise',
        sub2: 'DB Lateral Raise',
      },
    ],
  },
]

/**
 * Seeds built-in templates into IndexedDB if they don't already exist.
 * Safe to call on every app mount — checks by name before inserting.
 */
export async function seedBuiltInTemplates(): Promise<void> {
  try {
    const existing = await db.templates.toArray()
    const existingNames = new Set(existing.map((t) => t.name))

    for (const tmpl of BUILT_IN_TEMPLATES) {
      if (existingNames.has(tmpl.name)) continue
      await db.templates.add({
        name: tmpl.name,
        exercises: JSON.parse(JSON.stringify(tmpl.exercises)),
        createdAt: Date.now(),
      })
    }
  } catch (e) {
    console.error('[templateLibrary] Failed to seed built-in templates', e)
  }
}
