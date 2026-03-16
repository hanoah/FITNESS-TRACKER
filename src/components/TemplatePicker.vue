<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RText } from 'roughness'
import {
  getPrebuiltHierarchy,
  dayToSessionExercises,
  loadTemplates,
  deleteTemplate,
  type PrebuiltSource,
} from '../lib/templateLibrary'
import type { Block, Week, Day } from '../types/program'
import type { SessionExercise } from '../types/session'
import type { WorkoutTemplate } from '../lib/db'

const emit = defineEmits<{
  (e: 'select', exercises: SessionExercise[]): void
  (e: 'cancel'): void
}>()

type NavFrame =
  | { label: string; data: PrebuiltSource }
  | { label: string; data: Block }
  | { label: string; data: Week }

const hierarchy = getPrebuiltHierarchy()
const customTemplates = ref<WorkoutTemplate[]>([])
const loading = ref(true)
const navStack = ref<NavFrame[]>([])

const currentFrame = computed(() => navStack.value[navStack.value.length - 1])
const isRoot = computed(() => navStack.value.length === 0)

const currentBlocks = computed(() => {
  const frame = currentFrame.value
  if (!frame) return []
  const src = frame.data as PrebuiltSource
  if (src?.blocks) return src.blocks
  return []
})

const currentWeeks = computed(() => {
  const frame = currentFrame.value
  if (!frame) return []
  const block = frame.data as Block
  if (block?.weeks) return block.weeks
  return []
})

const currentDays = computed(() => {
  const frame = currentFrame.value
  if (!frame) return []
  const week = frame.data as Week
  if (week?.days) return week.days
  return []
})

const viewMode = computed<'root' | 'blocks' | 'weeks' | 'days'>(() => {
  if (isRoot.value) return 'root'
  const d = currentFrame.value?.data
  if (d && 'days' in d) return 'days'
  if (d && 'weeks' in d) return 'weeks'
  if (d && 'blocks' in d) return 'blocks'
  return 'root'
})

const headerTitle = computed(() => {
  if (isRoot.value) return 'Choose Template'
  return currentFrame.value?.label ?? 'Choose Template'
})

onMounted(async () => {
  loading.value = true
  customTemplates.value = await loadTemplates()
  loading.value = false
})

watch(
  () => navStack.value.length,
  () => {
    if (navStack.value.length === 0) {
      loadTemplates().then((t) => (customTemplates.value = t))
    }
  }
)

function goBack() {
  if (navStack.value.length > 0) {
    navStack.value = navStack.value.slice(0, -1)
  } else {
    emit('cancel')
  }
}

function selectSource(source: PrebuiltSource) {
  navStack.value = [...navStack.value, { label: source.name, data: source }]
}

function selectBlock(block: Block) {
  navStack.value = [...navStack.value, { label: block.name, data: block }]
}

function selectWeek(week: Week) {
  navStack.value = [
    ...navStack.value,
    { label: `Week ${week.number}${week.isDeload ? ' (Deload)' : ''}`, data: week },
  ]
}

function selectDay(day: Day) {
  const exercises = dayToSessionExercises(day)
  emit('select', exercises)
}

function selectCustomTemplate(template: WorkoutTemplate) {
  emit('select', template.exercises)
}

