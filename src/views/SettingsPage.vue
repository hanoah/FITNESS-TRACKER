<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '../lib/db'
import { getGoal } from '../lib/strengthGoals'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'

const KEY_LIFTS = [
  { name: 'Barbell Bench Press', label: 'Bench' },
  { name: 'Smith Machine Squat', label: 'Squat' },
  { name: 'Barbell RDL', label: 'RDL' },
]

const toast = useToast()

const heightDisplay = ref<string>('')
const weightDisplay = ref<string>('')
const unit = ref<'lb' | 'kg'>('kg')
const strengthLevel = ref<'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'>('intermediate')
const saving = ref(false)

const LEVELS = [
  { value: 'beginner' as const, label: 'Beginner' },
  { value: 'novice' as const, label: 'Novice' },
  { value: 'intermediate' as const, label: 'Intermediate' },
  { value: 'advanced' as const, label: 'Advanced' },
  { value: 'elite' as const, label: 'Elite' },
]

function toInches(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10
}

function toLbs(kg: number): number {
  return Math.round((kg * 2.205) * 10) / 10
}

function toCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10
}

function toKg(lbs: number): number {
  return Math.round((lbs / 2.205) * 10) / 10
}

onMounted(async () => {
  const profile = await db.userProfile.get('current')
  if (profile) {
    unit.value = profile.unit
    strengthLevel.value = profile.strengthLevel ?? 'intermediate'
    if (profile.heightCm != null) {
      heightDisplay.value = String(profile.unit === 'kg' ? profile.heightCm : toInches(profile.heightCm))
    } else {
      heightDisplay.value = ''
    }
    if (profile.weightKg != null) {
      weightDisplay.value = String(profile.unit === 'kg' ? profile.weightKg : toLbs(profile.weightKg))
    } else {
      weightDisplay.value = ''
    }
  }
})

function setUnit(u: 'lb' | 'kg') {
  if (u === unit.value) return
  const h = parseFloat(heightDisplay.value)
  const w = parseFloat(weightDisplay.value)
  if (!isNaN(h) && h > 0) {
    const cm = unit.value === 'kg' ? h : toCm(h)
    heightDisplay.value = String(u === 'kg' ? cm : toInches(cm))
  }
  if (!isNaN(w) && w > 0) {
    const kg = unit.value === 'kg' ? w : toKg(w)
    weightDisplay.value = String(u === 'kg' ? kg : toLbs(kg))
  }
  unit.value = u
}

async function handleSave() {
  saving.value = true
  try {
    const hVal = parseFloat(heightDisplay.value)
    const wVal = parseFloat(weightDisplay.value)
    const heightCm = !isNaN(hVal) && hVal > 0
      ? (unit.value === 'kg' ? hVal : toCm(hVal))
      : undefined
    const weightKg = !isNaN(wVal) && wVal > 0
      ? (unit.value === 'kg' ? wVal : toKg(wVal))
      : undefined

    await db.userProfile.put({
      id: 'current',
      heightCm,
      weightKg,
      unit: unit.value,
      strengthLevel: strengthLevel.value,
      updatedAt: Date.now(),
    })
    toast('Settings saved')
  } catch (e) {
    console.error('[SettingsPage] Failed to save', e)
    toast('Failed to save settings')
  } finally {
    saving.value = false
  }
}

const heightLabel = () => (unit.value === 'kg' ? 'Height (cm)' : 'Height (in)')
const weightLabel = () => (unit.value === 'kg' ? 'Weight (kg)' : 'Weight (lbs)')

const weightKgFromForm = computed(() => {
  const v = parseFloat(weightDisplay.value)
  if (isNaN(v) || v <= 0) return undefined
  return unit.value === 'kg' ? v : toKg(v)
})

const keyLiftGoals = computed(() => {
  const w = weightKgFromForm.value
  if (w == null) return []
  const bodyWeightLbs = w * 2.205
  const level = strengthLevel.value
  return KEY_LIFTS.map(({ name, label }) => {
    const goal = getGoal(name, bodyWeightLbs, level)
    return { label, goal }
  }).filter((g) => g.goal != null)
})
</script>

<template>
  <div class="settings">
    <RCard class="profile-card">
      <RText tag="h2">Profile</RText>
      <div class="field">
        <RText tag="label">{{ heightLabel() }}</RText>
        <RInput
          v-model="heightDisplay"
          type="number"
          min="0"
          step="0.1"
          :placeholder="unit === 'kg' ? '170' : '67'"
        />
      </div>
      <div class="field">
        <RText tag="label">{{ weightLabel() }}</RText>
        <RInput
          v-model="weightDisplay"
          type="number"
          min="0"
          step="0.1"
          :placeholder="unit === 'kg' ? '70' : '154'"
        />
      </div>
      <div class="field">
        <RText tag="label">Strength Level</RText>
        <select v-model="strengthLevel" class="level-select">
          <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </div>
      <div class="field">
        <RText tag="label">Unit</RText>
        <div class="unit-toggle">
          <RButton :type="unit === 'kg' ? 'primary' : undefined" @click="setUnit('kg')">kg</RButton>
          <RButton :type="unit === 'lb' ? 'primary' : undefined" @click="setUnit('lb')">lb</RButton>
        </div>
      </div>
      <RButton type="primary" :disabled="saving" @click="handleSave">Save</RButton>

      <div v-if="keyLiftGoals.length > 0" class="key-lifts">
        <RText tag="h3">Key lift goals ({{ strengthLevel }})</RText>
        <ul>
          <li v-for="g in keyLiftGoals" :key="g.label">{{ g.label }}: {{ g.goal }} lb</li>
        </ul>
      </div>
    </RCard>
  </div>
</template>

<style scoped>
.settings {
  max-width: 400px;
  margin: 0 auto;
}
.profile-card {
  padding: 1.5rem;
}
.profile-card h2 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
}
.field {
  margin-bottom: 1rem;
}
.field label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}
.unit-toggle {
  display: flex;
  gap: 0.5rem;
}
.level-select {
  padding: 0.5rem;
  border: 2px solid var(--r-color-stroke, #333);
  border-radius: 4px;
  font-size: 1rem;
  min-width: 160px;
}
.key-lifts {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--r-color-stroke, #ccc);
}
.key-lifts h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}
.key-lifts ul {
  margin: 0;
  padding-left: 1.25rem;
}
.key-lifts li {
  margin: 0.25rem 0;
}
</style>
