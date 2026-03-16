<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { RButton, RCard, RText, useToast } from 'roughness'
import { db } from '../lib/db'
import ProgressionChart from '../components/ProgressionChart.vue'
import { useExerciseProgression } from '../composables/useExerciseProgression'
import type { WorkoutSession, SetLog } from '../types/session'

type ViewMode = 'workout' | 'exercise'

const viewMode = ref<ViewMode>('workout')
const sessions = ref<WorkoutSession[]>([])
const expandedId = ref<number | null>(null)
const expandedExercise = ref<string | null>(null)
const setsBySession = ref<Record<number, SetLog[]>>({})
const loadingSets = ref<number | null>(null)
const deleting = ref<number | null>(null)
const loadError = ref(false)
const toast = useToast()

const progression = useExerciseProgression()

watch(viewMode, (mode) => {
  if (mode === 'exercise') {
    progression.loadAllSets()
  }
})

async function load() {
  loadError.value = false
  try {
    sessions.value = await db.sessions
      .orderBy('date')
      .reverse()
      .limit(50)
      .toArray()
  } catch (e) {
    console.error('[HistoryPage] Failed to load sessions', e)
    loadError.value = true
    toast('Failed to load workout history')
  }
}

onMounted(load)

async function loadSets(sessionId: number) {
  if (setsBySession.value[sessionId]) return
  loadingSets.value = sessionId
  try {
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
    setsBySession.value = { ...setsBySession.value, [sessionId]: sets }
  } catch (e) {
    console.error('[HistoryPage] Failed to load sets', e)
    toast('Failed to load sets')
  } finally {
    loadingSets.value = null
  }
}

async function toggleExpand(s: WorkoutSession) {
  const id = s.id!
  if (expandedId.value === id) {
    expandedId.value = null
  } else {
    expandedId.value = id
    await loadSets(id)
  }
}

function toggleExerciseExpand(name: string) {
  expandedExercise.value = expandedExercise.value === name ? null : name
}

async function deleteSession(s: WorkoutSession) {
  if (!confirm('Delete this workout? This cannot be undone.')) return
  const id = s.id!
  deleting.value = id
  try {
    await db.sets.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
    toast('Session deleted')
    await load()
    if (expandedId.value === id) expandedId.value = null
    setsBySession.value = { ...setsBySession.value, [id]: [] }
    delete setsBySession.value[id]
    if (viewMode.value === 'exercise') {
      await progression.loadAllSets()
    }
  } catch (e) {
    console.error('Delete failed:', e)
    toast('Delete failed — please try again')
  } finally {
    deleting.value = null
  }
}

function formatDayType(dayType: string) {
  return dayType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const exerciseList = computed(() => progression.exercisesSortedByRecent.value ?? [])

const expandedExerciseGroup = computed(() => {
  const name = expandedExercise.value
  if (!name) return null
  return progression.getExerciseGroup(name)
})

function groupSetsByExercise(sets: SetLog[]): { exerciseName: string; slotKey: string; sets: SetLog[] }[] {
  const bySlot = new Map<string, SetLog[]>()
  for (const s of sets) {
    const key = s.exerciseSlot
    if (!bySlot.has(key)) bySlot.set(key, [])
    bySlot.get(key)!.push(s)
  }
  return Array.from(bySlot.entries()).map(([slot, arr]) => {
    const sorted = [...arr].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0))
    return { exerciseName: sorted[0]?.exerciseName ?? slot, slotKey: slot, sets: sorted }
  })
}
</script>

