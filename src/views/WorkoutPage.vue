<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorkoutStore } from '../store/workout'
import { useProgressionHistory } from '../composables/useProgressionHistory'
import { parseLogInput, ParseError, rebuildLogInput } from '../lib/parseLogInput'
import { plateCalc, platesToTotal } from '../lib/plateCalc'
import { suggest } from '../lib/progression'
import { toSessionExercise } from '../lib/exerciseLibrary'
import { saveTemplate } from '../lib/templateLibrary'
import { getCompleteWorkoutMessage } from '../lib/delightCopy'
import { useUserProfile } from '../composables/useUserProfile'
import { getGoal } from '../lib/strengthGoals'
import { getMusclesForExercise } from '../lib/exerciseLibrary'
import { getExerciseImage } from '../lib/exerciseImageCache'
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
const exerciseDbImageUrl = ref<string | null>(null)
const exerciseImageLoading = ref(false)
const includeBar = ref(true)
const showOverflowMenu = ref(false)
const showDemo = ref(false)
const showPlateCalc = ref(false)
const showFlowList = ref(false)
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
  const rawIncrement = suggested > 0 ? suggested - s.lastWeight : 2.5
  const increment = Math.ceil(rawIncrement / 2.5) * 2.5
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

const plateInput = ref('')

const lastCompletedSetForPreload = computed(() => {
  const sets = completedSetsForExercise.value
  if (sets.length === 0) return null
  return sets[sets.length - 1]
})

/** Pre-fill source: this session last set → prior slot history → prior exercise history → suggestion with weight → suggestion reps/rpe only. */
const prefillSource = computed(() => {
  const last = lastCompletedSetForPreload.value
  if (last && last.weight > 0) return { weight: last.weight, reps: last.reps, rpe: last.rpe }
  const slotHist = pastSlotHistory.value
  if (slotHist.length > 0) {
    const s = slotHist[0]
    if (s.weight > 0) return { weight: s.weight, reps: s.reps, rpe: s.rpe }
  }
  const exHist = pastExerciseHistory.value
  if (exHist.length > 0) {
    const s = exHist[0]
    if (s.weight > 0) return { weight: s.weight, reps: s.reps, rpe: s.rpe }
  }
  const s = suggestion.value
  if (s?.weight != null && s.weight > 0)
    return { weight: s.weight, reps: s.reps ?? 8, rpe: s.rpe ?? 9 }
  return null
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
    return platesToTotal(perSide, includeBar.value ? 45 : 0)
  } catch {
    return null
  }
})

const upcomingExercises = computed(() => {
  const idx = workoutStore.activeSession?.currentExerciseIndex ?? 0
  return workoutStore.todayExercises.slice(idx + 1)
})

