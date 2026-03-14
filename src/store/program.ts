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
import { getDayExercises, getCurrentBlockAndWeek } from '../lib/programEngine'

const program = nippardData as NippardProgram
const schedule = scheduleData as ScheduleConfig

export const useProgramStore = defineStore('program', () => {
  const programState = ref<{ blockId: string; weekNumber: number } | null>(null)

  async function loadProgramState() {
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
  }

  async function advanceWeek() {
    const state = programState.value
    if (!state) return
    const block = program.blocks.find((b) => b.id === state.blockId)
    if (!block) return
    const maxWeek = Math.max(...block.weeks.map((w) => w.number))
    if (state.weekNumber >= maxWeek) return

    const next = state.weekNumber + 1
    programState.value = { ...state, weekNumber: next }
    await db.programState.put({
      id: 'current',
      blockId: state.blockId,
      weekNumber: next,
      updatedAt: Date.now(),
    })
  }

  function getExercisesForDay(
    day: 'monday' | 'tuesday' | 'thursday' | 'saturday'
  ) {
    const state = programState.value
    if (!state) return []
    return getDayExercises(day, schedule, program, state.blockId, state.weekNumber)
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
    loadProgramState,
    advanceWeek,
    getExercisesForDay,
    currentBlock,
  }
})
