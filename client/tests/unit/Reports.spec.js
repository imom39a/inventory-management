import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../src/api', () => ({
  api: {
    getQuarterlyReports: vi.fn(),
    getMonthlyTrends: vi.fn()
  }
}))

import { api } from '../../src/api'
import { useFilters } from '../../src/composables/useFilters'
import { useI18n } from '../../src/composables/useI18n'
import Reports from '../../src/views/Reports.vue'

const quarterly = [
  { quarter: 'Q1', total_orders: 10, total_revenue: 1000, avg_order_value: 100, fulfillment_rate: 95 },
  { quarter: 'Q2', total_orders: 20, total_revenue: 3000.5, avg_order_value: 150.025, fulfillment_rate: 80 }
]
const monthly = [
  { month: '2025-01', order_count: 4, revenue: 0 },
  { month: '2025-02', order_count: 6, revenue: 500 },
  { month: '2025-03', order_count: 5, revenue: 250 }
]

// Mounted views keep watching the shared filter singleton, so unmount between tests.
const mounted = []
const mountView = async () => {
  const wrapper = mount(Reports)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Reports view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFilters().resetFilters()
    api.getQuarterlyReports.mockResolvedValue(quarterly)
    api.getMonthlyTrends.mockResolvedValue(monthly)
  })

  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    useI18n().setLocale('en')
    vi.restoreAllMocks()
  })

  it('renders rows keyed by data with formatted values', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Performance Reports')
    expect(wrapper.text()).toContain('Quarterly Performance')
    expect(wrapper.text()).toContain('Month-over-Month Analysis')
    expect(wrapper.find('[data-testid="quarter-row-Q1"]').text()).toContain('$1,000.00')
    expect(wrapper.find('[data-testid="quarter-row-Q2"]').text()).toContain('$3,000.50')
    expect(wrapper.findAll('[data-testid^="month-row-"]')).toHaveLength(3)
    const feb = wrapper.find('[data-testid="month-row-2025-02"]').text()
    expect(feb).toContain('Feb 2025')
    // Previous month revenue is 0, so growth is undefined.
    expect(feb).toContain('N/A')
    expect(feb).toContain('+$500.00')
    expect(wrapper.find('[data-testid="month-row-2025-03"]').text()).toContain('-$250.00')
    expect(wrapper.find('[data-testid="month-row-2025-03"]').text()).toContain('-50.0%')
  })

  it('computes summary stats', async () => {
    const wrapper = await mountView()
    const text = wrapper.find('.stats-grid').text()
    expect(text).toContain('$750.00')
    expect(text).toContain('$250.00')
    expect(text).toContain('15')
    expect(text).toContain('Q2')
  })

  it('passes current filters to both API calls and reloads when a filter changes', async () => {
    await mountView()
    const initial = { warehouse: 'all', category: 'all', status: 'all' }
    expect(api.getQuarterlyReports).toHaveBeenCalledWith(initial)
    expect(api.getMonthlyTrends).toHaveBeenCalledWith(initial)

    useFilters().selectedLocation.value = 'Tokyo'
    await flushPromises()
    const next = { warehouse: 'Tokyo', category: 'all', status: 'all' }
    expect(api.getQuarterlyReports).toHaveBeenLastCalledWith(next)
    expect(api.getMonthlyTrends).toHaveBeenLastCalledWith(next)

    useFilters().selectedPeriod.value = '2025-02'
    await flushPromises()
    expect(api.getMonthlyTrends).toHaveBeenLastCalledWith({ ...next, month: '2025-02' })
    expect(api.getQuarterlyReports).toHaveBeenCalledTimes(3)
  })

  it('ignores a stale response that resolves after a newer one', async () => {
    let resolveFirst
    api.getQuarterlyReports.mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
    const wrapper = mount(Reports)
    mounted.push(wrapper)
    await flushPromises()
    api.getQuarterlyReports.mockResolvedValueOnce([quarterly[1]])
    useFilters().selectedLocation.value = 'Tokyo'
    await flushPromises()
    resolveFirst([quarterly[0]])
    await flushPromises()
    expect(wrapper.find('[data-testid="quarter-row-Q2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quarter-row-Q1"]').exists()).toBe(false)
  })

  it('shows Japanese title, localized months and yen', async () => {
    useI18n().setLocale('ja')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('パフォーマンスレポート')
    expect(wrapper.text()).not.toContain('Performance Reports')
    // 1000 USD * 150
    expect(wrapper.find('[data-testid="quarter-row-Q1"]').text()).toContain('¥150,000')
    expect(wrapper.find('[data-testid="quarter-row-Q1"]').text()).not.toContain('$')
    expect(wrapper.find('[data-testid="month-row-2025-02"]').text()).toContain('2025年2月')
    expect(wrapper.find('[data-testid="month-row-2025-02"]').text()).toContain('+¥75,000')
  })

  it('does not call console.log while mounting or rendering', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await mountView()
    useFilters().selectedCategory.value = 'sensors'
    await flushPromises()
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows an empty state and a dash for best quarter when there is no data', async () => {
    api.getQuarterlyReports.mockResolvedValue([])
    api.getMonthlyTrends.mockResolvedValue([])
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="reports-empty"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.find('.reports-table').exists()).toBe(false)
  })

  it('shows the best quarter as a dash when all revenue is zero', async () => {
    api.getQuarterlyReports.mockResolvedValue([{ ...quarterly[0], total_revenue: 0 }])
    api.getMonthlyTrends.mockResolvedValue([{ month: '2025-01', order_count: 0, revenue: 0 }])
    const wrapper = await mountView()
    const labels = wrapper.findAll('.stat-card')
    expect(labels[3].find('.stat-value').text()).toBe('-')
    expect(wrapper.find('.bar').attributes('style')).toContain('height: 0px')
  })

  it('shows an error message when loading fails', async () => {
    api.getQuarterlyReports.mockRejectedValue(new Error('down'))
    const wrapper = await mountView()
    expect(wrapper.find('.error').text()).toContain('down')
  })
})
