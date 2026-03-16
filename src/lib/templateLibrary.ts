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
