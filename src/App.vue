<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useWorkoutStore } from './store/workout'
import { seedBuiltInTemplates } from './lib/templateLibrary'

const router = useRouter()
const route = useRoute()
const workoutStore = useWorkoutStore()

onMounted(() => {
  seedBuiltInTemplates()
})

const hasActiveWorkout = computed(() => !!workoutStore.activeSession)

function navTo(path: string) {
  router.push(path)
}

const firstTabLabel = computed(() => (hasActiveWorkout.value ? 'Workout' : 'Home'))
const firstTabPath = computed(() => (hasActiveWorkout.value ? '/workout' : '/'))
const firstTabActive = computed(() =>
  hasActiveWorkout.value ? route.path === '/workout' : route.path === '/'
)

</script>

<template>
  <RScope>
    <RToastProvider>
      <div class="app">
        <header class="header">
          <h1 class="title">Workout</h1>
        </header>
        <main class="main">
          <RouterView v-slot="{ Component }">
            <Transition name="fade" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </main>
        <nav class="bottom-nav">
          <button
            type="button"
            class="nav-item"
            :class="{ active: firstTabActive }"
            @click="navTo(firstTabPath)"
          >
            <span class="nav-icon">
              <svg v-if="hasActiveWorkout" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.4 14.4 9.6 9.6" />
                <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1 2.829 2.829z" />
                <path d="m3.515 6.343 1.768-1.767a2 2 0 1 1 2.828 2.829L6.343 9.172" />
                <path d="m6.343 6.343 11.314 11.314" />
                <path d="m21.485 18.657-1.768 1.767a2 2 0 1 1-2.829-2.829l1.768-1.767" />
                <path d="m9.172 6.343-1.768-1.768a2 2 0 1 1 2.829-2.828l1.767 1.767" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span class="nav-label">{{ firstTabLabel }}</span>
          </button>
          <button
            type="button"
            class="nav-item"
            :class="{ active: route.path === '/history' }"
            @click="navTo('/history')"
          >
            <span class="nav-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span class="nav-label">History</span>
          </button>
          <button
            type="button"
            class="nav-item"
            :class="{ active: route.path === '/settings' }"
            @click="navTo('/settings')"
          >
            <span class="nav-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <span class="nav-label">Settings</span>
          </button>
        </nav>
      </div>
    </RToastProvider>
  </RScope>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
}
.header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--r-color-fill-secondary);
}
.title {
  font-size: 1.25rem;
  margin: 0;
  font-weight: 600;
}
.main {
  flex: 1;
  padding: 1.5rem;
  overflow-x: hidden;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0.5rem 0;
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
  background: var(--r-color-bg);
  border-top: 1px solid var(--r-color-fill-secondary);
  z-index: 100;
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--r-color-text-secondary, #666);
  transition: color 0.15s;
}
.nav-item:hover {
  color: var(--r-color-text, #333);
}
.nav-item.active {
  color: var(--r-color-primary);
  font-weight: 600;
}
.nav-item.active .nav-icon :deep(svg) {
  stroke: var(--r-color-primary);
}
.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-icon :deep(svg) {
  width: 24px;
  height: 24px;
}
.nav-label {
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.fade-enter-to,
.fade-leave-from {
  transform: translateY(0);
}
</style>
