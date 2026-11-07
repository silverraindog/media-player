import { expect, test } from '@playwright/test';

test('matches, reviews, and remembers virtual universe assignments', async ({ page }) => {
  const items = [
    { id: 'one', title: 'Caprica Season 1', type: 'series', year: 2010, overview: '', posterUrl: '', genres: [], rating: 0, folderPath: '/media/Caprica', path: '/media/Caprica/ep.mkv', recommendedFolderStructure: 'Caprica', recommendedFilenames: [] },
    { id: 'two', title: 'The Plan (2009)', type: 'movie', year: 2009, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/The Plan.mkv', recommendedFolderStructure: 'The Plan', recommendedFilenames: [] },
    { id: 'three', title: 'Ambiguous', type: 'movie', year: 0, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/Ambiguous.mkv', recommendedFolderStructure: 'Ambiguous', recommendedFilenames: [] },
  ];
  const assignments: Record<string, unknown> = {};
  const saved: Record<string, Record<string, unknown>> = {};
  const checked: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    let response: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && req.method() === 'GET') response = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && req.method() === 'POST') {
      const item = req.postDataJSON() as Record<string, unknown>;
      saved[item.id as string] = item;
    } else if (pathname === '/api/db/media') response = { success: true, items: Object.values(saved).map((item) => ({ id: item.id, title: item.title, raw_data: JSON.stringify(item) })) };
    else if (pathname === '/api/universes/assignments') response = { assignments };
    else if (pathname === '/api/universes/assignment') {
      const value = req.postDataJSON() as { itemKey: string; assignment: unknown };
      assignments[value.itemKey] = value.assignment;
    } else if (pathname === '/api/universes/search') {
      const { title } = req.postDataJSON() as { title: string };
      checked.push(title);
      if (title.startsWith('Caprica')) response = { confidentId: 1, candidates: [{ id: 1, type: 'series', title: 'Caprica', year: 2010, overview: 'Caprica plot' }] };
      else if (title.startsWith('The Plan')) response = { confidentId: 2, candidates: [{ id: 2, type: 'movie', title: 'The Plan', year: 2009 }] };
      else response = { confidentId: null, candidates: [{ id: 3, type: 'movie', title: 'Ambiguous', year: 1980 }, { id: 4, type: 'movie', title: 'Ambiguous', year: 2020 }] };
    } else if (pathname === '/api/universes/resolve') response = { match: { key: 'curated:bsg', name: 'Battlestar Galactica Universe', source: 'curated' } };
    else if (pathname === '/api/db/watchlist') response = { success: true, watchlist: [] };
    else if (pathname === '/api/playlists') response = { success: true, playlists: [] };
    else if (pathname === '/api/media' || pathname === '/api/db/media/recent') response = { success: true, items: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Universe Matcher' }).click();
  await page.getByRole('button', { name: 'Match library (3)' }).click();
  await expect(page.getByText('Finished 3 of 3 lookups. Review unmatched or ambiguous items below.')).toBeVisible();
  expect(checked).toEqual(['Caprica Season 1', 'The Plan (2009)', 'Ambiguous']);
  await expect(page.getByRole('heading', { name: 'Battlestar Galactica Universe (2)' })).toBeVisible();
  await expect(page.getByText('Ambiguous (1980)')).toBeVisible();
  await page.getByLabel('Universe for Ambiguous').fill('My Universe');
  await page.getByRole('button', { name: 'Assign universe' }).click();
  await expect(page.getByRole('heading', { name: 'My Universe (1)' })).toBeVisible();
  expect(saved.one).toMatchObject({ id: 'one', folderPath: '/media/Caprica', path: '/media/Caprica/ep.mkv', overview: 'Caprica plot' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Universe Matcher' }).click();
  await expect(page.getByRole('heading', { name: 'My Universe (1)' })).toBeVisible();
  const bsg = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Battlestar Galactica Universe (2)' }) });
  await bsg.getByRole('button', { name: 'Remove from universe' }).first().click();
  await expect(page.getByRole('heading', { name: 'Battlestar Galactica Universe (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Universe Matcher' }).click();
  await expect(page.getByRole('heading', { name: 'Battlestar Galactica Universe (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Match library (3)' }).click();
  await expect(page.getByText('Finished 1 of 1 lookups. Review unmatched or ambiguous items below.')).toBeVisible();
  expect(checked).toEqual(['Caprica Season 1', 'The Plan (2009)', 'Ambiguous', 'The Plan (2009)']);
  await expect(page.getByRole('heading', { name: 'My Universe (1)' })).toBeVisible();
});
