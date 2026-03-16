/**
 * Nippard program data types.
 * Used by: parse script output, program engine, UI.
 */

export type IntensityTechnique =
  | 'none'
  | 'failure'
  | 'llps'
  | 'static_stretch'
  | 'myo_reps'
  | 'drop_set'

export interface ProgramExercise {
  name: string
  demoUrl: string
  intensityTechnique: IntensityTechnique
  warmupSets: number
  workingSets: number
  repRange: [number, number]
  earlySetRPE: number
  lastSetRPE: number
  restSeconds: [number, number]
  sub1: string
  sub2: string
  notes: string
  imagePath?: string
}

export interface Day {
  id: string
  name: string
  exercises: ProgramExercise[]
}

export interface Week {
  number: number
  isDeload: boolean
  days: Day[]
}

export interface Block {
  id: string
  name: string
  weeks: Week[]
}

export interface NippardProgram {
  blocks: Block[]
}
