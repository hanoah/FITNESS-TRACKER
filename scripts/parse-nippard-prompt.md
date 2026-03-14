# Prompt: Parse Jeff Nippard Bodybuilding Program to JSON

Copy the prompt below and paste it into Claude, ChatGPT, or another LLM. Then paste the contents of `The_Bodybuilding_Transformation_System_-_Intermediate_Advanced.txt` as the program text to parse.

---

## The prompt

You are parsing a PDF-extracted workout program (Jeff Nippard's Bodybuilding Transformation System) into structured JSON. The source text is messy: space-aligned columns, exercise names split across lines, NOTES and Substitution columns that wrap awkwardly. Extract the data accurately.

**Output:** A single JSON object matching this TypeScript interface. Return ONLY valid JSON, no markdown, no explanation.

```typescript
interface NippardProgram {
  blocks: Block[]
}
interface Block {
  id: string           // e.g. "foundation", "ramping"
  name: string         // e.g. "Foundation Block"
  weeks: Week[]
}
interface Week {
  number: number       // 1-based
  isDeload: boolean    // Week 1 = true
  days: Day[]
}
interface Day {
  id: string           // slug: "upper_strength", "lower_strength", "pull_hypertrophy", "push_hypertrophy", "legs_hypertrophy"
  name: string         // e.g. "Upper (Strength Focus)"
  exercises: ProgramExercise[]
}
interface ProgramExercise {
  name: string
  demoUrl: string      // empty string ""
  intensityTechnique: "none" | "failure" | "llps" | "static_stretch" | "myo_reps" | "drop_set"
  warmupSets: number   // from Warm-up column (1, 1-2, 2-3, 2-4, etc. — use the higher number or average)
  workingSets: number  // from WORKING SETS column
  repRange: [number, number]  // e.g. [6, 8] from "6-8"
  earlySetRPE: number  // from Early Set RPE: "~6-7" → 6, "~7-8" → 7
  lastSetRPE: number   // from Last Set RPE: "~7-8" → 7, "~8-9" → 8, "10" → 10
  restSeconds: [number, number]  // "3-5 min" → [180, 300], "1-2 min" → [60, 120], "2-3 min" → [120, 180]
  sub1: string         // Substitution Option 1
  sub2: string         // Substitution Option 2
  notes: string        // form cues, technique notes from NOTES column
  gifPath?: string     // omit
}
```

**Mapping rules:**

1. **Intensity Technique:** N/A → "none", Failure → "failure", LLPs → "llps", Static Stretch → "static_stretch", Myo-reps → "myo_reps", Drop Set → "drop_set"

2. **Day IDs:** Infer from day names. "Upper (Strength Focus)" → "upper_strength", "Lower (Strength Focus)" → "lower_strength", "Pull (Hypertrophy Focus)" → "pull_hypertrophy", "Push (Hypertrophy Focus)" → "push_hypertrophy", "Legs (Hypertrophy Focus)" → "legs_hypertrophy"

3. **Block IDs:** "Foundation Block" → "foundation", "Ramping Block" → "ramping". Infer others from headers.

4. **Warm-up sets:** "2-3" → 3, "1-2" → 2, "2-4" → 4. Use the higher value when it's a range.

5. **Rest times:** "3-5 min" → [180, 300], "2-3 min" → [120, 180], "1-2 min" → [60, 120]

6. **RPE:** "~6-7" → earlySetRPE 6, lastSetRPE 7. "~8-9" → 8 and 9. "10" or "Failure" → 10.

7. **Exercise names:** Merge split lines. "45° Incline Barbell" + "Press" → "45° Incline Barbell Press". "Pendlay Deficit" + "Row" → "Pendlay Deficit Row". "Overhead Cable" + "Triceps Extension" + "(Bar)" → "Overhead Cable Triceps Extension (Bar)".

8. **Notes:** Combine all form cues/technique instructions. Truncate if extremely long; keep the most useful cues.

9. **Rest Day:** Skip it. Do not add a day for "Rest Day".

10. **Week structure:** Each block has multiple weeks. Parse all weeks in each block. Week 1 is typically deload (isDeload: true).

**Structure:** The program is organized as Block → Week → Day → Exercise. Each week repeats the same day types (Upper, Lower, Pull, Push, Legs) but exercises and parameters may change between weeks. Parse every distinct exercise row for each week.

Return ONLY the JSON object. No other text.