async function handleDeleteTemplate(e: Event, id: number) {
  e.stopPropagation()
  if (!confirm('Delete this template? You won\'t be able to recover it.')) return
  await deleteTemplate(id)
  customTemplates.value = await loadTemplates()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div class="picker-backdrop" @click.self="emit('cancel')">
        <div class="picker-panel" role="dialog" aria-modal="true" aria-label="Choose template">
          <header class="picker-header">
            <button type="button" class="back-btn" aria-label="Back" @click="goBack">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
            <RText tag="h2" class="picker-title">{{ headerTitle }}</RText>
          </header>

          <div v-if="loading" class="loading">
            <RText tag="p">Loading...</RText>
          </div>

          <div v-else class="picker-scroll">
            <!-- Root: Programs + My Templates -->
            <template v-if="viewMode === 'root'">
              <div class="section">
                <RText tag="p" class="section-label">Programs</RText>
                <ul class="nav-list">
                  <li v-for="src in hierarchy.sources" :key="src.id">
                    <button type="button" class="list-item" @click="selectSource(src)">
                      {{ src.name }}
                    </button>
                  </li>
                </ul>
              </div>
              <div class="section">
                <RText tag="p" class="section-label">My Templates</RText>
                <ul v-if="customTemplates.length > 0" class="nav-list">
                  <li v-for="t in customTemplates" :key="t.id">
                    <button
                      type="button"
                      class="list-item list-item-with-action"
                      @click="selectCustomTemplate(t)"
                    >
                      <span>{{ t.name }}</span>
                      <button
                        type="button"
                        class="delete-btn"
                        aria-label="Delete"
                        @click="handleDeleteTemplate($event, t.id!)"
                      >
                        ×
                      </button>
                    </button>
                  </li>
                </ul>
                <RText v-else tag="p" class="empty-hint">No custom templates yet. Complete a workout and save it to build your library.</RText>
              </div>
            </template>

            <!-- Blocks -->
            <template v-else-if="viewMode === 'blocks'">
              <ul class="nav-list">
                <li v-for="block in currentBlocks" :key="block.id">
                  <button type="button" class="list-item" @click="selectBlock(block)">
                    {{ block.name }}
                  </button>
                </li>
              </ul>
            </template>

            <!-- Weeks -->
            <template v-else-if="viewMode === 'weeks'">
              <ul class="nav-list">
                <li v-for="week in currentWeeks" :key="week.number">
                  <button type="button" class="list-item" @click="selectWeek(week)">
                    Week {{ week.number }}
                    <span v-if="week.isDeload" class="deload-badge">(Deload)</span>
                  </button>
                </li>
              </ul>
            </template>

            <!-- Days -->
            <template v-else-if="viewMode === 'days'">
              <ul class="nav-list">
                <li v-for="day in currentDays" :key="day.id">
                  <button type="button" class="list-item" @click="selectDay(day)">
                    {{ day.name }}
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 500;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.picker-panel {
  width: 100%;
  max-width: 480px;
  height: 90vh;
  max-height: 90vh;
  border-radius: 16px 16px 0 0;
  background: var(--r-color-bg);
  border: 2px solid var(--r-color-stroke);
  border-bottom: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.picker-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--r-color-fill-secondary);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--r-color-text);
}
.back-btn:hover {
  background: var(--r-color-fill-tertiary);
  border-radius: 8px;
}

.picker-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}

.picker-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl) var(--space-xl) var(--space-2xl);
}

.section {
  margin-bottom: var(--space-xl);
}

.section-label {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 var(--space-sm) 0;
  display: block;
  color: var(--r-color-text-secondary);
}

.nav-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list-item {
  display: block;
  width: 100%;
  padding: var(--space-md) 0;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid var(--r-color-fill-secondary);
  font-family: inherit;
  font-size: 1rem;
  cursor: pointer;
}
.list-item:hover {
  color: var(--r-color-primary);
}

.list-item-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.delete-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--r-color-fill-secondary);
  border: 1px solid var(--r-color-stroke);
  border-radius: 6px;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--r-color-text-secondary);
}
.delete-btn:hover {
  background: var(--r-color-error);
  color: white;
  border-color: var(--r-color-error);
}

.deload-badge {
  font-style: italic;
  color: var(--r-color-text-secondary);
  margin-left: 0.25em;
}

.empty-hint {
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
  margin: 0;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.2s ease;
}
.slide-up-enter-active .picker-panel,
.slide-up-leave-active .picker-panel {
  transition: transform 0.25s ease-out;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
}
.slide-up-enter-from .picker-panel,
.slide-up-leave-to .picker-panel {
  transform: translateY(100%);
}
</style>
