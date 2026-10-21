import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration of the Tutor Marketplace quality audit (`tutoring-audit.audit.ts`, P13-43). Kept apart from the acceptance suite
 * (`playwright.config.ts`) because it is a measuring tool, not a regression test: it writes numbers to `test-results/tutoring-audit/`.
 *
 *   E2E_PORT=4310 npx playwright test -c e2e/tools/tutoring-audit.config.ts
 *   node e2e/tools/tutoring-audit-report.cjs          # renders docs/audit/p13-43-fe-quality.md from the numbers
 *
 * Like the acceptance suite it needs no backend: the API is the in-memory mock of `e2e/tutoring-mock-api.ts`.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4200);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.audit.ts',
  outputDir: '../../test-results/tutoring-audit-artifacts',
  fullyParallel: true,
  workers: 4,
  timeout: 90_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: BASE_URL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
