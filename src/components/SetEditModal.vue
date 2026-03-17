<script setup lang="ts">
import { ref, watch } from 'vue'
import { RButton, RInput, RText } from 'roughness'
import { validateSetEdit, ParseError } from '../lib/parseLogInput'
import type { SetLog } from '../types/session'

const props = defineProps<{
  set: SetLog | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [weight: number, reps: number, rpe: number]
  cancel: []
}>()

const weightInput = ref('')
const repsInput = ref('')
const rpeInput = ref('')
const errorMsg = ref('')

watch(
  () => props.set,
  (set) => {
    if (set) {
      weightInput.value = String(set.weight)
      repsInput.value = String(set.reps)
      rpeInput.value = String(set.rpe)
      errorMsg.value = ''
    }
  },
  { immediate: true }
)

function handleSave() {
  errorMsg.value = ''
  const w = parseFloat(weightInput.value)
  const r = parseFloat(repsInput.value)
  const rpe = parseFloat(rpeInput.value)
  try {
    const validated = validateSetEdit(w, r, rpe)
    emit('save', validated.weight, validated.reps, validated.rpe)
  } catch (e) {
    errorMsg.value = e instanceof ParseError ? e.message : 'Invalid values'
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div class="edit-overlay" role="dialog" aria-modal="true" aria-label="Edit set" @click.self="handleCancel">
      <div class="edit-modal">
        <RText tag="h3">Edit set</RText>
        <p v-if="set" class="set-context">{{ set.exerciseName }} — Set {{ set.setNumber }}</p>
        <div class="edit-fields">
          <div class="field">
            <label>Weight (lb)</label>
            <RInput v-model="weightInput" type="number" min="0" step="0.5" placeholder="150" />
          </div>
          <div class="field">
            <label>Reps</label>
            <RInput v-model="repsInput" type="number" min="1" step="1" placeholder="12" />
          </div>
          <div class="field">
            <label>RPE (1–10)</label>
            <RInput v-model="rpeInput" type="number" min="1" max="10" step="0.5" placeholder="9" />
          </div>
        </div>
        <RText v-if="errorMsg" tag="p" class="error">{{ errorMsg }}</RText>
        <div class="edit-actions">
          <RButton variant="secondary" :disabled="saving" @click="handleCancel">Cancel</RButton>
          <RButton type="primary" :disabled="saving" @click="handleSave">
            {{ saving ? 'Saving…' : 'Save' }}
          </RButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  font-family: var(--r-common-font-family), inherit;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.edit-modal {
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-radius: 12px;
  padding: var(--space-xl);
  min-width: 280px;
  max-width: 90vw;
  font-family: inherit;
}
.edit-modal h3 {
  margin: 0 0 var(--space-sm) 0;
  font-size: 1.25rem;
}
.set-context {
  margin: 0 0 var(--space-md) 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
}
.edit-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.field label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.error {
  color: var(--r-color-error);
  font-size: 0.9rem;
  margin: 0 0 var(--space-md) 0;
}
.edit-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
