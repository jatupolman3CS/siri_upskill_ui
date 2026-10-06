import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * P0-36's headline smoke test (docs/TASKS.md: "สมัคร→ล็อกอิน→ล็อกอินเครื่องที่ 3→เครื่องแรกหลุด") —
 * proves SE-03 concurrent-session eviction (P0-17) end-to-end through the real UI against the real
 * backend, not a mock.
 *
 * <b>Why this uses a pre-seeded account instead of a fresh registration</b>: the full acceptance
 * phrase starts from "สมัคร" (register), but `LoginHandler` only accepts `UserStatus.Active`
 * accounts, reached solely via the confirmation-email link — and this environment's default
 * `Email:Provider` is `Log` (no real inbox a black-box test can read a token from). Rather than
 * inventing a test-only "read the last confirmation token" backend endpoint to route around that
 * un-asked (a new security-relevant surface, and an architecture call this task's own scope
 * shouldn't make unilaterally), this spec instead uses one of P0-37's already-confirmed seed
 * accounts to exercise the login/eviction mechanism the acceptance criterion actually cares about.
 * `register.spec.ts` separately covers the registration screen itself. See CLAUDE.md for this
 * being logged as an open item (how E2E should obtain a confirmation token for a *freshly*
 * registered account), not a silent workaround.
 *
 * Requires two env vars pointing at a real, already-confirmed, Active test account:
 *   E2E_SEED_EMAIL, E2E_SEED_PASSWORD
 * (e.g. one of the P0-37 seed accounts — `dotnet run --project backend/src/Siri.Api -- --seed`
 * after setting real `Identity:Seed:*` user-secrets, per CLAUDE.md). Skips entirely when unset, the
 * same "refuse silently rather than run against unintended state" shape `SeedOptionsGuard` already
 * uses for the seeder itself — this is deliberately not a hardcoded credential (security.md: no real
 * secrets committed).
 *
 * The eviction check calls `POST /api/identity/refresh` directly (via each browser context's own
 * `request`, which shares that context's cookies — the httpOnly refresh-token cookie included) rather
 * than waiting for the UI to notice: the access token is a short-lived, stateless JWT (15 minutes,
 * security.md) that keeps validating locally right up to its natural expiry regardless of
 * server-side session revocation, so nothing observable in the SPA itself changes the instant
 * eviction happens. The refresh endpoint is exactly the mechanism that DOES check server-side
 * session/refresh-token state (RefreshHandler), so calling it directly is the fast, deterministic way
 * to prove revocation without an artificial ~15 minute wait — it is not a workaround, it is the same
 * check the app itself would eventually make on its own.
 */
const seedEmail = process.env['E2E_SEED_EMAIL'];
const seedPassword = process.env['E2E_SEED_PASSWORD'];

test.describe('Concurrent session eviction (SE-03)', () => {
  test.skip(
    !seedEmail || !seedPassword,
    'Set E2E_SEED_EMAIL / E2E_SEED_PASSWORD to a real, already-confirmed test account to run this spec.',
  );

  test('logging in from a 3rd device evicts the oldest of 2 existing sessions', async ({ browser }) => {
    // Three independent cookie jars = three independent "devices" — a single Page/context would
    // share one session and could never reproduce the over-the-limit scenario at all.
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext();
    const deviceC = await browser.newContext();

    try {
      await loginViaUi(deviceA, seedEmail!, seedPassword!);
      await loginViaUi(deviceB, seedEmail!, seedPassword!);

      // System default is 2 concurrent sessions (Identity:Security:MaxConcurrentSessions,
      // appsettings.json) unless this seed account has a per-user override — device A is the
      // oldest active session at this point, so ConcurrentSessionEvictionPolicy evicts it first.
      await loginViaUi(deviceC, seedEmail!, seedPassword!);

      const [refreshA, refreshC] = await Promise.all([
        deviceA.request.post('/api/identity/refresh'),
        deviceC.request.post('/api/identity/refresh'),
      ]);

      expect(refreshA.ok(), 'device A (oldest session) should have been evicted and its refresh rejected').toBeFalsy();
      expect(refreshC.ok(), 'device C (newest session) should still be valid').toBeTruthy();
    } finally {
      await Promise.all([deviceA.close(), deviceB.close(), deviceC.close()]);
    }
  });
});

async function loginViaUi(context: BrowserContext, email: string, password: string): Promise<void> {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/my-courses'); // a learner's home after sign-in
  await page.close();
}
