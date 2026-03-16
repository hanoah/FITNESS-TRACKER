# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
