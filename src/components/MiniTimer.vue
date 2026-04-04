<script setup lang="ts">
/**
 * Compact rest timer chip when full overlay is minimized.
 * Reads store snapshot for remaining time. Draggable via pointer events.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkoutStore } from '../store/workout'

const workoutStore = useWorkoutStore()

const displaySeconds = ref(0)
const isGo = ref(false)
let rafId = 0

const STORAGE_KEY = 'mini-timer-pos'
const CHIP_W = 120
const CHIP_H = 44

const posX = ref<number | null>(null)
const posY = ref<number | null>(null)
const isDragging = ref(false)
let dragOffsetX = 0
let dragOffsetY = 0

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function loadPosition() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return
    const { x, y } = JSON.parse(saved)
    if (typeof x === 'number' && typeof y === 'number') {
      posX.value = clamp(x, 0, window.innerWidth - CHIP_W)
      posY.value = clamp(y, 0, window.innerHeight - CHIP_H)
    }
  } catch { /* use default */ }
}

function savePosition() {
  if (posX.value == null || posY.value == null) return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ x: posX.value, y: posY.value }))
  } catch { /* storage full or disabled */ }
}

function onPointerDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  isDragging.value = true

  const rect = el.getBoundingClientRect()
  dragOffsetX = e.clientX - rect.left
  dragOffsetY = e.clientY - rect.top
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const x = clamp(e.clientX - dragOffsetX, 0, window.innerWidth - CHIP_W)
  const y = clamp(e.clientY - dragOffsetY, 0, window.innerHeight - CHIP_H)
  posX.value = x
  posY.value = y
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  savePosition()

  const el = e.currentTarget as HTMLElement
  try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
}

function onClick() {
  if (isDragging.value) return
  expand()
}

function handleResize() {
  if (posX.value == null || posY.value == null) return
  posX.value = clamp(posX.value, 0, window.innerWidth - CHIP_W)
  posY.value = clamp(posY.value, 0, window.innerHeight - CHIP_H)
}

const chipStyle = computed(() => {
  if (posX.value == null || posY.value == null) {
    return {
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    }
  }
  return {
    left: `${posX.value}px`,
    top: `${posY.value}px`,
    bottom: 'auto',
    transform: 'none',
  }
})

function tick() {
  if (!workoutStore.restTimerPanel) {
    return
  }
  if (!workoutStore.restTimerMinimized) {
    rafId = requestAnimationFrame(tick)
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
  loadPosition()
  window.addEventListener('resize', handleResize)
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  window.removeEventListener('resize', handleResize)
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
      :class="{ dragging: isDragging }"
      :style="chipStyle"
      :aria-label="isGo ? 'Rest complete — tap to continue' : 'Rest timer — tap to expand'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @click="onClick"
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
  cursor: grab;
  max-width: calc(100vw - 2rem);
  touch-action: none;
  user-select: none;
}
.mini-timer-chip.dragging {
  cursor: grabbing;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  opacity: 0.9;
}
.mini-timer-chip:active:not(.dragging) {
  transform: scale(0.98);
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
