<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutStore } from '../store/workout'
import TemplatePicker from '../components/TemplatePicker.vue'
import type { SessionExercise } from '../types/session'
import { RButton, RCard, RText, useToast } from 'roughness'

const router = useRouter()
const toast = useToast()
const workoutStore = useWorkoutStore()
const loading = ref(true)
const starting = ref(false)
const resumable = ref(false)
const showTemplatePicker = ref(false)

onMounted(async () => {
  const session = await workoutStore.loadResumableSession()
  resumable.value = !!session
  loading.value = false
})

async function startFromTemplate(exercises: SessionExercise[]) {
  if (exercises.length === 0) return
  if (starting.value) return
  starting.value = true
  try {
    const dayType = exercises[0].dayType
    const id = await workoutStore.startWorkout(dayType, exercises)
    if (id === null) {
      toast('Failed to start workout')
      return
    }
    showTemplatePicker.value = false
    router.push('/workout')
  } finally {
    starting.value = false
  }
}

async function startFreeWorkout() {
  if (starting.value) return
  starting.value = true
  try {
    const id = await workoutStore.startFreeWorkout()
    if (id === null) {
      toast('Failed to start workout')
      return
    }
    router.push('/workout')
  } finally {
    starting.value = false
  }
}

async function resumeWorkout() {
  if (starting.value) return
  const session = workoutStore.activeSession
  if (!session) {
    toast('No session to resume')
    return
  }
  starting.value = true
  try {
    const result = await workoutStore.resumeSession()
    if (!result.ok) {
      toast(result.error)
      return
    }
    router.push('/workout')
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <div class="home">
    <RCard v-if="loading">
      <RText>Loading...</RText>
    </RCard>

    <template v-else>
      <div v-if="resumable" class="resume-banner">
        <RButton type="primary" class="resume-btn" :disabled="starting" @click="resumeWorkout">
          {{ starting ? 'Loading…' : 'Resume Workout' }}
        </RButton>
      </div>

      <RCard class="welcome-card">
        <RText tag="h2" class="welcome-title">Ready to train?</RText>
        <RText class="welcome-sub">Add exercises as you go. Track sets, weight, and RPE.</RText>
      </RCard>

      <RCard class="free-workout-card">
        <RButton type="primary" class="free-workout-btn" :disabled="starting" @click="startFreeWorkout">
          {{ starting ? 'Starting…' : 'Start Workout' }}
        </RButton>
        <RButton
          class="from-template-btn"
          :disabled="starting"
          @click="showTemplatePicker = true"
        >
          From Template
        </RButton>
      </RCard>

      <TemplatePicker
        v-if="showTemplatePicker"
        @select="startFromTemplate"
        @cancel="showTemplatePicker = false"
      />
    </template>
  </div>
</template>

<style scoped>
.home {
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.resume-banner {
  margin-bottom: var(--space-xs);
}
.resume-btn {
  width: 100%;
  padding: var(--space-lg) var(--space-xl);
  font-size: 1.1rem;
  font-weight: 600;
}
.welcome-card {
  padding: var(--space-xl);
}
.welcome-title {
  font-size: 1.25rem;
  margin: 0 0 var(--space-sm) 0;
}
.welcome-sub {
  color: var(--r-color-text-secondary);
  margin: 0;
  font-size: 0.9rem;
}
.free-workout-card {
  padding: var(--space-xl);
}
.free-workout-btn {
  width: 100%;
}
.from-template-btn {
  width: 100%;
  margin-top: var(--space-md);
}
</style>
