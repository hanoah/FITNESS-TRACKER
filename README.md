# Workout App

Personal workout tracker based on Jeff Nippard's Bodybuilding Transformation System. PWA with local-first storage, hand-drawn UI (roughness), and RPE-based logging.

## Stack

- **Vue 3** + **Vite** + **TypeScript**
- **Pinia** — state
- **Vue Router** — navigation
- **Dexie.js** — IndexedDB
- **roughness** — hand-drawn UI components

## Features (Phase 1)

- ✅ Home page with Start/Resume workout (Mon/Tue/Thu/Sat schedule)
- ✅ Workout queue with exercise form cues
- ✅ Log sets: `150 12 9` (weight reps RPE)
- ✅ Plate math for barbell lifts (45 lb default)
- ✅ Progression hints from last week
- ✅ Session persist + resume on interrupt
- ✅ History page
- ✅ Vitest unit tests (parseLogInput, plateCalc)

## Run

```bash
npm install
npm run dev    # http://localhost:5173
npm run build  # dist/
npm run test:run
```

## Schedule

Configured in `src/data/schedule.json`:
- **Monday** — Condensed lower (3 exercises)
- **Tuesday** — Upper strength
- **Thursday** — Pull + Push merged
- **Saturday** — Legs

## Data

- `src/data/nippard.json` — Program (stub; full parse via LLM script later)
- `src/data/schedule.json` — Day mappings + exercise filters
- IndexedDB — Sessions, sets, user profile, program state

## Next (Phase 2+)

- Rest timer overlay (manual, beep)
- ExRx GIF display
- Strength goals (bundled standards)
- Apps Script → Google Sheets sync
- roughViz progression graphs
