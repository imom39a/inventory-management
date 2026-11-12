import { test, expect } from '@playwright/test'

// Locate filters by their options, not position: FilterBar hides some filters per route.
const warehouseFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="London"]') })
const statusFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="delivered"]') })

test.describe('Restocking', () => {
  test('plan a London restock, place it, and see it in the Orders tab', async ({ page }) => {
    await page.goto('/restocking')
    await warehouseFilter(page).selectOption('London')

    // London candidates: TMP-201 ($8,950), HMD-202 ($3,125), PSU-505 ($2,362.50).
    await expect(page.getByTestId('candidate-row-TMP-201')).toBeVisible()
    await expect(page.getByTestId('candidate-row-PCB-001')).toHaveCount(0)

    // The unfiltered default ($29,000) exceeds London's max, so the budget is clamped to max: all fit.
    const slider = page.getByTestId('budget-slider')
    await expect(page.getByTestId('candidate-checkbox-TMP-201')).toBeChecked()

    // At $7,000, TMP-201 ($8,950) can't fit: greedy skips it and still takes the two smaller lines.
    await slider.fill('7000')
    await expect(page.getByTestId('candidate-checkbox-TMP-201')).not.toBeChecked()
    await expect(page.getByTestId('candidate-checkbox-HMD-202')).toBeChecked()
    await expect(page.getByTestId('candidate-checkbox-PSU-505')).toBeChecked()

    // Max is London's $14,437.50 rounded up to the $500 step, so at the top everything fits.
    const max = await slider.getAttribute('max')
    expect(max).toBe('14500')
    await slider.fill(max)
    for (const sku of ['TMP-201', 'HMD-202', 'PSU-505']) {
      await expect(page.getByTestId(`candidate-checkbox-${sku}`)).toBeChecked()
    }
    await expect(page.getByTestId('selected-total')).toContainText('14,437.50')

    // Leave one line out of the order.
    await page.getByTestId('candidate-checkbox-PSU-505').uncheck()
    await expect(page.getByTestId('candidate-checkbox-PSU-505')).not.toBeChecked()
    await expect(page.getByTestId('selected-total')).toContainText('12,075.00')

    await page.getByTestId('place-order-button').click()
    const banner = page.getByTestId('restock-success')
    await expect(banner).toBeVisible()
    const orderNumber = (await banner.textContent()).match(/RST-\d{4}-\d{4}/)[0]

    // Ordered items drop out; the unticked one is still recommended.
    await expect(page.getByTestId('candidate-row-TMP-201')).toHaveCount(0)
    await expect(page.getByTestId('candidate-row-HMD-202')).toHaveCount(0)
    await expect(page.getByTestId('candidate-row-PSU-505')).toBeVisible()

    // The spent $12,075 is deducted: $14,500 - $12,075 = $2,425 left, which still fits PSU-505.
    await expect(page.getByTestId('budget-value')).toContainText('2,425')
    await expect(page.getByTestId('candidate-checkbox-PSU-505')).toBeChecked()

    await banner.getByRole('link').click()
    await expect(page).toHaveURL(/\/orders$/)

    const row = page.getByTestId(`restock-order-row-${orderNumber}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('London')
    await expect(row).toContainText('10')
    await expect(row).toContainText('12,075.00')
  })

  test('Submitted Restock Orders follow warehouse filter but ignore status filter', async ({ page, request }) => {
    const response = await request.post('http://localhost:8001/api/restock-orders', {
      data: { budget: 100000, skus: ['STP-304'] }
    })
    expect(response.status()).toBe(201)
    const [tokyoOrder] = await response.json()

    await page.goto('/orders')
    const section = page.getByTestId('restock-orders-section')
    const tokyoRow = page.getByTestId(`restock-order-row-${tokyoOrder.order_number}`)
    await expect(tokyoRow).toBeVisible()

    // Order Status filters customer Orders only; Restock Orders stay visible.
    await statusFilter(page).selectOption('delivered')
    await expect(tokyoRow).toBeVisible()

    await warehouseFilter(page).selectOption('San Francisco')
    await expect(tokyoRow).toHaveCount(0)
    await expect(section).toBeVisible()

    await warehouseFilter(page).selectOption('Tokyo')
    await expect(tokyoRow).toBeVisible()
  })
})
