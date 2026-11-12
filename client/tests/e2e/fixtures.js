import { test as base, expect } from '@playwright/test'

export const API = 'http://localhost:8001/api'

// Errors that already exist in the app and are tracked separately. Anything else logged as a
// console error (or thrown) fails the test, so a new runtime error can't slip in unnoticed.
const KNOWN_ERRORS = [
  // Dashboard calls a /api/tasks endpoint the backend never implemented.
  (msg) => msg.location().url.includes('/api/tasks'),
  (msg) => msg.text().startsWith('Failed to load tasks')
]

export const test = base.extend({
  consoleGuard: [
    async ({ page }, use) => {
      const errors = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !KNOWN_ERRORS.some((known) => known(msg))) {
          errors.push(msg.text())
        }
      })
      page.on('pageerror', (err) => errors.push(err.message))
      await use()
      expect(errors, 'unexpected console errors').toEqual([])
    },
    { auto: true }
  ]
})

export { expect }

export async function apiGet(request, path) {
  const response = await request.get(`${API}${path}`)
  expect(response.ok()).toBeTruthy()
  return response.json()
}

// Locate filters by one of their options, not by position: FilterBar hides some filters per route.
export const periodFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="2025-01"]') })
export const warehouseFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="London"]') })
export const categoryFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="sensors"]') })
export const statusFilter = (page) =>
  page.locator('select.filter-select').filter({ has: page.locator('option[value="delivered"]') })

// Most views have no test ids, so find a table by the heading of the card that contains it.
export const cardRows = (page, heading) =>
  page.locator('.card').filter({ has: page.getByRole('heading', { name: heading }) }).locator('tbody tr')
