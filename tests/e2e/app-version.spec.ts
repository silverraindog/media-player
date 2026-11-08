import { expect, test } from '@playwright/test';
import { APP_RELEASE_TAG, formatReleaseTag } from '../../src/version';

test('header shows the running build version rather than a backend version', async ({ page }) => {
  await page.route('**/api/system/version', async (route) => {
    await route.fulfill({ json: { success: true, data: { releaseTag: '99.0.0', commit: 'test', buildDate: '2026-01-01T00:00:00Z' } } });
  });
  await page.goto('/');
  const badge = page.getByRole('button', { name: `App version ${formatReleaseTag(APP_RELEASE_TAG, true)}; open version settings` });
  await expect(badge).toContainText(`App ${formatReleaseTag(APP_RELEASE_TAG, true)}`);
  await expect(badge).toContainText('Backend: v99.0.0');
  await expect(badge).not.toContainText('New:');
  await badge.click();
  await expect(page.getByText('Release Version Tracker', { exact: false }).first()).toBeVisible();
});
