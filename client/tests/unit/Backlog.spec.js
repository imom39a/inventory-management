import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../src/api', () => ({
  api: {
    getBacklog: vi.fn(),
    getInventory: vi.fn()
  }
}))

import { api } from '../../src/api'
import { useFilters } from '../../src/composables/useFilters'
import { useI18n } from '../../src/composables/useI18n'
import Backlog from '../../src/views/Backlog.vue'

const backlog = [
  {
    id: 1,
    order_id: 'ORD-1',
    item_sku: 'PCB-001',
    item_name: 'Single Layer PCB Assembly',
    quantity_needed: 100,
    quantity_available: 40,
    days_delayed: 10,
    priority: 'high'
  },
  {
    id: 2,
    order_id: 'ORD-2',
    item_sku: 'PCB-002',
    item_name: 'Dual Layer PCB Assembly',
    quantity_needed: 20,
    quantity_available: 15,
    days_delayed: 3,
    priority: 'low'
  }
]

// Mounted views keep watching the shared filter singleton, so unmount between tests.
const mounted = []
const mountView = async () => {
  const wrapper = mount(Backlog)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Backlog view i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFilters().resetFilters()
    api.getBacklog.mockResolvedValue(JSON.parse(JSON.stringify(backlog)))
    api.getInventory.mockResolvedValue([])
  })

  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    useI18n().setLocale('en')
  })

  it('renders in English', async () => {
    const text = (await mountView()).text()
    expect(text).toContain('Backlog Management')
    expect(text).toContain('Total Backlog Items')
    expect(text).toContain('Quantity Needed')
    expect(text).toContain('Days Delayed')
    expect(text).toContain('60 units short')
    expect(text).toContain('10 days')
    expect(text).toContain('High')
    expect(text).toContain('Single Layer PCB Assembly')
  })

  it('renders in Japanese with translated product names', async () => {
    useI18n().setLocale('ja')
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).not.toContain('Backlog Management')
    expect(text).toContain('バックログ管理')
    expect(text).toContain('必要数量')
    expect(text).toContain('遅延日数')
    expect(text).toContain('60単位不足')
    expect(text).toContain('10日')
    expect(wrapper.find('.badge.high').text()).toBe('高')
    expect(wrapper.find('.badge.low').text()).toBe('低')
    expect(text).toContain('単層PCB組立')
    expect(text).not.toContain('Single Layer PCB Assembly')
  })

  it('shows a localized empty state without a glyph', async () => {
    api.getBacklog.mockResolvedValue([])
    const wrapper = await mountView()
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('No backlog items - all orders can be fulfilled!')
    expect(wrapper.text()).not.toContain('✓')

    useI18n().setLocale('ja')
    await flushPromises()
    expect(wrapper.text()).not.toContain('No backlog items')
  })

  it('localizes the error message', async () => {
    api.getBacklog.mockRejectedValue(new Error('down'))
    const wrapper = await mountView()
    expect(wrapper.find('.error').text()).toBe('Failed to load backlog: down')
  })
})
