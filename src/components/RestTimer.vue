<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RButton, RText } from 'roughness'

const props = defineProps<{
  seconds: number
}>()

const emit = defineEmits<{
  done: []
  skip: []
}>()

const displaySeconds = ref(props.seconds)
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
    <div class="rest-overlay" @click.self="handleSkip">
      <div class="rest-modal">
        <RText tag="h3">Rest</RText>
        <RText tag="p" class="countdown">{{ displaySeconds }}</RText>
        <RText tag="p" class="hint">seconds</RText>
        <RButton @click="handleSkip">Skip</RButton>
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
  background: var(--r-color-bg, #fff);
  border: 2px solid var(--r-color-stroke, #333);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  min-width: 200px;
}
.rest-modal h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
}
.countdown {
  font-size: 3rem;
  font-weight: 700;
  margin: 0.5rem 0;
}
.hint {
  margin: 0 0 1rem 0;
  color: var(--r-color-text-secondary, #666);
}
</style>
