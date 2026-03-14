/**
 * Program store: loaded program + schedule + current block/week state.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../lib/db'
import nippardData from '../data/nippard.json'
import scheduleData from '../data/schedule.json'
import type { NippardProgram } from '../types/program'
import type { ScheduleConfig } from '../types/schedule'
import { getDayExercises, getCurrentBlockAndWeek, type ResolvedExercise } from '../lib/programEngine'

const program = nippardData as NippardProgram
const schedule = scheduleData as ScheduleConfig

function validateProgram(p: NippardProgram): string | null {
  if (!p.blocks?.length) return 'Program has no blocks'
  for (const b of p.blocks) {
    if (!b.weeks?.length) return `Block ${b.id} has no weeks`
    for (const w of b.weeks) {
      if (!w.days?.length) return `Block ${b.id} week ${w.number} has no days`
    }
  }
  return null
}

export const useProgramStore = defineStore('program', () => {
  const programError = ref<string | null>(null)
  const programState = ref<{ blockId: string; weekNumber: number } | null>(null)

  async function loadProgramState(): Promise<{ blockId: string; weekNumber: number } | null> {
    programError.value = null
    const validationError = validateProgram(program)
    if (validationError) {
      programError.value = validationError
      return null
    }
    try {
      const state = await db.programState.get('current')
      if (state) {
        programState.value = { blockId: state.blockId, weekNumber: state.weekNumber }
      } else {
        const { blockId, weekNumber } = getCurrentBlockAndWeek(program, null)
        programState.value = { blockId, weekNumber }
        await db.programState.put({
          id: 'current',
          blockId,
          weekNumber,
          updatedAt: Date.now(),
        })
      }
      return programState.value
    } catch (e) {
      console.error('[program.loadProgramState] Failed to load state', e)
      return null
    }
  }

  async function advanceWeek(): Promise<boolean> {
    const state = programState.value
    if (!state) return false
    const block = program.blocks.find((b) => b.id === state.blockId)
    if (!block) return false
    const maxWeek = Math.max(...block.weeks.map((w) => w.number))
    if (state.weekNumber >= maxWeek) return false

    try {
      const next = state.weekNumber + 1
      programState.value = { ...state, weekNumber: next }
      await db.programState.put({
        id: 'current',
        blockId: state.blockId,
        weekNumber: next,
        updatedAt: Date.now(),
      })
      return true
    } catch (e) {
      console.error('[program.advanceWeek] Failed to advance week', e)
      return false
    }
  }

  function getExercisesForDay(
    day: 'monday' | 'tuesday' | 'thursday' | 'saturday'
  ): ResolvedExercise[] {
    const state = programState.value
    if (!state) return []
    try {
      return getDayExercises(day, schedule, program, state.blockId, state.weekNumber)
    } catch (e) {
      console.error('[program.getExercisesForDay] Failed to get exercises', { day, state }, e)
      return []
    }
  }

  const currentBlock = computed(() => {
    const state = programState.value
    if (!state) return null
    return program.blocks.find((b) => b.id === state.blockId)
  })

  return {
    program,
    schedule,
    programState,
    programError,
    loadProgramState,
    advanceWeek,
    getExercisesForDay,
    currentBlock,
  }
})
