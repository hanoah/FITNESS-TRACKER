<script setup lang="ts">
/**
 * Plate calculator modal: tap plates to build weight, or type a target to auto-decompose.
 *
 *   initialWeight prop
 *        │
 *        ▼
 *   plateCalc(weight, barWeight)  ←──  type target in input
 *        │                               │
 *        ▼                               ▼
 *   plateHistory[] ──────────────── totalWeight
 *        │
 *        ├── tap plate → push to history
 *        ├── undo → pop from history
 *        └── clear → empty history
 *
 *   emit('use', totalWeight) ──→ WorkoutPage writes to logInput
 */
import { ref, computed, onMounted } from 'vue'
import { plateCalc } from '../lib/plateCalc'

const PLATES = [45, 35, 25, 10, 5, 2.5]
const BAR_WEIGHTS = [45, 35, 15, 0]

const props = defineProps<{
  initialWeight?: number
}>()

const emit = defineEmits<{
  use: [weight: number]
  close: []
}>()

const plateHistory = ref<number[]>([])
const barWeightIndex = ref(0)
const inputValue = ref('45')

const currentBarWeight = computed(() => BAR_WEIGHTS[barWeightIndex.value])

const plateCounts = computed(() => {
  const counts: Record<number, number> = {}
  PLATES.forEach(p => counts[p] = 0)
  plateHistory.value.forEach(p => { counts[p] += 1 })
  return counts
})

const totalWeight = computed(() => {
  const fromPlates = plateHistory.value.reduce((sum, p) => sum + p, 0)
  return currentBarWeight.value + fromPlates * 2
})

onMounted(() => {
  const init = props.initialWeight
  if (init != null && init > 0) {
    inputValue.value = String(init)
    const idx = BAR_WEIGHTS.indexOf(45)
    barWeightIndex.value = idx >= 0 ? idx : 0
    decomposePlates(init, BAR_WEIGHTS[barWeightIndex.value])
  } else {
    inputValue.value = String(currentBarWeight.value)
  }
})

function decomposePlates(target: number, bar: number) {
  try {
    const config = plateCalc(target, bar)
    const history: number[] = []
    for (const { weight, count } of config.perSide) {
      for (let i = 0; i < count; i++) history.push(weight)
    }
    plateHistory.value = history
  } catch {
    plateHistory.value = []
  }
}

function handleInputChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  inputValue.value = val
  if (val === '') {
    plateHistory.value = []
    return
  }
  const numVal = parseFloat(val)
  if (!isNaN(numVal) && numVal >= 0) {
    decomposePlates(numVal, currentBarWeight.value)
  }
}

function handleInputBlur() {
  inputValue.value = String(totalWeight.value)
}

function addPlate(weight: number) {
  plateHistory.value = [...plateHistory.value, weight]
  inputValue.value = String(totalWeight.value)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(15)
  }
}

function undoLastPlate() {
  if (plateHistory.value.length === 0) return
  plateHistory.value = plateHistory.value.slice(0, -1)
  inputValue.value = String(totalWeight.value)
}

function clearAll() {
  plateHistory.value = []
  inputValue.value = String(currentBarWeight.value)
}

function cycleBarWeight() {
  const nextIndex = (barWeightIndex.value + 1) % BAR_WEIGHTS.length
  const nextBarWeight = BAR_WEIGHTS[nextIndex]
  barWeightIndex.value = nextIndex

  const currentTarget = parseFloat(inputValue.value) || 0
  decomposePlates(currentTarget, nextBarWeight)
  inputValue.value = String(
    nextBarWeight + plateHistory.value.reduce((s, p) => s + p, 0) * 2
  )
}

