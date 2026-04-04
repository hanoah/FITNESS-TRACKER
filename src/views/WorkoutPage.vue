<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorkoutStore, isExerciseComplete } from '../store/workout'
import { useProgressionHistory } from '../composables/useProgressionHistory'
import { parseLogInput, ParseError, rebuildLogInput } from '../lib/parseLogInput'
import PlateCalculator from '../components/PlateCalculator.vue'
import { suggest } from '../lib/progression'
import { toSessionExercise } from '../lib/exerciseLibrary'
import { saveTemplate } from '../lib/templateLibrary'
import { getCompleteWorkoutMessage } from '../lib/delightCopy'
import { useUserProfile } from '../composables/useUserProfile'
import { getGoal } from '../lib/strengthGoals'
import { getMusclesForExercise } from '../lib/exerciseLibrary'

import { emitDebugEvent } from '../lib/debugEvents'
import ExercisePicker from '../components/ExercisePicker.vue'
import SetEditModal from '../components/SetEditModal.vue'
import ExerciseHistoryModal from '../components/ExerciseHistoryModal.vue'
import ExerciseSetsGroup from '../components/ExerciseSetsGroup.vue'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'
import type { ExerciseInfo } from '../lib/exerciseLibrary'
import type { SetLog } from '../types/session'

const router = useRouter()
const workoutStore = useWorkoutStore()
const { todayExercises } = storeToRefs(workoutStore)
const toast = useToast()

const logInput = ref('')
const parseError = ref('')
const logging = ref(false)
const setAdjusting = ref(false)
const showOverflowMenu = ref(false)
const showPlateModal = ref(false)
const editingSet = ref<SetLog | null>(null)
const savingEdit = ref(false)
const showHistory = ref(false)
const warmupOverride = ref<boolean | null>(null)
const statsExpanded = ref(false)

const { profile: userProfile } = useUserProfile()
const strengthGoal = computed(() => {
  const ex = currentExercise.value
  const profile = userProfile.value
  if (!ex || !profile?.weightKg) return null
  const bodyWeightLbs = profile.weightKg * 2.205
  const level = (profile.strengthLevel ?? 'intermediate') as 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'
  const goal = getGoal(ex.name, bodyWeightLbs, level)
  return goal != null ? { weight: goal, level } : null
})

function formatStrengthLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

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
const totalWorkoutSets = computed(() => workoutStore.totalWorkoutSets)
const currentExerciseSetNumber = computed(() => workoutStore.currentExerciseSetNumber)
const totalSetsForCurrentExercise = computed(() => workoutStore.totalSetsForCurrentExercise)
const isWarmupSet = computed(() => workoutStore.isWarmupSet)

/** When null, use store auto warm-up detection; otherwise user override (persists across sets until exercise changes). */
const effectiveIsWarmup = computed(() =>
  warmupOverride.value !== null ? warmupOverride.value : isWarmupSet.value
)

function toggleWarmup() {
  if (warmupOverride.value === null) {
    warmupOverride.value = !isWarmupSet.value
  } else {
    warmupOverride.value = !warmupOverride.value
  }
}

const { slotHistory: pastSlotHistory, exerciseHistory: pastExerciseHistory, bestWeight: historicalBestWeight } =
  useProgressionHistory(
    () => currentExercise.value?.slotKey,
    () => currentExercise.value?.name,
    () => workoutStore.activeSession?.id
  )

const completedSetsForExercise = computed(() => {
  const ex = currentExercise.value
  if (!ex) return []
  return workoutStore.completedSetsBySlot.get(ex.slotKey) ?? []
})

/** Max weight this session (working sets) for current exercise — combined with history for "Best" display. */
const sessionBestWeight = computed(() => {
  const w = completedSetsForExercise.value.filter((s) => !s.isWarmup).map((s) => s.weight)
  return w.length ? Math.max(...w) : 0
})

const overallBestWeight = computed(() =>
  Math.max(historicalBestWeight.value, sessionBestWeight.value)
)

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

const hasStatsData = computed(() =>
  suggestedWeight.value != null ||
  !!suggestion.value?.note ||
  !!suggestion.value?.lastDate ||
  overallBestWeight.value > 0 ||
  strengthGoal.value != null ||
  goalProjection.value != null
)

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

const upcomingExercises = computed(() => {
  const idx = workoutStore.activeSession?.currentExerciseIndex ?? 0
  return workoutStore.todayExercises.slice(idx + 1)
})

