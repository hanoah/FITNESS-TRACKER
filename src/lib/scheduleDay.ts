export type ScheduleDay = 'monday' | 'tuesday' | 'thursday' | 'saturday'

export function getScheduleDay(date?: Date): { key: ScheduleDay; label: string } | null {
  const d = (date ?? new Date()).getDay()
  if (d === 1) return { key: 'monday', label: 'Monday' }
  if (d === 2) return { key: 'tuesday', label: 'Tuesday' }
  if (d === 4) return { key: 'thursday', label: 'Thursday' }
  if (d === 6) return { key: 'saturday', label: 'Saturday' }
  return null
}
