/**
 * Schedule config: maps user's day-of-week to program days.
 * Supports merged days (Thu = Pull + Push) and condensed/trimmed exercise filters.
 *
 * Schedule resolution pipeline:
 *   dayOfWeek → schedule.json lookup
 *   → [programDayIds] (possibly multiple for merged days)
 *   → for each: optional exercise index filter for condensed/trimmed
 *   → concatenate exercises with correct slot keys
 */

export interface DayScheduleEntry {
  /** Program day id from nippard.json (e.g. "upper_strength", "pull_hypertrophy") */
  day: string
  /** Optional: include only these exercise indices (0-based). Omit = all exercises. */
  exerciseIndices?: number[]
}

export interface ScheduleConfig {
  monday: DayScheduleEntry[]
  tuesday: DayScheduleEntry[]
  thursday: DayScheduleEntry[]
  saturday: DayScheduleEntry[]
}
