import { test, expect } from '@playwright/test'

test('app home page loads with navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('nav.nav-tabs')).toBeVisible()
})