/** All exercises with completion stats for workout flow list. */
const workoutFlowItems = computed(() => {
  const exercises = todayExercises.value
  const currentIdx = workoutStore.activeSession?.currentExerciseIndex ?? 0
  const completed = workoutStore.completedSets
  return exercises.map((ex, idx) => {
    const setsForEx = completed.filter((s) => s.exerciseSlot === ex.slotKey)
    const total = ex.warmupSets + ex.workingSets
    const done = setsForEx.length
    const workingDone = setsForEx.filter((s) => !s.isWarmup).length
    const isComplete = workingDone >= ex.workingSets
    const isActive = idx === currentIdx
    return {
      index: idx,
      name: ex.name,
      slotKey: ex.slotKey,
      completed: done,
      total,
      isActive,
      isComplete,
    }
  })
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

const workoutProgress = computed(() => workoutStore.workoutProgress)

const restTimerSetLabel = computed(() => {
  const ex = currentExercise.value
  if (!ex) return ''
  const n = currentSetNumber.value
  const total = ex.warmupSets + ex.workingSets
  return `Set ${n} of ${total}`
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
  () => [currentExercise.value?.slotKey, currentExercise.value?.imagePath, currentExercise.value?.exerciseDbId, currentExercise.value?.imageUrl] as const,
  async ([slotKey, imagePath, exerciseDbId, imageUrl]) => {
    if (exerciseDbImageUrl.value) {
      URL.revokeObjectURL(exerciseDbImageUrl.value)
      exerciseDbImageUrl.value = null
    }
    if (exerciseDbId && !imagePath && imageUrl) {
      exerciseImageLoading.value = true
      const url = await getExerciseImage(exerciseDbId, imageUrl)
      exerciseImageLoading.value = false
      if (currentExercise.value?.slotKey === slotKey) {
        if (url) {
          exerciseDbImageUrl.value = url
        }
      } else if (url) {
        URL.revokeObjectURL(url)
      }
    } else {
      exerciseDbImageUrl.value = null
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (exerciseDbImageUrl.value) {
    URL.revokeObjectURL(exerciseDbImageUrl.value)
    exerciseDbImageUrl.value = null
  }
})

function resetInputState() {
  logInput.value = ''
  parseError.value = ''
  plateConfig.value = null
  plateInput.value = ''
}

watch(
  () => currentExercise.value?.slotKey,
  () => {
    resetInputState()
  }
)

function adjustWeight(delta: number) {
  logInput.value = rebuildLogInput(logInput.value, 'weight', delta, 'add')
}

function adjustReps(delta: number) {
  logInput.value = rebuildLogInput(logInput.value, 'reps', delta, 'add')
}

function setRpe(rpe: number) {
  logInput.value = rebuildLogInput(logInput.value, 'rpe', rpe, 'set')
}

const canUseQuickAdjust = computed(() => Boolean(logInput.value.trim()))

/** Parsed values from logInput for RPE pill active state. Null if unparseable. */
const parsedLogValues = computed(() => {
  try {
    return parseLogInput(logInput.value)
  } catch {
    return null
  }
})

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

/** Pre-fill from prefillSource when exercise changes or source updates. Don't overwrite user input. */
watch(
  [() => currentExercise.value?.slotKey, prefillSource],
  ([, source]) => {
    if (!source || logInput.value.trim()) return
    logInput.value = `${source.weight} ${source.reps} ${source.rpe}`
  },
  { immediate: true }
)

async function doLogSet(weight: number, reps: number, rpe: number) {
  const ex = currentExercise.value
  logging.value = true
  try {
    const ok = await workoutStore.logSet(weight, reps, rpe)
    if (!ok) {
      toast("Couldn't save set — try again?")
      return
    }
    resetInputState()
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

async function handleSubmit() {
  const trimmed = logInput.value.trim()
  if (!trimmed) return
  try {
    const parsed = parseLogInput(trimmed)
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
  resetInputState()
}

async function handleUnskip() {
  const ok = await workoutStore.unskipExercise()
  if (!ok) {
      toast("Couldn't go back — try again?")
    return
  }
  resetInputState()
}

async function handleGoToExercise(index: number) {
  const fromIdx = workoutStore.activeSession?.currentExerciseIndex ?? -1
  if (index === fromIdx) return
  const ok = await workoutStore.goToExercise(index)
  if (!ok) {
    toast("Couldn't switch — try again?")
    return
  }
  resetInputState()
  emitDebugEvent({ eventName: 'exercise_jumped', meta: { fromIndex: fromIdx, toIndex: index } })
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
      :progress-percent="workoutProgress * 100"
      :set-label="restTimerSetLabel"
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
        <RButton type="primary" :disabled="completing" @click="handleComplete">
          {{ completing ? 'Saving…' : 'Complete Workout' }}
        </RButton>
        <div class="done-secondary">
          <button v-if="canUnskip" type="button" class="done-link" @click="handleUnskip">← Back</button>
          <button v-if="workoutStore.activeSession?.dayType === 'free'" type="button" class="done-link" @click="openAddPicker">+ Add more</button>
          <button type="button" class="done-link done-link-danger" :disabled="abandoning" @click="handleAbandon">Abandon</button>
        </div>
      </RCard>
    </div>

    <template v-else>
      <!-- Header: Exercise name + navigation + overflow -->
      <RCard class="header-card">
        <div class="info-header">
          <div class="info-header-left">
            <button v-if="canUnskip" type="button" class="back-link" @click="handleUnskip">← Previous</button>
            <RText tag="h2" class="exercise-name">{{ currentExercise.name }}</RText>
          </div>
          <div class="overflow-wrapper">
            <RButton class="overflow-btn" variant="secondary" :disabled="abandoning" @click.stop="showOverflowMenu = !showOverflowMenu">⋯</RButton>
            <Transition name="dropdown">
              <div v-if="showOverflowMenu" class="overflow-menu">
                <button v-if="todayExercises.length > 0" type="button" class="overflow-item" @click="handleSaveAsTemplate(); closeOverflowMenu()">Save as Template</button>
                <button type="button" class="overflow-item" @click="openSubPicker(); closeOverflowMenu()">Substitute</button>
                <button type="button" class="overflow-item" @click="openAddPicker(); closeOverflowMenu()">Add Exercise</button>
                <button type="button" class="overflow-item" @click="handleRemoveExercise(); closeOverflowMenu()">Remove</button>
                <button type="button" class="overflow-item" @click="handleAbandon(); closeOverflowMenu()">End Workout</button>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Inline stats: Target hero, Last + Goal secondary -->
        <div class="inline-stats">
          <div class="stat-target" v-if="suggestedWeight">
            <span class="target-weight">{{ suggestedWeight }} × {{ suggestedReps }}</span>
            <span class="target-label">target</span>
          </div>
          <div class="stat-secondary-row">
            <span v-if="suggestion?.lastWeight" class="stat-secondary">Last: {{ suggestion.lastWeight }} × {{ suggestion.lastReps }} @ RPE {{ suggestion.lastRpe }}</span>
            <span v-if="strengthGoal" class="stat-secondary">Goal: {{ strengthGoal.weight }} lb</span>
            <span v-else-if="!userProfile?.weightKg" class="stat-secondary stat-hint">Set weight in Settings for goals</span>
          </div>
          <div class="stat-secondary-row" v-if="goalProjection">
            <span class="stat-secondary goal-eta">~{{ goalProjection.sessions }} {{ goalProjection.sessions === 1 ? 'week' : 'weeks' }} to {{ goalProjection.goal }} lb</span>
          </div>
        </div>

        <!-- Set progress -->
        <div class="set-progress-row">
          <span class="set-info">Set {{ currentSetNumber }} of {{ currentExercise.warmupSets + currentExercise.workingSets }}{{ isWarmupSet ? ' (warm-up)' : '' }}</span>
          <span class="progress-percent">{{ Math.round(workoutProgress * 100) }}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" :style="{ width: (workoutProgress * 100) + '%' }" />
        </div>
      </RCard>

      <!-- Log input (always visible, no card wrapper needed but keeping for roughness style) -->
      <RCard class="log-card">
        <div class="log-input-row">
          <RInput
            v-model="logInput"
            placeholder="135 9 8"
            :disabled="logging"
            class="log-input-field log-input-large"
            @keyup.enter="handleSubmit"
          />
          <button v-if="logInput.trim()" type="button" class="clear-x-btn" aria-label="Clear input" @click="logInput = ''">×</button>
        </div>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">Weight:</span>
          <div class="pill-row">
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustWeight(2.5)">+2.5</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustWeight(5)">+5</RButton>
          </div>
        </div>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">Reps:</span>
          <div class="pill-row">
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(-2)">−2</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(-1)">−1</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(1)">+1</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(2)">+2</RButton>
          </div>
        </div>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">RPE:</span>
          <div class="pill-row">
            <button v-for="r in [7, 8, 9, 10]" :key="r" type="button" class="rpe-pill" :class="{ active: parsedLogValues && Math.round(parsedLogValues.rpe) === r }" :disabled="!canUseQuickAdjust || logging" @click="setRpe(r)">{{ r }}</button>
          </div>
        </div>
        <RText v-if="parseError" tag="p" class="error">{{ parseError }}</RText>
        <RButton type="primary" class="log-set-cta" @click="handleSubmit" :disabled="!logInput.trim() || logging">Log set →</RButton>
      </RCard>

      <!-- Collapsible: Workout flow summary -->
      <div class="collapsible-section">
        <button type="button" class="collapsible-toggle" @click="showFlowList = !showFlowList">
          <span>Exercise {{ (workoutStore.activeSession?.currentExerciseIndex ?? 0) + 1 }} of {{ todayExercises.length }}</span>
          <span class="toggle-arrow">{{ showFlowList ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showFlowList" class="collapsible-body">
          <ul class="workout-flow-list">
            <li v-for="item in workoutFlowItems" :key="item.slotKey" class="workout-flow-row" :class="{ active: item.isActive, complete: item.isComplete }">
              <button type="button" class="workout-flow-btn" @click="handleGoToExercise(item.index)">
                <span class="flow-icon">
                  <template v-if="item.isComplete">✓</template>
                  <template v-else-if="item.isActive">▶</template>
                  <template v-else>○</template>
                </span>
                <span class="flow-index">{{ item.index + 1 }}.</span>
                <span class="flow-name">{{ item.name }}</span>
                <span class="flow-sets">{{ item.completed }}/{{ item.total }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Collapsible: Logged sets -->
      <div v-if="completedSetsForExercise.length > 0" class="collapsible-section">
        <div class="logged-sets-compact">
          <span class="logged-label">{{ completedSetsForExercise.length }} set{{ completedSetsForExercise.length > 1 ? 's' : '' }} logged</span>
        </div>
        <ul class="logged-sets-list">
          <li v-for="(s, i) in completedSetsForExercise" :key="s.id ?? i" class="set-item-clickable">
            <button type="button" class="set-edit-btn" @click="openEditSet(s)">
              {{ s.weight }} × {{ s.reps }} @ RPE {{ s.rpe }}{{ s.isWarmup ? ' (warm-up)' : '' }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Collapsible: Plate calculator -->
      <div v-if="isBarbell" class="collapsible-section">
        <button type="button" class="collapsible-toggle" @click="showPlateCalc = !showPlateCalc">
          <span>Plate math</span>
          <span v-if="plateConfig && plateConfig.perSide.length > 0 && !showPlateCalc" class="toggle-preview">{{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}</span>
          <span class="toggle-arrow">{{ showPlateCalc ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showPlateCalc" class="collapsible-body">
          <div v-if="plateConfig && plateConfig.perSide.length > 0" class="plate-math">
            <RText tag="p" class="plate-label">Plates per side</RText>
            <RText tag="p" class="plate-value">{{ plateConfig.perSide.map((p) => `${p.count}×${p.weight}`).join(' + ') }}</RText>
          </div>
          <div class="plate-reverse">
            <label class="bar-toggle">
              <input type="checkbox" v-model="includeBar" />
              <span>Include 45 lb bar</span>
            </label>
            <div class="plate-reverse-row">
              <RInput v-model="plateInput" placeholder="2 45 1 25" :disabled="logging" class="plate-input" />
              <RButton v-if="computedWeightFromPlates != null" variant="secondary" :disabled="logging" @click="applyPlateWeight">Use {{ computedWeightFromPlates }} lb</RButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Collapsible: Demo -->
      <div class="collapsible-section">
        <button type="button" class="collapsible-toggle" @click="showDemo = !showDemo">
          <span>Demo</span>
          <span class="toggle-arrow">{{ showDemo ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showDemo" class="collapsible-body">
          <div class="exercise-gif">
            <img v-if="currentExercise.imagePath && gifLoaded !== false" :src="currentExercise.imagePath" :alt="currentExercise.name" @load="gifLoaded = true" @error="gifLoaded = false" />
            <img v-else-if="exerciseDbImageUrl && !exerciseImageLoading" :src="exerciseDbImageUrl" :alt="currentExercise.name" />
            <div v-else-if="exerciseImageLoading" class="exercise-gif-placeholder">
              <span class="placeholder-icon">⏳</span>
              <RText tag="p">Loading…</RText>
            </div>
            <div v-else-if="currentExercise.bodyPart || currentExercise.equipment" class="exercise-metadata-card">
              <RText tag="p" class="metadata-row"><span v-if="currentExercise.bodyPart" class="metadata-label">Body part:</span> {{ currentExercise.bodyPart }}</RText>
              <RText tag="p" class="metadata-row"><span v-if="currentExercise.equipment" class="metadata-label">Equipment:</span> {{ currentExercise.equipment }}</RText>
            </div>
            <div v-else class="exercise-gif-placeholder">
              <span class="placeholder-icon">🏋️</span>
              <RText tag="p">No demo available</RText>
            </div>
          </div>
        </div>
      </div>

      <!-- Skip / Next button at bottom -->
      <div class="bottom-actions">
        <RButton type="primary" class="skip-btn" @click="handleSkip">Next →</RButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.workout-page {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* Header card */
.header-card {
  padding: var(--space-lg);
  position: relative;
  z-index: 10;
}
.log-card {
  padding: var(--space-lg);
}
.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-lg);
}
.info-header-left {
  flex: 1;
  min-width: 0;
}
.exercise-name {
  font-size: 1.25rem;
  margin: 0;
  overflow-wrap: break-word;
}
.back-link {
  display: block;
  margin-bottom: var(--space-xs);
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--r-color-text-secondary);
  cursor: pointer;
}
.back-link:hover { text-decoration: underline; }

/* Inline stats */
.inline-stats {
  margin: var(--space-md) 0 var(--space-sm);
}
.stat-target {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: 0.25rem;
}
.target-weight {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--r-color-primary);
}
.target-label {
  font-size: 0.8rem;
  color: var(--r-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stat-secondary-row {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
}
.stat-secondary {
  font-size: 0.8rem;
  color: var(--r-color-text-secondary);
}
.stat-hint {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  font-style: italic;
}
.goal-eta {
  font-size: 0.8rem;
  color: var(--r-color-text-secondary);
}

/* Set progress */
.set-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: var(--space-sm) 0 var(--space-xs);
  font-size: 0.85rem;
}
.set-info { font-weight: 600; }
.progress-percent { color: var(--r-color-text-secondary); }
.progress-bar-wrap {
  width: 100%;
  height: 5px;
  background: var(--r-color-fill-secondary);
  border-radius: 3px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--r-color-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* Overflow menu */
.overflow-wrapper { position: relative; }
.overflow-btn { min-width: 2.5rem; padding: 0.35rem 0.5rem; }
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
  box-shadow: 0 4px 12px rgba(45, 42, 38, 0.1);
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
.overflow-item:hover { background: var(--r-color-fill-tertiary); }
.dropdown-enter-active,
.dropdown-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-enter-from,
.dropdown-leave-to { opacity: 0; transform: translateY(-4px); }

/* Log card */
.log-input-large :deep(.r-input__input) {
  font-size: 1.5rem;
  text-align: center;
  padding: var(--space-lg);
}
.log-input-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.log-input-field { flex: 1; }
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
.clear-x-btn:hover { background: var(--r-color-fill-tertiary); color: var(--r-color-text); }
.quick-adjust-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-md);
  flex-wrap: wrap;
}
.quick-adjust-label {
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
  min-width: 3.5rem;
}
.pill-row { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
.pill-btn { min-width: 2.5rem; padding: 0.35rem 0.6rem; }
.rpe-pill {
  min-width: 2.25rem;
  padding: 0.35rem 0.5rem;
  font-family: inherit;
  font-size: 0.9rem;
  border: 2px solid var(--r-color-stroke);
  background: var(--r-color-fill-secondary);
  border-radius: 8px;
  cursor: pointer;
  color: var(--r-color-text);
  transition: background 0.15s, border-color 0.15s;
}
.rpe-pill:hover:not(:disabled) { background: var(--r-color-fill-tertiary); }
.rpe-pill.active { background: var(--r-color-primary); border-color: var(--r-color-primary); color: white; }
.rpe-pill:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--r-color-error); margin: 0.5rem 0 0 0; font-size: 0.9rem; }
.log-set-cta {
  width: 100%;
  margin-top: var(--space-lg);
  padding: var(--space-lg) var(--space-xl);
  font-size: 1.1rem;
}

/* Collapsible sections */
.collapsible-section {
  padding: 0 var(--space-lg);
}
.collapsible-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-md) 0;
  background: none;
  border: none;
  border-bottom: 1px solid var(--r-color-fill-secondary);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--r-color-text);
  cursor: pointer;
  gap: var(--space-sm);
}
.collapsible-toggle:hover { color: var(--r-color-primary); }
.toggle-arrow {
  flex-shrink: 0;
  color: var(--r-color-text-secondary);
  font-size: 0.8rem;
}
.toggle-preview {
  flex: 1;
  text-align: right;
  font-weight: 400;
  font-size: 0.8rem;
  color: var(--r-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collapsible-body {
  padding: var(--space-md) 0;
}

/* Logged sets compact */
.logged-sets-compact {
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--r-color-fill-secondary);
}
.logged-label {
  font-size: 0.85rem;
  font-weight: 600;
}
.logged-sets-list {
  margin: 0;
  padding: var(--space-xs) 0 0 0;
  list-style: none;
}
.set-item-clickable { list-style: none; }
.set-edit-btn {
  display: block;
  width: 100%;
  padding: 0.25rem 0;
  text-align: left;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  border-radius: 4px;
}
.set-edit-btn:hover { color: var(--r-color-primary); background: var(--r-color-fill-secondary); }

/* Plate math */
.plate-math {
  margin-bottom: var(--space-sm);
}
.plate-label { margin: 0 0 0.25rem 0; font-size: 0.85rem; }
.plate-value { margin: 0; font-weight: 600; }
.plate-reverse-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}
.plate-input { flex: 1; max-width: 160px; }
.bar-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
  margin: 0 0 var(--space-sm);
  cursor: pointer;
}
.bar-toggle input[type="checkbox"] { accent-color: var(--r-color-primary); }

/* Demo */
.exercise-gif { text-align: center; min-height: 120px; }
.exercise-gif img { max-width: 100%; max-height: 240px; object-fit: contain; }
.exercise-gif-placeholder {
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  background: var(--r-color-fill-secondary);
  border-radius: 8px;
  color: var(--r-color-text-secondary);
}
.placeholder-icon { font-size: 1.5rem; margin-bottom: 0.25rem; }
.exercise-gif-placeholder p { margin: 0; font-size: 0.85rem; }
.exercise-metadata-card {
  padding: var(--space-md);
  background: var(--r-color-fill-secondary);
  border-radius: 8px;
  text-align: left;
}
.metadata-row { margin: 0 0 var(--space-xs) 0; font-size: 0.85rem; color: var(--r-color-text-secondary); }
.metadata-row:last-child { margin-bottom: 0; }
.metadata-label { font-weight: 600; color: var(--r-color-text); margin-right: 0.25rem; }

/* Workout flow list */
.workout-flow-list { margin: 0; padding: 0; list-style: none; }
.workout-flow-row { border-bottom: 1px solid var(--r-color-fill-secondary); }
.workout-flow-row:last-child { border-bottom: none; }
.workout-flow-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm) 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  color: var(--r-color-text);
}
.workout-flow-btn:hover { background: var(--r-color-fill-secondary); }
.workout-flow-row.active .workout-flow-btn { font-weight: 600; color: var(--r-color-primary); }
.workout-flow-row.complete .workout-flow-btn { color: var(--r-color-text-secondary); }
.workout-flow-row.complete .flow-icon { color: var(--r-color-success); }
.flow-icon { flex-shrink: 0; width: 1.25rem; font-size: 0.85rem; }
.flow-index { flex-shrink: 0; color: var(--r-color-text-secondary); }
.flow-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-sets { flex-shrink: 0; font-size: 0.8rem; color: var(--r-color-text-secondary); }

/* Bottom actions */
.bottom-actions {
  padding: 0 var(--space-lg);
}
.skip-btn { width: 100%; }

/* Empty / Done states */
.add-first { text-align: center; padding: 2rem; }
.add-first h2 { margin: 0 0 0.5rem 0; }
.add-hint { color: var(--r-color-text-secondary); margin: 0 0 1rem 0; }
.add-first .abandon-free { margin-top: 0.5rem; }
.done { text-align: center; padding: 2rem; }
.done-sub { color: var(--r-color-text-secondary); margin: 0 0 1rem 0; font-size: 0.95rem; }
.done-secondary {
  display: flex;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-md);
}
.done-link {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  padding: 0;
}
.done-link:hover { color: var(--r-color-primary); text-decoration: underline; }
.done-link-danger:hover { color: var(--r-color-error); }
.done-link:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
