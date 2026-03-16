import type { TrackerData } from '../lib/backup'

export const SAMPLE_TRACKER: TrackerData = {
  tracker: "Noah's Lifting Tracker",
  weeks: [
    {
      week: 1,
      label: "Calibration",
      rpe: "7-8",
      sets: 2,
      sessions: [
        {
          day: "Tuesday",
          focus: "Upper + Abs",
          exercises: [
            { name: "Lat Pulldown", weight: "115-120 lbs", notes: null },
            { name: "Machine Chest Press", weight: "90-100 lbs", notes: null },
            { name: "Machine OHP", weight: "60-65 lbs", notes: null },
            { name: "Cable Row (Neutral)", weight: "90-95 lbs", notes: null },
            { name: "DB Lateral Raise", weight: "10 lbs", notes: null },
            { name: "DB Bicep Curl", weight: "17.5 lbs", notes: null },
            { name: "Cable Triceps Pushdown", weight: "70-75 lbs", notes: null },
            { name: "Cable Crunch", weight: "110 lbs", notes: null },
          ],
        },
        {
          day: "Thursday",
          focus: "Upper + Abs",
          exercises: [
            { name: "Incline Machine Press", weight: "90 lbs", notes: null },
            { name: "Pec Deck", weight: "70 lbs", notes: null },
            { name: "Seated Cable Row", weight: "95 lbs", notes: null },
            { name: "Face Pull", weight: "80 lbs", notes: null },
            { name: "DB Shoulder Press", weight: "20 lbs", notes: "Light - can go heavier" },
            { name: "DB Hammer Curl", weight: "20 lbs", notes: null },
            { name: "Overhead Cable Triceps Ext", weight: "65 lbs", notes: null },
            { name: "Hanging Leg Raise", weight: "BW", notes: null },
          ],
        },
        {
          day: "Saturday",
          focus: "Lower + Upper Hybrid",
          exercises: [
            { name: "Leg Press", weight: "160-170 lbs", notes: null },
            { name: "Romanian Deadlift", weight: "135-140 lbs", notes: null },
            { name: "Kneeling Leg Curl", weight: "30 lbs", notes: null },
            { name: "KB Goblet Squat", weight: "16kg (35 lbs)", notes: null },
            { name: "Hip Abduction", weight: "85-90 lbs", notes: null },
            { name: "Hip Adduction", weight: "100-110 lbs", notes: null },
            { name: "Standing Calf Raise", weight: "115-120 lbs", notes: null },
            { name: "Lat Pulldown", weight: "85-90 lbs", notes: null },
            { name: "Ab Crunch", weight: "50 lbs", notes: "Machine" },
          ],
        },
      ],
    },
    {
      week: 2,
      label: "To Failure",
      rpe: "10",
      sets: 3,
      sessions: [
        {
          day: "Tuesday",
          focus: "Upper + Abs",
          exercises: [
            { name: "Lat Pulldown", weight: "130 lbs", reps: "8", notes: "Failure" },
            { name: "Machine Chest Press", weight: "105 lbs", reps: "8-10", notes: null },
            { name: "Standing Barbell Press", weight: "65 lbs", reps: "8", notes: null },
            { name: "Chest-Supported Row", weight: "100 lbs", reps: "8", notes: null },
            { name: "DB Lateral Raise", weight: "12.5 lbs", reps: "12", notes: null },
            { name: "Barbell Curl", weight: "40 lbs", reps: "12", notes: null },
            { name: "Cable Triceps Pushdown", weight: "65 lbs", reps: "12", notes: "Can go heavier" },
          ],
        },
        {
          day: "Thursday",
          focus: "Upper + Abs",
          exercises: [
            { name: "Incline Machine Press", weight: "105 lbs", reps: "10", notes: "Failure" },
            { name: "Pec Deck", weight: "90 lbs", reps: "8", notes: "Failure" },
            { name: "Seated Cable Row", weight: "120 lbs", reps: "8-10", notes: "Failure" },
            { name: "Face Pull", weight: "95 lbs", reps: "9-11", notes: "Failure" },
            { name: "Standing Barbell Press", weight: "65 lbs", reps: "8-9", notes: null },
            { name: "DB Hammer Curl", weight: "20 lbs", reps: "10", notes: null },
          ],
        },
        {
          day: "Saturday",
          focus: "Lower + Upper Hybrid",
          exercises: [
            { name: "Leg Press", weight: "180 lbs", reps: "8", notes: "Failure" },
            { name: "Romanian Deadlift", weight: "155 lbs", reps: "8", notes: "Failure" },
            { name: "Kneeling Leg Curl", weight: "40 lbs", reps: "10", notes: "Failure" },
            { name: "KB Goblet Squat", weight: "40 lbs", reps: "12", notes: null },
            { name: "Hip Adduction", weight: "130 lbs", reps: "12", notes: "Failure" },
            { name: "Hip Abduction", weight: "115 lbs", reps: "12", notes: "Failure" },
            { name: "Standing Calf Raise", weight: "150 lbs", reps: "12", notes: "Failure" },
            { name: "Pull-Ups (BW)", weight: "BW", reps: "8", notes: "Failure" },
          ],
        },
      ],
    },
  ],
}
