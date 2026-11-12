import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import FilterBar from '../../src/components/FilterBar.vue'
import { useFilters } from '../../src/composables/useFilters'

const stub = { template: '<div />' }

const mountAt = async (path) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/orders', component: stub },
      { path: '/restocking', component: stub, meta: { hiddenFilters: ['period', 'status'] } },
      { path: '/only-status', component: stub, meta: { hiddenFilters: ['status'] } }
    ]
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(FilterBar, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const labels = (wrapper) => wrapper.findAll('.filter-group label').map((l) => l.text())
const selectFor = (wrapper, index) => wrapper.findAll('.filter-select')[index]

describe('FilterBar', () => {
  let current
  beforeEach(() => useFilters().resetFilters())
  afterEach(() => current?.unmount())

  it('shows all four filters on /orders', async () => {
    const { wrapper } = await mountAt('/orders')
    current = wrapper
    expect(wrapper.findAll('.filter-group')).toHaveLength(4)
    expect(labels(wrapper)).toContain('Time Period')
    expect(labels(wrapper)).toContain('Order Status')
  })

  it('hides Time Period and Order Status on /restocking', async () => {
    const { wrapper } = await mountAt('/restocking')
    current = wrapper
    expect(wrapper.findAll('.filter-group')).toHaveLength(2)
    expect(labels(wrapper)).not.toContain('Time Period')
    expect(labels(wrapper)).not.toContain('Order Status')
  })

  it('toggles the groups when navigating between routes', async () => {
    const { wrapper, router } = await mountAt('/orders')
    current = wrapper
    await router.push('/restocking')
    await flushPromises()
    expect(wrapper.findAll('.filter-group')).toHaveLength(2)
    await router.push('/orders')
    await flushPromises()
    expect(wrapper.findAll('.filter-group')).toHaveLength(4)
  })

  it('resets only the visible filters on /restocking and leaves hidden values alone', async () => {
    const { selectedPeriod, selectedStatus, selectedLocation, selectedCategory } = useFilters()
    selectedPeriod.value = '2025-03'
    selectedStatus.value = 'delivered'
    selectedLocation.value = 'London'
    selectedCategory.value = 'sensors'
    const { wrapper } = await mountAt('/restocking')
    current = wrapper
    const button = wrapper.find('.reset-filters-btn')
    expect(button.element.disabled).toBe(false)
    await button.trigger('click')
    expect(selectedLocation.value).toBe('all')
    expect(selectedCategory.value).toBe('all')
    expect(selectedPeriod.value).toBe('2025-03')
    expect(selectedStatus.value).toBe('delivered')
    // Only hidden filters remain active, so there is nothing visible left to reset.
    expect(button.element.disabled).toBe(true)
  })

  it('hides only the filters listed in route meta', async () => {
    const { wrapper } = await mountAt('/only-status')
    current = wrapper
    expect(labels(wrapper)).toContain('Time Period')
    expect(labels(wrapper)).not.toContain('Order Status')
  })

  it('still resets every filter on other routes', async () => {
    const { selectedPeriod, selectedLocation } = useFilters()
    selectedPeriod.value = '2025-03'
    selectedLocation.value = 'London'
    const { wrapper } = await mountAt('/orders')
    current = wrapper
    await wrapper.find('.reset-filters-btn').trigger('click')
    expect(selectedPeriod.value).toBe('all')
    expect(selectedLocation.value).toBe('all')
  })
})
