/**
 * Delight copy: varied, encouraging messages that match the app's
 * chill, organic, hand-drawn brand. Keeps repeated use fresh.
 */

const COMPLETE_WORKOUT_MESSAGES = [
  'Nice one!',
  'Crushed it!',
  'Workout saved!',
  'Done. Go refuel.',
  'Logged and locked.',
]

/** Picks a random completion message. Call at success moment. */
export function getCompleteWorkoutMessage(): string {
  const i = Math.floor(Math.random() * COMPLETE_WORKOUT_MESSAGES.length)
  return COMPLETE_WORKOUT_MESSAGES[i]
}
