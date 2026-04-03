import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PlateCalculator from './PlateCalculator.vue'

const teleportStub = { template: '<div class="teleport-stub"><slot /></div>' }

function mountCalc(props: Record<string, unknown> = {}) {
  return mount(PlateCalculator, {
    props,
    global: { stubs: { Teleport: teleportStub } },
  })
}

function getInput(w: ReturnType<typeof mount>) {
  return w.find<HTMLInputElement>('.plate-weight-input')
}

function getPlateBtn(w: ReturnType<typeof mount>, weight: number) {
  const btns = w.findAll('.plate-btn')
  return btns.find(b => b.text().includes(String(weight)))!
}

describe('PlateCalculator', () => {
  describe('addPlate', () => {
    it('tapping 45 updates total to 135 (bar + 45x2)', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      expect(getInput(w).element.value).toBe('135')
    })

    it('tapping 45 twice shows 2x count and 225 total', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      await getPlateBtn(w, 45).trigger('click')
      expect(getInput(w).element.value).toBe('225')
      expect(getPlateBtn(w, 45).text()).toContain('2x')
    })

    it('tapping different plates accumulates correctly', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      await getPlateBtn(w, 25).trigger('click')
      expect(getInput(w).element.value).toBe('185')
    })
  })

  describe('undoLastPlate', () => {
    it('removes the last added plate', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      await getPlateBtn(w, 25).trigger('click')
      expect(getInput(w).element.value).toBe('185')

      await w.find('[aria-label="Undo last plate"]').trigger('click')
      expect(getInput(w).element.value).toBe('135')
    })

    it('is disabled when no plates loaded', () => {
      const w = mountCalc()
      const btn = w.find('[aria-label="Undo last plate"]')
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('clearAll', () => {
    it('resets to bar-only weight', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      await getPlateBtn(w, 25).trigger('click')
      expect(getInput(w).element.value).toBe('185')

      const clearBtn = w.findAll('.plate-action-btn').find(b => b.text().includes('Clear'))!
      await clearBtn.trigger('click')
      expect(getInput(w).element.value).toBe('45')
    })
  })

  describe('handleInputChange', () => {
    it('typing a valid weight auto-decomposes plates', async () => {
      const w = mountCalc()
      const input = getInput(w)
      await input.setValue('225')
      const btn45 = getPlateBtn(w, 45)
      expect(btn45.classes()).toContain('active')
      expect(btn45.text()).toContain('2x')
    })

    it('typing empty string clears plates', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')
      const input = getInput(w)
      await input.setValue('')
      const btn45 = getPlateBtn(w, 45)
      expect(btn45.classes()).not.toContain('active')
    })

    it('typing a value less than bar weight shows empty plates (no crash)', async () => {
      const w = mountCalc()
      const input = getInput(w)
      await input.setValue('3')
      expect(w.find('.plate-btn.active').exists()).toBe(false)
    })
  })

  describe('handleInputBlur', () => {
    it('snaps input to nearest loadable weight', async () => {
      const w = mountCalc()
      const input = getInput(w)
      await input.setValue('227')
      await input.trigger('blur')
      expect(getInput(w).element.value).toBe('225')
    })
  })

  describe('cycleBarWeight', () => {
    it('cycles through bar weights', async () => {
      const w = mountCalc()
      expect(w.find('.bar-weight-btn').text()).toContain('BAR (45)')

      await w.find('.bar-weight-btn').trigger('click')
      await flushPromises()
      expect(w.find('.bar-weight-btn').text()).toContain('BAR (35)')

      await w.find('.bar-weight-btn').trigger('click')
      await flushPromises()
      expect(w.find('.bar-weight-btn').text()).toContain('BAR (15)')

      await w.find('.bar-weight-btn').trigger('click')
      await flushPromises()
      expect(w.find('.bar-weight-btn').text()).toContain('NO BAR')

      await w.find('.bar-weight-btn').trigger('click')
      await flushPromises()
      expect(w.find('.bar-weight-btn').text()).toContain('BAR (45)')
    })

    it('recalculates plates to preserve target weight', async () => {
      const w = mountCalc()
      const input = getInput(w)
      await input.setValue('135')

      const barBtn = w.find('.bar-weight-btn')
      await barBtn.trigger('click')
      const newVal = parseFloat(getInput(w).element.value)
      expect(newVal).toBeGreaterThan(0)
    })
  })

  describe('emits', () => {
    it('emits use with total weight on confirm', async () => {
      const w = mountCalc()
      await getPlateBtn(w, 45).trigger('click')

      await w.find('.plate-use-btn').trigger('click')
      expect(w.emitted('use')).toBeTruthy()
      expect(w.emitted('use')![0]).toEqual([135])
    })

    it('emits close on backdrop click', async () => {
      const w = mountCalc()
      await w.find('.plate-overlay').trigger('click')
      expect(w.emitted('close')).toBeTruthy()
    })

    it('emits close on close button click', async () => {
      const w = mountCalc()
      await w.find('.plate-close-btn').trigger('click')
      expect(w.emitted('close')).toBeTruthy()
    })
  })

  describe('initialWeight prop', () => {
    it('pre-fills with initial weight and decomposes plates', async () => {
      const w = mountCalc({ initialWeight: 225 })
      await flushPromises()
      expect(getInput(w).element.value).toBe('225')
      const btn45 = getPlateBtn(w, 45)
      expect(btn45.classes()).toContain('active')
      expect(btn45.text()).toContain('2x')
    })

    it('defaults to bar weight when no initial weight', () => {
      const w = mountCalc()
      expect(getInput(w).element.value).toBe('45')
    })
  })
})
