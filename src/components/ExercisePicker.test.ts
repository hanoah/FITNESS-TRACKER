import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ExercisePicker from './ExercisePicker.vue'
import type { ExerciseInfo } from '../lib/exerciseLibrary'

const mockExercises = vi.hoisted<ExerciseInfo[]>(() => [
  { name: 'Bench Press', source: 'program', muscles: { primary: ['chest'], secondary: ['triceps'] } },
  { name: 'Squat', source: 'program', muscles: { primary: ['quads'], secondary: ['glutes'] } },
  { name: 'My Custom Lift', source: 'history' },
  { name: 'Unknown Thing', source: 'history', muscles: { primary: [], secondary: [] } },
])

vi.mock('../lib/exerciseLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/exerciseLibrary')>()
  return {
    ...actual,
    loadCachedExercises: vi.fn().mockResolvedValue(mockExercises),
    getRecentExercises: vi.fn().mockResolvedValue([]),
    getMuscleGroups: vi.fn().mockReturnValue(['chest', 'quads', 'triceps', 'glutes']),
  }
})

const RInputStub = defineComponent({
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { class: (props as { placeholder?: string }).placeholder?.includes('Search') ? 'search-input' : 'custom-input' }, [
      h('input', {
        value: (props as { modelValue?: string }).modelValue,
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      }),
    ])
  },
})

const RButtonStub = defineComponent({
  props: ['type', 'disabled'],
  setup(_, { slots }) {
    return () => h('button', {}, slots.default?.())
  },
})

const RTextStub = defineComponent({
  props: ['tag'],
  setup(props, { slots, attrs }) {
    return () => h((props as { tag?: string }).tag || 'span', { class: attrs.class }, slots.default?.())
  },
})

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(ExercisePicker, {
    props: { title: 'Test Picker', ...props },
    global: {
      stubs: {
        Teleport: true,
        RInput: RInputStub,
        RButton: RButtonStub,
        RText: RTextStub,
      },
    },
  })
}

describe('ExercisePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders matched exercises in main results when contextMuscles is set', async () => {
    const wrapper = mountPicker({ contextMuscles: ['chest'] })
    await flushPromises()

    const input = wrapper.find('.search-input input')
    await input.setValue('e')
    await flushPromises()

    const items = wrapper.findAll('.list-item')
    const names = items.map((btn) => btn.text())
    expect(names).toContain('Bench Press')
    expect(names).not.toContain('Squat')
  })

  it('renders unclassified exercises in separate section when contextMuscles is set', async () => {
    const wrapper = mountPicker({ contextMuscles: ['chest'] })
    await flushPromises()

    const labels = wrapper.findAll('.section-label')
    const unclassifiedLabel = labels.find((el) => el.text().includes('Custom / Unclassified'))
    expect(unclassifiedLabel).toBeTruthy()

    const sections = wrapper.findAll('.section')
    const unclassifiedSection = sections.find((s) =>
      s.find('.section-label')?.text().includes('Custom / Unclassified')
    )
    expect(unclassifiedSection).toBeTruthy()
    const unclassifiedItems = unclassifiedSection!.findAll('.list-item')
    const unclassifiedNames = unclassifiedItems.map((btn) => btn.text())
    expect(unclassifiedNames).toContain('My Custom Lift')
    expect(unclassifiedNames).toContain('Unknown Thing')
  })

  it('search filters both matched and unclassified groups', async () => {
    const wrapper = mountPicker({ contextMuscles: ['chest'] })
    await flushPromises()

    const input = wrapper.find('.search-input input')
    await input.setValue('Custom')
    await flushPromises()

    const items = wrapper.findAll('.list-item')
    const names = items.map((btn) => btn.text())
    expect(names).toContain('My Custom Lift')
    expect(names).not.toContain('Bench Press')
    expect(names).not.toContain('Squat')
  })

  it('custom exercise name addition emits correct ExerciseInfo', async () => {
    const wrapper = mountPicker()
    await flushPromises()

    const customInput = wrapper.find('.custom-input input')
    await customInput.setValue('Brand New Exercise')
    await wrapper.find('.custom-row button').trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual({ name: 'Brand New Exercise', source: 'history' })
  })
})
