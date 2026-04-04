import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, nextTick } from 'vue'
import WorkoutPage from './WorkoutPage.vue'

const mockSlotKey = ref('slot-1')
const mockCurrentExercise = ref<Record<string, unknown> | null>({
  name: 'Barbell RDL',
  slotKey: 'slot-1',
  warmupSets: 1,
  workingSets: 3,
  repRange: [8, 12],
  restSeconds: [90],
})
const mockSuggestion = ref<Record<string, unknown> | null>(null)
const mockBestWeight = ref(0)

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('roughness', () => ({
  RButton: { template: '<button><slot /></button>' },
  RCard: { template: '<div class="r-card"><slot /></div>' },
  RInput: { template: '<input />', props: ['modelValue', 'placeholder', 'disabled'] },
  RText: { template: '<span><slot /></span>', props: ['tag'] },
  useToast: () => vi.fn(),
}))

vi.mock('../store/workout', () => ({
  useWorkoutStore: () => ({
    activeSession: { currentExerciseIndex: 0 },
    currentExercise: mockCurrentExercise.value,
    currentSetNumber: 1,
    totalWorkoutSets: 4,
    currentExerciseSetNumber: 1,
    totalSetsForCurrentExercise: 4,
    isWarmupSet: false,
    todayExercises: [mockCurrentExercise.value],
    completedSets: [],
    completedSetsBySlot: new Map(),
    workoutProgress: 0,
    isPRSet: () => false,
    logSet: vi.fn().mockResolvedValue({ ok: true }),
    loadResumableSession: vi.fn().mockResolvedValue(null),
  }),
  isExerciseComplete: () => false,
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: Record<string, unknown>) => ({
    todayExercises: ref(store.todayExercises),
  }),
}))

vi.mock('../composables/useProgressionHistory', () => ({
  useProgressionHistory: () => ({
    slotHistory: ref([]),
    exerciseHistory: ref([]),
    bestWeight: mockBestWeight,
  }),
}))

vi.mock('../composables/useUserProfile', () => ({
  useUserProfile: () => ({ profile: ref(null) }),
}))

vi.mock('../lib/parseLogInput', () => ({
  parseLogInput: vi.fn(),
  ParseError: class ParseError extends Error {},
  rebuildLogInput: vi.fn((input: string) => input),
}))

vi.mock('../lib/progression', () => ({
  suggest: () => mockSuggestion.value,
}))

vi.mock('../lib/exerciseLibrary', () => ({
  toSessionExercise: vi.fn(),
  getMusclesForExercise: () => [],
}))

vi.mock('../lib/templateLibrary', () => ({
  saveTemplate: vi.fn(),
}))

vi.mock('../lib/delightCopy', () => ({
  getCompleteWorkoutMessage: () => 'Nice work!',
}))

vi.mock('../lib/strengthGoals', () => ({
  getGoal: () => null,
}))

vi.mock('../lib/debugEvents', () => ({
  emitDebugEvent: vi.fn(),
}))

vi.mock('../components/ExercisePicker.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../components/SetEditModal.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../components/ExerciseHistoryModal.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../components/ExerciseSetsGroup.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../components/PlateCalculator.vue', () => ({
  default: { template: '<div />' },
}))

function mountPage() {
  return mount(WorkoutPage, {
    global: {
      stubs: {
        Transition: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('WorkoutPage collapsible stats', () => {
  beforeEach(() => {
    mockSuggestion.value = null
    mockBestWeight.value = 0
    mockCurrentExercise.value = {
      name: 'Barbell RDL',
      slotKey: 'slot-1',
      warmupSets: 1,
      workingSets: 3,
      repRange: [8, 12],
      restSeconds: [90],
    }
  })

  it('hides stats section when no stats data exists', () => {
    const w = mountPage()
    expect(w.find('.stats-section').exists()).toBe(false)
  })

  it('shows stats section when suggestion data exists', async () => {
    mockSuggestion.value = { weight: 135, reps: 8, rpe: 8 }
    const w = mountPage()
    await nextTick()
    expect(w.find('.stats-section').exists()).toBe(true)
  })

  it('shows stats section when PR data exists', async () => {
    mockBestWeight.value = 200
    const w = mountPage()
    await nextTick()
    expect(w.find('.stats-section').exists()).toBe(true)
  })

  it('stats body is collapsed by default', async () => {
    mockSuggestion.value = { weight: 135, reps: 8, rpe: 8 }
    const w = mountPage()
    await nextTick()
    const body = w.find('.stats-body')
    expect(body.exists()).toBe(true)
    expect(body.isVisible()).toBe(false)
  })

  it('clicking toggle expands stats body', async () => {
    mockSuggestion.value = { weight: 135, reps: 8, rpe: 8 }
    const w = mountPage()
    await nextTick()
    await w.find('.stats-toggle').trigger('click')
    expect(w.find('.stats-body').isVisible()).toBe(true)
  })

  it('clicking toggle again collapses stats body', async () => {
    mockSuggestion.value = { weight: 135, reps: 8, rpe: 8 }
    const w = mountPage()
    await flushPromises()

    const toggle = w.find('.stats-toggle')
    const body = w.find('.stats-body')

    await toggle.trigger('click')
    await flushPromises()
    expect(body.attributes('style')).not.toContain('display: none')

    await toggle.trigger('click')
    await flushPromises()
    expect(body.attributes('style')).toContain('display: none')
  })
})
