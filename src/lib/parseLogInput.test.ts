import { describe, it, expect } from 'vitest'
import { parseLogInput, validateSetEdit, rebuildLogInput, ParseError } from './parseLogInput'

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

describe('rebuildLogInput', () => {
  it('adds weight', () => {
    expect(rebuildLogInput('140 10 9', 'weight', 5, 'add')).toBe('145 10 9')
  })

  it('adds fractional weight', () => {
    expect(rebuildLogInput('140 10 9', 'weight', 2.5, 'add')).toBe('142.5 10 9')
  })

  it('clamps weight to 0', () => {
    expect(rebuildLogInput('2 10 9', 'weight', -5, 'add')).toBe('0 10 9')
  })

  it('adds reps', () => {
    expect(rebuildLogInput('140 10 9', 'reps', 2, 'add')).toBe('140 12 9')
  })

  it('subtracts reps', () => {
    expect(rebuildLogInput('140 10 9', 'reps', -2, 'add')).toBe('140 8 9')
  })

  it('clamps reps to 1', () => {
    expect(rebuildLogInput('140 1 9', 'reps', -5, 'add')).toBe('140 1 9')
  })

  it('sets RPE', () => {
    expect(rebuildLogInput('140 10 9', 'rpe', 7, 'set')).toBe('140 10 7')
  })

  it('clamps RPE to valid range', () => {
    expect(rebuildLogInput('140 10 9', 'rpe', 0, 'set')).toBe('140 10 1')
    expect(rebuildLogInput('140 10 9', 'rpe', 15, 'set')).toBe('140 10 10')
  })

  it('returns empty string unchanged', () => {
    expect(rebuildLogInput('', 'weight', 5, 'add')).toBe('')
    expect(rebuildLogInput('   ', 'weight', 5, 'add')).toBe('   ')
  })

  it('returns unparseable input unchanged', () => {
    expect(rebuildLogInput('abc', 'weight', 5, 'add')).toBe('abc')
    expect(rebuildLogInput('140 10', 'rpe', 8, 'set')).toBe('140 10')
  })
})
