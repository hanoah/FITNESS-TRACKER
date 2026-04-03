# TODOS

Deferred work tracked for future sprints.

---

## Extract WorkoutPage cards into child components

**What:** Split WorkoutPage.vue into InfoCard, DemoCard, QuickLogCard, and WorkoutFlowCard components.

**Why:** WorkoutPage is 1100+ lines and growing. Card boundaries are now well-defined after the Bundle D restructure.

**Pros:** Each card becomes independently testable, readable, maintainable.

**Cons:** Prop-drilling for shared reactive state, ~4 new files, event bubbling.

**Context:** Deferred from Bundle D per plan review. Revisit after Bundle D ships if the file feels unwieldy.

**Effort:** M

**Priority:** P3

**Depends on:** Bundle D completion

---

## Add delete-button debounce guard to logged set rows

**What:** Add a `deleting` ref per set row that disables the delete button during the async deleteSetLog call, same pattern as `setAdjusting` for +/- buttons.

**Why:** Without it, rapid double-taps could fire two delete calls. Dexie handles this safely (silent no-op), but the UX would flicker.

**Pros:** Prevents confusing double-action, consistent with existing +/- button pattern.

**Cons:** ~5 lines of code, trivial.

**Context:** Same pattern as `setAdjusting` ref in WorkoutPage.vue:465.

**Effort:** S

**Priority:** P3

**Depends on:** Sprint 2 deleteSetLog store action

---

## Add swipe-to-delete gesture on logged set rows

**What:** Replace or supplement the delete icon button with a native-feeling swipe-to-delete gesture on each logged set row.

**Why:** iOS users expect swipe-to-delete as the primary delete interaction. The icon button works but feels less polished.

**Pros:** More native-feeling interaction, consistent with iOS patterns.

**Cons:** Requires a touch gesture library (vue-swipe-actions or custom pan handler), adds ~50 lines, needs mobile testing.

**Context:** Sprint 2 ships with icon button first. Swipe can be layered on after.

**Effort:** M

**Priority:** P3

**Depends on:** Sprint 2 ExerciseSetsGroup component

---

## Create DESIGN.md via /design-consultation

**What:** Run /design-consultation to create a DESIGN.md capturing the stone/white design system, spacing scale, color tokens, typography, border radii, and interaction patterns.

**Why:** Every new component risks visual drift without a single source of truth. The stone palette, RCard patterns, and CSS variable naming are all implicit knowledge right now.

**Pros:** Future components (and AI-assisted code) align automatically. Reviews against a spec instead of vibes.

**Cons:** ~15 min with CC. One-time setup.

**Context:** This project has been shipping UI without a formal design system. The patterns are consistent but undocumented. Flagged during Sprint 2 design review.

**Effort:** S

**Priority:** P2

**Depends on:** Nothing

---

## Fix isBarbell heuristic to use equipment metadata

**What:** Replace the name-matching `isBarbell` computed in WorkoutPage.vue with an equipment field on exercise metadata.

**Why:** The current heuristic checks for "barbell", "squat", "deadlift", "press", "bench" in the exercise name. This matches "Dumbbell Shoulder Press" because it contains "press", causing plate math to show for non-barbell exercises. Now that plate math has a full interactive UI, the gating logic matters more.

**Pros:** Correct gating for plate math, extensible for other equipment-specific features (e.g. cable stack weight selection).

**Cons:** Requires adding an `equipment` field to the exercise data model and backfilling existing exercises. ExerciseDB API already provides equipment metadata, so the data is available.

**Context:** WorkoutPage.vue:241-252. Flagged during Sprint 5 (Plate Math Redesign) eng review. The `isBarbell` computed is used by the "Plate math" trigger button in the log card.

**Effort:** M

**Priority:** P3

**Depends on:** Nothing (can be done independently)
