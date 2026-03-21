<script setup lang="ts">
/**
 * Rest timer overlay: countdown -> GO interstitial -> user confirms "Start next set".
 *
 * State machine:
 *   counting --(remaining<=0)--> go --(confirm/skip)--> emit done|skip
 *
 * Audio: single AudioContext created on mount (user-gesture chain from Log set) so
 * mobile Safari can play the triple beep. Beep is best-effort; GO always shows.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RButton, RText } from 'roughness'
import { useWorkoutStore } from '../store/workout'
import { emitDebugEvent } from '../lib/debugEvents'

const props = withDefaults(
  defineProps<{
    seconds: number
    sessionId?: number
    nextExerciseHint?: string
    progressPercent?: number
    setLabel?: string
  }>(),
  { sessionId: 0, nextExerciseHint: '', progressPercent: 0, setLabel: '' }
)

const emit = defineEmits<{
  done: []
  skip: []
}>()

const workoutStore = useWorkoutStore()
const displaySeconds = ref(props.seconds)
const isPaused = ref(false)
/** 'counting' = rest countdown; 'go' = interstitial after timer hits zero */
const timerPhase = ref<'counting' | 'go'>('counting')
let rafId = 0
let endTime = 0

/** Reused for triple beep; created once on mount (within user-gesture chain). */
let audioCtx: AudioContext | null = null

const timerProgressPercent = computed(() => {
  const total = props.seconds
  if (total <= 0) return 0
  return (displaySeconds.value / total) * 100
})

function vibrateRestComplete(): void {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 200])
  } catch {
    /* ignore */
  }
}

/** Triple 880Hz sine tones, 0.15s each, spaced 0.3s apart. Fire-and-forget. */
function playBeep(): void {
  if (!audioCtx) return
  try {
    const t0 = audioCtx.currentTime
    const toneDuration = 0.15
    const gap = 0.3
    for (let i = 0; i < 3; i++) {
      const startAt = t0 + i * gap
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.5, startAt)
      gain.gain.exponentialRampToValueAtTime(0.01, startAt + toneDuration)
      osc.start(startAt)
      osc.stop(startAt + toneDuration)
    }
  } catch {
    /* best-effort audio */
  }
}

function tick() {
  if (isPaused.value) return
  const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
  displaySeconds.value = remaining
  if (remaining <= 0) {
    playBeep()
    vibrateRestComplete()
    timerPhase.value = 'go'
    emitDebugEvent({ eventName: 'timer_completed', status: 'success', meta: { audio: !!audioCtx } })
    return
  }
  persistSnapshot()
  rafId = requestAnimationFrame(tick)
}

function persistSnapshot() {
  if (props.sessionId && !isPaused.value) {
    workoutStore.setRestTimerSnapshot({
      sessionId: props.sessionId,
      endTime,
      pausedRemaining: null,
      initialSeconds: props.seconds,
    })
  } else if (props.sessionId && isPaused.value) {
    workoutStore.setRestTimerSnapshot({
      sessionId: props.sessionId,
      endTime: 0,
      pausedRemaining: displaySeconds.value,
      initialSeconds: props.seconds,
    })
  }
}

function start(initialSeconds?: number) {
  if (rafId) cancelAnimationFrame(rafId)
  timerPhase.value = 'counting'
  const secs = initialSeconds ?? displaySeconds.value
  emitDebugEvent({ eventName: 'timer_started', meta: { seconds: secs } })
  endTime = Date.now() + secs * 1000
  displaySeconds.value = secs
  isPaused.value = false
  rafId = requestAnimationFrame(tick)
}

function stop() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  workoutStore.clearRestTimerSnapshot()
}

function handlePause() {
  if (isPaused.value) return
  emitDebugEvent({ eventName: 'timer_paused', meta: { remaining: displaySeconds.value } })
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  isPaused.value = true
  persistSnapshot()
}

function handleResume() {
  if (!isPaused.value) return
  emitDebugEvent({ eventName: 'timer_resumed', meta: { remaining: displaySeconds.value } })
  isPaused.value = false
  endTime = Date.now() + displaySeconds.value * 1000
  rafId = requestAnimationFrame(tick)
}

function adjustSeconds(delta: number) {
  emitDebugEvent({ eventName: 'timer_adjusted', meta: { delta } })
  if (isPaused.value) {
    displaySeconds.value = Math.max(0, Math.min(999, displaySeconds.value + delta))
    persistSnapshot()
  } else {
    if (rafId) cancelAnimationFrame(rafId)
    const newRemaining = Math.max(0, Math.min(999, displaySeconds.value + delta))
    displaySeconds.value = newRemaining
    endTime = Date.now() + newRemaining * 1000
    rafId = requestAnimationFrame(tick)
  }
}

function tryRestore() {
  const snap = workoutStore.restTimerSnapshot
  if (!snap || snap.sessionId !== props.sessionId) return false
  const maxAge = 5 * 60 * 1000
  if (snap.pausedRemaining != null) {
    displaySeconds.value = snap.pausedRemaining
    isPaused.value = true
    timerPhase.value = 'counting'
    emitDebugEvent({ eventName: 'timer_restored', meta: { paused: true, remaining: snap.pausedRemaining } })
    persistSnapshot()
    return true
  }
  const remaining = Math.ceil((snap.endTime - Date.now()) / 1000)
  if (remaining <= 0 || Date.now() - snap.endTime > maxAge) return false
  displaySeconds.value = remaining
  endTime = snap.endTime
  timerPhase.value = 'counting'
  emitDebugEvent({ eventName: 'timer_restored', meta: { paused: false, remaining } })
  rafId = requestAnimationFrame(tick)
  return true
}

