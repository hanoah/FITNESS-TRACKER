<script setup lang="ts">
/**
 * Modal: past sets for one exercise (scoped IndexedDB query, max 50 most recent).
 *
 * Data flow:
 *   exerciseName prop
 *        │
 *        ▼
 *   db.sets.where('exerciseName').equals(name).toArray()
 *        │
 *        ▼
 *   sort by timestamp desc → slice(0, 50)
 *        │
 *        ├── loading / error / empty
 *        └── table rows
 */
import { ref, onMounted, watch } from 'vue'
import { RButton, RText } from 'roughness'
import { db } from '../lib/db'
import type { SetLog } from '../types/session'

const props = defineProps<{
  exerciseName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const rows = ref<SetLog[]>([])

async function load() {
  loading.value = true
  error.value = null
  try {
    const all = await db.sets.where('exerciseName').equals(props.exerciseName).toArray()
    all.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    rows.value = all.slice(0, 50)
  } catch (e) {
    console.error('[ExerciseHistoryModal] load failed', e)
    error.value = "Couldn't load history"
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(
  () => props.exerciseName,
  () => {
    void load()
  }
)

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="history-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="`History for ${exerciseName}`"
      @click.self="handleClose"
    >
      <div class="history-modal">
        <div class="history-header">
          <RText tag="h3" class="history-title">History</RText>
          <RButton variant="secondary" type="button" @click="handleClose">Close</RButton>
        </div>
        <RText tag="p" class="history-exercise-name">{{ exerciseName }}</RText>

        <div v-if="loading" class="history-state">
          <RText tag="p">Loading…</RText>
        </div>
        <div v-else-if="error" class="history-state history-error">
          <RText tag="p">{{ error }}</RText>
        </div>
        <div v-else-if="rows.length === 0" class="history-state">
          <RText tag="p">No history yet for this exercise.</RText>
        </div>
        <div v-else class="history-table-wrap">
          <div class="history-table-header">
            <span>Date</span>
            <span>Weight</span>
            <span>Reps</span>
            <span>RPE</span>
          </div>
          <div
            v-for="(s, i) in rows"
            :key="s.id ?? `${s.timestamp}-${i}`"
            class="history-table-row"
            :class="{ 'is-warmup': s.isWarmup }"
          >
            <span>{{ formatDate(s.timestamp) }}</span>
            <span>{{ s.weight }}</span>
            <span>{{ s.reps }}</span>
            <span>{{ s.rpe }}{{ s.isWarmup ? ' (W)' : '' }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.history-overlay {
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
  .history-overlay {
    align-items: center;
  }
}

.history-modal {
  width: 100%;
  max-width: 28rem;
  max-height: min(85vh, 32rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  background: var(--r-color-bg);
  box-shadow: 0 12px 40px rgba(45, 42, 38, 0.2);
  padding: var(--space-lg);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.history-title {
  margin: 0;
}

.history-exercise-name {
  margin: 0 0 var(--space-md);
  font-size: 0.875rem;
  color: var(--r-color-text-muted, #6b6560);
}

.history-state {
  padding: var(--space-xl) var(--space-md);
  text-align: center;
}

.history-error {
  color: var(--r-color-danger, #b91c1c);
}

.history-table-wrap {
  overflow: auto;
  border: 1px solid var(--r-color-border, #e7e5e4);
  border-radius: 16px;
}

.history-table-header,
.history-table-row {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 0.6fr 0.7fr;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
  align-items: center;
}

.history-table-header {
  background: var(--r-color-surface-muted, #f5f5f4);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--r-color-text-muted, #6b6560);
}

.history-table-row {
  border-top: 1px solid var(--r-color-border, #e7e5e4);
}

.history-table-row.is-warmup {
  opacity: 0.85;
}
</style>
