import { test, expect, apiGet, periodFilter, statusFilter, warehouseFilter } from './fixtures.js'

const orderRows = (page) => page.locator('table.orders-table tbody tr')
const statCard = (page, label) => page.locator('.stat-card').filter({ hasText: label }).locator('.stat-value')

test.describe('Orders', () => {
  test('lists every order with status counts that add up', async ({ page, request }) => {
    const orders = await apiGet(request, '/orders')

    await page.goto('/orders')
    await expect(page.getByRole('heading', { name: `All Orders (${orders.length})` })).toBeVisible()
    await expect(orderRows(page)).toHaveCount(orders.length)

    for (const status of ['Delivered', 'Shipped', 'Processing', 'Backordered']) {
      const expected = orders.filter((o) => o.status === status).length
      await expect(statCard(page, status)).toHaveText(String(expected))
    }
  })

  test('status, period and warehouse filters match the API', async ({ page, request }) => {
    const delivered = await apiGet(request, '/orders?status=delivered')
    const deliveredInMarch = await apiGet(request, '/orders?status=delivered&month=2025-03')
    const deliveredInMarchTokyo = await apiGet(request, '/orders?status=delivered&month=2025-03&warehouse=Tokyo')

    await page.goto('/orders')
    await statusFilter(page).selectOption('delivered')
    await expect(orderRows(page)).toHaveCount(delivered.length)

    await periodFilter(page).selectOption('2025-03')
    await expect(orderRows(page)).toHaveCount(deliveredInMarch.length)

    await warehouseFilter(page).selectOption('Tokyo')
    await expect(orderRows(page)).toHaveCount(deliveredInMarchTokyo.length)

    // Reset clears every filter and brings back the full list.
    const all = await apiGet(request, '/orders')
    await page.getByRole('button', { name: 'Reset all filters' }).click()
    await expect(orderRows(page)).toHaveCount(all.length)
  })
})
