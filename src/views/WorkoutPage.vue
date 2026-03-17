<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorkoutStore } from '../store/workout'
import { useProgressionHistory } from '../composables/useProgressionHistory'
import { parseLogInput, ParseError } from '../lib/parseLogInput'
import { plateCalc, platesToTotal } from '../lib/plateCalc'
import { suggest } from '../lib/progression'
import { toSessionExercise } from '../lib/exerciseLibrary'
import { saveTemplate } from '../lib/templateLibrary'
import { getCompleteWorkoutMessage } from '../lib/delightCopy'
import { useUserProfile } from '../composables/useUserProfile'
import { getGoal } from '../lib/strengthGoals'
import { getMusclesForExercise } from '../lib/exerciseLibrary'
import { emitDebugEvent } from '../lib/debugEvents'
import RestTimer from '../components/RestTimer.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import SetEditModal from '../components/SetEditModal.vue'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'
import type { ExerciseInfo } from '../lib/exerciseLibrary'
import type { SetLog } from '../types/session'

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
const editingSet = ref<SetLog | null>(null)
const savingEdit = ref(false)

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

/** ETA to goal: "At +2.5 lb per session, about 8 weeks to reach 135" */
const goalProjection = computed(() => {
  const goal = strengthGoal.value?.weight
  const s = suggestion.value
  if (!goal || !s?.lastWeight || s.lastWeight >= goal) return null
  const suggested = suggestedWeight.value ?? 0
  const increment = suggested > 0 ? suggested - s.lastWeight : 2.5
  if (increment <= 0) return null
  const remaining = goal - s.lastWeight
  const sessions = Math.ceil(remaining / increment)
  if (sessions <= 0) return null
  return { increment, sessions, goal }
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
const plateInput = ref('')

const lastCompletedSetForPreload = computed(() => {
  const sets = completedSetsForExercise.value
  if (sets.length === 0) return null
  return sets[sets.length - 1]
})

const computedWeightFromPlates = computed(() => {
  if (!isBarbell.value || !plateInput.value.trim()) return null
  const tokens = plateInput.value.trim().split(/\s+/).map((t) => parseFloat(t))
  if (tokens.length % 2 !== 0 || tokens.some((n) => !Number.isFinite(n) || n <= 0)) return null
  const perSide: { weight: number; count: number }[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    perSide.push({ count: Math.round(tokens[i]), weight: tokens[i + 1] })
  }
  try {
    return platesToTotal(perSide)
  } catch {
    return null
  }
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

const restTimerNextHint = computed(() => {
  const ex = currentExercise.value
  const nextEx = upcomingExercises.value[0]
  if (ex) {
    const completedCount = completedSetsForExercise.value.length
    const totalSets = ex.warmupSets + ex.workingSets
    if (completedCount < totalSets) {
      return `Next: Set ${completedCount + 1} of ${ex.name}`
    }
  }
  if (nextEx) return `Next: Set 1 of ${nextEx.name}`
  return 'Next: Complete workout'
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
    plateInput.value = ''
  }
)

function applyPlateWeight() {
  const w = computedWeightFromPlates.value
  if (w == null) return
  const r = suggestedReps.value || 8
  const rpe = suggestedRpe.value || 9
  logInput.value = `${w} ${r} ${rpe}`
}

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
      toast("Couldn't save set — try again?")
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
      toast("Couldn't skip — try again?")
    return
  }
  logInput.value = ''
  parseError.value = ''
  plateConfig.value = null
}

async function handleUnskip() {
  const ok = await workoutStore.unskipExercise()
  if (!ok) {
      toast("Couldn't go back — try again?")
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

const subContextMuscles = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  return getMusclesForExercise(ex.name)
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
    emitDebugEvent({ eventName: 'substitution_applied', exerciseSlot: ex.slotKey, meta: { from: ex.name, to: info.name } })
    toast(`Swapped to ${info.name}`)
    closeSubPicker()
  } else {
    toast("Couldn't swap exercise — try again?")
  }
}

async function handleAddExercise(info: ExerciseInfo) {
  const base = toSessionExercise(info, '')
  const setCountStr = prompt('How many working sets? (default 3)', '3')
  if (setCountStr !== null) {
    const n = parseInt(setCountStr, 10)
    if (Number.isInteger(n) && n >= 1 && n <= 10) {
      base.workingSets = n
    }
  }
  const ok = await workoutStore.addExercise(base)
  if (ok) {
    toast(`Added ${info.name}`)
    closeAddPicker()
  } else {
    toast("Couldn't add exercise — try again?")
  }
}

async function handleRemoveExercise() {
  const ex = currentExercise.value
  if (!ex) return
  if (!confirm(`Remove ${ex.name} from this workout?`)) return
  const ok = await workoutStore.removeExercise(ex.slotKey)
  if (!ok) {
    toast("Couldn't remove exercise — try again?")
  }
}

function openEditSet(set: SetLog) {
  if (!set.id) return
  editingSet.value = set
}

function closeEditModal() {
  editingSet.value = null
}

async function handleEditSave(weight: number, reps: number, rpe: number) {
  const set = editingSet.value
  if (!set?.id) return
  savingEdit.value = true
  try {
    const ok = await workoutStore.updateSetLog(set.id, weight, reps, rpe)
    if (ok) {
      toast(`Updated to ${weight}×${reps} @ RPE ${rpe}`)
      closeEditModal()
    } else {
      toast("Couldn't save edit — try again?")
    }
  } finally {
    savingEdit.value = false
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
      toast("Couldn't save template — try again?")
  }
}

async function handleComplete() {
  if (completing.value) return
  completing.value = true
  try {
    const ok = await workoutStore.completeWorkout()
    if (!ok) {
      toast("Couldn't save — try again?")
      return
    }
    toast(getCompleteWorkoutMessage())
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
      toast("Couldn't abandon — try again?")
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
      :session-id="workoutStore.activeSession?.id ?? 0"
      :next-exercise-hint="restTimerNextHint"
      @done="onRestTimerDone"
      @skip="onRestTimerDone"
    />
    <ExercisePicker
      v-if="showSubPicker && currentExercise"
      title="Substitute exercise"
      :quick-picks="subQuickPicks"
      :context-muscles="subContextMuscles"
      @select="handleSubSelect"
      @cancel="closeSubPicker"
    />
    <ExercisePicker
      v-if="showAddPicker"
      title="Add exercise"
      @select="handleAddExercise"
      @cancel="closeAddPicker"
    />
    <SetEditModal
      v-if="editingSet"
      :set="editingSet"
      :saving="savingEdit"
      @save="handleEditSave"
      @cancel="closeEditModal"
    />
    <div v-if="needsAddExercise" class="add-first">
      <RCard>
        <RText tag="h2">Add your first exercise</RText>
        <RText tag="p" class="add-hint">Your canvas awaits. Pick an exercise to get started.</RText>
        <RButton type="primary" @click="openAddPicker">+ Add Exercise</RButton>
        <RButton variant="secondary" :disabled="abandoning" @click="handleAbandon" class="abandon-free">
          Abandon
        </RButton>
      </RCard>
    </div>
    <div v-else-if="!currentExercise" class="done">
      <RCard>
        <RText tag="h2">All done!</RText>
        <RText tag="p" class="done-sub">Nice work.</RText>
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
              ← Previous
            </button>
            <RText tag="h2" class="exercise-name">{{ currentExercise.name }}</RText>
          </div>
          <div class="exercise-actions">
            <RButton type="primary" class="skip-btn" @click="handleSkip">Next</RButton>
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
          <RText tag="p" class="goal-weight">Goal: {{ strengthGoal.weight }} lb</RText>
          <RText
            v-if="goalProjection"
            tag="p"
            class="goal-eta"
          >
            At +{{ goalProjection.increment }} lb per session, about {{ goalProjection.sessions }} {{ goalProjection.sessions === 1 ? 'week' : 'weeks' }} to reach {{ goalProjection.goal }} lb
          </RText>
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
          {{ canLogSuggested || canLogFirstTime ? 'Or enter manually: ' : 'Enter: ' }}weight reps RPE (1–10 effort, e.g. 150 12 9)
        </RText>
        <div class="log-input-row">
          <RInput
            v-model="logInput"
            placeholder="150 12 9"
            :disabled="logging"
            class="log-input-field"
            @keyup.enter="handleSubmit"
          />
          <button
            v-if="logInput.trim()"
            type="button"
            class="clear-x-btn"
            aria-label="Clear input"
            @click="logInput = ''"
          >
            ×
          </button>
        </div>
        <RText v-if="parseError" tag="p" class="error">{{ parseError }}</RText>
        <div v-if="plateConfig && plateConfig.perSide.length > 0 && !suggestedPlateConfig" class="plate-math">
          <RText tag="p" class="plate-label">Plates per side</RText>
          <RText tag="p" class="plate-value">
            {{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}
          </RText>
        </div>
        <div v-else-if="plateConfig && plateConfig.perSide.length > 0" class="plate-math">
          <RText tag="p" class="plate-label">Plates per side (from your weight)</RText>
          <RText tag="p" class="plate-value">
            {{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}
          </RText>
        </div>
        <div v-if="isBarbell" class="plate-reverse">
          <RText tag="p" class="plate-label">Or from plates (e.g. 2 45 1 25 = count weight count weight)</RText>
          <div class="plate-reverse-row">
            <RInput
              v-model="plateInput"
              placeholder="2 45 1 25"
              :disabled="logging"
              class="plate-input"
            />
            <RButton
              v-if="computedWeightFromPlates != null"
              variant="secondary"
              :disabled="logging"
              @click="applyPlateWeight"
            >
              Use {{ computedWeightFromPlates }} lb
            </RButton>
          </div>
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
          <li
            v-for="(s, i) in completedSetsForExercise"
            :key="s.id ?? i"
            class="set-item-clickable"
          >
            <button
              type="button"
              class="set-edit-btn"
              @click="openEditSet(s)"
            >
              {{ s.weight }} × {{ s.reps }} @ RPE {{ s.rpe }}
              {{ s.isWarmup ? '(warm-up)' : '' }}
            </button>
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
  padding: var(--space-md) var(--space-lg);
  background: var(--r-color-fill-secondary);
  border-radius: 8px;
  font-size: 0.95rem;
  border: 1px solid var(--r-color-fill-tertiary);
}
.goal-weight {
  margin: 0 0 0.25rem 0;
  font-weight: 700;
  color: var(--r-color-primary);
}
.goal-eta {
  margin: 0;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
}
.plate-label {
  margin: 0 0 0.25rem 0;
  font-size: 0.85rem;
}
.plate-value {
  margin: 0;
  font-weight: 600;
}
.plate-reverse {
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  background: var(--r-color-fill-tertiary);
  border-radius: 4px;
}
.plate-reverse-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}
.plate-input {
  flex: 1;
  max-width: 160px;
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
.log-input-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.log-input-field {
  flex: 1;
}
.clear-x-btn {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--r-color-fill-secondary);
  border: 1px solid var(--r-color-stroke);
  border-radius: 6px;
  font-size: 1.25rem;
  font-family: inherit;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  line-height: 1;
}
.clear-x-btn:hover {
  background: var(--r-color-fill-tertiary);
  color: var(--r-color-text);
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
.set-item-clickable {
  list-style: none;
  margin-left: -1.25rem;
}
.set-edit-btn {
  display: block;
  width: 100%;
  padding: 0.25rem 0;
  text-align: left;
  background: none;
  border: none;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
}
.set-edit-btn:hover {
  color: var(--r-color-primary);
  background: var(--r-color-fill-secondary);
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
.done-sub {
  color: var(--r-color-text-secondary);
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
}
.done .back-btn,
.done .add-more-btn {
  margin-bottom: 0.5rem;
}
</style>
