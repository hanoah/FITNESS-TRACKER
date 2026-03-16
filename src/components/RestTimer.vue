<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RButton, RText } from 'roughness'

const props = defineProps<{
  seconds: number
}>()

const emit = defineEmits<{
  done: []
  skip: []
}>()

const displaySeconds = ref(props.seconds)
const progressPercent = computed(() => {
  if (props.seconds <= 0) return 0
  return (displaySeconds.value / props.seconds) * 100
})
let rafId = 0
let endTime = 0

function tick() {
  const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
  displaySeconds.value = remaining
  if (remaining <= 0) {
    beep()
    emit('done')
    return
  }
  rafId = requestAnimationFrame(tick)
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    // Autoplay may be blocked
  }
}

function start() {
  if (rafId) cancelAnimationFrame(rafId)
  endTime = Date.now() + props.seconds * 1000
  displaySeconds.value = props.seconds
  rafId = requestAnimationFrame(tick)
}

function stop() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

onMounted(() => {
  if (props.seconds > 0) start()
})

onUnmounted(stop)

function handleSkip() {
  stop()
  emit('skip')
}
</script>

<template>
  <Teleport to="body">
    <div class="rest-overlay" role="dialog" aria-modal="true" aria-label="Rest timer" @click.self="handleSkip">
      <div class="rest-modal">
        <RText tag="h3">Rest</RText>
        <div class="progress-ring">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <RText tag="p" class="countdown" aria-live="polite" aria-atomic="true">{{ displaySeconds }}</RText>
        <RText tag="p" class="hint">seconds</RText>
        <RButton type="primary" @click="handleSkip">Skip</RButton>
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
}
.rest-modal {
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-radius: 12px;
  padding: var(--space-2xl);
  text-align: center;
  min-width: 220px;
}
.rest-modal h3 {
  margin: 0 0 var(--space-md) 0;
  font-size: 1.25rem;
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
  margin: 0 0 var(--space-lg) 0;
  color: var(--r-color-text-secondary);
}
</style>
