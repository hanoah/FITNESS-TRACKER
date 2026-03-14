#!/usr/bin/env node
/**
 * Generate backup JSON from Noah's 2-week tracker for import.
 * Week 1: 2 sets each, RPE 7-8. Week 2: 3 sets each, RPE 10 (failure).
 */

const sessions = [
  { date: '2025-03-04', dayType: 'tuesday_upper_abs', weekNum: 1, exercises: [
    { name: 'Lat Pulldown', weight: 118, reps: 10, rpe: 8, sets: 2 },
    { name: 'Machine Chest Press', weight: 95, reps: 10, rpe: 8, sets: 2 },
    { name: 'Machine OHP', weight: 62, reps: 10, rpe: 8, sets: 2 },
    { name: 'Cable Row (Neutral)', weight: 92, reps: 10, rpe: 8, sets: 2 },
    { name: 'DB Lateral Raise', weight: 10, reps: 10, rpe: 8, sets: 2 },
    { name: 'DB Bicep Curl', weight: 17.5, reps: 10, rpe: 8, sets: 2 },
    { name: 'Cable Triceps Pushdown', weight: 72, reps: 10, rpe: 8, sets: 2 },
    { name: 'Cable Crunch', weight: 110, reps: 10, rpe: 8, sets: 2 },
  ]},
  { date: '2025-03-06', dayType: 'thursday_upper_abs', weekNum: 1, exercises: [
    { name: 'Incline Machine Press', weight: 90, reps: 10, rpe: 8, sets: 2 },
    { name: 'Pec Deck', weight: 70, reps: 10, rpe: 8, sets: 2 },
    { name: 'Seated Cable Row', weight: 95, reps: 10, rpe: 8, sets: 2 },
    { name: 'Face Pull', weight: 80, reps: 10, rpe: 8, sets: 2 },
    { name: 'DB Shoulder Press', weight: 20, reps: 10, rpe: 8, sets: 2 },
    { name: 'DB Hammer Curl', weight: 20, reps: 10, rpe: 8, sets: 2 },
    { name: 'Overhead Cable Triceps Ext', weight: 65, reps: 10, rpe: 8, sets: 2 },
    { name: 'Hanging Leg Raise', weight: 0, reps: 10, rpe: 8, sets: 2 },
  ]},
  { date: '2025-03-08', dayType: 'saturday_lower_upper', weekNum: 1, exercises: [
    { name: 'Leg Press', weight: 165, reps: 10, rpe: 8, sets: 2 },
    { name: 'Romanian Deadlift', weight: 138, reps: 10, rpe: 8, sets: 2 },
    { name: 'Kneeling Leg Curl', weight: 30, reps: 10, rpe: 8, sets: 2 },
    { name: 'KB Goblet Squat', weight: 35, reps: 10, rpe: 8, sets: 2 },
    { name: 'Hip Abduction', weight: 88, reps: 10, rpe: 8, sets: 2 },
    { name: 'Hip Adduction', weight: 105, reps: 10, rpe: 8, sets: 2 },
    { name: 'Standing Calf Raise', weight: 118, reps: 10, rpe: 8, sets: 2 },
    { name: 'Lat Pulldown', weight: 88, reps: 10, rpe: 8, sets: 2 },
    { name: 'Ab Crunch', weight: 50, reps: 10, rpe: 8, sets: 2 },
  ]},
  { date: '2025-03-11', dayType: 'tuesday_upper_abs', weekNum: 2, exercises: [
    { name: 'Lat Pulldown', weight: 130, reps: 8, rpe: 10, sets: 3 },
    { name: 'Machine Chest Press', weight: 105, reps: 9, rpe: 10, sets: 3 },
    { name: 'Standing Barbell Press', weight: 65, reps: 8, rpe: 10, sets: 3 },
    { name: 'Chest-Supported Row', weight: 100, reps: 8, rpe: 10, sets: 3 },
    { name: 'DB Lateral Raise', weight: 12.5, reps: 12, rpe: 10, sets: 3 },
    { name: 'Barbell Curl', weight: 40, reps: 12, rpe: 10, sets: 3 },
    { name: 'Cable Triceps Pushdown', weight: 65, reps: 12, rpe: 10, sets: 3 },
  ]},
  { date: '2025-03-13', dayType: 'thursday_upper_abs', weekNum: 2, exercises: [
    { name: 'Incline Machine Press', weight: 105, reps: 10, rpe: 10, sets: 3 },
    { name: 'Pec Deck', weight: 90, reps: 8, rpe: 10, sets: 3 },
    { name: 'Seated Cable Row', weight: 120, reps: 9, rpe: 10, sets: 3 },
    { name: 'Face Pull', weight: 95, reps: 10, rpe: 10, sets: 3 },
    { name: 'Standing Barbell Press', weight: 65, reps: 8, rpe: 10, sets: 3 },
    { name: 'DB Hammer Curl', weight: 20, reps: 10, rpe: 10, sets: 3 },
  ]},
  { date: '2025-03-15', dayType: 'saturday_lower_upper', weekNum: 2, exercises: [
    { name: 'Leg Press', weight: 180, reps: 8, rpe: 10, sets: 3 },
    { name: 'Romanian Deadlift', weight: 155, reps: 8, rpe: 10, sets: 3 },
    { name: 'Kneeling Leg Curl', weight: 40, reps: 10, rpe: 10, sets: 3 },
    { name: 'KB Goblet Squat', weight: 40, reps: 12, rpe: 10, sets: 3 },
    { name: 'Hip Adduction', weight: 130, reps: 12, rpe: 10, sets: 3 },
    { name: 'Hip Abduction', weight: 115, reps: 12, rpe: 10, sets: 3 },
    { name: 'Standing Calf Raise', weight: 150, reps: 12, rpe: 10, sets: 3 },
    { name: 'Pull-Ups (BW)', weight: 0, reps: 8, rpe: 10, sets: 3 },
  ]},
]

const out = { version: 1, exportedAt: new Date().toISOString(), sessions: [], sets: [] }
let sessionId = 1
const baseTs = new Date('2025-03-01').getTime()

for (const s of sessions) {
  const startTs = baseTs + (sessionId - 1) * 86400000 * 4
  out.sessions.push({
    date: s.date,
    dayType: s.dayType,
    blockId: 'noah',
    weekNumber: s.weekNum,
    status: 'completed',
    currentExerciseIndex: s.exercises.length,
    completedSetCount: s.exercises.length,
    startedAt: startTs,
    completedAt: startTs + 3600000,
  })
  let setTs = startTs
  for (let e = 0; e < s.exercises.length; e++) {
    const ex = s.exercises[e]
    const slot = `${s.dayType}:${e}`
    for (let i = 1; i <= ex.sets; i++) {
      setTs += 90000
      out.sets.push({
        sessionId,
        exerciseSlot: slot,
        exerciseName: ex.name,
        setNumber: i,
        weight: ex.weight,
        reps: ex.reps,
        rpe: ex.rpe,
        isWarmup: false,
        timestamp: setTs,
      })
    }
  }
  sessionId++
}

console.log(JSON.stringify(out, null, 2))