/** All exercises with completion stats for workout flow list. */
const workoutFlowItems = computed(() => {
  const exercises = todayExercises.value
  const currentIdx = workoutStore.activeSession?.currentExerciseIndex ?? 0
  const bySlot = workoutStore.completedSetsBySlot
  return exercises.map((ex, idx) => {
    const setsForEx = bySlot.get(ex.slotKey) ?? []
    const total = ex.warmupSets + ex.workingSets
    const done = setsForEx.length
    const isActive = idx === currentIdx
    const hasPR = setsForEx.some((s) => s.id != null && workoutStore.isPRSet(s.id))
    return {
      index: idx,
      name: ex.name,
      slotKey: ex.slotKey,
      completed: done,
      total,
      isActive,
      isComplete: isExerciseComplete(ex, setsForEx),
      hasPR,
      sets: setsForEx,
      exercise: ex,
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
  if (!currentExercise.value) return ''
  return `Set ${currentExerciseSetNumber.value} of ${totalSetsForCurrentExercise.value}`
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

function resetInputState() {
  logInput.value = ''
  parseError.value = ''
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

function onUsePlateWeight(weight: number) {
  const r = suggestedReps.value || 8
  const rpe = suggestedRpe.value || 9
  logInput.value = `${weight} ${r} ${rpe}`
  showPlateModal.value = false
}

watch(logInput, () => {
  parseError.value = ''
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

watch(
  () => currentExercise.value?.slotKey,
  () => {
    warmupOverride.value = null
    statsExpanded.value = false
  }
)

async function doLogSet(weight: number, reps: number, rpe: number) {
  const ex = currentExercise.value
  logging.value = true
  try {
    const result = await workoutStore.logSet(
      weight,
      reps,
      rpe,
      effectiveIsWarmup.value,
      historicalBestWeight.value
    )
    if (!result.ok) {
      toast("Couldn't save set — try again?")
      return
    }
    resetInputState()
    // Per-set override: reset so next set falls back to auto-detection
    warmupOverride.value = null
    const source = prefillSource.value
    if (source) {
      logInput.value = `${source.weight} ${source.reps} ${source.rpe}`
    }
    if (ex?.restSeconds?.[0]) {
      workoutStore.startRestTimer({
        seconds: ex.restSeconds[0],
        nextExerciseHint: restTimerNextHint.value,
        progressPercent: workoutProgress.value * 100,
        setLabel: restTimerSetLabel.value,
      })
    }
    if (result.isPR) {
      toast(`New PR — ${weight} lb!`)
    } else {
      toast(`${weight}×${reps} @ RPE ${rpe} logged`)
    }
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

async function handleAddSet() {
  const ex = currentExercise.value
  if (!ex) return
  setAdjusting.value = true
  try {
    const ok = await workoutStore.addSetToExercise(ex.slotKey)
    if (ok) toast('Set added')
    else toast("Couldn't add set")
  } finally {
    setAdjusting.value = false
  }
}

async function handleRemoveSet() {
  const ex = currentExercise.value
  if (!ex) return
  const completed = completedSetsForExercise.value.length
  const total = ex.warmupSets + ex.workingSets
  if (total <= completed) {
    toast("Can't remove — all sets logged or minimum reached.")
    return
  }
  if (completed > 0 && !confirm('Remove one planned set from the end?')) return
  setAdjusting.value = true
  try {
    const ok = await workoutStore.removeSetFromExercise(ex.slotKey)
    if (ok) toast('Set removed')
    else toast("Couldn't remove set")
  } finally {
    setAdjusting.value = false
  }
}

const deleting = ref(false)

async function handleDeleteSet(setId: number) {
  const set = workoutStore.completedSets.find((s) => s.id === setId)
  if (!set) return
  if (!confirm(`Delete ${set.weight} × ${set.reps} @ RPE ${set.rpe}?`)) return
  deleting.value = true
  try {
    const ok = await workoutStore.deleteSetLog(setId)
    if (!ok) toast("Couldn't delete set")
  } finally {
    deleting.value = false
  }
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
const ending = ref(false)
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
  const setCountStr = prompt('How many sets? (default 3)', '3')
  if (setCountStr !== null) {
    const n = parseInt(setCountStr, 10)
    if (Number.isInteger(n) && n >= 1 && n <= 10) {
      base.warmupSets = 0
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

async function handleEditSave(weight: number, reps: number, rpe: number, isWarmup: boolean) {
  const set = editingSet.value
  if (!set?.id) return
  savingEdit.value = true
  try {
    const ok = await workoutStore.updateSetLog(set.id, weight, reps, rpe, isWarmup)
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

async function handleEndWorkout() {
  if (!confirm('End this workout? Your logged sets will be saved.')) return
  if (ending.value) return
  ending.value = true
  try {
    const ok = await workoutStore.endWorkout()
    if (!ok) {
      toast("Couldn't end workout — try again?")
      return
    }
    router.push('/')
  } finally {
    ending.value = false
  }
}
</script>

<template>
  <div class="workout-page">
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
    <ExerciseHistoryModal
      v-if="showHistory && currentExercise"
      :exercise-name="currentExercise.name"
      @close="showHistory = false"
    />
    <div v-if="needsAddExercise" class="add-first">
      <RCard>
        <RText tag="h2">Add your first exercise</RText>
        <RText tag="p" class="add-hint">Your canvas awaits. Pick an exercise to get started.</RText>
        <RButton type="primary" @click="openAddPicker">+ Add Exercise</RButton>
        <RButton variant="secondary" :disabled="ending" @click="handleEndWorkout" class="abandon-free">
          End Workout
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
          <button type="button" class="done-link done-link-danger" :disabled="ending" @click="handleEndWorkout">End Workout</button>
        </div>
      </RCard>
    </div>

    <template v-else>
      <RCard class="active-card">
        <div class="info-header">
          <div class="info-header-left">
            <button v-if="canUnskip" type="button" class="back-link" @click="handleUnskip">← Previous</button>
            <button
              type="button"
              class="exercise-name-btn"
              :aria-label="`History for ${currentExercise.name}`"
              @click="showHistory = true"
            >
              <RText tag="span" class="exercise-name">{{ currentExercise.name }}</RText>
            </button>
          </div>
          <div class="overflow-wrapper">
            <RButton class="overflow-btn" variant="secondary" :disabled="ending" @click.stop="showOverflowMenu = !showOverflowMenu">⋯</RButton>
            <Transition name="dropdown">
              <div v-if="showOverflowMenu" class="overflow-menu">
                <button v-if="todayExercises.length > 0" type="button" class="overflow-item" @click="handleSaveAsTemplate(); closeOverflowMenu()">Save as Template</button>
                <button type="button" class="overflow-item" @click="openSubPicker(); closeOverflowMenu()">Substitute</button>
                <button type="button" class="overflow-item" @click="openAddPicker(); closeOverflowMenu()">Add Exercise</button>
                <button type="button" class="overflow-item" @click="handleAddSet(); closeOverflowMenu()">Add Set</button>
                <button type="button" class="overflow-item" @click="handleRemoveSet(); closeOverflowMenu()">Remove Set</button>
                <button type="button" class="overflow-item" @click="handleRemoveExercise(); closeOverflowMenu()">Remove</button>
                <button type="button" class="overflow-item" @click="handleEndWorkout(); closeOverflowMenu()">End Workout</button>
              </div>
            </Transition>
          </div>
        </div>

        <div class="set-progress-row">
          <span class="set-info">Set {{ currentExerciseSetNumber }} of {{ totalSetsForCurrentExercise }}{{ effectiveIsWarmup ? ' (warm-up)' : '' }}</span>
          <span class="progress-percent">{{ Math.round(workoutProgress * 100) }}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" :style="{ width: (workoutProgress * 100) + '%' }" />
        </div>
        <span class="overall-progress-label">{{ currentSetNumber - 1 }} of {{ totalWorkoutSets }} total</span>

        <div v-if="hasStatsData" class="stats-section">
          <button
            type="button"
            class="stats-toggle"
            :aria-expanded="statsExpanded"
            @click="statsExpanded = !statsExpanded"
          >
            <span class="stats-toggle-label">Stats</span>
            <span class="stats-toggle-arrow">{{ statsExpanded ? '▾' : '▸' }}</span>
          </button>
          <div v-show="statsExpanded" class="stats-body">
            <div class="stat-target" v-if="suggestedWeight">
              <span class="target-weight">{{ suggestedWeight }} × {{ suggestedReps }}</span>
              <span class="target-label">Suggested</span>
            </div>
            <div v-if="suggestion?.note" class="stat-note">{{ suggestion.note }}</div>
            <div v-if="suggestion?.lastDate" class="stat-note stat-last-session">
              Last: {{ suggestion.lastWeight }} × {{ suggestion.lastReps }}<template v-if="suggestion.lastRpe"> @ RPE {{ suggestion.lastRpe }}</template> · {{ suggestion.lastDate }}
            </div>
            <div class="stat-secondary-row">
              <span v-if="overallBestWeight > 0" class="stat-secondary stat-best">PR: {{ overallBestWeight }} lb</span>
              <span v-if="strengthGoal" class="stat-secondary"
                >Goal: {{ strengthGoal.weight }} lb / {{ formatStrengthLevel(strengthGoal.level) }}</span
              >
              <span v-else-if="!userProfile?.weightKg" class="stat-secondary stat-hint">Set weight in Settings for goals</span>
            </div>
            <div class="stat-secondary-row" v-if="goalProjection">
              <span class="stat-secondary goal-eta">~{{ goalProjection.sessions }} {{ goalProjection.sessions === 1 ? 'week' : 'weeks' }} to {{ goalProjection.goal }} lb</span>
            </div>
          </div>
        </div>

        <div class="divider" />

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
        <span class="log-hint">weight · reps · rpe</span>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">Weight</span>
          <div class="pill-row">
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustWeight(2.5)">+2.5</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustWeight(5)">+5</RButton>
          </div>
        </div>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">Reps</span>
          <div class="pill-row">
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(-2)">−2</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(-1)">−1</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(1)">+1</RButton>
            <RButton variant="secondary" class="pill-btn" :disabled="!canUseQuickAdjust || logging" @click="adjustReps(2)">+2</RButton>
          </div>
        </div>
        <div class="quick-adjust-row">
          <span class="quick-adjust-label">RPE</span>
          <div class="pill-row">
            <button v-for="r in [7, 8, 9, 10]" :key="r" type="button" class="rpe-pill" :class="{ active: parsedLogValues && Math.round(parsedLogValues.rpe) === r }" :disabled="!canUseQuickAdjust || logging" @click="setRpe(r)">{{ r }}</button>
          </div>
        </div>
        <RText v-if="parseError" tag="p" class="error">{{ parseError }}</RText>
        <button
          type="button"
          class="warmup-toggle"
          :aria-pressed="effectiveIsWarmup"
          aria-label="Mark this set as warm-up"
          @click="toggleWarmup"
        >
          <div class="warmup-toggle-text">
            <span class="warmup-toggle-title">Warm-up set</span>
            <span class="warmup-toggle-hint">Mark this set as warm-up</span>
          </div>
          <span class="toggle-track" :class="{ on: effectiveIsWarmup }" aria-hidden="true">
            <span class="toggle-knob" />
          </span>
        </button>
        <div class="card-actions" :class="{ 'card-actions--single': !isBarbell }">
          <button v-if="isBarbell" type="button" class="plate-math-trigger" @click="showPlateModal = true">Plate math</button>
          <RButton type="primary" class="log-set-cta" @click="handleSubmit" :disabled="!logInput.trim() || logging">Log set →</RButton>
        </div>
      </RCard>

      <PlateCalculator
        v-if="showPlateModal"
        :initial-weight="parsedLogValues?.weight"
        @use="onUsePlateWeight"
        @close="showPlateModal = false"
      />

      <!-- Grouped exercises with sets -->
      <div class="exercise-groups">
        <ExerciseSetsGroup
          v-for="item in workoutFlowItems"
          :key="item.slotKey"
          :index="item.index"
          :name="item.name"
          :slot-key="item.slotKey"
          :completed="item.completed"
          :total="item.total"
          :is-active="item.isActive"
          :is-complete="item.isComplete"
          :has-p-r="item.hasPR"
          :sets="item.sets"
          :exercise="item.exercise"
          :deleting="deleting"
          :is-p-r-set="workoutStore.isPRSet"
          @go-to="handleGoToExercise(item.index)"
          @edit-set="openEditSet"
          @delete-set="handleDeleteSet"
        />
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

/* Active card (merged header + log) */
.active-card {
  padding: var(--space-lg);
  position: relative;
  z-index: 10;
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
  font-size: 1.5rem;
  letter-spacing: -0.03em;
  line-height: 1.1;
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

.exercise-name-btn {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 0;
  margin: 0;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.exercise-name-btn:hover .exercise-name {
  text-decoration: underline;
}
.exercise-name-btn:focus-visible {
  outline: 2px solid var(--r-color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Collapsible stats */
.stats-section {
  margin-top: var(--space-xs);
}
.stats-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-xs) 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  text-align: left;
}
.stats-toggle:hover { color: var(--r-color-text); }
.stats-toggle-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.stats-toggle-arrow {
  font-size: 0.65rem;
  opacity: 0.6;
}
.stats-body {
  padding: var(--space-xs) 0 var(--space-sm);
}
.stat-target {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: 0.25rem;
}
.target-weight {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--r-color-primary);
}
.target-label {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stat-note {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  margin-bottom: 0.15rem;
}
.stat-last-session {
  font-size: 0.75rem;
  font-style: italic;
}
.stat-secondary-row {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
}
.stat-secondary {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
}
.stat-hint {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  font-style: italic;
}
.goal-eta {
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
}

/* Set progress */
.set-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin: var(--space-sm) 0 var(--space-xs);
  font-size: 0.75rem;
}
.set-info { font-weight: 600; flex: 1; min-width: 0; }
.progress-percent { color: var(--r-color-text-secondary); flex-shrink: 0; }
.overall-progress-label {
  display: block;
  font-size: 0.75rem;
  color: var(--r-color-text-secondary);
  margin-top: 2px;
}
.exercise-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 8px);
}
.stat-best {
  font-weight: 600;
  color: var(--r-color-primary);
}
.flow-pr {
  color: var(--r-color-warning, #d97706);
  font-size: 0.85rem;
  margin-left: 0.15rem;
}
.progress-bar-wrap {
  width: 100%;
  height: 3px;
  background: var(--r-color-fill-secondary);
  border-radius: 2px;
  overflow: hidden;
}
.warmup-toggle {
  display: flex;
  margin-top: var(--space-sm);
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-xs) var(--space-md);
  border-radius: 12px;
  border: 1px solid var(--r-color-stroke);
  background: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.warmup-toggle:hover {
  background: var(--r-color-surface-muted, #fafaf9);
}
.warmup-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.warmup-toggle-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--r-color-text);
}
.warmup-toggle-hint {
  font-size: 0.7rem;
  color: var(--r-color-text-secondary);
}
.toggle-track {
  flex-shrink: 0;
  width: 2.5rem;
  height: 1.375rem;
  border-radius: 999px;
  background: var(--r-color-fill-secondary, #d6d3d1);
  position: relative;
  transition: background 0.15s ease;
}
.toggle-track.on {
  background: var(--r-color-primary, #2d2a26);
}
.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease;
}
.toggle-track.on .toggle-knob {
  transform: translateX(1.125rem);
}

.progress-bar-fill {
  height: 100%;
  background: var(--r-color-primary);
  border-radius: 2px;
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

/* Divider */
.divider {
  height: 1px;
  background: var(--r-color-fill-secondary);
  margin: var(--space-sm) calc(var(--space-lg) * -1);
}

/* Log area */
.log-input-large :deep(.r-input__input) {
  font-size: 1.5rem;
  text-align: center;
  padding: var(--space-lg);
}
.log-hint {
  display: block;
  text-align: center;
  font-size: 0.7rem;
  color: var(--r-color-text-secondary);
  letter-spacing: 0.04em;
  margin-top: calc(var(--space-xs) * -1);
  margin-bottom: var(--space-xs);
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
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  flex-wrap: wrap;
}
.quick-adjust-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--r-color-text-secondary);
  min-width: 3rem;
}
.pill-row { display: flex; gap: var(--space-xs); flex-wrap: wrap; }
.pill-btn {
  min-width: 2.5rem;
  height: 1.875rem;
  padding: 0 0.5rem;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rpe-pill {
  min-width: 2.25rem;
  height: 1.875rem;
  padding: 0 0.5rem;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 0.85rem;
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
  font-size: 1.1rem;
}


/* Card actions grid */
.card-actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}
.card-actions--single {
  grid-template-columns: 1fr;
}
.plate-math-trigger {
  padding: var(--space-sm) var(--space-md);
  border-radius: 12px;
  border: 1px solid var(--r-color-stroke);
  background: none;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--r-color-text-secondary);
  cursor: pointer;
  transition: background 0.1s;
}
.plate-math-trigger:active {
  background: var(--r-color-fill-secondary);
}

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
