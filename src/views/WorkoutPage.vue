<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutStore } from '../store/workout'
import { useProgramStore } from '../store/program'
import { useProgressionHistory } from '../composables/useProgressionHistory'
import { parseLogInput, ParseError } from '../lib/parseLogInput'
import { plateCalc } from '../lib/plateCalc'
import { suggest } from '../lib/progression'
import { getScheduleDay } from '../lib/scheduleDay'
import RestTimer from '../components/RestTimer.vue'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'

const router = useRouter()
const workoutStore = useWorkoutStore()
const programStore = useProgramStore()
const toast = useToast()

const logInput = ref('')
const parseError = ref('')
const plateConfig = ref<ReturnType<typeof plateCalc> | null>(null)
const logging = ref(false)
const showRestTimer = ref(false)
const restTimerSeconds = ref(0)
const restTimerKey = ref(0)
const gifLoaded = ref<boolean | undefined>(undefined)

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
    const dayInfo = getScheduleDay(new Date(session.date))
    if (dayInfo) {
      const exercises = programStore.getExercisesForDay(dayInfo.key)
      await workoutStore.resumeSession(exercises)
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

watch(
  () => currentExercise.value?.gifPath,
  () => {
    gifLoaded.value = undefined
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

async function handleSubmit() {
  try {
    const parsed = parseLogInput(logInput.value)
    const wasWorkingSet = !isWarmupSet.value
    const ex = currentExercise.value
    logging.value = true
    try {
      const ok = await workoutStore.logSet(parsed.weight, parsed.reps, parsed.rpe)
      if (!ok) {
        toast('Failed to save set')
        return
      }
      logInput.value = ''
      parseError.value = ''
      plateConfig.value = null
      if (wasWorkingSet && ex?.restSeconds?.[0]) {
        restTimerSeconds.value = ex.restSeconds[0]
        restTimerKey.value++
        showRestTimer.value = true
      }
    } finally {
      logging.value = false
    }
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

async function handleComplete() {
  const ok = await workoutStore.completeWorkout()
  if (!ok) {
    toast('Failed to save workout')
    return
  }
  toast('Workout saved!')
  router.push('/')
}

async function handleAbandon() {
  const ok = await workoutStore.abandonWorkout()
  if (!ok) {
    toast('Failed to abandon workout')
    return
  }
  router.push('/')
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
    <div v-if="!currentExercise" class="done">
      <RCard>
        <RText tag="h2">All done!</RText>
        <RButton type="primary" @click="handleComplete">Complete Workout</RButton>
        <RButton @click="handleAbandon">Abandon</RButton>
      </RCard>
    </div>

    <template v-else>
      <RCard class="exercise-card">
        <div class="exercise-header">
          <RText tag="h2" class="exercise-name">{{ currentExercise.name }}</RText>
          <RButton @click="handleSkip">Skip</RButton>
        </div>
        <RText tag="p" class="exercise-notes">{{ currentExercise.notes }}</RText>
        <RText tag="p" class="set-info">
          Set {{ currentSetNumber }} of
          {{ currentExercise.warmupSets + currentExercise.workingSets }}
          {{ isWarmupSet ? '(warm-up)' : '' }}
        </RText>

        <div v-if="suggestion" class="suggestion-block">
          <RText tag="p" class="suggestion-title">Suggested</RText>
          <RText tag="p" class="suggestion-note">{{ suggestion.note }}</RText>
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
      </RCard>

      <div v-if="currentExercise.gifPath && gifLoaded !== false" class="exercise-gif">
        <img
          :src="currentExercise.gifPath"
          :alt="currentExercise.name"
          @load="gifLoaded = true"
          @error="gifLoaded = false"
        />
      </div>

      <RCard class="log-card">
        <RText tag="p" class="log-hint">Enter: weight reps RPE (e.g. 150 12 9)</RText>
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
  gap: 1rem;
}
.exercise-card {
  padding: 1.5rem;
}
.exercise-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}
.exercise-name {
  font-size: 1.25rem;
  margin: 0 0 0.5rem 0;
  flex: 1;
}
.exercise-notes {
  color: var(--r-color-text-secondary, #666);
  font-size: 0.9rem;
  margin: 0 0 0.75rem 0;
}
.set-info {
  margin: 0 0 0.5rem 0;
  font-weight: 500;
}
.suggestion-block {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--r-color-fill-secondary, #f0f7ff);
  border-radius: 6px;
  border: 1px dashed var(--r-color-primary, #0066cc);
}
.suggestion-title {
  margin: 0 0 0.25rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--r-color-primary, #0066cc);
}
.suggestion-note {
  margin: 0 0 0.5rem 0;
  font-style: italic;
  color: var(--r-color-primary, #0066cc);
}
.plate-math {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: var(--r-color-fill-secondary, #f5f5f5);
  border-radius: 4px;
}
.plate-math.suggested {
  background: rgba(0, 102, 204, 0.08);
  margin-top: 0.5rem;
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
.log-card {
  padding: 1.5rem;
}
.log-hint {
  font-size: 0.85rem;
  margin: 0 0 0.5rem 0;
  color: var(--r-color-text-secondary, #666);
}
.error {
  color: var(--r-color-error, #c00);
  margin: 0.5rem 0 0 0;
  font-size: 0.9rem;
}
.up-next-card {
  padding: 1rem;
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
  padding: 1rem;
}
.history-card ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.25rem;
}
.history-card li {
  margin: 0.25rem 0;
}
.done {
  text-align: center;
  padding: 2rem;
}
</style>
