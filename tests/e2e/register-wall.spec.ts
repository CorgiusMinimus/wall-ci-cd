import { test, expect } from '@playwright/test';

test.describe('Register → Wall flow', () => {
  test('should register a new user and land on the wall with current user displayed', async ({ page }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const displayName = 'Playwright User';
    const username = `playwright_${suffix}`.replace(/[^A-Za-z0-9_]/g, '_');
    const email = `playwright.${suffix}@example.com`;

    await page.goto('/');

    await page.getByRole('tab', { name: 'Register' }).click();

    await page.locator('#display-name').fill(displayName);
    await page.locator('#username').fill(username);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('password123');

    await page.locator('#submit-button').click();

    await expect(page).toHaveURL(/\/wall\.html$/);

    await expect(page.getByRole('heading', { name: 'Post to Feedline' })).toBeVisible();
    await expect(page.locator('#current-user-name')).toHaveText(displayName);
    await expect(page.locator('#current-user-username')).toHaveText(`@${username}`);
    await expect(page.locator('#post-body')).toBeVisible();
  });
});
