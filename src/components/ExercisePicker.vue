<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RButton, RInput, RText } from 'roughness'
import {
  searchExercises,
  getRecentExercises,
  getMuscleGroups,
  type ExerciseInfo,
} from '../lib/exerciseLibrary'

const props = withDefaults(
  defineProps<{
    /** Quick-pick options shown at top (e.g. sub1, sub2) */
    quickPicks?: string[]
    title?: string
  }>(),
  {
    quickPicks: () => [],
    title: 'Add Exercise',
  }
)

const emit = defineEmits<{
  (e: 'select', info: ExerciseInfo): void
  (e: 'cancel'): void
}>()

const searchQuery = ref('')
const recentExercises = ref<ExerciseInfo[]>([])
const allExercises = ref<ExerciseInfo[]>([])
const muscleGroups = ref<string[]>([])
const customName = ref('')
const loading = ref(true)

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  return allExercises.value.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

onMounted(async () => {
  loading.value = true
  try {
    const [recent, all] = await Promise.all([
      getRecentExercises(20),
      searchExercises(''),
    ])
    recentExercises.value = recent
    allExercises.value = all
    muscleGroups.value = getMuscleGroups()
  } finally {
    loading.value = false
  }
})

watch(searchQuery, async (q) => {
  if (!q.trim()) return
  allExercises.value = await searchExercises(q)
})

function selectFromInfo(info: ExerciseInfo) {
  emit('select', info)
}

function handleQuickPick(name: string) {
  const info = allExercises.value.find((e) => e.name === name)
  if (info) emit('select', info)
}

function handleCustomAdd() {
  const name = customName.value.trim()
  if (!name) return
  const info: ExerciseInfo = { name, source: 'history' }
  emit('select', info)
  customName.value = ''
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div class="picker-backdrop" @click.self="handleCancel">
        <div class="picker-panel" role="dialog" aria-modal="true" :aria-label="title">
          <header class="picker-header">
            <button type="button" class="back-btn" aria-label="Close" @click="handleCancel">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
            <RText tag="h2" class="picker-title">{{ title }}</RText>
          </header>

          <div class="picker-search">
            <RInput
              v-model="searchQuery"
              placeholder="Search exercises..."
              class="search-input"
            />
          </div>

          <div v-if="quickPicks.length > 0" class="quick-pills">
            <button
              v-for="name in quickPicks"
              :key="name"
              type="button"
              class="pill"
              @click="handleQuickPick(name)"
            >
              {{ name }}
            </button>
          </div>

          <div v-if="loading" class="loading">
            <RText tag="p">Loading...</RText>
          </div>

          <div v-else class="picker-scroll">
            <div v-if="recentExercises.length > 0 && !searchQuery.trim()" class="section">
              <RText tag="p" class="section-label">Recent</RText>
              <ul class="exercise-list">
                <li v-for="ex in recentExercises" :key="ex.name">
                  <button type="button" class="list-item" @click="selectFromInfo(ex)">
                    {{ ex.name }}
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="searchQuery.trim() && searchResults.length > 0" class="section">
              <RText tag="p" class="section-label">Results</RText>
              <ul class="exercise-list">
                <li v-for="ex in searchResults" :key="ex.name">
                  <button type="button" class="list-item" @click="selectFromInfo(ex)">
                    {{ ex.name }}
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="searchQuery.trim() && searchResults.length === 0" class="no-results">
              <RText tag="p">No matches. Type a custom exercise name below.</RText>
            </div>

            <div class="custom-section">
              <RText tag="p" class="section-label">Custom exercise</RText>
              <div class="custom-row">
                <RInput
                  v-model="customName"
                  placeholder="Type any exercise name"
                  class="custom-input"
                  @keyup.enter="handleCustomAdd"
                />
                <RButton
                  type="primary"
                  :disabled="!customName.trim()"
                  @click="handleCustomAdd"
                >
                  Add
                </RButton>
              </div>
            </div>
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

.picker-search {
  flex-shrink: 0;
  padding: var(--space-md) var(--space-xl);
}

.search-input {
  width: 100%;
}

.quick-pills {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: 0 var(--space-xl) var(--space-md);
}

.pill {
  padding: var(--space-sm) var(--space-md);
  background: var(--r-color-fill-secondary);
  border: 1px solid var(--r-color-stroke);
  border-radius: 20px;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.pill:hover {
  background: var(--r-color-fill-tertiary);
}

.picker-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-xl) var(--space-2xl);
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

.exercise-list {
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

.no-results {
  margin-bottom: var(--space-lg);
  color: var(--r-color-text-secondary);
  font-size: 0.9rem;
}

.custom-section {
  padding-top: var(--space-lg);
}

.custom-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.custom-input {
  flex: 1;
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
