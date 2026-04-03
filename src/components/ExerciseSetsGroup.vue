<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SetLog, SessionExercise } from '../types/session'

const props = defineProps<{
  index: number
  name: string
  slotKey: string
  completed: number
  total: number
  isActive: boolean
  isComplete: boolean
  hasPR: boolean
  sets: SetLog[]
  exercise: SessionExercise
  deleting: boolean
  isPRSet: (id: number | undefined) => boolean
}>()

const emit = defineEmits<{
  goTo: []
  editSet: [set: SetLog]
  deleteSet: [setId: number]
}>()

const expanded = ref(props.isActive)

watch(
  () => props.isActive,
  (active) => {
    if (active) expanded.value = true
  }
)

function toggleExpanded() {
  expanded.value = !expanded.value
}

function handleHeaderKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleExpanded()
  }
}
</script>

<template>
  <div class="exercise-group" :class="{ active: isActive }">
    <div
      class="group-header"
      :class="{ active: isActive, collapsed: !isActive }"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      @click="toggleExpanded"
      @keydown="handleHeaderKeydown"
    >
      <span class="group-index">{{ index + 1 }}.</span>
      <button
        type="button"
        class="group-name-btn"
        @click.stop="emit('goTo')"
      >
        {{ name }}
      </button>
      <span v-if="hasPR" class="group-pr" title="PR this session">★</span>
      <span v-if="isComplete" class="group-check" aria-label="Complete">✓</span>
      <span class="group-count">{{ completed }}/{{ total }}</span>
      <span class="group-arrow">{{ expanded ? '▾' : '▸' }}</span>
    </div>

    <div v-show="expanded" class="group-body" role="group">
      <ul v-if="sets.length > 0" class="group-sets-list">
        <li v-for="(s, i) in sets" :key="s.id ?? i" class="group-set-row">
          <button
            type="button"
            class="group-set-edit-btn"
            @click="emit('editSet', s)"
          >
            <span v-if="isPRSet(s.id)" class="set-pr-badge">★</span>
            <span class="set-detail">
              {{ s.weight }} × {{ s.reps }} @ RPE {{ s.rpe }}
              <span v-if="s.isWarmup" class="set-warmup-tag">(warm-up)</span>
            </span>
          </button>
          <button
            v-if="s.id != null"
            type="button"
            class="group-set-delete-btn"
            :disabled="deleting"
            :style="{ opacity: deleting ? 0.4 : 1, pointerEvents: deleting ? 'none' : 'auto' }"
            aria-label="Delete set"
            @click="emit('deleteSet', s.id!)"
          >
            ✕
          </button>
        </li>
      </ul>
      <div v-else class="group-empty">
        <p class="group-empty-text">No sets logged yet</p>
        <p class="group-empty-hint">
          {{ exercise.workingSets }} working set{{ exercise.workingSets !== 1 ? 's' : '' }}
          of {{ exercise.repRange[0] }}–{{ exercise.repRange[1] }} reps
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.exercise-group {
  border-radius: 16px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  cursor: pointer;
  user-select: none;
  min-height: 44px;
  border-radius: 16px;
  transition: background 0.15s ease;
}

.group-header.active {
  background: var(--color-stone-900, #1c1917);
  color: #fff;
}

.group-header.collapsed {
  background: var(--color-stone-50, #fafaf9);
  color: var(--color-stone-700, #44403c);
  border: 1px solid var(--color-stone-200, #e7e5e4);
}

.group-header.collapsed:hover {
  background: var(--color-stone-100, #f5f5f4);
}

.group-index {
  flex-shrink: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.group-name-btn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.group-header.active .group-name-btn:hover {
  text-decoration: underline;
}

.group-header.collapsed .group-name-btn:hover {
  text-decoration: underline;
  color: var(--r-color-primary);
}

.group-pr {
  flex-shrink: 0;
  color: var(--color-amber-500, #f59e0b);
  font-size: 0.85rem;
}

.group-check {
  flex-shrink: 0;
  color: var(--color-emerald-600, #059669);
  font-size: 0.85rem;
  font-weight: 700;
}

.group-header.active .group-check {
  color: var(--color-emerald-400, #34d399);
}

.group-count {
  flex-shrink: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.group-arrow {
  flex-shrink: 0;
  font-size: 0.7rem;
  opacity: 0.5;
}

/* Body */
.group-body {
  padding: var(--space-xs, 4px) var(--space-md, 12px) var(--space-sm, 8px);
}

.group-sets-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.group-set-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  border-bottom: 1px solid var(--r-color-fill-secondary, #f5f5f4);
}

.group-set-row:last-child {
  border-bottom: none;
}

.group-set-edit-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: var(--space-xs, 4px) 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  color: var(--r-color-text-secondary, #78716c);
  border-radius: 4px;
  min-height: 44px;
}

.group-set-edit-btn:hover {
  color: var(--r-color-primary);
  background: var(--r-color-fill-secondary, #f5f5f4);
}

.set-pr-badge {
  color: var(--color-amber-500, #f59e0b);
  font-size: 0.8rem;
}

.set-warmup-tag {
  font-size: 0.75rem;
  opacity: 0.7;
  font-style: italic;
}

.group-set-delete-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--r-color-text-secondary, #78716c);
  cursor: pointer;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}

.group-set-delete-btn:hover:not(:disabled) {
  color: var(--r-color-error, #dc2626);
  background: var(--r-color-fill-secondary, #f5f5f4);
}

.group-set-delete-btn:disabled {
  cursor: not-allowed;
}

/* Empty state */
.group-empty {
  padding: var(--space-xs, 4px) 0;
}

.group-empty-text {
  margin: 0;
  font-size: 0.8rem;
  font-style: italic;
  color: var(--color-stone-400, #a8a29e);
}

.group-empty-hint {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--color-stone-500, #78716c);
}
</style>
