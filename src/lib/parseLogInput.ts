/**
 * Parse "150 12 9" format → { weight, reps, rpe }
 * Handles: integers, decimals, extra whitespace.
 * Fails loudly with ParseError for malformed input.
 */

export class ParseError extends Error {
  input: string
  constructor(message: string, input: string) {
    super(message)
    this.name = 'ParseError'
    this.input = input
  }
}

export interface ParseResult {
  weight: number
  reps: number
  rpe: number
}

export const RPE_MIN = 1
export const RPE_MAX = 10
export const WEIGHT_MAX = 2000
export const REPS_MAX = 200

export interface SetEditValues {
  weight: number
  reps: number
  rpe: number
}

/** Validate weight, reps, rpe for set edit. Throws ParseError if invalid. */
export function validateSetEdit(weight: number, reps: number, rpe: number): SetEditValues {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || !Number.isFinite(rpe)) {
    throw new ParseError('Use numbers only. Example: 150 12 9', '')
  }
  if (weight <= 0 || reps <= 0) {
    throw new ParseError('Weight and reps must be positive', '')
  }
  if (weight > WEIGHT_MAX) {
    throw new ParseError(`Weight can't exceed ${WEIGHT_MAX} lbs`, '')
  }
  const repsRounded = Math.round(reps)
  if (repsRounded > REPS_MAX) {
    throw new ParseError(`Reps can't exceed ${REPS_MAX}`, '')
  }
  if (repsRounded < 1) {
    throw new ParseError('Reps must be at least 1', '')
  }
  if (rpe < RPE_MIN || rpe > RPE_MAX) {
    throw new ParseError(`RPE must be ${RPE_MIN}–${RPE_MAX} (effort level)`, '')
  }
  return {
    weight: Math.round(weight * 10) / 10,
    reps: repsRounded,
    rpe: Math.round(rpe * 10) / 10,
  }
}

export function parseLogInput(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new ParseError('Enter weight, reps, and RPE. Example: 150 12 9', input)
  }

  const tokens = trimmed.split(/\s+/)
  if (tokens.length < 3) {
    throw new ParseError('Enter weight, reps, and RPE. Example: 150 12 9', input)
  }

  const [weightStr, repsStr, rpeStr] = tokens.slice(0, 3)
  const weight = parseFloat(weightStr)
  const reps = parseFloat(repsStr)
  const rpe = parseFloat(rpeStr)

  if (Number.isNaN(weight) || Number.isNaN(reps) || Number.isNaN(rpe)) {
    throw new ParseError('Use numbers only. Example: 150 12 9', input)
  }

  if (weight <= 0 || reps <= 0) {
    throw new ParseError('Weight and reps must be positive', input)
  }

  if (weight > WEIGHT_MAX) {
    throw new ParseError(`Weight can't exceed ${WEIGHT_MAX} lbs`, input)
  }

  if (reps > REPS_MAX) {
    throw new ParseError(`Reps can't exceed ${REPS_MAX}`, input)
  }

  if (!Number.isInteger(reps)) {
    throw new ParseError('Reps must be a whole number', input)
  }

  if (rpe < RPE_MIN || rpe > RPE_MAX) {
    throw new ParseError(`RPE must be ${RPE_MIN}–${RPE_MAX} (effort level)`, input)
  }

  return { weight: Math.round(weight * 10) / 10, reps: Math.round(reps), rpe: Math.round(rpe * 10) / 10 }
}

/**
 * Parse a log input string, modify one field, and return the rebuilt string.
 * Returns the original string unchanged if it can't be parsed.
 * Returns empty string unchanged (no-op).
 */
export function rebuildLogInput(
  input: string,
  field: 'weight' | 'reps' | 'rpe',
  value: number,
  mode: 'add' | 'set'
): string {
  const trimmed = input.trim()
  if (!trimmed) return input
  try {
    const parsed = parseLogInput(trimmed)
    let w = parsed.weight
    let r = parsed.reps
    let rpe = parsed.rpe
    if (field === 'weight') {
      w = Math.max(0, mode === 'add' ? w + value : value)
    } else if (field === 'reps') {
      r = Math.max(1, mode === 'add' ? r + value : value)
    } else {
      rpe = Math.max(RPE_MIN, Math.min(RPE_MAX, mode === 'add' ? rpe + value : value))
    }
    return `${w} ${r} ${rpe}`
  } catch {
    return input
  }
}
