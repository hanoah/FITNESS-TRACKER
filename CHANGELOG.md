# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
