<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '../lib/db'
import { getGoal } from '../lib/strengthGoals'
import { getPendingCount, flushSyncQueue } from '../lib/sync'
import { downloadBackup, importFromJson, parseSheetCsv, clearAndSeedFromTracker } from '../lib/backup'
import { exportDebugEventsAsJson, getDebugEvents, clearDebugEvents } from '../lib/debugEvents'
import { clearExerciseCache } from '../lib/exerciseLibrary'
import { SAMPLE_TRACKER } from '../data/sampleTracker'
import { RButton, RCard, RInput, RText, useToast } from 'roughness'

const KEY_LIFTS = [
  { name: 'Barbell Bench Press', label: 'Bench' },
  { name: 'Smith Machine Squat', label: 'Squat' },
  { name: 'Barbell RDL', label: 'RDL' },
]

const toast = useToast()

const heightDisplay = ref<string>('')
const weightDisplay = ref<string>('')
const unit = ref<'lb' | 'kg'>('kg')
const strengthLevel = ref<'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'>('intermediate')
const appsScriptUrl = ref('')
const saving = ref(false)
const syncing = ref(false)
const pendingCount = ref(0)
const exporting = ref(false)
const importing = ref(false)
const seeding = ref(false)
const importResult = ref<string | null>(null)
const jsonInputRef = ref<HTMLInputElement | null>(null)
const csvInputRef = ref<HTMLInputElement | null>(null)

const LEVELS = [
  { value: 'beginner' as const, label: 'Beginner' },
  { value: 'novice' as const, label: 'Novice' },
  { value: 'intermediate' as const, label: 'Intermediate' },
  { value: 'advanced' as const, label: 'Advanced' },
  { value: 'elite' as const, label: 'Elite' },
]

function toInches(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10
}

function toLbs(kg: number): number {
  return Math.round((kg * 2.205) * 10) / 10
}

function toCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10
}

function toKg(lbs: number): number {
  return Math.round((lbs / 2.205) * 10) / 10
}

async function refreshPendingCount() {
  pendingCount.value = await getPendingCount()
}

onMounted(async () => {
  const profile = await db.userProfile.get('current')
  await refreshPendingCount()
  if (profile) {
    unit.value = profile.unit
    strengthLevel.value = profile.strengthLevel ?? 'intermediate'
    appsScriptUrl.value = profile.appsScriptUrl ?? ''
    if (profile.heightCm != null) {
      heightDisplay.value = String(profile.unit === 'kg' ? profile.heightCm : toInches(profile.heightCm))
    } else {
      heightDisplay.value = ''
    }
    if (profile.weightKg != null) {
      weightDisplay.value = String(profile.unit === 'kg' ? profile.weightKg : toLbs(profile.weightKg))
    } else {
      weightDisplay.value = ''
    }
  }
})

function setUnit(u: 'lb' | 'kg') {
  if (u === unit.value) return
  const h = parseFloat(heightDisplay.value)
  const w = parseFloat(weightDisplay.value)
  if (!isNaN(h) && h > 0) {
    const cm = unit.value === 'kg' ? h : toCm(h)
    heightDisplay.value = String(u === 'kg' ? cm : toInches(cm))
  }
  if (!isNaN(w) && w > 0) {
    const kg = unit.value === 'kg' ? w : toKg(w)
    weightDisplay.value = String(u === 'kg' ? kg : toLbs(kg))
  }
  unit.value = u
}

async function handleExport() {
  exporting.value = true
  try {
    await downloadBackup()
    toast('Backup downloaded')
  } catch (e) {
    console.error('[SettingsPage] Export failed', e)
    toast('Export failed')
  } finally {
    exporting.value = false
  }
}

function triggerJsonInput() {
  jsonInputRef.value?.click()
}

function triggerCsvInput() {
  csvInputRef.value?.click()
}

function handleExportDebugTrace() {
  const json = exportDebugEventsAsJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workout-debug-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast(`Exported ${getDebugEvents().length} events`)
}

