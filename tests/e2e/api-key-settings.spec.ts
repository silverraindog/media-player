import { expect, test } from '@playwright/test';

test('API key settings show status and save without displaying the key', async ({ page }) => {
  const keys = {
    TMDB_READ_ACCESS_TOKEN: { configured: false, source: 'none' },
    OMDB_API_KEY: { configured: false, source: 'none' },
    GEMINI_API_KEY: { configured: false, source: 'none' },
  };
  await page.route('**/api/settings/api-keys', async (route) => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toEqual({ name: 'TMDB_READ_ACCESS_TOKEN', value: 'sample-token' });
      keys.TMDB_READ_ACCESS_TOKEN = { configured: true, source: 'settings' };
      await route.fulfill({ json: { success: true, keys } });
    } else await route.fulfill({ json: { keys } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /App version .*open version settings/ }).click();
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible();
  await page.getByLabel('TMDB API Read Access Token').fill('sample-token');
  await page.getByLabel('TMDB API Read Access Token').locator('..').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Key saved and applied.');
  await expect(page.getByLabel('TMDB API Read Access Token')).toHaveValue('');
  await expect(page.getByText('Configured via settings.', { exact: false })).toBeVisible();
});
