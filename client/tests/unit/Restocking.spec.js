import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../src/api', () => ({
  api: {
    getRestockRecommendations: vi.fn(),
    createRestockOrder: vi.fn()
  }
}))

import { api } from '../../src/api'
import { useFilters } from '../../src/composables/useFilters'
import { useI18n } from '../../src/composables/useI18n'
import Restocking from '../../src/views/Restocking.vue'

const line = (sku, warehouse, line_total, extra = {}) => ({
  sku,
  name: `Part ${sku}`,
  warehouse,
  category: 'Electronics',
  quantity_on_hand: 5,
  reorder_point: 20,
  unit_cost: 100,
  quantity: line_total / 100,
  line_total,
  urgency: 0.5,
  recommended: false,
  ...extra
})

// Ordered most urgent first. At a $5,000 budget the greedy rule picks A, skips B (too big),
// picks C, skips D, then picks the smaller E that still fits.
const fixture = () => ({
  max_budget: 10000,
  budget: 5000,
  recommended_total: 4900,
  candidates: [
    line('A-1', 'San Francisco', 3000, { recommended: true }),
    line('B-1', 'London', 4000),
    line('C-1', 'Tokyo', 1500, { recommended: true }),
    line('D-1', 'San Francisco', 600),
    line('E-1', 'London', 400, { recommended: true })
  ]
})

