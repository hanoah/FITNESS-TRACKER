import { describe, it, expect } from 'vitest'
import { plateCalc, platesToTotal } from './plateCalc'

describe('plateCalc', () => {
  it('165 lbs with 45 lb bar', () => {
    const result = plateCalc(165)
    expect(result.barWeight).toBe(45)
    expect(result.totalWeight).toBe(165)
    // 165 - 45 = 120, 60 per side: 45 + 10 + 5
    expect(result.perSide).toEqual([
      { weight: 45, count: 1 },
      { weight: 10, count: 1 },
      { weight: 5, count: 1 },
    ])
  })

  it('45 bar only', () => {
    const result = plateCalc(45)
    expect(result.perSide).toEqual([])
  })

  it('95 lbs (bar + 25/side)', () => {
    const result = plateCalc(95)
    expect(result.perSide).toEqual([{ weight: 25, count: 1 }])
  })

  it('returns empty plates when weight < bar (no throw)', () => {
    const result = plateCalc(30)
    expect(result.perSide).toEqual([])
    expect(result.totalWeight).toBe(30)
    expect(result.barWeight).toBe(45)
  })

  it('throws on negative weight', () => {
    expect(() => plateCalc(-10)).toThrow()
  })

  it('115 lbs uses 35lb plate (1×35/side)', () => {
    const result = plateCalc(115)
    expect(result.perSide).toEqual([{ weight: 35, count: 1 }])
  })

  it('47.5 lbs rounds down (no 1.25lb plates available)', () => {
    const result = plateCalc(47.5)
    expect(result.perSide).toEqual([])
  })

  it('works with barWeight = 0 (no bar)', () => {
    const result = plateCalc(90, 0)
    expect(result.barWeight).toBe(0)
    expect(result.perSide).toEqual([{ weight: 45, count: 1 }])
  })

  it('barWeight = 0 with small weight', () => {
    const result = plateCalc(5, 0)
    expect(result.perSide).toEqual([{ weight: 2.5, count: 1 }])
  })
})

describe('platesToTotal', () => {
  it('reverses plateCalc 165', () => {
    const perSide = [
      { weight: 45, count: 1 },
      { weight: 10, count: 1 },
      { weight: 5, count: 1 },
    ]
    expect(platesToTotal(perSide)).toBe(165)
  })
  it('empty per side = bar only', () => {
    expect(platesToTotal([])).toBe(45)
  })
  it('works with barWeight = 0', () => {
    expect(platesToTotal([{ weight: 45, count: 1 }], 0)).toBe(90)
  })
})
