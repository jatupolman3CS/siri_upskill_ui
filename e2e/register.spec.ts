import { expect, test } from '@playwright/test';

/**
 * P0-36 smoke test — registration form against the REAL backend (via `proxy.conf.json`, not a
 * mock; frontend.md forbids mocking `HttpClient` calls anyway).
 *
 * ⚠️ Submitting the valid-data test below creates a REAL row in whatever database
 * `ConnectionStrings:Default` currently resolves to for the running `Siri.Api` — per CLAUDE.md that
 * is frequently the real remote Contabo `SIRIUPSKILL` database, not a disposable local one. Only run
 * this against a database you're OK writing throwaway rows into. The email is time-stamped and uses
 * the project's established `@example.test` convention (same as P0-37's seed accounts) specifically
 * so any row it does create is unambiguously test data, never confusable with a real user.
 *
 * This does not cover login: `LoginHandler` requires `UserStatus.Active`, reached only through
 * `POST /identity/confirm-email` with the token from the confirmation email — and this environment's
 * default `Email:Provider` is `Log` (backend/src/Siri.Api/appsettings.json), so there is no inbox a
 * black-box browser test can read that token from. See `concurrent-session-eviction.spec.ts`'s
 * header comment for how the login-dependent part of P0-36's acceptance criterion is covered
 * instead, and CLAUDE.md for this gap being an open item rather than something quietly worked around.
 */
test.describe('Registration', () => {
  test('valid submission shows the anti-enumeration success message', async ({ page }) => {
    await page.goto('/register');

    const uniqueEmail = `e2e-register-${Date.now()}@example.test`;

    await page.getByLabel('อีเมล').fill(uniqueEmail);
    await page.getByLabel('ชื่อที่แสดง').fill('E2E Smoke Test (Playwright)');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Correct-Horse-Battery-Staple');

    await page.getByRole('button', { name: 'สร้างบัญชี' }).click();

    // RegisterHandler's anti-enumeration guarantee (Register/Handler.cs): this exact heading +
    // message renders whether the email was new or already registered — never assert on message
    // *content* here beyond "the success panel rendered", or this test would itself be encoding an
    // enumeration oracle into the suite.
    await expect(page.getByRole('heading', { name: 'สำเร็จ' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ไปที่หน้าเข้าสู่ระบบ' })).toBeVisible();
  });

  test('invalid email shows a client-side validation error without calling the API', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel('อีเมล').fill('not-an-email');
    await page.getByLabel('ชื่อที่แสดง').fill('E2E Validation Test');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Correct-Horse-Battery-Staple');
    await page.getByRole('button', { name: 'สร้างบัญชี' }).click();

    await expect(page.getByText('กรุณากรอกอีเมลให้ถูกต้อง')).toBeVisible();
    // Client-side rejection only — the success panel (which only renders after a real API round
    // trip) must never appear for invalid input.
    await expect(page.getByRole('heading', { name: 'สำเร็จ' })).not.toBeVisible();
  });
});
