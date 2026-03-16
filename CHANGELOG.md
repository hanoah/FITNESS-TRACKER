# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