<template>
  <div class="history-page">
    <RCard class="header-card">
      <RText tag="h2">Workout History</RText>
      <div class="tab-row">
        <button
          type="button"
          class="tab"
          :class="{ active: viewMode === 'workout' }"
          @click="viewMode = 'workout'"
        >
          By Workout
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: viewMode === 'exercise' }"
          @click="viewMode = 'exercise'"
        >
          By Exercise
        </button>
      </div>
    </RCard>

    <!-- By Workout view -->
    <template v-if="viewMode === 'workout'">
      <RCard v-if="loadError" class="empty-card">
        <RText tag="p">Couldn't load history.</RText>
        <RButton @click="load">Retry</RButton>
      </RCard>

      <RCard v-else-if="sessions.length === 0" class="empty-card">
        <RText tag="p">No workouts yet. Start one from the home page!</RText>
      </RCard>

      <RCard
        v-for="s in sessions"
        :key="s.id"
        class="session-card"
        :class="{ expanded: expandedId === s.id }"
      >
        <button
          type="button"
          class="session-header"
          @click="toggleExpand(s)"
        >
          <div class="session-info">
            <RText tag="p" class="session-date">{{ s.date }}</RText>
            <RText tag="p" class="session-meta">
              {{ formatDayType(s.dayType) }}{{ s.weekNumber != null ? ' · Week ' + s.weekNumber : '' }} · {{ s.status }}
            </RText>
          </div>
          <span class="expand-icon" :class="{ open: expandedId === s.id }">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        <Transition name="expand">
          <div v-if="expandedId === s.id" class="session-detail">
          <div v-if="loadingSets === s.id" class="loading-sets">Loading…</div>
          <div v-else-if="setsBySession[s.id!]?.length" class="sets-list">
            <div
              v-for="group in groupSetsByExercise(setsBySession[s.id!]!)"
              :key="group.exerciseName + (group.sets[0]?.id ?? group.slotKey)"
              class="exercise-group"
            >
              <RText tag="p" class="exercise-name">
                {{ group.exerciseName }} — {{ group.sets.length }} {{ group.sets.length === 1 ? 'set' : 'sets' }}
              </RText>
              <ul class="set-list">
                <li v-for="(set, i) in group.sets" :key="set.id" class="set-item">
                  Set {{ i + 1 }}: {{ set.weight }}×{{ set.reps }}
                  <span v-if="set.rpe" class="set-rpe">RPE {{ set.rpe }}</span>
                  <span v-if="set.isWarmup" class="set-warmup">warm-up</span>
                </li>
              </ul>
            </div>
          </div>
          <RText v-else tag="p" class="no-sets">No sets logged</RText>

          <RButton
            variant="secondary"
            type="button"
            class="delete-btn"
            :disabled="deleting === s.id"
            @click.stop="deleteSession(s)"
          >
            {{ deleting === s.id ? 'Deleting…' : 'Delete workout' }}
          </RButton>
          </div>
        </Transition>
      </RCard>
    </template>

    <!-- By Exercise view -->
    <template v-else>
      <RCard v-if="progression.loadError.value" class="empty-card">
        <RText tag="p">Couldn't load sets.</RText>
        <RButton @click="progression.loadAllSets">Retry</RButton>
      </RCard>

      <RCard v-else-if="progression.loading.value" class="empty-card">
        <RText tag="p">Loading…</RText>
      </RCard>

      <RCard v-else-if="exerciseList.length === 0" class="empty-card">
        <RText tag="p">No exercises logged yet. Complete a workout to see your progress!</RText>
      </RCard>

      <RCard
        v-for="name in exerciseList"
        :key="name"
        class="exercise-card"
        :class="{ expanded: expandedExercise === name }"
      >
        <button
          type="button"
          class="session-header"
          @click="toggleExerciseExpand(name)"
        >
          <RText tag="p" class="exercise-name">{{ name }}</RText>
          <span class="expand-icon" :class="{ open: expandedExercise === name }">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        <Transition name="expand">
          <div v-if="expandedExercise === name" class="exercise-detail">
          <template v-if="expandedExerciseGroup">
            <div v-if="expandedExerciseGroup.bestSet" class="best-set">
              Best: {{ expandedExerciseGroup.bestSet.weight }}×{{ expandedExerciseGroup.bestSet.reps }}
              <span v-if="expandedExerciseGroup.bestSet.rpe">
                @ RPE {{ expandedExerciseGroup.bestSet.rpe }}
              </span>
            </div>
            <ProgressionChart
              v-if="expandedExerciseGroup.progressionData.length >= 2"
              :data="expandedExerciseGroup.progressionData"
              :title="name"
            />
            <p v-else-if="expandedExerciseGroup.progressionData.length === 1" class="chart-need-more">
              Need more data (1 session) — log this exercise again to see progression
            </p>
            <div class="sets-by-date">
              <template
                v-for="[date, daySets] in Array.from(expandedExerciseGroup.setsByDate.entries()).sort((a, b) => b[0].localeCompare(a[0]))"
                :key="date"
              >
                <RText tag="p" class="date-label">{{ date }}</RText>
                <ul class="set-list">
                  <li v-for="(set, i) in daySets" :key="date + '-' + (set.id ?? i)" class="set-item">
                    {{ set.weight }}×{{ set.reps }}
                    <span v-if="set.rpe" class="set-rpe">RPE {{ set.rpe }}</span>
                    <span v-if="set.isWarmup" class="set-warmup">warm-up</span>
                  </li>
                </ul>
              </template>
            </div>
          </template>
          </div>
        </Transition>
      </RCard>
    </template>
  </div>
</template>

<style scoped>
.history-page {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.header-card {
  padding: 1rem;
}
.header-card h2 {
  margin: 0;
}
.tab-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.tab {
  padding: var(--space-sm) var(--space-md);
  background: var(--r-color-fill-secondary);
  border: 1px solid var(--r-color-stroke);
  border-radius: 20px;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--r-color-text-secondary);
  transition: background 0.15s, color 0.15s;
}
.tab:hover {
  background: var(--r-color-fill-tertiary);
}
.tab.active {
  background: var(--r-color-primary);
  color: var(--r-color-bg);
  border-color: var(--r-color-primary);
}
.empty-card {
  padding: 1rem;
}
.session-card,
.exercise-card {
  padding: 0;
  overflow: hidden;
}
.session-header {
  width: 100%;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.session-header:hover {
  background: var(--r-color-fill-tertiary, rgba(128, 128, 128, 0.1));
}
.session-info {
  flex: 1;
  min-width: 0;
}
.session-date {
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}
.session-meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary, #666);
}
.expand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--r-color-text-secondary);
  transition: transform 0.2s ease;
}
.expand-icon.open {
  transform: rotate(90deg);
}
.session-detail,
.exercise-detail {
  padding: 0 1rem 1rem;
  border-top: 1px solid var(--r-color-stroke, #333);
}
.sets-list {
  margin-bottom: 1rem;
}
.exercise-group {
  margin-bottom: 1rem;
}
.exercise-group:last-child {
  margin-bottom: 0;
}
.exercise-name {
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  font-size: 0.95rem;
  overflow-wrap: break-word;
}
.set-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary, #666);
}
.set-item {
  margin: 0.15rem 0;
}
.set-rpe {
  margin-left: 0.35rem;
}
.set-warmup {
  margin-left: 0.35rem;
  font-style: italic;
}
.no-sets {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary, #666);
}
.loading-sets {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary, #666);
}
.delete-btn {
  width: 100%;
}
.best-set {
  font-weight: 600;
  margin-bottom: var(--space-sm);
  font-size: 0.95rem;
  color: var(--r-color-primary);
}
.chart-need-more {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary, #666);
}
.sets-by-date {
  margin-top: 1rem;
}
.date-label {
  font-size: 0.85rem;
  color: var(--r-color-text-secondary, #666);
  margin: 0.5rem 0 0.25rem 0;
}
.date-label:first-child {
  margin-top: 0;
}

.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
