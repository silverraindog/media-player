import { expect, test } from '@playwright/test';

test('provider search is available in both categorizer and universe matcher without changing assignments', async ({ page }) => {
  const item = { id: 'one', title: 'Caprica', type: 'series', year: 2010, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/Caprica', recommendedFolderStructure: 'Caprica', recommendedFilenames: [] };
  let searchCount = 0;
  let writes = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: object = { success: true };
    let status = 200;
    if (path === '/api/vault/state') data = { success: true, state: { mediaLibrary: [item] } };
    else if (path === '/api/universes/assignments') data = { assignments: {} };
    else if (path === '/api/universes/assignment') writes++;
    else if (path === '/api/provider-search') {
      const payload = request.postDataJSON();
      if (payload.provider === 'omdb') {
        status = 503;
        data = { error: 'OMDB_API_KEY is not configured in the backend environment.' };
      } else {
        searchCount++;
        expect(payload).toEqual({ title: 'Caprica', type: searchCount === 1 ? 'all' : 'series', provider: 'tvmaze' });
        data = { results: [{ id: '1', source: 'tvmaze', title: 'Caprica', type: 'series', year: 2010, url: 'https://www.tvmaze.com/shows/1' }] };
      }
    } else if (path === '/api/db/media') data = { success: true, items: [] };
    else if (path === '/api/db/watchlist') data = { success: true, watchlist: [] };
    else if (path === '/api/playlists') data = { success: true, playlists: [] };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  const first = page.getByRole('region', { name: 'TVMaze and OMDb search' });
  await first.getByLabel('Provider search title').fill('Caprica');
  await first.getByRole('button', { name: 'Search provider' }).click();
  await expect(first.getByRole('link', { name: 'Caprica (2010)' })).toBeVisible();
  await first.getByLabel('Search provider').selectOption('omdb');
  await first.getByRole('button', { name: 'Search provider' }).click();
  await expect(first.getByRole('alert')).toContainText('OMDB_API_KEY is not configured');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Universe Matcher' }).click();
  await page.getByRole('button', { name: 'Search TVMaze / OMDb' }).click();
  const second = page.getByRole('region', { name: 'TVMaze and OMDb search' });
  await second.getByRole('button', { name: 'Search provider' }).click();
  await expect(second.getByRole('link', { name: 'Caprica (2010)' })).toBeVisible();
  expect(searchCount).toBe(2);
  expect(writes).toBe(0);
});
