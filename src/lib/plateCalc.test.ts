import { describe, it, expect } from 'vitest'
import { plateCalc } from './plateCalc'

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

  it('throws on weight < bar', () => {
    expect(() => plateCalc(30)).toThrow()
  })

  it('throws on negative weight', () => {
    expect(() => plateCalc(-10)).toThrow()
  })
})
