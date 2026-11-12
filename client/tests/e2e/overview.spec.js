import { test, expect, apiGet, cardRows } from './fixtures.js'

test.describe('Overview', () => {
  test('shows KPIs, summary cards and one shortage row per backlog item', async ({ page, request }) => {
    const backlog = await apiGet(request, '/backlog')

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Key Performance Indicators' })).toBeVisible()
    for (const card of ['Order Health', 'Inventory Value by Category', 'Top Products by Revenue']) {
      await expect(page.getByRole('heading', { name: card })).toBeVisible()
    }

    await expect(page.getByRole('heading', { name: `Inventory Shortages (${backlog.length})` })).toBeVisible()
    await expect(cardRows(page, /Inventory Shortages/)).toHaveCount(backlog.length)
  })

  test('order health total matches the number of orders', async ({ page, request }) => {
    const orders = await apiGet(request, '/orders')

    await page.goto('/')
    const donut = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Order Health' }) })
    await expect(donut).toContainText(String(orders.length))
  })
})
