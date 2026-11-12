import { defineConfig, devices } from '@playwright/test'

// E2E specs live under client/ (not the repo-root tests/) so they can resolve
// @playwright/test from client/node_modules.
export default defineConfig({
  testDir: './tests/e2e',
  // Restock Orders are shared in-memory server state, so run serially to avoid cross-test interference.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'uv run python main.py',
      cwd: '../server',
      url: 'http://localhost:8001/',
      // Always start a fresh backend: Restock Orders are in-memory, and ordered items stop
      // being candidates, so a reused server would carry state between runs.
      // Stop any running backend on :8001 before running e2e.
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000/',
      reuseExistingServer: true,
      timeout: 60_000
    }
  ]
})
