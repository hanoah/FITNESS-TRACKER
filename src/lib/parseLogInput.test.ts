import { describe, it, expect } from 'vitest'
import { parseLogInput, validateSetEdit, ParseError } from './parseLogInput'

describe('parseLogInput', () => {
  it('parses valid input "150 12 9"', () => {
    const result = parseLogInput('150 12 9')
    expect(result).toEqual({ weight: 150, reps: 12, rpe: 9 })
  })

  it('parses with extra whitespace', () => {
    const result = parseLogInput('  155  10  8.5  ')
    expect(result).toEqual({ weight: 155, reps: 10, rpe: 8.5 })
  })

  it('parses decimal weight', () => {
    const result = parseLogInput('152.5 11 8')
    expect(result).toEqual({ weight: 152.5, reps: 11, rpe: 8 })
  })

  it('throws on empty input', () => {
    expect(() => parseLogInput('')).toThrow(ParseError)
    expect(() => parseLogInput('   ')).toThrow(ParseError)
  })

  it('throws on too few tokens', () => {
    expect(() => parseLogInput('150 12')).toThrow(ParseError)
  })

  it('throws on non-numeric', () => {
    expect(() => parseLogInput('abc 12 9')).toThrow(ParseError)
  })

  it('throws on RPE out of range', () => {
    expect(() => parseLogInput('150 12 0')).toThrow(ParseError)
    expect(() => parseLogInput('150 12 11')).toThrow(ParseError)
  })
})

describe('validateSetEdit', () => {
  it('accepts valid values', () => {
    expect(validateSetEdit(150, 12, 9)).toEqual({ weight: 150, reps: 12, rpe: 9 })
  })
  it('rounds and normalizes', () => {
    expect(validateSetEdit(152.54, 11.7, 8.6)).toEqual({ weight: 152.5, reps: 12, rpe: 8.6 })
  })
  it('throws on invalid', () => {
    expect(() => validateSetEdit(0, 12, 9)).toThrow(ParseError)
    expect(() => validateSetEdit(150, -1, 9)).toThrow(ParseError)
    expect(() => validateSetEdit(150, 12, 11)).toThrow(ParseError)
  })
})