function initAudioContext(): void {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audioCtx = new Ctx()
    void audioCtx.resume()
  } catch {
    audioCtx = null
  }
}

onMounted(() => {
  initAudioContext()
  if (props.seconds <= 0) return
  const restored = tryRestore()
  if (!restored) {
    displaySeconds.value = props.seconds
    start(props.seconds)
  }
})

onUnmounted(stop)

watch(
  () => props.seconds,
  () => {
    if (rafId || isPaused.value) return
    if (props.seconds > 0) start(props.seconds)
  }
)

function handleGoConfirm() {
  stop()
  emit('done')
}

function handleSkip() {
  emitDebugEvent({ eventName: 'timer_skipped' })
  stop()
  emit('skip')
}
</script>

<template>
  <Teleport to="body">
    <div class="rest-overlay" role="dialog" aria-modal="true" aria-label="Rest timer" @click.self="handleSkip">
      <div class="rest-modal">
        <template v-if="timerPhase === 'go'">
          <div class="go-screen">
            <div class="go-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="28" height="28">
                <path
                  d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 3.5-1.6 4.9-2.5 6-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5-2.5 1.5-5.5 1.5-7.5 0-2-1.6-3.5-4-4-6.5 2.224 1.946 2.072 3.857 2 6-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5C2 11 4.5 13 8 16z"
                />
              </svg>
            </div>
            <RText tag="p" class="go-text">GO</RText>
            <RText v-if="setLabel" tag="p" class="set-label">{{ setLabel }}</RText>
            <RText v-if="nextExerciseHint" tag="p" class="next-hint">{{ nextExerciseHint }}</RText>
            <div class="timer-controls go-controls">
              <RButton type="primary" @click="handleGoConfirm">Start next set</RButton>
            </div>
          </div>
        </template>
        <template v-else>
          <RText tag="h3">Rest</RText>
          <RText v-if="nextExerciseHint" tag="p" class="next-hint">{{ nextExerciseHint }}</RText>
          <RText v-if="setLabel" tag="p" class="set-label">{{ setLabel }}</RText>
          <div v-if="progressPercent > 0" class="workout-progress-wrap">
            <div class="progress-ring">
              <div class="workout-progress-bar" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <RText tag="span" class="workout-percent">{{ Math.round(progressPercent) }}% complete</RText>
          </div>
          <div class="progress-ring">
            <div class="progress-bar" :style="{ width: timerProgressPercent + '%' }"></div>
          </div>
          <RText tag="p" class="countdown" aria-live="polite" aria-atomic="true">{{ displaySeconds }}</RText>
          <RText tag="p" class="hint">seconds</RText>
          <div class="quick-actions">
            <RButton variant="secondary" class="adj-btn" @click="adjustSeconds(-30)">−30s</RButton>
            <RButton variant="secondary" class="adj-btn" @click="adjustSeconds(15)">+15s</RButton>
          </div>
          <div class="timer-controls">
            <RButton
              v-if="!isPaused"
              variant="secondary"
              @click="handlePause"
            >
              Pause
            </RButton>
            <RButton
              v-else
              variant="secondary"
              @click="handleResume"
            >
              Resume
            </RButton>
            <RButton type="primary" @click="handleSkip">Skip</RButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rest-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-family: var(--r-common-font-family), inherit;
}
.rest-modal {
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-radius: 12px;
  padding: var(--space-2xl);
  text-align: center;
  min-width: 260px;
  font-family: inherit;
}
.rest-modal h3 {
  margin: 0 0 var(--space-md) 0;
  font-size: 1.25rem;
}
.next-hint {
  margin: 0 0 var(--space-sm) 0;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
}
.set-label {
  margin: 0 0 var(--space-sm) 0;
  font-size: 0.9rem;
  font-weight: 600;
}
.go-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
}
.go-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--r-color-warning, #d97706) 18%, transparent);
  color: var(--r-color-warning, #b45309);
}
.go-text {
  margin: 0;
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--r-color-primary);
}
.go-controls {
  margin-top: var(--space-sm);
  width: 100%;
}
.go-controls :deep(button) {
  width: 100%;
}
.workout-progress-wrap {
  margin-bottom: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.workout-progress-wrap .progress-ring {
  background: var(--r-color-fill-secondary);
}
.workout-progress-bar {
  height: 100%;
  background: var(--r-color-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.workout-percent {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
}
.progress-ring {
  width: 100%;
  height: 4px;
  background: var(--r-color-fill-secondary);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: var(--space-md);
}
.progress-bar {
  height: 100%;
  background: var(--r-color-primary);
  border-radius: 2px;
  transition: width 1s linear;
}
.countdown {
  font-size: 3rem;
  font-weight: 700;
  margin: var(--space-sm) 0;
  color: var(--r-color-primary);
}
.hint {
  margin: 0 0 var(--space-md) 0;
  color: var(--r-color-text-secondary);
}
.quick-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  margin-bottom: var(--space-md);
}
.adj-btn {
  min-width: 4rem;
}
.timer-controls {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  flex-wrap: wrap;
}
</style>
