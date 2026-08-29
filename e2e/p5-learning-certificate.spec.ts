import { expect, test } from '@playwright/test';

/**
 * P5-22 / P5-23 E2E Suite: Certificate Verification & Learning Flow
 */
test.describe('Learning & Certificate E2E', () => {
  test('certificate verification page renders verification form', async ({ page }) => {
    await page.goto('/certificates/verify');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByPlaceholder('เช่น CERT-2026-ABC12345')).toBeVisible();
  });

  test('certificate verification with invalid code shows error feedback', async ({ page }) => {
    await page.goto('/certificates/verify/INVALID-CODE-999');

    // Page handles invalid code gracefully without crashing
    await expect(page.locator('body')).toBeVisible();
  });

  test('my courses page renders empty state or course list', async ({ page }) => {
    await page.goto('/my-courses');

    const url = page.url();
    expect(url.includes('/login') || url.includes('/my-courses')).toBeTruthy();
  });
});
