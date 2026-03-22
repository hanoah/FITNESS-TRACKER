# Workout App

Personal workout tracker based on Jeff Nippard's Bodybuilding Transformation System. PWA with local-first storage, hand-drawn UI (roughness), and RPE-based logging.

## Tech Stack

- **Vue 3** + **Vite** + **TypeScript**
- **Pinia** — state management
- **Vue Router** — navigation
- **Dexie.js** — IndexedDB (local-first storage)
- **roughness** — hand-drawn UI components
- **rough-viz** — progression charts

## Features

- Workout picker with recommended schedule (Mon/Tue/Thu/Sat)
- Exercise queue with form cues and progression suggestions
- Log sets: `150 12 9` (weight reps RPE)
- Plate math for barbell lifts (45 lb default)
- Rest timer overlay with beep, pause/resume, minimize to floating chip
- Real-time PR tracking with toast notifications and flow sidebar markers
- Dynamic add/remove sets mid-workout
- Session persist and resume on interrupt
- History page (by workout and by exercise)
- Backup and restore (JSON export/import)
- Sync to Google Sheets via Apps Script
- Strength standards and goals by body weight

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/
npm run test:run
```

## Deploy

Build outputs to `dist/`. Deploy the `dist/` folder to any static host (Vercel, Netlify, GitHub Pages). The app runs fully offline after install (PWA).

## Project Structure

- `src/data/` — program (nippard.json), schedule, strength standards
- `src/lib/` — db, sync, backup, progression, plate calc
- `src/store/` — workout and program state
- `src/views/` — Home, Workout, History, Settings