async function handleImportJson(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!confirm('Import will add data to your existing history. Continue?')) {
    input.value = ''
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const text = await file.text()
    const result = await importFromJson(text)
    if (result.error) {
      toast(result.error)
      importResult.value = result.error
    } else {
      const parts = []
      if (result.sessionsImported > 0) parts.push(`${result.sessionsImported} sessions`)
      if (result.setsImported > 0) parts.push(`${result.setsImported} sets`)
      if (result.profileRestored) parts.push('profile')
      if (result.programStateRestored) parts.push('program')
      toast(`Restored: ${parts.join(', ')}`)
      importResult.value = `Restored ${result.sessionsImported} sessions, ${result.setsImported} sets`
      if (result.profileRestored) importResult.value += ', profile'
      if (result.programStateRestored) importResult.value += ', program state'
      clearExerciseCache()
    }
  } catch (err) {
    toast('Import failed')
    importResult.value = 'Import failed'
    console.error('[SettingsPage] Import failed', err)
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function handleImportSheet(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!confirm('Import will add data to your existing history. Continue?')) {
    input.value = ''
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const csv = await file.text()
    const data = parseSheetCsv(csv)
    const result = await importFromJson(JSON.stringify(data))
    if (result.error) {
      toast(result.error)
      importResult.value = result.error
    } else {
      toast(`Restored ${result.sessionsImported} sessions, ${result.setsImported} sets from Sheet`)
      importResult.value = `Restored ${result.sessionsImported} sessions, ${result.setsImported} sets`
      clearExerciseCache()
    }
  } catch (err) {
    toast('Import failed')
    importResult.value = 'Import failed'
    console.error('[SettingsPage] Sheet import failed', err)
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function handleSync() {
  const url = appsScriptUrl.value.trim()
  if (!url) {
    toast('Enter Apps Script URL first')
    return
  }
  syncing.value = true
  try {
    const { synced, failed, errors } = await flushSyncQueue(url)
    await refreshPendingCount()
    if (synced > 0) toast(`Synced ${synced} workout(s)`)
    if (failed > 0) toast(`Failed: ${errors[0] ?? 'unknown'}`)
  } catch (e) {
    console.error('[SettingsPage] Sync failed', e)
    toast('Sync failed')
  } finally {
    syncing.value = false
  }
}

async function handleLoadSample() {
  if (!confirm('This will clear all workout history and replace it with sample data. Continue?')) return
  seeding.value = true
  importResult.value = null
  try {
    const result = await clearAndSeedFromTracker(SAMPLE_TRACKER)
    if (result.error) {
      toast(result.error)
      importResult.value = result.error
    } else {
      toast(`Loaded ${result.sessionsImported} sessions, ${result.setsImported} sets`)
      importResult.value = `Loaded ${result.sessionsImported} sessions, ${result.setsImported} sets`
      clearExerciseCache()
      clearDebugEvents()
    }
  } catch (err) {
    toast('Failed to load sample data')
    importResult.value = 'Failed to load sample data'
    console.error('[SettingsPage] Sample load failed', err)
  } finally {
    seeding.value = false
  }
}

const saveError = ref('')

async function handleSave() {
  saveError.value = ''
  const hVal = parseFloat(heightDisplay.value)
  const wVal = parseFloat(weightDisplay.value)

  if (heightDisplay.value.trim() && (!isFinite(hVal) || hVal <= 0)) {
    saveError.value = 'Height must be a positive number'
    return
  }
  if (weightDisplay.value.trim() && (!isFinite(wVal) || wVal <= 0)) {
    saveError.value = 'Weight must be a positive number'
    return
  }
  const maxHeight = unit.value === 'kg' ? 300 : 120
  const maxWeight = unit.value === 'kg' ? 400 : 880
  if (hVal > maxHeight) {
    saveError.value = `Height seems too high (max ${maxHeight} ${unit.value === 'kg' ? 'cm' : 'in'})`
    return
  }
  if (wVal > maxWeight) {
    saveError.value = `Weight seems too high (max ${maxWeight} ${unit.value === 'kg' ? 'kg' : 'lbs'})`
    return
  }
  const url = appsScriptUrl.value.trim()
  if (url && !url.startsWith('https://script.google.com/')) {
    saveError.value = 'Apps Script URL must start with https://script.google.com/'
    return
  }

  saving.value = true
  try {
    const heightCm = !isNaN(hVal) && hVal > 0
      ? (unit.value === 'kg' ? hVal : toCm(hVal))
      : undefined
    const weightKg = !isNaN(wVal) && wVal > 0
      ? (unit.value === 'kg' ? wVal : toKg(wVal))
      : undefined

    const patch: Record<string, unknown> = {
      unit: unit.value,
      strengthLevel: strengthLevel.value,
      updatedAt: Date.now(),
    }
    if (heightCm !== undefined) patch.heightCm = heightCm
    if (weightKg !== undefined) patch.weightKg = weightKg
    const url = appsScriptUrl.value.trim()
    if (url) patch.appsScriptUrl = url

    const existing = await db.userProfile.get('current')
    if (existing) {
      await db.userProfile.update('current', patch)
    } else {
      await db.userProfile.put({ id: 'current', ...patch })
    }
    toast('Settings saved')
  } catch (e) {
    console.error('[SettingsPage] Failed to save', e)
    toast('Failed to save settings')
  } finally {
    saving.value = false
  }
}

const heightLabel = () => (unit.value === 'kg' ? 'Height (cm)' : 'Height (in)')
const weightLabel = () => (unit.value === 'kg' ? 'Weight (kg)' : 'Weight (lbs)')

const weightKgFromForm = computed(() => {
  const v = parseFloat(weightDisplay.value)
  if (isNaN(v) || v <= 0) return undefined
  return unit.value === 'kg' ? v : toKg(v)
})

const keyLiftGoals = computed(() => {
  const w = weightKgFromForm.value
  if (w == null) return []
  const bodyWeightLbs = w * 2.205
  const level = strengthLevel.value
  return KEY_LIFTS.map(({ name, label }) => {
    const goal = getGoal(name, bodyWeightLbs, level)
    return { label, goal }
  }).filter((g) => g.goal != null)
})

</script>

<template>
  <div class="settings">
    <RCard class="settings-card">
      <RText tag="h2">Profile</RText>
      <div class="field">
        <RText tag="label">{{ heightLabel() }}</RText>
        <RInput
          v-model="heightDisplay"
          type="number"
          min="0"
          step="0.1"
          :placeholder="unit === 'kg' ? '170' : '67'"
        />
      </div>
      <div class="field">
        <RText tag="label">{{ weightLabel() }}</RText>
        <RInput
          v-model="weightDisplay"
          type="number"
          min="0"
          step="0.1"
          :placeholder="unit === 'kg' ? '70' : '154'"
        />
      </div>
      <div class="field">
        <RText tag="label">Strength Level</RText>
        <select v-model="strengthLevel" class="level-select">
          <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </div>
      <div class="field">
        <RText tag="label">Unit</RText>
        <div class="unit-toggle">
          <RButton :type="unit === 'kg' ? 'primary' : undefined" @click="setUnit('kg')">kg</RButton>
          <RButton :type="unit === 'lb' ? 'primary' : undefined" @click="setUnit('lb')">lb</RButton>
        </div>
      </div>
      <RText v-if="saveError" tag="p" class="save-error">{{ saveError }}</RText>
      <RButton type="primary" :disabled="saving" @click="handleSave">Save</RButton>
    </RCard>

    <RCard class="settings-card">
      <RText tag="h3">Sync to Google Sheet</RText>
      <div class="field">
        <RText tag="label">Apps Script URL</RText>
        <RInput
          v-model="appsScriptUrl"
          type="url"
          placeholder="https://script.google.com/..."
        />
      </div>
      <RText tag="p" class="sync-hint">Paste the web app URL from your deployed Google Apps Script. Save your profile above to store it.</RText>
      <RText tag="p" class="sync-status">{{ pendingCount }} workout(s) pending sync</RText>
      <RButton
        :disabled="syncing || !appsScriptUrl.trim()"
        @click="handleSync"
      >
        {{ syncing ? 'Syncing…' : 'Sync now' }}
      </RButton>
    </RCard>

    <RCard class="settings-card">
      <RText tag="h3">Backup & Restore</RText>
      <RText tag="p" class="backup-hint">
        Export downloads your workout history. Restore brings it back on a new device or after clearing data.
      </RText>
      <div class="backup-actions">
        <RButton :disabled="exporting" @click="handleExport">
          {{ exporting ? 'Exporting…' : 'Download backup' }}
        </RButton>
        <RButton :disabled="importing" @click="triggerJsonInput">
          Import backup (.json)
        </RButton>
        <RButton :disabled="importing" @click="triggerCsvInput">
          Import from Sheet (.csv)
        </RButton>
        <input
          ref="jsonInputRef"
          type="file"
          accept=".json,application/json"
          class="file-input"
          @change="handleImportJson"
        />
        <input
          ref="csvInputRef"
          type="file"
          accept=".csv,text/csv"
          class="file-input"
          @change="handleImportSheet"
        />
      </div>
        <RText v-if="importResult" tag="p" class="import-result">{{ importResult }}</RText>
        <RText tag="p" class="sample-hint">Replace all history with sample data to preview the app:</RText>
        <RButton
          variant="secondary"
          :disabled="seeding"
          @click="handleLoadSample"
        >
          {{ seeding ? 'Loading…' : 'Clear & load sample history' }}
        </RButton>
    </RCard>

    <RCard class="settings-card">
      <RText tag="h3">Debug</RText>
      <RText tag="p" class="backup-hint">
        Export recent debug events for troubleshooting. Contains set edits, timer actions, substitutions.
      </RText>
      <RButton variant="secondary" @click="handleExportDebugTrace">
        Export debug trace
      </RButton>
    </RCard>

    <RCard v-if="keyLiftGoals.length > 0" class="settings-card">
      <RText tag="h3">Strength goals ({{ strengthLevel }})</RText>
      <ul class="key-lifts-list">
        <li v-for="g in keyLiftGoals" :key="g.label">{{ g.label }}: {{ g.goal }} lb</li>
      </ul>
    </RCard>
  </div>
</template>

<style scoped>
.settings {
  max-width: 400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.settings-card {
  padding: var(--space-xl);
}
.settings-card h2 {
  margin: 0 0 var(--space-lg) 0;
  font-size: 1.25rem;
}
.settings-card h3 {
  margin: 0 0 var(--space-md) 0;
  font-size: 1rem;
}
.field {
  margin-bottom: var(--space-lg);
}
.field label {
  display: block;
  margin-bottom: var(--space-xs);
  font-size: 0.9rem;
}
.unit-toggle {
  display: flex;
  gap: var(--space-sm);
}
.level-select {
  padding: var(--space-sm);
  border: 2px solid var(--r-color-stroke);
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  min-width: 160px;
}
.backup-hint {
  margin: 0 0 var(--space-md) 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}
.file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.import-result {
  margin: var(--space-sm) 0 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
}
.sample-hint {
  margin: var(--space-lg) 0 var(--space-sm) 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
}
.save-error {
  color: var(--r-color-error);
  margin: 0 0 var(--space-sm) 0;
  font-size: 0.9rem;
}
.sync-hint {
  margin: 0 0 var(--space-xs) 0;
  font-size: 0.85rem;
  color: var(--r-color-text-secondary);
}
.sync-status {
  margin: 0 0 var(--space-md) 0;
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
}
.key-lifts-list {
  margin: 0;
  padding-left: 1.25rem;
}
.key-lifts-list li {
  margin: var(--space-xs) 0;
}
.no-program-hint {
  font-size: 0.9rem;
  color: var(--r-color-text-secondary);
  margin: 0;
}
</style>
