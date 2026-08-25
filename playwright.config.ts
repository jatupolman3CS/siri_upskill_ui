import { defineConfig, devices } from '@playwright/test';

/**
 * P0-36 E2E setup. Smoke-scope only (task estimate: 1.5) — one browser (chromium), not a full
 * cross-browser matrix; see docs/TASKS.md's P0-36 row and each spec file's own header comment for
 * what it does and does not prove yet.
 *
 * `webServer` starts the real Angular dev server (`npm run start`, i.e. `ng serve`) — NOT the
 * backend API. `proxy.conf.json` (added alongside this config) forwards `/api/*` from
 * `localhost:4200` to the backend at `http://localhost:5190` (the `http` profile in
 * `Siri.Api/Properties/launchSettings.json`), so a real `dotnet run --project backend/src/Siri.Api`
 * must already be running before these specs can pass — this config does not start it, since the
 * API talks to whatever `ConnectionStrings:Default` currently resolves to (frequently the real
 * remote Contabo database per CLAUDE.md — see each spec's own header comment before running it
 * anywhere that matters).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