function handleUse() {
  emit('use', totalWeight.value)
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="plate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Plate calculator"
      @click.self="handleClose"
    >
      <div class="plate-modal">
        <div class="plate-header">
          <h3 class="plate-title">Plate Math</h3>
          <button type="button" class="plate-close-btn" @click="handleClose">Close</button>
        </div>

        <div class="plate-top-row">
          <div class="plate-input-wrap" :class="{ 'has-value': parseFloat(inputValue || '0') > 0 }">
            <input
              type="number"
              :value="inputValue"
              @input="handleInputChange"
              @blur="handleInputBlur"
              placeholder="0"
              inputmode="decimal"
              class="plate-weight-input"
            />
            <span class="plate-input-unit">lb</span>
          </div>

          <div class="plate-actions-col">
            <button
              type="button"
              class="plate-action-btn"
              :disabled="plateHistory.length === 0"
              @click="undoLastPlate"
              aria-label="Undo last plate"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button
              type="button"
              class="plate-action-btn plate-clear-btn"
              :disabled="plateHistory.length === 0"
              @click="clearAll"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="plate-buttons-row">
          <div
            v-for="weight in PLATES"
            :key="weight"
            class="plate-btn-wrap"
          >
            <div
              v-for="i in Math.max(0, plateCounts[weight] - 1)"
              :key="`ring-${i}`"
              class="plate-ring"
              :style="{ transform: `translate(-${i * 3}px, -${i * 3}px)` }"
            />
            <button
              type="button"
              class="plate-btn"
              :class="{ active: plateCounts[weight] > 0 }"
              @click="addPlate(weight)"
            >
              <span v-if="plateCounts[weight] > 1" class="plate-count">{{ plateCounts[weight] }}x</span>
              <span class="plate-weight-label">{{ weight }}</span>
            </button>
          </div>
        </div>

        <p class="plate-hint">each side</p>

        <button
          type="button"
          class="bar-weight-btn"
          :class="{ 'has-bar': currentBarWeight > 0 }"
          @click="cycleBarWeight"
        >
          {{ currentBarWeight === 0 ? 'NO BAR' : `BAR (${currentBarWeight})` }}
        </button>

        <button
          type="button"
          class="plate-use-btn"
          :disabled="totalWeight <= 0"
          @click="handleUse"
        >
          Use {{ totalWeight }} lb
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.plate-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-md);
  background: rgba(0, 0, 0, 0.45);
}

@media (min-width: 640px) {
  .plate-overlay {
    align-items: center;
  }
}

.plate-modal {
  width: 100%;
  max-width: 28rem;
  border-radius: 28px;
  background: var(--r-color-bg);
  box-shadow: 0 12px 40px rgba(45, 42, 38, 0.2);
  padding: var(--space-xl);
  touch-action: manipulation;
}

.plate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
}

.plate-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.plate-close-btn {
  background: none;
  border: 1px solid var(--r-color-stroke);
  border-radius: 12px;
  padding: var(--space-xs) var(--space-md);
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--r-color-text);
}

.plate-top-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.plate-input-wrap {
  flex: 1;
  height: 5rem;
  border: 1px solid var(--r-color-stroke);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s;
}

.plate-input-wrap:focus-within {
  border-color: var(--r-color-success);
}

.plate-weight-input {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  text-align: center;
  font-family: var(--font-data);
  font-size: 2.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--r-color-text);
  -moz-appearance: textfield;
  padding: 0;
  margin: 0;
}

.plate-weight-input::-webkit-inner-spin-button,
.plate-weight-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.plate-weight-input::placeholder {
  color: var(--r-color-text-secondary);
}

.plate-input-unit {
  position: absolute;
  right: var(--space-md);
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
  pointer-events: none;
}

.plate-actions-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  height: 5rem;
}

.plate-action-btn {
  flex: 1;
  padding: 0 var(--space-md);
  border-radius: 12px;
  border: 1px solid var(--r-color-stroke);
  background: none;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: opacity 0.1s;
}

.plate-action-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.plate-action-btn:not(:disabled):active {
  background: var(--r-color-fill-secondary);
}

.plate-clear-btn {
  color: var(--r-color-error);
}

.plate-buttons-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.plate-btn-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

@media (min-width: 400px) {
  .plate-btn-wrap {
    width: 56px;
    height: 56px;
  }
}

.plate-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--r-color-success);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}

.plate-btn {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid var(--r-color-stroke);
  background: var(--r-color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
  transition: border-color 0.1s, color 0.1s, transform 0.1s;
  font-family: inherit;
  color: var(--r-color-text-secondary);
  padding: 0;
}

.plate-btn.active {
  border-color: var(--r-color-success);
  background: var(--r-color-success);
  color: #fff;
}

.plate-btn:active {
  transform: scale(0.95);
}

.plate-count {
  font-family: var(--font-data);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 1px;
  letter-spacing: 0.04em;
}

.plate-weight-label {
  font-family: var(--font-data);
  font-size: 1rem;
  font-weight: 500;
  line-height: 1;
}

@media (min-width: 400px) {
  .plate-weight-label {
    font-size: 1.15rem;
  }
}

.plate-hint {
  margin: 0 0 var(--space-lg);
  text-align: center;
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bar-weight-btn {
  width: 100%;
  height: 3rem;
  border-radius: 12px;
  border: 1px solid var(--r-color-stroke);
  background: none;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  color: var(--r-color-text-secondary);
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  margin-bottom: var(--space-md);
}

.bar-weight-btn.has-bar {
  border-color: var(--r-color-success);
  color: var(--r-color-success);
  background: var(--r-color-success-bg);
}

.bar-weight-btn:active {
  opacity: 0.8;
}

.plate-use-btn {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  border-radius: 16px;
  border: none;
  background: var(--color-ink);
  color: #fff;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.1s;
}

.plate-use-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.plate-use-btn:not(:disabled):active {
  opacity: 0.85;
}
</style>
