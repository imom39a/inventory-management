import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../src/api', () => ({
  api: {
    getOrders: vi.fn(),
    getRestockOrders: vi.fn()
  }
}))

import { api } from '../../src/api'
import { useFilters } from '../../src/composables/useFilters'
import { useI18n } from '../../src/composables/useI18n'
import Orders from '../../src/views/Orders.vue'

const customerOrders = [
  {
    id: 1,
    order_number: 'ORD-1001',
    customer: 'Acme Corp',
    items: [{ name: 'Widget', quantity: 2, unit_price: 10 }],
    status: 'Delivered',
    order_date: '2026-01-05',
    expected_delivery: '2026-01-10',
    total_value: 20
  }
]

const restockOrders = [
  {
    id: 2,
    order_number: 'RST-2026-0002',
    warehouse: 'London',
    status: 'Submitted',
    placed_at: '2026-03-02T10:00:00Z',
    lead_time_days: 10,
    expected_arrival: '2026-03-12T10:00:00Z',
    items: [
      { sku: 'L-1', name: 'Gasket', category: 'Parts', quantity: 4, unit_cost: 25, line_total: 100 }
    ],
    total_cost: 1234
  },
  {
    id: 1,
    order_number: 'RST-2026-0001',
    warehouse: 'Tokyo',
    status: 'Submitted',
    placed_at: '2026-03-01T10:00:00Z',
    lead_time_days: 14,
    expected_arrival: '2026-03-15T10:00:00Z',
    items: [
      { sku: 'T-1', name: 'Valve', category: 'Parts', quantity: 1, unit_cost: 50, line_total: 50 }
    ],
    total_cost: 50
  }
]

// Mounted views keep watching the shared filter singleton, so unmount between tests.
const mounted = []
const mountView = async () => {
  const wrapper = mount(Orders)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Orders view restock section', () => {
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    useI18n().setLocale('en')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useFilters().resetFilters()
    api.getOrders.mockResolvedValue(JSON.parse(JSON.stringify(customerOrders)))
    api.getRestockOrders.mockResolvedValue(restockOrders)
  })

  it('renders a row per restock order with its details', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="restock-orders-section"]').exists()).toBe(true)
    const row = wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]')
    expect(row.exists()).toBe(true)
    const text = row.text()
    expect(text).toContain('RST-2026-0002')
    expect(text).toContain('London')
    expect(text).toContain('10 days')
    expect(text).toContain('Mar 12, 2026')
    expect(text).toContain('$1,234.00')
    expect(text).toContain('Submitted')
    expect(row.find('details').exists()).toBe(true)
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0001"]').text()).toContain('14 days')
    expect(wrapper.find('[data-testid="restock-orders-empty"]').exists()).toBe(false)
  })

  it('shows an empty state when there are no restock orders', async () => {
    api.getRestockOrders.mockResolvedValue([])
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="restock-orders-empty"]').exists()).toBe(true)
  })

  it('calls getRestockOrders with warehouse and category only, and refetches on change', async () => {
    await mountView()
    expect(api.getRestockOrders).toHaveBeenCalledWith({ warehouse: 'all', category: 'all' })

    const { selectedLocation, selectedStatus } = useFilters()
    selectedLocation.value = 'Tokyo'
    await flushPromises()
    expect(api.getRestockOrders).toHaveBeenLastCalledWith({ warehouse: 'Tokyo', category: 'all' })

    const calls = api.getRestockOrders.mock.calls.length
    selectedStatus.value = 'Delivered'
    await flushPromises()
    expect(api.getRestockOrders).toHaveBeenCalledTimes(calls)
  })

  it('still renders the existing All Orders table', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('All Orders (1)')
    expect(wrapper.text()).toContain('ORD-1001')
    expect(wrapper.text()).toContain('Acme Corp')
  })

  it('keeps the restock section rendered while customer orders are pending', async () => {
    api.getOrders.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]').exists()).toBe(true)
  })

  it('keeps the restock section rendered when customer orders fail to load', async () => {
    api.getOrders.mockRejectedValue(new Error('down'))
    const wrapper = await mountView()
    expect(wrapper.find('.error').exists()).toBe(true)
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]').exists()).toBe(true)
  })

  it('does not unmount the restock section when period or status change', async () => {
    const wrapper = await mountView()
    const { selectedPeriod } = useFilters()
    api.getOrders.mockReturnValue(new Promise(() => {}))
    selectedPeriod.value = '2026-01'
    await flushPromises()
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]').exists()).toBe(true)
  })

  it('ignores a stale restock response that resolves after a newer one', async () => {
    let resolveFirst
    api.getRestockOrders.mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
    const wrapper = mount(Orders)
    mounted.push(wrapper)
    await flushPromises()
    api.getRestockOrders.mockResolvedValueOnce([restockOrders[1]])
    useFilters().selectedLocation.value = 'Tokyo'
    await flushPromises()
    resolveFirst([restockOrders[0]])
    await flushPromises()
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0001"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]').exists()).toBe(false)
  })

  it('renders the restock section in Japanese', async () => {
    useI18n().setLocale('ja')
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="restock-orders-section"]').text()).toContain('発注済みの補充発注')
    expect(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]').text()).toContain('10日')
  })

  it('uses singular and plural item labels in both tables', async () => {
    const two = [
      { name: 'Widget', quantity: 1, unit_price: 1 },
      { name: 'Gadget', quantity: 1, unit_price: 1 }
    ]
    api.getOrders.mockResolvedValue([
      { ...customerOrders[0], id: 1, order_number: 'ORD-ONE' },
      { ...customerOrders[0], id: 2, order_number: 'ORD-TWO', items: two }
    ])
    api.getRestockOrders.mockResolvedValue([
      restockOrders[0],
      { ...restockOrders[1], items: [...restockOrders[0].items, ...restockOrders[1].items] }
    ])
    const wrapper = await mountView()
    const summary = (row) => row.find('summary').text()
    expect(summary(wrapper.find('[data-testid="restock-order-row-RST-2026-0002"]'))).toBe('1 item')
    expect(summary(wrapper.find('[data-testid="restock-order-row-RST-2026-0001"]'))).toBe('2 items')
    const rows = wrapper.find('.orders-table').findAll('tbody tr')
    expect(rows[0].find('summary').text()).toBe('1 item')
    expect(rows[1].find('summary').text()).toBe('2 items')
  })
})
