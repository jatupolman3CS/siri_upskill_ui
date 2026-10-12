import { expect, test, type Page } from '@playwright/test';

/**
 * Clicks a theme radio and waits until the app has actually applied it. The dev server can serve the
 * page before Angular has hydrated, in which case the first click lands on a dead button — retrying
 * the click+assert pair is the honest wait for "hydrated", not an arbitrary sleep.
 */
async function selectTheme(page: Page, name: string): Promise<void> {
  const radio = page.getByRole('radio', { name });
  await expect(async () => {
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 });
  }).toPass();
}

/**
 * D-24 theme switch (light / dark / system). Needs only the Angular dev server — no backend: the home
 * page renders its chrome even when the API proxy answers 502, and the theme logic is client-only
 * (cookie `siri_theme` + `data-theme` on <html>, set before first paint by the inline script in
 * index.html and kept in sync by ThemeService).
 *
 * The toggle sits in the desktop header strip, so these run at the default desktop viewport.
 */
test.describe('Theme toggle', () => {
  test('follows the OS preference by default and switches between light and dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('radio', { name: 'ตามระบบ' })).toHaveAttribute('aria-checked', 'true');

    await selectTheme(page, 'มืด');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await selectTheme(page, 'สว่าง');
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('remembers the choice across a reload without flashing the other theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await selectTheme(page, 'มืด');

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'siri_theme')?.value).toBe('dark');

    // The inline bootstrap script must set the attribute before the app boots: read it at
    // DOMContentLoaded on the reloaded document, i.e. before Angular has rendered anything.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __themeAtDomReady: string | null }).__themeAtDomReady =
          document.documentElement.getAttribute('data-theme');
      });
    });
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => (window as unknown as { __themeAtDomReady: string | null }).__themeAtDomReady)).toBe(
      'dark',
    );
    await expect(page.getByRole('radio', { name: 'มืด' })).toHaveAttribute('aria-checked', 'true');
  });

  test('"system" tracks live OS preference changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await selectTheme(page, 'สว่าง');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
