<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorkoutStore } from '../store/workout'
import { useProgressionHistory } from '../composables/useProgressionHistory'
import { parseLogInput, ParseError } from '../lib/parseLogInput'
import { plateCalc } from '../lib/plateCalc'
import { suggest } from '../lib/progression'
import { toSessionExercise } from '../lib/exerciseLibrary'
import { saveTemplate } from '../lib/templateLibrary'
import { useUserProfile } from '../composables/useUserProfile'
import { getGoal } from '../lib/strengthGoals'
import RestTimer from '../components/RestTimer.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'
import type { ExerciseInfo } from '../lib/exerciseLibrary'

const router = useRouter()
const workoutStore = useWorkoutStore()
const { todayExercises } = storeToRefs(workoutStore)
const toast = useToast()

const logInput = ref('')
const parseError = ref('')
const plateConfig = ref<ReturnType<typeof plateCalc> | null>(null)
const logging = ref(false)
const showRestTimer = ref(false)
const restTimerSeconds = ref(0)
const restTimerKey = ref(0)
const gifLoaded = ref<boolean | undefined>(undefined)
const showOverflowMenu = ref(false)

const { profile: userProfile } = useUserProfile()
const strengthGoal = computed(() => {
  const ex = currentExercise.value
  const profile = userProfile.value
  if (!ex || !profile?.weightKg) return null
  const bodyWeightLbs = profile.weightKg * 2.205
  const level = (profile.strengthLevel ?? 'intermediate') as 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'
  const goal = getGoal(ex.name, bodyWeightLbs, level)
  return goal != null ? { weight: goal } : null
})

const currentExercise = computed(() => workoutStore.currentExercise)
const currentSetNumber = computed(() => workoutStore.currentSetNumber)
const isWarmupSet = computed(() => workoutStore.isWarmupSet)

const { slotHistory: pastSlotHistory, exerciseHistory: pastExerciseHistory } =
  useProgressionHistory(
    () => currentExercise.value?.slotKey,
    () => currentExercise.value?.name,
    () => workoutStore.activeSession?.id
  )

const completedSetsForExercise = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  return workoutStore.completedSets.filter((s) => s.exerciseSlot === ex.slotKey)
})

const slotHistoryForSuggestion = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  const current = completedSetsForExercise.value
  return [...pastSlotHistory.value, ...current].sort((a, b) => a.timestamp - b.timestamp)
})

const exerciseHistoryForSuggestion = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  const current = workoutStore.completedSets.filter((s) => s.exerciseName === ex.name)
  return [...pastExerciseHistory.value, ...current].sort((a, b) => a.timestamp - b.timestamp)
})

const suggestion = computed(() => {
  const ex = currentExercise.value
  if (!ex) return null
  return suggest(ex, slotHistoryForSuggestion.value, exerciseHistoryForSuggestion.value)
})

const suggestedWeight = computed(() => suggestion.value?.weight)
const suggestedReps = computed(() => suggestion.value?.reps ?? 0)
const suggestedRpe = computed(() => {
  const s = suggestion.value
  const ex = currentExercise.value
  if (s?.rpe != null) return s.rpe
  return ex?.lastSetRPE ?? 9
})
const canLogSuggested = computed(() => {
  const w = suggestedWeight.value
  const r = suggestedReps.value
  return w != null && w > 0 && r > 0
})

/** First-time exercise: we have reps/rpe from suggestion but no weight yet */
const canLogFirstTime = computed(() => {
  const w = suggestedWeight.value
  const r = suggestedReps.value
  return r > 0 && (w == null || w === 0)
})

const firstTimeWeight = ref('')

const lastCompletedSetForPreload = computed(() => {
  const sets = completedSetsForExercise.value
  if (sets.length === 0) return null
  return sets[sets.length - 1]
})

const suggestedPlateConfig = computed(() => {
  const weight = suggestedWeight.value
  if (!weight || !isBarbell.value) return null
  try {
    return plateCalc(weight)
  } catch {
    return null
  }
})

