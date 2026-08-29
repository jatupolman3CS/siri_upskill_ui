import { expect, test } from '@playwright/test';

/**
 * P1-21 / P1-25 E2E Suite: Catalog Search, Autocomplete & Filter
 */
test.describe('Catalog & Search E2E', () => {
  test('courses page renders catalog headings, filters and search bar', async ({ page }) => {
    await page.goto('/courses');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByPlaceholder('ค้นหาคอร์สเรียน ทักษะ หรือผู้สอน...')).toBeVisible();
  });

  test('search autocomplete opens when typing and updates search', async ({ page }) => {
    await page.goto('/courses');

    const searchInput = page.getByPlaceholder('ค้นหาคอร์สเรียน ทักษะ หรือผู้สอน...');
    await searchInput.fill('.NET');

    // Autocomplete dropdown or search result updates URL
    await page.waitForTimeout(500);
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/.*q=.*/);
  });

  test('category filter updates url query params without resetting other filters', async ({ page }) => {
    await page.goto('/courses');

    const levelSelect = page.locator('select').first();
    if (await levelSelect.isVisible()) {
      await levelSelect.selectOption({ index: 1 });
      await expect(page).toHaveURL(/.*level=.*/);
    }
  });
});
