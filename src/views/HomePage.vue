<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutStore } from '../store/workout'
import { useProgramStore } from '../store/program'
import { RButton, RCard, RText, useToast } from 'roughness'

const router = useRouter()
const toast = useToast()
const workoutStore = useWorkoutStore()
const programStore = useProgramStore()
const loading = ref(true)
const resumable = ref(false)

const dayLabel = computed(() => {
  const d = new Date().getDay()
  if (d === 1) return 'Monday'
  if (d === 2) return 'Tuesday'
  if (d === 4) return 'Thursday'
  if (d === 6) return 'Saturday'
  return null
})

const dayKey = computed((): 'monday' | 'tuesday' | 'thursday' | 'saturday' | null => {
  const d = new Date().getDay()
  if (d === 1) return 'monday'
  if (d === 2) return 'tuesday'
  if (d === 4) return 'thursday'
  if (d === 6) return 'saturday'
  return null
})

onMounted(async () => {
  await programStore.loadProgramState()
  const session = await workoutStore.loadResumableSession()
  resumable.value = !!session
  loading.value = false
  if (!programStore.programState) {
    toast('Failed to load program')
  }
})

async function startWorkout() {
  const day = dayKey.value
  if (!day) return
  const exercises = programStore.getExercisesForDay(day)
  if (exercises.length === 0) return
  const state = programStore.programState
  if (!state) return
  const id = await workoutStore.startWorkout(
    exercises[0].dayType,
    exercises,
    state.blockId,
    state.weekNumber
  )
  if (id === null) {
    toast('Failed to start workout')
    return
  }
  router.push('/workout')
}

async function resumeWorkout() {
  const session = workoutStore.activeSession
  if (!session) return
  const date = new Date(session.date)
  const d = date.getDay()
  let day: 'monday' | 'tuesday' | 'thursday' | 'saturday' | null = null
  if (d === 1) day = 'monday'
  else if (d === 2) day = 'tuesday'
  else if (d === 4) day = 'thursday'
  else if (d === 6) day = 'saturday'
  if (!day) return
  const exercises = programStore.getExercisesForDay(day)
  await workoutStore.resumeSession(exercises)
  router.push('/workout')
}
</script>

<template>
  <div class="home">
    <RCard v-if="loading">
      <RText>Loading...</RText>
    </RCard>

    <template v-else>
      <RCard class="welcome-card">
        <RText tag="h2" class="welcome-title">
          {{ dayLabel ? `Today is ${dayLabel}` : "No workout scheduled today" }}
        </RText>
        <RText v-if="dayLabel" class="welcome-sub">
          {{ programStore.getExercisesForDay(dayKey!).length }} exercises
        </RText>
      </RCard>

      <div v-if="dayLabel" class="actions">
        <RButton v-if="resumable" type="primary" @click="resumeWorkout">
          Resume Workout
        </RButton>
        <RButton v-else type="primary" @click="startWorkout">
          Start Workout
        </RButton>
      </div>

      <RCard v-if="programStore.programState" class="block-info">
        <RText tag="p">
          Block: {{ programStore.programState?.blockId }} · Week {{ programStore.programState?.weekNumber }}
        </RText>
      </RCard>
    </template>
  </div>
</template>

<style scoped>
.home {
  max-width: 400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.welcome-card {
  padding: 1.5rem;
}
.welcome-title {
  font-size: 1.25rem;
  margin: 0 0 0.5rem 0;
}
.welcome-sub {
  color: var(--r-color-text-secondary, #666);
  margin: 0;
}
.actions {
  display: flex;
  gap: 0.75rem;
}
.block-info {
  padding: 1rem;
}
</style>
