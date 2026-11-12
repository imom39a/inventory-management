import { test, expect, apiGet, cardRows, warehouseFilter, categoryFilter } from './fixtures.js'

const stockRows = (page) => cardRows(page, /Stock Levels/)

test.describe('Inventory', () => {
  test('lists every inventory item', async ({ page, request }) => {
    const items = await apiGet(request, '/inventory')

    await page.goto('/inventory')
    await expect(page.getByRole('heading', { name: `Stock Levels (${items.length} SKUs)` })).toBeVisible()
    await expect(stockRows(page)).toHaveCount(items.length)
  })

  test('warehouse and category filters narrow the list like the API does', async ({ page, request }) => {
    const london = await apiGet(request, '/inventory?warehouse=London')
    const londonSensors = await apiGet(request, '/inventory?warehouse=London&category=sensors')

    await page.goto('/inventory')
    await warehouseFilter(page).selectOption('London')
    await expect(stockRows(page)).toHaveCount(london.length)

    await categoryFilter(page).selectOption('sensors')
    await expect(stockRows(page)).toHaveCount(londonSensors.length)
    for (const item of londonSensors) {
      await expect(stockRows(page).filter({ hasText: item.sku })).toHaveCount(1)
    }
  })

  test('search matches item names case-insensitively and can be cleared', async ({ page, request }) => {
    const items = await apiGet(request, '/inventory')
    const matches = items.filter((item) => item.name.toLowerCase().includes('sensor'))
    expect(matches.length).toBeGreaterThan(0)

    await page.goto('/inventory')
    await page.getByPlaceholder('Search by item name...').fill('SENSOR')
    await expect(stockRows(page)).toHaveCount(matches.length)

    await page.locator('.clear-search').click()
    await expect(stockRows(page)).toHaveCount(items.length)
  })

  test('low stock items are listed first', async ({ page }) => {
    await page.goto('/inventory')
    const rank = { 'Low Stock': 0, Adequate: 1, 'In Stock': 2 }
    await expect(stockRows(page).first()).toBeVisible()

    const statuses = await stockRows(page).locator('td:last-child').allTextContents()
    const ranks = statuses.map((s) => rank[s.trim()])
    expect(ranks).not.toContain(undefined)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  test('Export CSV downloads the filtered rows in table order', async ({ page, request }) => {
    const london = await apiGet(request, '/inventory?warehouse=London')

    await page.goto('/inventory')
    await warehouseFilter(page).selectOption('London')
    await expect(stockRows(page)).toHaveCount(london.length)
    const shownSkus = (await stockRows(page).locator('td:first-child').allTextContents()).map((s) => s.trim())

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.csv$/)

    const fs = await import('node:fs/promises')
    const text = (await fs.readFile(await download.path(), 'utf8')).replace(/^﻿/, '')
    const [header, ...rows] = text.split('\r\n')
    expect(header).toBe(
      'SKU,Item Name,Category,Quantity on Hand,Reorder Point,Unit Cost (USD),Total Value (USD),Location,Status'
    )
    expect(rows.map((row) => row.split(',')[0])).toEqual(shownSkus)
    expect([...shownSkus].sort()).toEqual(london.map((item) => item.sku).sort())
  })
})
