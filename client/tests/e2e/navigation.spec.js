import { test, expect } from './fixtures.js'

const TABS = [
  { link: 'Overview', path: '/', heading: 'Overview' },
  { link: 'Inventory', path: '/inventory', heading: 'Inventory' },
  { link: 'Orders', path: '/orders', heading: 'Orders' },
  { link: 'Restocking', path: '/restocking', heading: 'Restocking' },
  { link: 'Finance', path: '/spending', heading: 'Finance Dashboard' },
  { link: 'Demand Forecast', path: '/demand', heading: 'Demand Forecast' },
  { link: 'Backlog', path: '/backlog', heading: 'Backlog Management' },
  { link: 'Reports', path: '/reports', heading: 'Performance Reports' }
]

test.describe('Main navigation', () => {
  test('every tab is reachable from the nav and renders its page', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav.nav-tabs')

    for (const tab of TABS) {
      await nav.getByRole('link', { name: tab.link, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/' : tab.path}$`))
      await expect(page.locator('main h2').first()).toHaveText(tab.heading)
    }
  })

  for (const tab of TABS) {
    test(`deep link to ${tab.path} renders ${tab.heading}`, async ({ page }) => {
      await page.goto(tab.path)
      await expect(page.locator('main h2').first()).toHaveText(tab.heading)
    })
  }
})
