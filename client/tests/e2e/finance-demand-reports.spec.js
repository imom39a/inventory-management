import { test, expect, apiGet, cardRows } from './fixtures.js'

test.describe('Finance', () => {
  test('shows stat cards, charts, categories and every recent transaction', async ({ page, request }) => {
    const transactions = await apiGet(request, '/spending/transactions')
    const categories = await apiGet(request, '/spending/categories')

    await page.goto('/spending')
    for (const label of ['Total Revenue', 'Total Costs', 'Net Profit', 'Avg Order Value']) {
      // Scope to stat labels: "Total Costs" also appears in a chart legend.
      await expect(page.locator('.stat-label').getByText(label, { exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Monthly Revenue vs Costs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Monthly Cost Flow' })).toBeVisible()
    await expect(page.locator('.category-item')).toHaveCount(categories.length)
    await expect(cardRows(page, 'Recent Transactions')).toHaveCount(transactions.length)
  })
})

test.describe('Demand Forecast', () => {
  test('lists every forecast', async ({ page, request }) => {
    const forecasts = await apiGet(request, '/demand')

    await page.goto('/demand')
    await expect(cardRows(page, 'Demand Forecasts')).toHaveCount(forecasts.length)
    for (const forecast of forecasts) {
      await expect(cardRows(page, 'Demand Forecasts').filter({ hasText: forecast.item_sku })).toHaveCount(1)
    }
  })
})

test.describe('Reports', () => {
  test('shows one row per quarter and per month', async ({ page, request }) => {
    const quarters = await apiGet(request, '/reports/quarterly')
    const months = await apiGet(request, '/reports/monthly-trends')

    await page.goto('/reports')
    await expect(cardRows(page, 'Quarterly Performance')).toHaveCount(quarters.length)
    await expect(cardRows(page, 'Month-over-Month Analysis')).toHaveCount(months.length)
    for (const q of quarters) {
      await expect(cardRows(page, 'Quarterly Performance').filter({ hasText: q.quarter })).toHaveCount(1)
    }
  })
})
