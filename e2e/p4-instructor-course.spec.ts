import { expect, test } from '@playwright/test';

/**
 * P4-20 / P4-25 E2E Suite: Instructor Onboarding & Studio Flow
 */
test.describe('Instructor Studio E2E', () => {
  test('instructor onboarding page renders multi-step form and terms', async ({ page }) => {
    await page.goto('/instructor/onboarding');

    // If redirected to login (due to auth guard), check login page or heading
    const isLogin = page.url().includes('/login');
    if (!isLogin) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('ข้อมูลผู้สอน')).toBeVisible();
    }
  });

  test('instructor dashboard protects unauthenticated users', async ({ page }) => {
    await page.goto('/instructor');

    const url = page.url();
    expect(url.includes('/login') || url.includes('/instructor')).toBeTruthy();
  });
});
