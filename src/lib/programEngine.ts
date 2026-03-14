/**
 * Program engine: resolve today's workout from schedule + nippard program.
 *
 * Schedule resolution pipeline:
 *   dayOfWeek → schedule.json lookup → [DayScheduleEntry]
 *   → for each entry: load exercises from nippard, apply exercise filter
 *   → concatenate with slot keys (dayType:index)
 */

import type { ScheduleConfig } from '../types/schedule'
import type { NippardProgram, ProgramExercise } from '../types/program'

export interface ResolvedExercise extends ProgramExercise {
  slotKey: string
  dayType: string
}

export function getDayExercises(
  dayOfWeek: 'monday' | 'tuesday' | 'thursday' | 'saturday',
  schedule: ScheduleConfig,
  program: NippardProgram,
  blockId: string,
  weekNumber: number
): ResolvedExercise[] {
  const entries = schedule[dayOfWeek]
  if (!entries || entries.length === 0) {
    return []
  }

  const block = program.blocks.find((b) => b.id === blockId)
  if (!block) {
    throw new Error(`Block ${blockId} not found`)
  }

  const week = block.weeks.find((w) => w.number === weekNumber)
  if (!week) {
    throw new Error(`Week ${weekNumber} not found in block ${blockId}`)
  }

  const result: ResolvedExercise[] = []
  let globalIndex = 0

  for (const entry of entries) {
    const day = week.days.find((d) => d.id === entry.day)
    if (!day) {
      throw new Error(`Day ${entry.day} not found in week ${weekNumber}`)
    }

    const indices = entry.exerciseIndices ?? day.exercises.map((_, i) => i)
    for (const i of indices) {
      const ex = day.exercises[i]
      if (!ex) continue

      result.push({
        ...ex,
        slotKey: `${entry.day}:${i}`,
        dayType: entry.day,
      })
      globalIndex++
    }
  }

  return result
}

export function getCurrentBlockAndWeek(
  program: NippardProgram,
  programState: { blockId: string; weekNumber: number } | null
): { blockId: string; weekNumber: number } {
  if (programState) {
    return programState
  }
  const block = program.blocks[0]
  if (!block) {
    throw new Error('Program has no blocks')
  }
  return {
    blockId: block.id,
    weekNumber: 1,
  }
}
