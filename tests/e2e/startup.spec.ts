import { expect, test } from '@playwright/test';

test('the app renders after startup and navigation remains interactive', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => browserErrors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
      console.log(`[browser console:error] ${message.text()}`);
    }
  });

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    let response: Record<string, unknown> = { success: true };

    if (pathname === '/api/vault/state') {
      await new Promise((resolve) => setTimeout(resolve, 800));
      response = { success: true, hasSavedState: false, state: {} };
    } else if (pathname === '/api/db/watchlist') {
      response = { success: true, watchlist: [], count: 0 };
    } else if (pathname === '/api/db/media' || pathname === '/api/media') {
      response = { success: true, items: [], count: 0 };
    } else if (pathname === '/api/db/media/recent') {
      response = { success: true, items: [], count: 0 };
    } else if (pathname === '/api/playlists') {
      response = { success: true, playlists: [] };
    } else if (pathname === '/api/samba/network-diagnostics') {
      response = {
        success: true,
        server: '127.0.0.1',
        share: 'media',
        mountPath: '/Volumes/media',
        target: '127.0.0.1/media',
        smbVersion: 'SMB 3.1.1',
        smbDialect: 'SMB 3.1.1',
        smbCapabilities: [],
        isMounted: false,
        smbSource: 'test',
        ping: {
          samples: [],
          packetsSent: 0,
          packetsReceived: 0,
          packetLossPercent: 0,
          minLatencyMs: 0,
          avgLatencyMs: 0,
          maxLatencyMs: 0,
          jitterMs: 0,
        },
        smbPort445: { open: false, latencyMs: 0 },
        netbiosPort139: { open: false, latencyMs: 0 },
        qualityRating: 'good',
        healthScore: 100,
        timestamp: new Date().toISOString(),
        logs: [],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  try {
    await page.goto('/');
    const startupScreen = page.locator('#app-startup-screen');
    await expect(startupScreen).toBeVisible();
    await expect.poll(() =>
      startupScreen.evaluate((screen) => {
        const bounds = screen.getBoundingClientRect();
        return (
          bounds.x <= 0 &&
          bounds.y <= 0 &&
          bounds.right >= window.innerWidth &&
          bounds.bottom >= window.innerHeight
        );
      })
    ).toBe(true);
    await expect(page.getByText('Initializing SambaVault Application view...')).toBeHidden();
    await expect(page.getByText('Loading recent media from SQLite database...')).toBeHidden();
    await expect(page.getByText('No recently added media is available yet.')).toBeVisible();

    const searchTab = page.locator('#tab-search');
    await expect(searchTab).toBeVisible();
    await expect(page.getByRole('main').first()).toBeVisible();
    await expect(searchTab).toHaveClass(/bg-indigo-600/);

    await page.locator('#tab-settings').click();
    await expect(page.getByRole('heading', { name: 'SambaVault Settings & Schedule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SambaVault Application View Recovered' })).toHaveCount(0);
    await expect(page.locator('#tab-settings')).toHaveClass(/bg-indigo-600/);
    await expect.poll(() =>
      page.locator('#root').evaluate((root) => getComputedStyle(root).pointerEvents)
    ).not.toBe('none');

    expect(browserErrors, 'Uncaught browser errors during startup').toEqual([]);
  } finally {
    await testInfo.attach('browser-diagnostics', {
      body: JSON.stringify({ browserErrors, consoleErrors }, null, 2),
      contentType: 'application/json',
    });
  }
});
