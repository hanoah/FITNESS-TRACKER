import { describe, it, expect } from 'vitest'
import { getScheduleDay } from './scheduleDay'

describe('getScheduleDay', () => {
  it('returns monday for Monday', () => {
    const d = new Date(2025, 2, 10) // March 10, 2025 = Monday (local)
    const result = getScheduleDay(d)
    expect(result).toEqual({ key: 'monday', label: 'Monday' })
  })

  it('returns tuesday for Tuesday', () => {
    const d = new Date(2025, 2, 11) // March 11, 2025 = Tuesday
    const result = getScheduleDay(d)
    expect(result).toEqual({ key: 'tuesday', label: 'Tuesday' })
  })

  it('returns thursday for Thursday', () => {
    const d = new Date(2025, 2, 13) // March 13, 2025 = Thursday
    const result = getScheduleDay(d)
    expect(result).toEqual({ key: 'thursday', label: 'Thursday' })
  })

  it('returns saturday for Saturday', () => {
    const d = new Date(2025, 2, 15) // March 15, 2025 = Saturday
    const result = getScheduleDay(d)
    expect(result).toEqual({ key: 'saturday', label: 'Saturday' })
  })

  it('returns null for non-workout days (e.g. Wednesday)', () => {
    const d = new Date(2025, 2, 12) // March 12, 2025 = Wednesday
    const result = getScheduleDay(d)
    expect(result).toBeNull()
  })
})
