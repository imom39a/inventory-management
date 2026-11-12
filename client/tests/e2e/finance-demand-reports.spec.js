import { test, expect, apiGet, cardRows, warehouseFilter } from './fixtures.js'

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

  test('filtering by warehouse reloads rows to match the filtered API', async ({ page, request }) => {
    const quarters = await apiGet(request, '/reports/quarterly?warehouse=London')
    const months = await apiGet(request, '/reports/monthly-trends?warehouse=London')

    await page.goto('/reports')
    await expect(cardRows(page, 'Quarterly Performance').first()).toBeVisible()
    await warehouseFilter(page).selectOption('London')

    if (quarters.length > 0) {
      await expect(cardRows(page, 'Quarterly Performance')).toHaveCount(quarters.length)
      await expect(cardRows(page, 'Month-over-Month Analysis')).toHaveCount(months.length)
    } else {
      await expect(page.getByTestId('reports-empty')).toBeVisible()
    }
  })

  test('switching to Japanese translates the heading and nav link', async ({ page }) => {
    await page.goto('/reports')
    const nav = page.locator('nav.nav-tabs')
    await expect(page.getByRole('heading', { name: 'Performance Reports' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Reports', exact: true })).toBeVisible()

    await page.locator('.language-button').click()
    await page.getByText('日本語', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'パフォーマンスレポート' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'レポート' })).toBeVisible()

    // Restore the saved locale so later tests start in English.
    await page.locator('.language-button').click()
    await page.getByText('English', { exact: true }).click()
  })
})
