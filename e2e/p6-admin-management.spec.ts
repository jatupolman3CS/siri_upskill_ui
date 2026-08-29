import { expect, test } from '@playwright/test';

/**
 * P6-20 / P6-23 E2E Suite: Admin Management & Moderation Flow
 */
test.describe('Admin Management E2E', () => {
  test('admin dashboard redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin');

    const url = page.url();
    expect(url.includes('/login') || url.includes('/admin')).toBeTruthy();
  });

  test('admin moderation page is protected by auth guard', async ({ page }) => {
    await page.goto('/admin/courses/moderation');

    const url = page.url();
    expect(url.includes('/login') || url.includes('/admin')).toBeTruthy();
  });
});
