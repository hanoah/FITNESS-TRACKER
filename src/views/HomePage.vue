<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutStore } from '../store/workout'
import { detectCaps } from '../composables/useTimerBackground'
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
const showNotifBanner = ref(false)

const NOTIF_ASKED_KEY = 'notif-permission-asked'

onMounted(async () => {
  const session = await workoutStore.loadResumableSession()
  resumable.value = !!session
  loading.value = false
})

async function requestNotifPermission() {
  showNotifBanner.value = false
  try {
    localStorage.setItem(NOTIF_ASKED_KEY, '1')
  } catch { /* storage disabled */ }
  if (detectCaps().notification) {
    await Notification.requestPermission()
  }
}

function dismissNotifBanner() {
  showNotifBanner.value = false
  try {
    localStorage.setItem(NOTIF_ASKED_KEY, '1')
  } catch { /* storage disabled */ }
}

function shouldAskNotifPermission(): boolean {
  const caps = detectCaps()
  if (!caps.notification) return false
  if (Notification.permission !== 'default') return false
  try {
    if (localStorage.getItem(NOTIF_ASKED_KEY)) return false
  } catch { /* storage disabled, ask anyway */ }
  return true
}

async function onWorkoutStart(navigateFn: () => Promise<unknown>) {
  if (shouldAskNotifPermission()) {
    showNotifBanner.value = true
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!showNotifBanner.value) { clearInterval(check); resolve() }
      }, 100)
      setTimeout(() => { showNotifBanner.value = false; clearInterval(check); resolve() }, 10000)
    })
  }
  await navigateFn()
}

async function startFromTemplate(exercises: SessionExercise[]) {
  if (exercises.length === 0) return
  if (starting.value) return
  starting.value = true
  try {
    const dayType = exercises[0].dayType
    const id = await workoutStore.startWorkout(dayType, exercises)
    if (id === null) {
      toast("Couldn't start — try again?")
      return
    }
    showTemplatePicker.value = false
    await onWorkoutStart(() => router.push('/workout'))
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
      toast("Couldn't start — try again?")
      return
    }
    await onWorkoutStart(() => router.push('/workout'))
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

      <Teleport to="body">
        <div v-if="showNotifBanner" class="notif-banner-overlay">
          <div class="notif-banner">
            <RText tag="p" class="notif-title">Stay on track between sets</RText>
            <RText tag="p" class="notif-desc">
              Enable notifications so we can remind you when your rest timer is up, even if you leave the app.
            </RText>
            <div class="notif-actions">
              <RButton type="primary" @click="requestNotifPermission">Enable</RButton>
              <RButton @click="dismissNotifBanner">Not now</RButton>
            </div>
          </div>
        </div>
      </Teleport>
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
.notif-banner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}
.notif-banner {
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-radius: 12px;
  padding: var(--space-xl);
  max-width: 340px;
  text-align: center;
}
.notif-title {
  font-weight: 600;
  font-size: 1.1rem;
  margin: 0 0 var(--space-sm) 0;
}
.notif-desc {
  color: var(--r-color-text-secondary);
  font-size: 0.9rem;
  margin: 0 0 var(--space-lg) 0;
  line-height: 1.4;
}
.notif-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
}
</style>
