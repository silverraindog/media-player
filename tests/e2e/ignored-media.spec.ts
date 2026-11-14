import { expect, test } from '@playwright/test';

test('ignored files stay out of the library and direct imports without deleting stored items', async ({ page }) => {
  const base = { type: 'movie', year: 2020, overview: '', posterUrl: '', genres: [], rating: 0, recommendedFilenames: [] };
  const items = [
    { ...base, id: 'text', title: 'Ignored Text', path: '/media/readme.TXT', recommendedFolderStructure: '/media/readme.TXT' },
    { ...base, id: 'torrent', title: 'Ignored Torrent', matchedFilename: 'movie.torrent', recommendedFolderStructure: 'Movies/Movie' },
    { ...base, id: 'movie', title: 'Real Movie', path: '/media/movie.mkv', matchedFilename: 'readme.txt', recommendedFolderStructure: '/media' },
  ];
  const parsedRequests: string[][] = [];
  let deleteRequests = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (request.method() === 'DELETE') deleteRequests++;
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/metadata/parse-filename') {
      const { filenames } = request.postDataJSON() as { filenames: string[] };
      parsedRequests.push(filenames);
      body = { success: true, results: filenames.map((filename, index) => ({
        id: `parsed-${index}`, originalFilename: filename, detectedType: 'movie',
        detectedTitle: 'Imported Movie', cleanFormattedFilename: filename, cleanFolderPath: 'Movies/Imported Movie', status: 'pending',
      })) };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await expect(page.getByText('Real Movie', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ignored Text', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ignored Torrent', { exact: true })).toHaveCount(0);

  const input = page.locator('input[type=file]').first();
  await input.setInputFiles([{ name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('text') }]);
  await expect(page.getByText('No media imported: .txt and .torrent files are ignored.')).toBeVisible();
  expect(parsedRequests).toHaveLength(0);
  await input.setInputFiles([
    { name: 'readme.TXT', mimeType: 'text/plain', buffer: Buffer.from('text') },
    { name: 'file.torrent', mimeType: 'application/x-bittorrent', buffer: Buffer.from('torrent') },
    { name: 'movie.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from('video') },
  ]);
  await expect.poll(() => parsedRequests.length).toBe(1);
  expect(parsedRequests[0]).toEqual(['movie.mkv']);
  await expect(page.getByText('Imported Movie', { exact: true }).first()).toBeVisible();
  expect(deleteRequests).toBe(0);
});

test('batch filename cleaner excludes ignored files before parsing', async ({ page }) => {
  const parsedRequests: string[][] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: [] } };
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/metadata/parse-filename') {
      parsedRequests.push(request.postDataJSON().filenames);
      body = { success: true, results: [] };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Batch File Cleaner' }).click();
  await page.locator('#batch-filenames-textarea').fill('readme.txt\nfilm.TORRENT\nfilm.mkv');
  await page.locator('#batch-parse-btn').click();
  await expect(page.getByRole('status')).toContainText('Ignored 2 .txt or .torrent file(s).');
  await expect.poll(() => parsedRequests.length).toBe(1);
  expect(parsedRequests[0]).toEqual(['film.mkv']);
});
