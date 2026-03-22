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
