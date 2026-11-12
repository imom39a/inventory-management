import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../src/api', () => ({
  api: { getInventory: vi.fn() }
}))

// Keep the real CSV building; only stub the browser download so the test can read the file.
vi.mock('../../src/utils/csv', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))

import { api } from '../../src/api'
import { downloadCsv } from '../../src/utils/csv'
import { useFilters } from '../../src/composables/useFilters'
import { useI18n } from '../../src/composables/useI18n'
import Inventory from '../../src/views/Inventory.vue'

const item = (id, sku, name, quantity_on_hand, reorder_point = 20) => ({
  id,
  sku,
  name,
  category: 'Sensors',
  warehouse: 'London',
  quantity_on_hand,
  reorder_point,
  unit_cost: 2,
  location: 'Warehouse B-07'
})

// API order differs from display order: the table puts Low Stock first.
const fixture = () => [
  item('1', 'MTR-001', 'Stepper Motor', 100),
  item('2', 'SNS-001', 'Temperature Sensor Module', 5),
  item('3', 'SNS-002', 'Pressure Sensor', 25)
]

const mounted = []
const mountView = async () => {
  const wrapper = mount(Inventory)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const exportButton = (wrapper) => wrapper.find('[data-testid="export-csv"]')
const exportedCsv = () => downloadCsv.mock.calls.at(-1)[1]
const csvColumn = (csv, index) =>
  csv
    .split('\r\n')
    .slice(1)
    .map((line) => line.split(',')[index])
const tableSkus = (wrapper) => wrapper.findAll('tbody tr').map((tr) => tr.find('td').text())
const tableStatuses = (wrapper) => wrapper.findAll('tbody tr').map((tr) => tr.find('td:last-child').text())

describe('Inventory CSV export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFilters().resetFilters()
    api.getInventory.mockResolvedValue(fixture())
  })

  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    useI18n().setLocale('en')
  })

  it('shows an Export CSV button once the inventory has loaded', async () => {
    const wrapper = await mountView()
    expect(exportButton(wrapper).text()).toBe('Export CSV')
    expect(exportButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('exports the rows on screen, in the order the table shows them', async () => {
    const wrapper = await mountView()
    await exportButton(wrapper).trigger('click')

    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(downloadCsv.mock.calls[0][0]).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csvColumn(exportedCsv(), 0)).toEqual(tableSkus(wrapper))
    expect(csvColumn(exportedCsv(), 0)).toEqual(['SNS-001', 'SNS-002', 'MTR-001'])
  })

  it('uses the same stock status labels as the table', async () => {
    const wrapper = await mountView()
    await exportButton(wrapper).trigger('click')
    expect(csvColumn(exportedCsv(), 8)).toEqual(tableStatuses(wrapper))
  })

  it('exports only the items that match the search', async () => {
    const wrapper = await mountView()
    await wrapper.find('input.search-input').setValue('sensor')
    await exportButton(wrapper).trigger('click')
    expect(csvColumn(exportedCsv(), 0)).toEqual(['SNS-001', 'SNS-002'])
  })

  it('is disabled when the search matches nothing', async () => {
    const wrapper = await mountView()
    await wrapper.find('input.search-input').setValue('no such part')
    expect(exportButton(wrapper).attributes('disabled')).toBeDefined()
    await exportButton(wrapper).trigger('click')
    expect(downloadCsv).not.toHaveBeenCalled()
  })

  it('labels the button in Japanese when the language is Japanese', async () => {
    useI18n().setLocale('ja')
    const wrapper = await mountView()
    expect(exportButton(wrapper).text()).toBe(useI18n().t('inventory.exportCsv'))
    expect(exportButton(wrapper).text()).not.toBe('Export CSV')
  })
})
