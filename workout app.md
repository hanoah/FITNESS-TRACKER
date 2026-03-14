


i want GOALS to hit. based on my standards. https://strengthlevel.com/strength-standards/male/lb, so we need to find these out by my height and weight. 

i want some different plans too. 

monday morning that are just for moving my body. 
saturdays when i ave time nad patients to do some leg work ous
tues thursday when im keen to work out my upper body and abs.

i want to see graphs (https://github.com/jwilber/roughViz) of my weight lifted for each movement

fun design using roughness
when i log i can either confirm or up date with simple "150 12 9" 150 lbs, 12 reps, 9 rpe
barbell racking calculation (default barbell is 45)
shows the gifs from each of these: https://exrx.net/Lists/Directory
based on jeff nippard's program
form cues
quick sub (based on jeff nippards program) - +sub a custom exercise
weekly progressive overload
i can sync my results to a google sheet (PWA!!!)
i like a metronome timer with a beep. 45 off, 1 minute on. and i can change the tracking. in my headphones there's a beep for me to start lifing again.



>1. Features that map naturally to an app

Exercise sequencing / workout queue — you literally had to ask "what's next" every single time. An app owns the queue and advances automatically.
Weight logging with RPE — you were texting numbers and it was parsing them. A simple input UI (weight + RPE slider) is way cleaner.
Plate math — you asked "how do I rack 165?" That's a dead-simple calculator that an app should surface automatically when you log a barbell lift.
Week 1 → Week 2 progression tracking — the agent had to remember your calibration weights across sessions. An app just stores it.
Rest timers — never mentioned, but implied by the flow. An app auto-starts them.
Workout history / summary tables — the agent regenerated these from memory at the end of each session. An app just renders a persistent log.


2. What the agent does poorly vs. well
Poorly:

No state persistence — it was reconstructing your workout history from context every session. It will eventually hallucinate or lose data. An app has a database.
Inconsistent form cues — you had to explicitly tell it "always give form cues, don't forget ever again." That's a rules enforcement problem. An app just always renders the cue card.
RPE calibration logic is sloppy — it kept saying things like "that's your Week 2+ weight" but wasn't applying a consistent formula. An app can run the actual RPE-to-load math.
No proactive nudging — it never flagged "hey, you skipped Monday" or "it's been 4 days." Push notifications are an app primitive, not a chat primitive.
Confusion between sets — there was a whole back-and-forth about whether you'd done 2 or 3 sets of lat pulldown. An app tracks set completion with a single tap.

Does well:

Flexible substitutions — when you said "row is taken" or "I want dumbbell shoulder press today," it adapted instantly. That's genuinely hard to replicate with rigid app templates.
Coaching tone — the encouragement and real-time feedback ("way too light!") keeps you engaged in a way a static app doesn't.
Handling ambiguity — "2 45 plates" being misread and then corrected naturally is something a chat interface handles better than a form field.


3. What a real human trainer would do better

Watch your form in real time — no amount of text cues replaces someone seeing your hips pop on a leg curl and correcting it immediately.
Adjust mid-set — a trainer can tell you to grind out 2 more reps when you're about to quit. The agent only responds after you report back.
Read fatigue signals — if you were moving slow, grimacing, or compensating with another muscle group, a trainer catches it. You'd have to self-report all of that to the agent.
Program design with context — the agent is running Jeff Nippard's template somewhat mechanically. A real trainer would modulate based on sleep, stress, how you looked that day, and accumulated fatigue over weeks.
Accountability beyond the session — a trainer might text you the morning of, notice you skipped, or ask how you slept. The agent has no ambient presence.
Spotting and safety — obvious, but worth naming. A trainer physically keeps you safe on heavy sets.


The core insight: the agent is great as a flexible, conversational layer but terrible as a state machine. An app should own the state, queue, and logging — and the agent (or LLM layer) should only be invoked for the judgment calls like substitutions, coaching cues, and RPE interpretation.

---

# Architecture / Design Decisions

**Rest timer** — Overlay UI. When rest starts, a dismissible overlay appears on top of the current workout view (not a separate screen). Shows countdown, beeps at end. User can skip or let it run. Workout content stays visible but dimmed behind it.

**Local-first, no external hosting** — All assets are grabbed at build time or first install and stored locally. No runtime fetching from third parties.
- **Strength standards** — Parse Strength Level tables once, bundle as JSON in the app. No calls to strengthlevel.com at runtime.
- **ExRx GIFs** — Download GIFs for every exercise in the program, store in `/public` or bundle. No requests to exrx.net during workouts.
- **Jeff Nippard program** — Already local (.txt). Parse to JSON and bundle.
- **roughViz, roughness** — NPM deps, bundled with the app (not CDN). Offline works.

Build/install script responsibilities: fetch ExRx GIFs, scrape Strength Level, parse Nippard → commit generated assets. App runs fully offline after that.

---

# Installation

## NPM

```
npm i roughness
```

## Using from CDN

You can use roughness directly from a CDN via HTML tags:

```
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/roughness/dist/style.css">

<script type="importmap">
{
  "imports": {
    "roughness": "https://cdn.jsdelivr.net/npm/roughness",
    "vue": "https://cdn.jsdelivr.net/npm/vue"
  }
}
</script>
<script type="module">
import * as roughness from 'roughness'
</script>
```

Pager