const upcomingExercises = computed(() => {
  const idx = workoutStore.activeSession?.currentExerciseIndex ?? 0
  return workoutStore.todayExercises.slice(idx + 1)
})

const canUnskip = computed(() => (workoutStore.activeSession?.currentExerciseIndex ?? 0) > 0)

const isBarbell = computed(() => {
  const ex = currentExercise.value
  if (!ex) return false
  const name = ex.name.toLowerCase()
  return (
    name.includes('barbell') ||
    name.includes('squat') ||
    name.includes('deadlift') ||
    name.includes('press') ||
    name.includes('bench')
  )
})

onMounted(async () => {
  if (!workoutStore.activeSession && workoutStore.todayExercises.length === 0) {
    const session = await workoutStore.loadResumableSession()
    if (!session) {
      router.push('/')
      return
    }
    const result = await workoutStore.resumeSession()
    if (!result.ok) {
      toast(result.error)
    }
  }
})

watch(
  () => workoutStore.activeSession,
  (session) => {
    if (!session) {
      router.push('/')
    }
  }
)

function closeOverflowMenu() {
  showOverflowMenu.value = false
}

watch(showOverflowMenu, (open) => {
  if (!open) return
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.overflow-wrapper')) closeOverflowMenu()
  }
  setTimeout(() => document.addEventListener('click', handler, { once: true }), 0)
})

watch(
  () => currentExercise.value?.imagePath,
  () => {
    gifLoaded.value = undefined
  }
)

watch(
  () => currentExercise.value?.slotKey,
  () => {
    firstTimeWeight.value = ''
    logInput.value = ''
  }
)

watch(logInput, (val) => {
  parseError.value = ''
  if (!val.trim()) {
    plateConfig.value = null
    return
  }
  try {
    const parsed = parseLogInput(val)
    if (isBarbell.value) {
      plateConfig.value = plateCalc(parsed.weight)
    } else {
      plateConfig.value = null
    }
  } catch {
    plateConfig.value = null
  }
})

/** Pre-fill manual input with last logged set so user can tap Log Set without typing */
watch(
  [() => currentExercise.value?.slotKey, lastCompletedSetForPreload],
  ([, lastSet]) => {
    if (!lastSet || logInput.value.trim()) return
    logInput.value = `${lastSet.weight} ${lastSet.reps} ${lastSet.rpe}`
  },
  { immediate: true }
)

function handleLogFirstTime() {
  const w = parseFloat(firstTimeWeight.value)
  if (!Number.isFinite(w) || w <= 0) {
    toast('Enter a valid weight')
    return
  }
  firstTimeWeight.value = ''
  doLogSet(w, suggestedReps.value, suggestedRpe.value)
}

async function doLogSet(weight: number, reps: number, rpe: number) {
  const ex = currentExercise.value
  logging.value = true
  try {
    const ok = await workoutStore.logSet(weight, reps, rpe)
    if (!ok) {
      toast('Failed to save set')
      return
    }
    logInput.value = ''
    parseError.value = ''
    plateConfig.value = null
    if (ex?.restSeconds?.[0]) {
      restTimerSeconds.value = ex.restSeconds[0]
      restTimerKey.value++
      showRestTimer.value = true
    }
    toast(`${weight}×${reps} @ RPE ${rpe} logged`)
  } finally {
    logging.value = false
  }
}

async function handleLogSuggested() {
  if (!canLogSuggested.value || logging.value) return
  const w = suggestedWeight.value!
  const r = suggestedReps.value
  const rpe = suggestedRpe.value
  await doLogSet(w, r, rpe)
}

async function handleSubmit() {
  try {
    const parsed = parseLogInput(logInput.value)
    await doLogSet(parsed.weight, parsed.reps, parsed.rpe)
  } catch (e) {
    parseError.value = e instanceof ParseError ? e.message : 'Invalid input'
  }
}

function onRestTimerDone() {
  showRestTimer.value = false
}

async function handleSkip() {
  const ok = await workoutStore.skipExercise()
  if (!ok) {
    toast('Failed to skip exercise')
    return
  }
  logInput.value = ''
  parseError.value = ''
  plateConfig.value = null
}

