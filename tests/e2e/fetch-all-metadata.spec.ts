import { expect, test } from '@playwright/test';

test('Fetch All checks every item, preserves data, and reports unmatched and failed lookups', async ({ page }) => {
  const items = [
    { id: 'one', title: 'First Movie', type: 'movie', year: 2020, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/first.mkv', recommendedFolderStructure: 'First', recommendedFilenames: [] },
    { id: 'two', title: 'Second Movie', type: 'movie', year: 2021, overview: 'Existing synopsis', posterUrl: 'https://example.com/existing.jpg', genres: ['Drama'], rating: 8, path: '/media/second.mkv', recommendedFolderStructure: 'Second', recommendedFilenames: [] },
    { id: 'three', title: 'Third Movie', type: 'movie', year: 2022, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/third.mkv', recommendedFolderStructure: 'Third', recommendedFilenames: [] },
  ];
  const saved = new Map<string, Record<string, unknown>>();
  const checked: string[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let status = 200;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') {
      body = { success: true, state: { mediaLibrary: items } };
    } else if (pathname === '/api/db/media' && request.method() === 'POST') {
      const item = request.postDataJSON() as Record<string, unknown>;
      saved.set(item.id as string, item);
    } else if (pathname === '/api/db/media') {
      body = { success: true, items: Array.from(saved.values(), (item) => ({
        id: item.id, title: item.title, raw_data: JSON.stringify(item),
      })) };
    } else if (pathname === '/api/media/fetch-art') {
      const { title } = request.postDataJSON() as { title: string };
      checked.push(title);
      if (title === 'First Movie') {
        body = { success: true, source: 'omdb', title, year: 2020, overview: 'Fetched synopsis', posterUrl: 'https://example.com/new.jpg' };
      } else if (title === 'Second Movie') {
        body = { success: true, source: 'fallback', title };
      } else {
        status = 500;
        body = { error: 'Provider failed' };
      }
    } else if (pathname === '/api/db/watchlist') {
      body = { success: true, watchlist: [] };
    } else if (pathname === '/api/playlists') {
      body = { success: true, playlists: [] };
    } else if (pathname === '/api/media' || pathname === '/api/db/media/recent') {
      body = { success: true, items: [] };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const openList = async () => {
    await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
    await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  };
  await page.goto('/');
  await openList();
  await expect(page.getByRole('button', { name: 'Not Checked (3)' })).toBeVisible();
  await page.getByRole('button', { name: 'Fetch All (3)' }).click();
  await expect(page.getByText('Finished: 3/3 checked, 1 matched, 1 without a verified match, 1 failed.')).toBeVisible();
  expect(checked).toEqual(['First Movie', 'Second Movie', 'Third Movie']);
  expect(saved.get('one')).toMatchObject({ id: 'one', path: '/media/first.mkv', overview: 'Fetched synopsis', posterUrl: 'https://example.com/new.jpg', metadataFetchStatus: 'matched' });
  expect(saved.get('two')).toMatchObject({ id: 'two', overview: 'Existing synopsis', posterUrl: 'https://example.com/existing.jpg', metadataFetchStatus: 'no-match' });
  expect(saved.has('three')).toBe(false);
  await expect(page.getByText('Fetch failed: Metadata lookup failed (HTTP 500)')).toBeVisible();
  await expect(page.getByText('No verified match or provider unavailable')).toBeVisible();

  await page.reload();
  await openList();
  await expect(page.getByRole('button', { name: 'Not Checked (1)' })).toBeVisible();
  await expect(page.getByText('No verified match or provider unavailable')).toBeVisible();
});
