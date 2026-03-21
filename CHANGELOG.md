# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.6] - 2026-03-18

### Added

**Bundle A — Timer & Rest Modal (WO-002, WO-003, WO-005)**
- Beep sound (triple 880 Hz sine tones) and haptic vibration when rest timer ends
- "GO" interstitial screen with flame icon and "Start next set" button after countdown
- "Set X of Y" label displayed on rest timer and GO screen
- Rest timer unit tests (5 tests covering countdown, GO screen, skip, pause/resume)

**Bundle B — Progression & Quick Log Logic (WO-001)**
- Body-part-aware progression increments: 2.5 lb base for arm exercises, 5 lb for legs, fallback to weight-tier logic when bodyPart is unknown

**Bundle C — Exercise Card Features (WO-007, WO-010, WO-011)**
- Exercise history modal: tap exercise name to view last 50 logged sets with date, weight, reps, and RPE
- Manual warm-up toggle: override auto warm-up detection per exercise, persists across sets until exercise changes
- Strength level label on goal display (e.g. "Goal: 135 lb / Intermediate")
- logSet warm-up override parameter for explicit warm-up/working-set control

### Changed

- Rest timer debug event now includes `audio` context availability in metadata
- Removed manual log re-fill after set logging (reactive prefill watcher handles it cleanly)

## [0.1.5] - 2026-03-18

### Added

- ExerciseDB catalog integration: exercises now cross-reference with ExerciseDB for demo images, body part, and equipment metadata
- Exercise image caching with IndexedDB (blob cache) and CORS-safe direct URL fallback
- Enrichment pipeline: program, library, and resumed session exercises inherit ExerciseDB image data
- Explicit "Include 45 lb bar" toggle on plate calculator
- Weight rounding: all suggested/target weights round up to nearest 2.5 lb (no more 121.25 or 96.25)
- Goal hint: "Set weight in Settings" when user profile is missing weight
- Collapsible sections: Demo, Workout Flow, Plate Calculator, and Logged Sets collapse by default to keep log input above the fold

### Changed

- Distilled WorkoutPage layout: log input is now the first card (no scrolling to log a set)
- Stats grid replaced with inline text: Target is the hero element, Last and Goal are compact secondary lines
- Done state simplified: single primary CTA with secondary actions as text links
- RPE pills now disabled when input is empty (consistent with weight/reps pills)
- Overflow menu z-index fixed to render above sibling cards
- Success color palette: warm olive green (#4a7a3d) replaces cold emerald for better harmony with earthy theme

### Removed

- "One line only" badge from Quick Log card
- "Quick log" heading and "Log set as: weight reps RPE" hint (redundant with placeholder)
- Duplicate progression banner (was shown in stats grid AND below RPE pills)

## [0.1.4] - 2026-03-17

### Added

- Set editing: edit logged set values mid-workout and from History (completed sessions only)
- Audit metadata on set edits (editedAt, prevWeight/Reps/Rpe)
- Quick-log clear-X button to clear prefilled input
- Rest timer: pause/resume, −30s/+15s quick actions, background restore, "Rest complete!" fallback when audio is blocked
- Rest timer "next exercise" hint (e.g. "Next: Set 2 of Face Pull")
- Plate reverse input: enter plates per side (e.g. "2 45 1 25") to compute total weight
- Substitution filtering by relevant muscle groups (e.g. no leg subs for pull-ups)
- Cached exercise index for faster add/substitute search
- Add-exercise set count prompt
- RPE-aware progression: larger increments for easy sets (RPE ≤6), smaller for hard (RPE ≥9)
- Goal ETA projection: "At +2.5 lb per session, about 8 weeks to reach 135 lb"
- Debug event stream with Settings export for troubleshooting
- Navigation labels: "Skip"/"Back" → "Next"/"Previous"

### Changed

- Goal badge styling and prominence
- logInput wrapped with clear-X affordance

### Fixed

- Rest timer "Next: Set X" hint now uses overall set numbering (matches main UI when warmup sets exist)
- Mansalva font now applies consistently to teleported overlays and tab bar

## [0.1.3] - 2026-03-16

### Added

- "Monday Upper Feel Good" built-in template: 5-exercise, ~25 min upper body session based on Jeff Nippard's Bodybuilding Transformation System
- Built-in template seeding on app mount (idempotent — skips if already exists)

## [0.1.2] - 2026-03-14

### Added

- "By Exercise" muscle group dropdown filter (replaces collapsible region/muscle hierarchy)
- Inline muscle badge on each exercise row in history
- Keyword-based muscle inference for custom exercise names not in the library
- `muscleGroups.ts` utility: maps exercises → muscles → body regions
- Delight copy: randomized workout-complete messages
- Button press micro-interaction (subtle translateY on tap)
- "Nice work." subtext on workout completion card

### Changed

- UX copy overhaul: friendlier error toasts, clearer hints, better empty states across all views
- Settings: "Key lift goals" → "Strength goals"; improved backup/sync hints
- Parse input errors now include examples and RPE explanation
- WorkoutPage: clearer plate math label, RPE hint in log prompt

## [0.1.1] - 2025-03-14

### Added

- Template picker: browse Jeff Nippard program (blocks → weeks → days) and custom templates
- "From Template" flow on Home page to start a workout from a chosen day
- "Save as Template" in WorkoutPage overflow menu
- Exercise library with muscle groups and substitutions
- `getExercisesForBlockWeekDay` for legacy session resume fallback

### Fixed

- DataCloneError when starting workout from template (serialize exercises before IndexedDB write)
- `resumeSession` now falls back to program when session has blockId/weekNumber but no exercises

### Changed

- Repo cleanup: remove junk files, update .gitignore
- Sync empty state copy when Apps Script URL missing