async function handleUnskip() {
  const ok = await workoutStore.unskipExercise()
  if (!ok) {
    toast('Failed to go back')
    return
  }
  logInput.value = ''
  parseError.value = ''
  plateConfig.value = null
}

const completing = ref(false)
const abandoning = ref(false)
const showSubPicker = ref(false)
const showAddPicker = ref(false)

const needsAddExercise = computed(
  () =>
    workoutStore.activeSession &&
    workoutStore.todayExercises.length === 0
)

const subQuickPicks = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  const picks: string[] = []
  if (ex.sub1) picks.push(ex.sub1)
  if (ex.sub2 && ex.sub2 !== ex.sub1) picks.push(ex.sub2)
  return picks
})

function openSubPicker() {
  showSubPicker.value = true
}

function closeSubPicker() {
  showSubPicker.value = false
}

function openAddPicker() {
  showAddPicker.value = true
}

function closeAddPicker() {
  showAddPicker.value = false
}

async function handleSubSelect(info: ExerciseInfo) {
  const ex = currentExercise.value
  if (!ex) return
  const ok = await workoutStore.substituteExercise(ex.slotKey, info.name)
  if (ok) {
    toast(`Swapped to ${info.name}`)
    closeSubPicker()
  } else {
    toast('Failed to substitute')
  }
}

async function handleAddExercise(info: ExerciseInfo) {
  const base = toSessionExercise(info, '')
  const ok = await workoutStore.addExercise(base)
  if (ok) {
    toast(`Added ${info.name}`)
    closeAddPicker()
  } else {
    toast('Failed to add exercise')
  }
}

async function handleRemoveExercise() {
  const ex = currentExercise.value
  if (!ex) return
  if (!confirm(`Remove ${ex.name} from this workout?`)) return
  const ok = await workoutStore.removeExercise(ex.slotKey)
  if (!ok) {
    toast('Failed to remove exercise')
  }
}

async function handleSaveAsTemplate() {
  const exercises = todayExercises.value
  if (!exercises.length) return
  const name = prompt('Template name')
  if (!name?.trim()) return
  try {
    await saveTemplate(name.trim(), exercises)
    toast('Template saved')
  } catch (e) {
    console.error('[WorkoutPage] Save template failed', e)
    toast('Failed to save template')
  }
}

async function handleComplete() {
  if (completing.value) return
  completing.value = true
  try {
    const ok = await workoutStore.completeWorkout()
    if (!ok) {
      toast('Failed to save workout')
      return
    }
    toast('Workout saved!')
    router.push('/')
  } finally {
    completing.value = false
  }
}

async function handleAbandon() {
  if (!confirm('Abandon this workout? Your logged sets will still be saved.')) return
  if (abandoning.value) return
  abandoning.value = true
  try {
    const ok = await workoutStore.abandonWorkout()
    if (!ok) {
      toast('Failed to abandon workout')
      return
    }
    router.push('/')
  } finally {
    abandoning.value = false
  }
}
</script>

