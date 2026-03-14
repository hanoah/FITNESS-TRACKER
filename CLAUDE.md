# Workout App — Project Context

## Design Context

### Users
Noah, solo user. Opens the app mid-set at the gym, phone in one hand, possibly sweaty. Needs to log weight/reps/RPE, see what's next, and get back to lifting. No onboarding, no accounts, no social features. One person, one program, one device.

### Brand Personality
**Chill, organic, hand-drawn.** This is a personal tool that feels like a well-worn notebook, not a product. The roughness library and Mansalva font set the tone — imperfect lines, sketchy borders, casual energy. It should feel like something you made for yourself, not something a company shipped.

### Anti-references
- Corporate fitness apps (MyFitnessPal, Fitbod) — too polished, too many features, too many upsells
- No badges, streaks, gamification, or social feeds
- No heavy animations or transitions that slow you down mid-set

### Emotional Goal
**Focus.** When opened at the gym, the app should feel distraction-free. Just the data: current exercise, what to lift, how many reps, log it, move on. No noise. The hand-drawn aesthetic keeps it warm without being busy.

### Aesthetic Direction
- **Theme:** Light mode, monochrome base (black strokes on white)
- **Accent:** Warm tones (amber/rust/orange) for interactive elements, progress indicators, and emphasis — keeps the organic feel without going cold or corporate
- **Typography:** Mansalva (cursive/hand-drawn) for headings and display text. System sans-serif as fallback for dense data (set logs, plate math) where legibility matters
- **Roughness:** Embrace the sketchy look — imperfect borders, wobbly lines. Don't fight the library's character
- **Charts:** rough-viz stays — the hand-drawn bar charts match the personality

### Design Principles

1. **One-hand, one-glance.** Every screen must work with a single thumb on a sweaty phone. Large touch targets (min 44px), clear hierarchy, no precision taps. If you have to think about where to tap, it's wrong.

2. **Show the next thing.** The app's job is to keep the workout moving. Current exercise, suggested weight, input field, log button. Everything else is secondary. Don't make the user hunt.

3. **Notebook, not dashboard.** The hand-drawn aesthetic is the identity. Lean into roughness — sketchy cards, wobbly borders, casual typography. Polish means legibility and speed, not pixel-perfection.

4. **Quiet until needed.** Rest timer overlays, progression hints, plate math — these appear contextually and get out of the way. No persistent badges, notifications, or chrome competing for attention.

5. **Data is sacred, UI is disposable.** IndexedDB + backup/export means the data survives anything. The interface can evolve freely because the state layer is independent and robust.
