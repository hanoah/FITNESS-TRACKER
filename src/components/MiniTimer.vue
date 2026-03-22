<script setup lang="ts">
/**
 * Compact rest timer chip when full overlay is minimized. Reads store snapshot for remaining time.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkoutStore } from '../store/workout'

const workoutStore = useWorkoutStore()

const displaySeconds = ref(0)
const isGo = ref(false)
let rafId = 0

function tick() {
  if (!workoutStore.restTimerPanel) {
    return
  }
  const snap = workoutStore.restTimerSnapshot
  if (!snap) {
    displaySeconds.value = 0
    isGo.value = false
    rafId = requestAnimationFrame(tick)
    return
  }
  if (snap.pausedRemaining != null) {
    displaySeconds.value = snap.pausedRemaining
    isGo.value = false
    rafId = requestAnimationFrame(tick)
    return
  }
  const remaining = Math.max(0, Math.ceil((snap.endTime - Date.now()) / 1000))
  displaySeconds.value = remaining
  isGo.value = remaining <= 0
  rafId = requestAnimationFrame(tick)
}

function expand() {
  workoutStore.expandRestTimer()
}

onMounted(() => {
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
})

const label = computed(() => {
  if (isGo.value) return 'GO!'
  return `${displaySeconds.value}s`
})
</script>

<template>
  <Teleport to="body">
    <button
      v-show="workoutStore.restTimerMinimized"
      type="button"
      class="mini-timer-chip"
      :aria-label="isGo ? 'Rest complete — tap to continue' : 'Rest timer — tap to expand'"
      @click="expand"
    >
      <span class="mini-timer-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
      <span class="mini-timer-text">{{ label }}</span>
    </button>
  </Teleport>
</template>

<style scoped>
.mini-timer-chip {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 999px;
  border: 2px solid var(--r-color-stroke);
  background: var(--r-color-bg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--r-color-primary);
  cursor: pointer;
  max-width: calc(100vw - 2rem);
}
.mini-timer-chip:active {
  transform: translateX(-50%) scale(0.98);
}
.mini-timer-icon {
  display: flex;
  flex-shrink: 0;
  opacity: 0.85;
}
.mini-timer-text {
  white-space: nowrap;
}
</style>