<template>
  <div class="workout-page">
    <RestTimer
      v-if="showRestTimer"
      :key="restTimerKey"
      :seconds="restTimerSeconds"
      @done="onRestTimerDone"
      @skip="onRestTimerDone"
    />
    <ExercisePicker
      v-if="showSubPicker && currentExercise"
      title="Substitute exercise"
      :quick-picks="subQuickPicks"
      @select="handleSubSelect"
      @cancel="closeSubPicker"
    />
    <ExercisePicker
      v-if="showAddPicker"
      title="Add exercise"
      @select="handleAddExercise"
      @cancel="closeAddPicker"
    />
    <div v-if="needsAddExercise" class="add-first">
      <RCard>
        <RText tag="h2">Add your first exercise</RText>
        <RText tag="p" class="add-hint">Start your free workout by adding an exercise.</RText>
        <RButton type="primary" @click="openAddPicker">+ Add Exercise</RButton>
        <RButton variant="secondary" :disabled="abandoning" @click="handleAbandon" class="abandon-free">
          Abandon
        </RButton>
      </RCard>
    </div>
    <div v-else-if="!currentExercise" class="done">
      <RCard>
        <RText tag="h2">All done!</RText>
        <RButton v-if="canUnskip" @click="handleUnskip" class="back-btn">Back</RButton>
        <RButton v-if="workoutStore.activeSession?.dayType === 'free'" @click="openAddPicker" class="add-more-btn">
          + Add more
        </RButton>
        <RButton type="primary" :disabled="completing" @click="handleComplete">
          {{ completing ? 'Saving…' : 'Complete Workout' }}
        </RButton>
        <RButton :disabled="abandoning" @click="handleAbandon">
          {{ abandoning ? 'Abandoning…' : 'Abandon' }}
        </RButton>
      </RCard>
    </div>

    <template v-else>
      <RCard class="exercise-card">
        <div class="exercise-header">
          <div class="exercise-header-left">
            <button
              v-if="canUnskip"
              type="button"
              class="back-link"
              @click="handleUnskip"
            >
              ← Back
            </button>
            <RText tag="h2" class="exercise-name">{{ currentExercise.name }}</RText>
          </div>
          <div class="exercise-actions">
            <RButton type="primary" class="skip-btn" @click="handleSkip">Skip</RButton>
            <div class="overflow-wrapper">
              <RButton
                class="overflow-btn"
                variant="secondary"
                :disabled="abandoning"
                @click.stop="showOverflowMenu = !showOverflowMenu"
              >
                ⋯
              </RButton>
              <Transition name="dropdown">
                <div v-if="showOverflowMenu" class="overflow-menu">
                  <button
                    v-if="todayExercises.length > 0"
                    type="button"
                    class="overflow-item"
                    @click="handleSaveAsTemplate(); closeOverflowMenu()"
                  >
                    Save as Template
                  </button>
                  <button type="button" class="overflow-item" @click="openSubPicker(); closeOverflowMenu()">
                    Substitute
                  </button>
                  <button type="button" class="overflow-item" @click="openAddPicker(); closeOverflowMenu()">
                    Add Exercise
                  </button>
                  <button type="button" class="overflow-item" @click="handleRemoveExercise(); closeOverflowMenu()">
                    Remove
                  </button>
                  <button type="button" class="overflow-item" @click="handleAbandon(); closeOverflowMenu()">
                    End Workout
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </div>
        <RText tag="p" class="exercise-notes">{{ currentExercise.notes }}</RText>
        <RText tag="p" class="set-info">
          Set {{ currentSetNumber }} of
          {{ currentExercise.warmupSets + currentExercise.workingSets }}
          {{ isWarmupSet ? '(warm-up)' : '' }}
          <span v-if="currentExercise.restSeconds" class="rest-info">
            · Rest: {{ Math.floor(currentExercise.restSeconds[0] / 60) }}-{{ Math.ceil((currentExercise.restSeconds[1] || currentExercise.restSeconds[0]) / 60) }} min
          </span>
        </RText>

        <div v-if="suggestion" class="suggestion-block">
          <RText tag="p" class="suggestion-title">Progression</RText>
          <RText v-if="suggestion.lastWeight != null" tag="p" class="suggestion-last">
            Last: {{ suggestion.lastWeight }}×{{ suggestion.lastReps }} @ RPE {{ suggestion.lastRpe }}
            <span v-if="suggestion.lastDate">({{ suggestion.lastDate }})</span>
            — {{ suggestion.note }}
          </RText>
          <RText v-else tag="p" class="suggestion-note">{{ suggestion.note }}</RText>
          <div
            v-if="suggestedPlateConfig && suggestedPlateConfig.perSide.length > 0"
            class="plate-math suggested"
          >
            <RText tag="p" class="plate-label">Plates per side</RText>
            <RText tag="p" class="plate-value">
              {{ suggestedPlateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}
            </RText>
          </div>
        </div>
        <div v-if="strengthGoal" class="goal-badge">
          <RText tag="p">Goal: {{ strengthGoal.weight }} lb</RText>
        </div>
      </RCard>

      <div class="exercise-gif">
        <img
          v-if="currentExercise.imagePath && gifLoaded !== false"
          :src="currentExercise.imagePath"
          :alt="currentExercise.name"
          @load="gifLoaded = true"
          @error="gifLoaded = false"
        />
        <div
          v-else-if="!currentExercise.imagePath || gifLoaded === false"
          class="exercise-gif-placeholder"
        >
          <span class="placeholder-icon">🏋️</span>
          <RText tag="p">No demo available</RText>
        </div>
      </div>

      <RCard class="log-card">
        <RButton
          v-if="canLogSuggested"
          type="primary"
          class="log-suggested-btn"
          :disabled="logging"
          @click="handleLogSuggested"
        >
          Log: {{ suggestedWeight }} × {{ suggestedReps }} @ RPE {{ suggestedRpe }}
        </RButton>
        <div v-else-if="canLogFirstTime" class="log-first-time">
          <RText tag="p" class="log-hint">Enter starting weight:</RText>
          <div class="first-time-row">
            <RInput
              v-model="firstTimeWeight"
              type="number"
              min="0"
              step="0.5"
              placeholder="135"
              :disabled="logging"
              class="first-time-weight-input"
              @keyup.enter="handleLogFirstTime"
            />
            <RButton
              type="primary"
              class="log-suggested-btn"
              :disabled="logging || !firstTimeWeight.trim()"
              @click="handleLogFirstTime"
            >
              Log: {{ suggestedReps }} @ RPE {{ suggestedRpe }}
            </RButton>
          </div>
        </div>
        <RText tag="p" class="log-hint">
          {{ canLogSuggested || canLogFirstTime ? 'Or enter manually: ' : 'Enter: ' }}weight reps RPE (e.g. 150 12 9)
        </RText>
        <RInput
          v-model="logInput"
          placeholder="150 12 9"
          :disabled="logging"
          @keyup.enter="handleSubmit"
        />
        <RText v-if="parseError" tag="p" class="error">{{ parseError }}</RText>
        <div v-if="plateConfig && plateConfig.perSide.length > 0 && !suggestedPlateConfig" class="plate-math">
          <RText tag="p" class="plate-label">Plates per side</RText>
          <RText tag="p" class="plate-value">
            {{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}
          </RText>
        </div>
        <div v-else-if="plateConfig && plateConfig.perSide.length > 0" class="plate-math">
          <RText tag="p" class="plate-label">Your input — plates per side</RText>
          <RText tag="p" class="plate-value">
            {{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}
          </RText>
        </div>
        <RButton
          type="primary"
          @click="handleSubmit"
          :disabled="!logInput.trim() || logging"
        >
          Log Set
        </RButton>
      </RCard>

      <RCard v-if="upcomingExercises.length > 0" class="up-next-card">
        <RText tag="h3">Up next</RText>
        <ul class="up-next-list">
          <li v-for="(ex, i) in upcomingExercises" :key="ex.slotKey">
            {{ i + 1 }}. {{ ex.name }}
          </li>
        </ul>
      </RCard>

      <RCard class="history-card" v-if="completedSetsForExercise.length > 0">
        <RText tag="h3">This exercise</RText>
        <ul>
          <li v-for="(s, i) in completedSetsForExercise" :key="i">
            {{ s.weight }} × {{ s.reps }} @ RPE {{ s.rpe }}
            {{ s.isWarmup ? '(warm-up)' : '' }}
          </li>
        </ul>
      </RCard>
    </template>
  </div>
</template>

<style scoped>
.workout-page {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.exercise-card {
  padding: var(--space-xl);
}
.exercise-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-lg);
}
.exercise-header-left {
  flex: 1;
  min-width: 0;
}
.back-link {
  display: block;
  margin-bottom: var(--space-xs);
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--r-color-primary);
  cursor: pointer;
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}
.exercise-actions {
  display: flex;
  gap: var(--space-sm);
  flex-shrink: 0;
}
.overflow-wrapper {
  position: relative;
}
.overflow-btn {
  min-width: 2.5rem;
  padding: 0.35rem 0.5rem;
}
.overflow-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-xs);
  min-width: 160px;
  padding: var(--space-xs);
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
}
.overflow-item {
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  text-align: left;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.overflow-item:hover {
  background: var(--r-color-fill-tertiary);
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.exercise-name {
  font-size: 1.25rem;
  margin: 0 0 0.5rem 0;
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}
.exercise-notes {
  color: var(--r-color-text-secondary);
  font-size: 0.9rem;
  margin: 0 0 var(--space-md) 0;
}
.set-info {
  margin: 0 0 var(--space-sm) 0;
  font-weight: 600;
}
.rest-info {
  color: var(--r-color-text-secondary);
  font-weight: 400;
}
.suggestion-last {
  margin: 0 0 var(--space-sm) 0;
  font-weight: 500;
  color: var(--r-color-primary);
}
.suggestion-block {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--r-color-fill-secondary);
  border-radius: 6px;
  border: 1px solid var(--r-color-fill-tertiary);
}
.suggestion-title {
  margin: 0 0 var(--space-xs) 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--r-color-primary);
}
.suggestion-note {
  margin: 0 0 var(--space-sm) 0;
  font-style: italic;
  color: var(--r-color-primary);
}
.plate-math {
  margin: var(--space-sm) 0;
  padding: var(--space-sm);
  background: var(--r-color-fill-tertiary);
  border-radius: 4px;
}
.plate-math.suggested {
  background: var(--r-color-fill-tertiary);
  margin-top: var(--space-sm);
}
.goal-badge {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--r-color-fill-secondary);
  border-radius: 6px;
  font-size: 0.9rem;
}
.plate-label {
  margin: 0 0 0.25rem 0;
  font-size: 0.85rem;
}
.plate-value {
  margin: 0;
  font-weight: 600;
}
.exercise-gif {
  text-align: center;
  min-height: 120px;
}
.exercise-gif img {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
}
.exercise-gif-placeholder {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  background: var(--r-color-fill-secondary);
  border-radius: 8px;
  color: var(--r-color-text-secondary);
}
.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
.exercise-gif-placeholder p {
  margin: 0;
  font-size: 0.9rem;
}
.log-card {
  padding: var(--space-xl);
}
.log-suggested-btn {
  width: 100%;
  margin-bottom: var(--space-md);
  font-size: 1.1rem;
  font-weight: 600;
  padding: var(--space-lg) var(--space-xl);
}
.log-first-time {
  margin-bottom: 0.75rem;
}
.first-time-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.first-time-weight-input {
  flex: 0 0 100px;
}
.log-hint {
  font-size: 0.85rem;
  margin: 0 0 var(--space-sm) 0;
  color: var(--r-color-text-secondary);
}
.error {
  color: var(--r-color-error);
  margin: 0.5rem 0 0 0;
  font-size: 0.9rem;
}
.up-next-card {
  padding: var(--space-lg);
  background: var(--r-color-fill-tertiary);
  border-color: var(--r-color-fill-secondary);
}
.up-next-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}
.up-next-list {
  margin: 0;
  padding-left: 1.25rem;
}
.up-next-list li {
  margin: 0.25rem 0;
}
.history-card {
  padding: var(--space-lg);
  background: var(--r-color-fill-tertiary);
  border-color: var(--r-color-fill-secondary);
}
.history-card ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.25rem;
}
.history-card li {
  margin: 0.25rem 0;
}
.add-first {
  text-align: center;
  padding: 2rem;
}
.add-first h2 {
  margin: 0 0 0.5rem 0;
}
.add-hint {
  color: var(--r-color-text-secondary);
  margin: 0 0 1rem 0;
}
.add-first .abandon-free {
  margin-top: 0.5rem;
}
.done {
  text-align: center;
  padding: 2rem;
}
.done .back-btn,
.done .add-more-btn {
  margin-bottom: 0.5rem;
}
</style>
