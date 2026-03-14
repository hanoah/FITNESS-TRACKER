# QA Report: Workout App

**Date:** 2026-03-14  
**URL:** http://localhost:5174/  
**Tester:** cursor-ide-browser MCP (systematic QA)  
**Duration:** ~15 min  
**Framework:** Vue 3 + Vite SPA

---

## Health Score: **78/100**

| Factor | Score | Notes |
|--------|-------|-------|
| Console | 70 | Dexie warning; `completeWorkout` failure logged (prior session) |
| Links | 100 | No broken links; client-side nav works |
| Visual | 95 | Mobile viewport (375×812) renders; minor polish |
| Functional | 75 | History empty after completion; core flow otherwise works |
| UX | 90 | Clear nav; Download backup, Sync section present |
| Performance | 100 | No noticeable lag |
| Content | 100 | Copy clear |
| Accessibility | 95 | Semantic structure; nav exposed |
| **Weighted** | **78** | Core flows work; History persistence gap |

---

## Top 3 Things to Fix

1. **History not showing completed workout** — After completing a workout (Start → log set → skip → Back → Complete Workout), user is redirected to Home but History shows "No workouts yet." Either `completeWorkout` is failing silently, or History reads from a different source. Settings showed "1 workout(s) pending sync" after Download backup, suggesting data exists somewhere.
2. **Dexie/IndexedDB error handling** — Console shows `[object Object]` from dexie.js during workout completion. Add structured logging and verify `db.sessions.update` succeeds. Ensure `completeWorkout` only returns `true` when the session is persisted.
3. **Sync now disabled without Apps Script URL** — Expected behavior, but consider a clearer empty-state message when no Apps Script URL is configured (e.g. "Add Apps Script URL to sync").

---

## Full Issue List

### Critical

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| 1 | critical | functional | History empty after completing workout |

**Repro:** Start workout → log a set (e.g. `150 10 8`) → skip through remaining exercises → tap "Complete Workout"  
**Expected:** Session saved to IndexedDB; redirect to Home; workout appears in History  
**Observed:** Redirect to Home succeeds; History shows "No workouts yet. Start one from the home page!"  
**Note:** Settings → Download backup showed "1 workout(s) pending sync" after export, suggesting partial persistence or sync queue state.

---

### High

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| 2 | high | console | Dexie warning during IndexedDB operations |

**Observed:** `[object Object]` warning from `dexie.js` line 1246 during workout completion. Possible constraint violation or schema mismatch.

---

### Medium

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| 3 | medium | ux | Sync section: "Sync now" disabled without clear guidance |

**Observed:** "0 workout(s) pending sync" (or "1" after completion) with Sync now disabled. No inline hint that Apps Script URL is required for sync. Users may not know how to enable sync.

---

### Low

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| 4 | low | ux | Import backup not verifiable via automation |

**Notes:** Import backup opens a file picker; automation cannot select a file. Export/Download backup was verified (button triggers download, shows "Exporting…" state).

---

## Test Coverage Summary

| Flow | Status | Notes |
|------|--------|-------|
| Navigate to app | Pass | Loads; no blocking errors |
| Home → History | Pass | Nav works |
| Home → Settings | Pass | Nav works |
| Start Workout | Pass | Leg Press loads; queue visible |
| Log set (150 10 8) | Pass | Plate math shows; set logged; advances to Set 2 |
| Skip exercise | Pass | Moves to next exercise |
| Back button | Pass | Returns to previous exercise |
| Complete Workout | Partial | Redirects to Home; History empty |
| History shows session | **Fail** | "No workouts yet" after completion |
| Download backup | Pass | Triggers export; "Exporting…" state; completes |
| Sync section | Pass | Shows pending count; Sync now disabled when no URL |
| Mobile viewport (375×812) | Pass | Layout renders; elements accessible |

---

## Console Messages (Summary)

- `[CursorBrowser] Native dialog overrides installed` — Benign (MCP)
- `[vite] connecting...` / `[vite] connected.` — Normal dev
- `[object Object]` (dexie.js) — Warning during completion flow
- `[workout.completeWorkout] Failed to complete session [object Object] [object Object]` — Error (observed in prior run; current run navigated on Complete)

---

## Mobile Viewport (375×812)

- Home: Nav (Home, Workout, History, Settings), "Today is Saturday", "Block: foundation · Week 1", Start Workout visible
- Layout responsive; no overflow observed in snapshot

---

## Recommendations

1. Add integration test for `completeWorkout` → History assertion.
2. ~~Improve Dexie error logging~~ — Done in workout store.
3. ~~Add empty-state copy for Sync when Apps Script URL is missing~~ — Done.

---

## Post-QA Fixes Applied (2026-03-14)

1. **DataCloneError fix** — `enqueueSync` was passing Vue reactive Proxies to IndexedDB; now serializes with `JSON.parse(JSON.stringify({ session, sets }))` before adding to sync queue.
2. **Sync empty state** — Added hint "Add an Apps Script URL above and save to enable sync" when URL is blank.
