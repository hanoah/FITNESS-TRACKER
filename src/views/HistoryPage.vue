<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RButton, RCard, RText, useToast } from 'roughness'
import { db } from '../lib/db'
import ProgressionChart from '../components/ProgressionChart.vue'
import type { WorkoutSession, SetLog } from '../types/session'

const sessions = ref<WorkoutSession[]>([])
const expandedId = ref<number | null>(null)
const setsBySession = ref<Record<number, SetLog[]>>({})
const loadingSets = ref<number | null>(null)
const deleting = ref<number | null>(null)
const toast = useToast()

async function load() {
  sessions.value = await db.sessions
    .orderBy('date')
    .reverse()
    .limit(50)
    .toArray()
}

onMounted(load)

async function loadSets(sessionId: number) {
  if (setsBySession.value[sessionId]) return
  loadingSets.value = sessionId
  try {
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
    setsBySession.value = { ...setsBySession.value, [sessionId]: sets }
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
    const sets = setsBySession.value[id] ?? []
    const groups = groupSetsByExercise(sets)
    for (const g of groups) {
      await loadProgressionData(g.exerciseName)
    }
  }
}

async function deleteSession(s: WorkoutSession) {
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
  } catch (e) {
    console.error('Delete failed:', e)
    toast('Delete failed')
  } finally {
    deleting.value = null
  }
}

function formatDayType(dayType: string) {
  return dayType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

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

const progressionDataByExercise = ref<Record<string, { date: string; weight: number }[]>>({})

async function loadProgressionData(exerciseName: string) {
  if (progressionDataByExercise.value[exerciseName]) return
  try {
    const allSets = await db.sets.where('exerciseName').equals(exerciseName).toArray()
    const bySession = new Map<number, SetLog[]>()
    for (const s of allSets) {
      if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, [])
      bySession.get(s.sessionId)!.push(s)
    }
    const sessionIds = Array.from(bySession.keys())
    const sessionList = await db.sessions.where('id').anyOf(sessionIds).toArray()
    const dateBySession = new Map<number, string>()
    for (const sess of sessionList) {
      if (sess.id) dateBySession.set(sess.id, sess.date)
    }
    const points: { date: string; weight: number }[] = []
    for (const [sid, sets] of bySession.entries()) {
      const date = dateBySession.get(sid)
      if (!date) continue
      const working = sets.filter((s) => !s.isWarmup)
      const maxWeight = working.length > 0 ? Math.max(...working.map((s) => s.weight)) : 0
      if (maxWeight > 0) points.push({ date, weight: maxWeight })
    }
    points.sort((a, b) => a.date.localeCompare(b.date))
    progressionDataByExercise.value = { ...progressionDataByExercise.value, [exerciseName]: points }
  } catch (e) {
    console.error('[HistoryPage] Failed to load progression', e)
  }
}
</script>

<template>
  <div class="history-page">
    <RCard class="header-card">
      <RText tag="h2">Workout History</RText>
    </RCard>

    <RCard v-if="sessions.length === 0" class="empty-card">
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
            {{ formatDayType(s.dayType) }} · Week {{ s.weekNumber }} · {{ s.status }}
          </RText>
        </div>
        <span class="expand-icon">{{ expandedId === s.id ? '▼' : '▶' }}</span>
      </button>

      <div v-if="expandedId === s.id" class="session-detail">
        <div v-if="loadingSets === s.id" class="loading-sets">Loading…</div>
        <div v-else-if="setsBySession[s.id!]?.length" class="sets-list">
          <div
            v-for="group in groupSetsByExercise(setsBySession[s.id!]!)"
            :key="group.exerciseName + group.sets[0]?.id"
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
            <ProgressionChart
              v-if="progressionDataByExercise[group.exerciseName]"
              :data="progressionDataByExercise[group.exerciseName]"
              :title="group.exerciseName"
            />
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
    </RCard>
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
.empty-card {
  padding: 1rem;
}
.session-card {
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
  font-size: 0.75rem;
  color: var(--r-color-text-secondary, #666);
}
.session-detail {
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
</style>
