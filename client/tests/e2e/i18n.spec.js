import { test, expect } from './fixtures.js'

test.describe('Language switcher', () => {
  test('switches to Japanese, keeps it after reload, and switches back', async ({ page }) => {
    await page.goto('/inventory')
    const nav = page.locator('nav.nav-tabs')

    await page.locator('.language-button').click()
    await page.getByText('日本語', { exact: true }).click()
    await expect(nav.getByRole('link', { name: '在庫' })).toBeVisible()

    // The choice is saved in localStorage, so it survives a reload.
    await page.reload()
    await expect(nav.getByRole('link', { name: '在庫' })).toBeVisible()

    await page.locator('.language-button').click()
    await page.getByText('English', { exact: true }).click()
    await expect(nav.getByRole('link', { name: 'Inventory', exact: true })).toBeVisible()
  })
})