// Mounted views keep watching the shared filter singleton, so unmount between tests.
const mounted = []
const mountView = async () => {
  const wrapper = mount(Restocking, {
    global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } }
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const tid = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const checked = (wrapper, sku) => tid(wrapper, `candidate-checkbox-${sku}`).element.checked
const disabled = (wrapper, sku) => tid(wrapper, `candidate-checkbox-${sku}`).element.disabled

describe('Restocking view', () => {
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    useI18n().setLocale('en')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useFilters().resetFilters()
    api.getRestockRecommendations.mockResolvedValue(fixture())
  })

  it('loads without a budget and configures the slider', async () => {
    const wrapper = await mountView()
    expect(api.getRestockRecommendations).toHaveBeenCalledWith({ warehouse: 'all', category: 'all' })
    const slider = tid(wrapper, 'budget-slider')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('10000')
    expect(slider.attributes('step')).toBe('500')
    expect(slider.element.value).toBe('5000')
    expect(tid(wrapper, 'budget-value').text()).toContain('$5,000')
  })

  it('uses the budget returned by the server as the initial budget', async () => {
    // A value the client's own 50% rule would not produce proves the server's is used.
    api.getRestockRecommendations.mockResolvedValue({ ...fixture(), max_budget: 9700, budget: 3000 })
    const wrapper = await mountView()
    expect(tid(wrapper, 'budget-slider').element.value).toBe('3000')
    expect(tid(wrapper, 'budget-value').text()).toContain('$3,000')
  })

  it('ticks recommended lines using the greedy whole-line rule', async () => {
    const wrapper = await mountView()
    expect(['A-1', 'B-1', 'C-1', 'D-1', 'E-1'].map((s) => checked(wrapper, s))).toEqual([
      true, false, true, false, true
    ])
    expect(tid(wrapper, 'selected-total').text()).toContain('$4,900.00')
    expect(tid(wrapper, 'remaining-budget').text()).toContain('$100.00')
  })

  it('re-selects when the slider moves, without another request', async () => {
    const wrapper = await mountView()
    await tid(wrapper, 'budget-slider').setValue(9000)
    expect(['A-1', 'B-1', 'C-1', 'D-1', 'E-1'].map((s) => checked(wrapper, s))).toEqual([
      true, true, true, false, true
    ])
    expect(tid(wrapper, 'budget-value').text()).toContain('$9,000')
    expect(api.getRestockRecommendations).toHaveBeenCalledTimes(1)

    await tid(wrapper, 'budget-slider').setValue(0)
    expect(['A-1', 'B-1', 'C-1', 'D-1', 'E-1'].some((s) => checked(wrapper, s))).toBe(false)
  })

  it('updates total and remaining when a line is unticked', async () => {
    const wrapper = await mountView()
    await tid(wrapper, 'candidate-checkbox-C-1').setValue(false)
    expect(tid(wrapper, 'selected-total').text()).toContain('$3,400.00')
    expect(tid(wrapper, 'remaining-budget').text()).toContain('$1,600.00')
  })

  it('disables unticked lines that do not fit and allows re-ticking ones that do', async () => {
    const wrapper = await mountView()
    // $100 remaining: nothing unticked fits.
    expect(disabled(wrapper, 'B-1')).toBe(true)
    expect(disabled(wrapper, 'D-1')).toBe(true)
    // Ticked lines stay enabled so they can be unticked.
    expect(disabled(wrapper, 'A-1')).toBe(false)

    await tid(wrapper, 'candidate-checkbox-C-1').setValue(false)
    // $1,600 remaining: D (600) fits, B (4000) does not.
    expect(disabled(wrapper, 'D-1')).toBe(false)
    expect(disabled(wrapper, 'B-1')).toBe(true)

    await tid(wrapper, 'candidate-checkbox-D-1').setValue(true)
    expect(checked(wrapper, 'D-1')).toBe(true)
    expect(tid(wrapper, 'remaining-budget').text()).toContain('$1,000.00')
  })

  it('disables Place Order when nothing is selected', async () => {
    const wrapper = await mountView()
    expect(tid(wrapper, 'place-order-button').element.disabled).toBe(false)
    await tid(wrapper, 'budget-slider').setValue(0)
    expect(tid(wrapper, 'place-order-button').element.disabled).toBe(true)
  })

  it('submits the budget and selected SKUs, shows confirmation and reloads', async () => {
    api.createRestockOrder.mockResolvedValue([
      { id: 1, order_number: 'RST-2026-0001', warehouse: 'San Francisco', total_cost: 3000 },
      { id: 2, order_number: 'RST-2026-0002', warehouse: 'Tokyo', total_cost: 1900 }
    ])
    const reloaded = fixture()
    reloaded.candidates = reloaded.candidates.filter((c) => !['A-1', 'C-1', 'E-1'].includes(c.sku))
    api.getRestockRecommendations.mockResolvedValueOnce(fixture()).mockResolvedValueOnce(reloaded)

    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()

    expect(api.createRestockOrder).toHaveBeenCalledWith(5000, ['A-1', 'C-1', 'E-1'])
    const success = tid(wrapper, 'restock-success')
    expect(success.text()).toContain('RST-2026-0001')
    expect(success.text()).toContain('RST-2026-0002')
    expect(api.getRestockRecommendations).toHaveBeenCalledTimes(2)
    expect(tid(wrapper, 'candidate-row-A-1').exists()).toBe(false)
    expect(tid(wrapper, 'candidate-row-B-1').exists()).toBe(true)
  })

  it('shows the server error detail on a 400', async () => {
    api.createRestockOrder.mockRejectedValue({ response: { data: { detail: 'Total exceeds budget' } } })
    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'restock-error').text()).toContain('Total exceeds budget')
    expect(tid(wrapper, 'restock-success').exists()).toBe(false)
  })

  it('falls back to a generic error message', async () => {
    api.createRestockOrder.mockRejectedValue(new Error('Network Error'))
    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'restock-error').text()).toContain('Failed to place the Restock Order')
  })

  it('shows an empty state when there are no candidates', async () => {
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 0, budget: 0, recommended_total: 0, candidates: []
    })
    const wrapper = await mountView()
    expect(tid(wrapper, 'restock-empty').exists()).toBe(true)
    expect(tid(wrapper, 'place-order-button').element.disabled).toBe(true)
  })

  it('reloads on filter change without a budget and clamps the budget', async () => {
    const wrapper = await mountView()
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 4000,
      budget: 2000,
      recommended_total: 4000,
      candidates: [line('B-1', 'London', 4000, { recommended: true })]
    })
    const { selectedLocation, selectedCategory } = useFilters()
    selectedLocation.value = 'London'
    selectedCategory.value = 'Electronics'
    await flushPromises()

    expect(api.getRestockRecommendations).toHaveBeenLastCalledWith({
      warehouse: 'London',
      category: 'Electronics'
    })
    expect(tid(wrapper, 'budget-slider').attributes('max')).toBe('4000')
    expect(tid(wrapper, 'budget-slider').element.value).toBe('4000')
    expect(checked(wrapper, 'B-1')).toBe(true)
  })

  it('keeps the user budget when it still fits the new maximum', async () => {
    const wrapper = await mountView()
    await tid(wrapper, 'budget-slider').setValue(3000)
    api.getRestockRecommendations.mockResolvedValue({
      ...fixture(),
      max_budget: 8000,
      candidates: [line('A-1', 'San Francisco', 3000), line('D-1', 'San Francisco', 600)]
    })
    useFilters().selectedLocation.value = 'San Francisco'
    await flushPromises()
    expect(tid(wrapper, 'budget-slider').element.value).toBe('3000')
    expect(checked(wrapper, 'A-1')).toBe(true)
    expect(checked(wrapper, 'D-1')).toBe(false)
  })

  it('lets the slider reach a non-step-aligned max_budget so everything can be selected', async () => {
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 14437.5,
      budget: 7000,
      recommended_total: 0,
      candidates: [line('A-1', 'London', 10000), line('B-1', 'London', 4437.5)]
    })
    const wrapper = await mountView()
    expect(tid(wrapper, 'budget-slider').attributes('max')).toBe('14500')
    await tid(wrapper, 'budget-slider').setValue(14500)
    expect(checked(wrapper, 'A-1')).toBe(true)
    expect(checked(wrapper, 'B-1')).toBe(true)
  })

  it('clamps the budget to the step-aligned slider max after a filter change', async () => {
    const wrapper = await mountView()
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 4437.5,
      budget: 2000,
      recommended_total: 0,
      candidates: [line('B-1', 'London', 4437.5)]
    })
    useFilters().selectedLocation.value = 'London'
    await flushPromises()
    expect(tid(wrapper, 'budget-slider').element.value).toBe('4500')
    expect(tid(wrapper, 'budget-value').text()).toContain('$4,500')
  })

  it('compares money in cents so float drift does not drop a line that exactly fits', async () => {
    // 1000.1 + 2000.2 is 3000.3000000000002 in floats, so 5000 - that < 1999.7 without cents math.
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 10000,
      budget: 5000,
      recommended_total: 5000,
      candidates: [
        line('A-1', 'London', 1000.1),
        line('B-1', 'London', 2000.2),
        line('C-1', 'London', 1999.7)
      ]
    })
    const wrapper = await mountView()
    expect(['A-1', 'B-1', 'C-1'].map((s) => checked(wrapper, s))).toEqual([true, true, true])
    expect(tid(wrapper, 'remaining-budget').text()).toContain('$0.00')
    await tid(wrapper, 'candidate-checkbox-C-1').setValue(false)
    expect(disabled(wrapper, 'C-1')).toBe(false)
  })

  it('shows cents for money values and decimals for a non-whole budget', async () => {
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 10000,
      budget: 5000,
      recommended_total: 0,
      candidates: [line('A-1', 'London', 1234.5, { unit_cost: 12.34 })]
    })
    const wrapper = await mountView()
    const row = tid(wrapper, 'candidate-row-A-1').text()
    expect(row).toContain('$12.34')
    expect(row).toContain('$1,234.50')
  })

  it('deducts the placed total from the budget and re-allocates after success', async () => {
    api.createRestockOrder.mockResolvedValue([
      { id: 1, order_number: 'RST-2026-0001', warehouse: 'San Francisco', total_cost: 3000 }
    ])
    const rest = fixture()
    rest.candidates = rest.candidates.filter((c) => c.sku !== 'A-1')
    api.getRestockRecommendations.mockResolvedValueOnce(fixture()).mockResolvedValueOnce(rest)
    const wrapper = await mountView()
    await tid(wrapper, 'budget-slider').setValue(10000)
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'budget-value').text()).toContain('$7,000')
    // Greedy at 7000 over B(4000), C(1500), D(600), E(400).
    expect(['B-1', 'C-1', 'D-1', 'E-1'].map((s) => checked(wrapper, s))).toEqual([true, true, true, true])
    expect(tid(wrapper, 'remaining-budget').text()).toContain('$500.00')
  })

  it('floors the deducted budget at zero', async () => {
    api.createRestockOrder.mockResolvedValue([
      { id: 1, order_number: 'RST-2026-0001', warehouse: 'London', total_cost: 99999 }
    ])
    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'budget-value').text()).toContain('$0')
  })

  it('keeps the page and success banner when the reload after ordering fails', async () => {
    api.createRestockOrder.mockResolvedValue([
      { id: 1, order_number: 'RST-2026-0001', warehouse: 'London', total_cost: 400 }
    ])
    api.getRestockRecommendations.mockResolvedValueOnce(fixture()).mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'restock-success').exists()).toBe(true)
    expect(tid(wrapper, 'restock-load-error').exists()).toBe(true)
    expect(tid(wrapper, 'candidate-row-A-1').exists()).toBe(true)
  })

  it('shows a full-page error only when the first load fails', async () => {
    api.getRestockRecommendations.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    expect(wrapper.find('.error').exists()).toBe(true)
    expect(tid(wrapper, 'budget-slider').exists()).toBe(false)
  })

  it('uses the generic message when the error detail is not a string', async () => {
    api.createRestockOrder.mockRejectedValue({ response: { data: { detail: [{ msg: 'bad' }] } } })
    const wrapper = await mountView()
    await tid(wrapper, 'place-order-button').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'restock-error').text()).toContain('Failed to place the Restock Order')
  })

  it('does not reload when period or status filters change', async () => {
    await mountView()
    const { selectedPeriod, selectedStatus } = useFilters()
    selectedPeriod.value = '2026-03'
    selectedStatus.value = 'Delivered'
    await flushPromises()
    expect(api.getRestockRecommendations).toHaveBeenCalledTimes(1)
  })

  it('renders translated labels and categories in Japanese', async () => {
    api.getRestockRecommendations.mockResolvedValue({
      max_budget: 10000,
      budget: 5000,
      recommended_total: 0,
      candidates: [line('A-1', 'London', 1000, { category: 'Sensors' })]
    })
    useI18n().setLocale('ja')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('補充発注')
    expect(tid(wrapper, 'candidate-row-A-1').text()).toContain('センサー')
    expect(tid(wrapper, 'candidate-row-A-1').text()).not.toContain('Sensors')
  })
})
