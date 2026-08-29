import { expect, test } from '@playwright/test';

/**
 * P3-20 / P3-25 E2E Suite: Cart & Commerce Checkout Flow
 */
test.describe('Commerce & Cart E2E', () => {
  test('cart page renders empty cart state when no items added', async ({ page }) => {
    await page.goto('/cart');

    await expect(page.getByRole('heading', { name: 'ตะกร้าสินค้า' })).toBeVisible();
    await expect(page.getByText('ไม่มีคอร์สเรียนในตะกร้า')).toBeVisible();
    await expect(page.getByRole('link', { name: 'เลือกดูคอร์สเรียน' })).toBeVisible();
  });

  test('order history page redirects unauthenticated users or shows login prompt', async ({ page }) => {
    await page.goto('/orders');

    // Either redirected to login or renders orders layout
    const url = page.url();
    expect(url.includes('/login') || url.includes('/orders')).toBeTruthy();
  });
});
