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

const RPE_MIN = 1
const RPE_MAX = 10

export function parseLogInput(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new ParseError('Try: 150 12 9 (weight reps RPE)', input)
  }

  const tokens = trimmed.split(/\s+/)
  if (tokens.length < 3) {
    throw new ParseError('Try: 150 12 9 (weight reps RPE)', input)
  }

  const [weightStr, repsStr, rpeStr] = tokens.slice(0, 3)
  const weight = parseFloat(weightStr)
  const reps = parseFloat(repsStr)
  const rpe = parseFloat(rpeStr)

  if (Number.isNaN(weight) || Number.isNaN(reps) || Number.isNaN(rpe)) {
    throw new ParseError('Use numbers only. Try: 150 12 9', input)
  }

  if (weight <= 0 || reps <= 0) {
    throw new ParseError('Weight and reps must be positive', input)
  }

  if (rpe < RPE_MIN || rpe > RPE_MAX) {
    throw new ParseError(`RPE must be ${RPE_MIN}-${RPE_MAX}`, input)
  }

  return { weight: Math.round(weight * 10) / 10, reps: Math.round(reps), rpe: Math.round(rpe * 10) / 10 }
}
