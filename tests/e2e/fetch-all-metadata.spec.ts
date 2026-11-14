import { expect, test } from '@playwright/test';

test('franchise overviews are saved separately for complete items and survive reload', async ({ page }) => {
  const items = [
    { id: 'series', title: 'Example Show', type: 'series', year: 2000, overview: 'Existing synopsis', posterUrl: 'https://example.com/poster.jpg', genres: [], rating: 0, recommendedFolderStructure: 'Example Show', recommendedFilenames: [] },
    { id: 'collection', title: 'Example Collection', type: 'movie', collectionFolder: true, year: 2000, overview: 'Existing collection synopsis', posterUrl: 'https://example.com/poster.jpg', genres: [], rating: 0, recommendedFolderStructure: 'Example Collection', recommendedFilenames: [] },
  ];
  const saved = new Map<string, Record<string, unknown>>();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'POST') {
      const item = request.postDataJSON() as Record<string, unknown>;
      saved.set(item.id as string, item);
    } else if (pathname === '/api/db/media') body = { success: true, items: Array.from(saved.values(), item => ({ id: item.id, title: item.title, raw_data: JSON.stringify(item) })) };
    else if (pathname === '/api/media/franchise-overview') {
      const requestBody = request.postDataJSON();
      if (requestBody.title === 'Example Show') body = { success: true, overview: { text: 'Show premise', source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Example_Show', license: 'CC BY-SA 4.0' } };
      else if (!requestBody.selection) body = { success: true, candidates: [
        { title: 'Example Collection', source: 'TMDB', id: 1 }, { title: 'Example Collection', source: 'TMDB', id: 2 },
      ] };
      else body = { success: true, overview: { text: 'Collection premise', source: 'TMDB', url: `https://www.themoviedb.org/collection/${requestBody.selection.id}` } };
    }
    await route.fulfill({ json: body });
  });
  const openList = async () => {
    await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
    await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  };
  await page.goto('/');
  await openList();
  await page.getByRole('button', { name: 'Fetch franchise overviews (2)' }).click();
  await expect(page.getByText('Overview lookup: 1 saved, 1 need selection, 0 failed; 2 checked.')).toBeVisible();
  await page.getByRole('button', { name: 'Example Collection (TMDB #2)' }).click();
  await expect.poll(() => saved.size).toBe(2);
  expect(saved.get('series')).toMatchObject({ overview: 'Existing synopsis', franchiseOverview: { text: 'Show premise', source: 'Wikipedia' } });
  expect(saved.get('collection')).toMatchObject({ overview: 'Existing collection synopsis', franchiseOverview: { text: 'Collection premise', url: 'https://www.themoviedb.org/collection/2' } });
  await page.reload();
  await openList();
  await expect(page.getByRole('button', { name: 'Fetch franchise overviews (0)' })).toBeVisible();
});

test('overview choices can be selected and retried while the overview batch continues', async ({ page }) => {
  const items = ['First Show', 'Second Show'].map((title, index) => ({
    id: `show-${index}`, title, type: 'series', year: 2000, overview: 'Existing synopsis',
    posterUrl: 'https://example.com/poster.jpg', genres: [], rating: 0,
    recommendedFolderStructure: title, recommendedFilenames: [],
  }));
  const saved = new Map<string, Record<string, unknown>>();
  let releaseSecond!: () => void;
  const secondLookup = new Promise<void>(resolve => { releaseSecond = resolve; });
  let selectionAttempts = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'POST') {
      const item = request.postDataJSON() as Record<string, unknown>;
      saved.set(item.id as string, item);
    } else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/media/franchise-overview') {
      const { title, selection } = request.postDataJSON();
      if (title === 'Second Show') {
        await secondLookup;
      } else if (!selection) {
        body = { success: true, candidates: [{ title: 'First Show (TV series)', source: 'Wikipedia', id: 1 }] };
      } else if (++selectionAttempts === 1) {
        body = { success: true, diagnostics: [{ provider: 'Wikipedia', outcome: 'No premise or overview section found; review manually' }] };
      } else {
        body = { success: true, overview: { text: 'Show premise', source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/First_Show', license: 'CC BY-SA 4.0' } };
      }
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch franchise overviews (2)' }).click();
  try {
    const option = page.getByRole('button', { name: 'First Show (TV series) (Wikipedia #1)' });
    await expect(option).toBeEnabled();
    await option.click();
    await expect(page.getByRole('alert')).toHaveText('No premise or overview section found; review manually');
    await option.click();
    await expect.poll(() => saved.size).toBe(1);
    await expect(option).toHaveCount(0);
    expect(saved.get('show-0')).toMatchObject({ overview: 'Existing synopsis', franchiseOverview: { text: 'Show premise' } });
  } finally {
    releaseSecond();
  }
  await expect(page.getByText('Overview lookup: 1 saved, 0 need selection, 0 failed; 2 checked.')).toBeVisible();
});

test('a rate-limited overview selection reports the cause and stops the running batch', async ({ page }) => {
  const items = ['First Show', 'Second Show', 'Third Show'].map((title, index) => ({
    id: `show-${index}`, title, type: 'series', year: 2000, overview: 'Existing synopsis',
    posterUrl: 'https://example.com/poster.jpg', genres: [], rating: 0,
    recommendedFolderStructure: title, recommendedFilenames: [],
  }));
  const checked: string[] = [];
  let releaseSecond!: () => void;
  const secondLookup = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let status = 200;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/media/franchise-overview') {
      const { title, selection } = request.postDataJSON();
      if (selection) {
        status = 429;
        body = { error: 'Wikipedia rate limit reached (HTTP 429). Wait before retrying.' };
      } else {
        checked.push(title);
        if (title === 'First Show') body = { success: true, candidates: [{ title: 'First Show', source: 'Wikipedia', id: 1 }] };
        if (title === 'Second Show') await secondLookup;
      }
    }
    await route.fulfill({ status, json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch franchise overviews (3)' }).click();
  try {
    await expect.poll(() => checked.length).toBe(2);
    await page.getByRole('button', { name: 'First Show (Wikipedia #1)' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wikipedia rate limit reached (HTTP 429). Wait before retrying.');
  } finally {
    releaseSecond();
  }
  await expect(page.getByText(/Stopped because Wikipedia rate limited requests/)).toBeVisible();
  expect(checked).toEqual(['First Show', 'Second Show']);
  await expect(page.getByRole('button', { name: 'First Show (Wikipedia #1)' })).toBeVisible();
});

test('Fetch All checks incomplete items and keeps complete items available for review', async ({ page }) => {
  const items = [
    { id: 'one', title: 'First Movie', type: 'movie', year: 2020, yearSource: 'user', overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/first.mkv', recommendedFolderStructure: 'First', recommendedFilenames: [] },
    { id: 'two', title: 'Second Movie', type: 'movie', year: 2021, overview: 'Existing synopsis', posterUrl: 'https://example.com/existing.jpg', genres: ['Drama'], rating: 8, path: '/media/second.mkv', recommendedFolderStructure: 'Second', recommendedFilenames: [] },
    { id: 'three', title: 'Third Movie', type: 'movie', year: 2022, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/third.mkv', recommendedFolderStructure: 'Third', recommendedFilenames: [] },
    { id: 'four', title: 'Fourth Movie', type: 'movie', year: 2020, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/fourth.mkv', recommendedFolderStructure: 'Fourth', recommendedFilenames: [] },
    { id: 'picture', title: 'Picture Folder Video', type: 'movie', year: 2022, overview: '', posterUrl: '', genres: [], rating: 0, path: '/Volumes/media/Pictures/album/video.mp4', recommendedFolderStructure: '/Volumes/media/Pictures/album', recommendedFilenames: [] },
    { id: 'subtitle', title: '3 Eng', type: 'movie', year: 2026, overview: '', posterUrl: '', genres: [], rating: 0, path: '/media/3 Eng.srt', matchedFilename: '3 Eng.srt', recommendedFolderStructure: '/media/3 Eng.srt', recommendedFilenames: [] },
    ...['Pictures', 'Collections', 'Comedy', 'Animation', 'Horror - Supernatural', 'Reality', 'Scify'].map((title) => ({
      id: `folder-${title}`, title, type: 'movie', year: 0, overview: '', posterUrl: '', genres: [], rating: 0,
      path: `/media/${title}`, recommendedFolderStructure: title, recommendedFilenames: [],
    })),
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
        body = { success: true, source: 'omdb', title, year: 2020, overview: 'Fetched synopsis', posterUrl: 'https://example.com/new.jpg', diagnostics: [{ provider: 'OMDb', outcome: 'Result returned' }] };
      } else if (title === 'Second Movie') {
        body = { success: true, source: 'fallback', title };
      } else if (title === 'Fourth Movie') {
        body = { success: true, source: 'itunes', title: 'Different title', diagnostics: [{ provider: 'OMDb', outcome: 'No result found' }, { provider: 'iTunes movies', outcome: 'Result returned' }] };
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
  await expect(page.getByText('Picture Folder Video', { exact: true })).toHaveCount(0);
  await openList();
  await expect(page.getByRole('button', { name: 'Not Checked (3)' })).toBeVisible();
  const categorizer = page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: /Web Search & Media Categorizer/ }),
  });
  for (const title of ['Pictures', 'Collections', 'Comedy', 'Animation', 'Horror - Supernatural', 'Reality', 'Scify']) {
    await expect(categorizer.getByText(title, { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Has metadata (1)' }).click();
  await expect(categorizer.getByText('Second Movie (2021)', { exact: true })).toBeVisible();
  await expect(categorizer.getByRole('button', { name: 'Manual Match' })).toBeVisible();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch All (3)' }).click();
  await expect(page.getByText('Finished: 3/3 checked, 1 matched, 1 without a verified match, 1 failed.', { exact: true })).toBeVisible();
  expect(checked).toEqual(['First Movie', 'Third Movie', 'Fourth Movie']);
  const log = page.getByRole('log', { name: 'Fetch All log' });
  await expect(log).toContainText('1 subtitle/metadata/artwork entries excluded');
  await expect(log).toContainText('OMDb: Result returned');
  await expect(log).toContainText('Failed to fetch or save "Third Movie": Metadata lookup failed (HTTP 500)');
  await expect(log).toContainText('Title does not match the library item; source: itunes; returned: Different title');
  await expect(log).toContainText('No verified match saved for "Fourth Movie"');
  expect(saved.get('one')).toMatchObject({ id: 'one', path: '/media/first.mkv', overview: 'Fetched synopsis', posterUrl: 'https://example.com/new.jpg', metadataFetchStatus: 'matched' });
  expect(saved.has('two')).toBe(false);
  expect(saved.has('three')).toBe(false);
  expect(saved.get('four')).toMatchObject({ metadataFetchStatus: 'no-match' });
  await expect(page.getByText('Fetch failed: Metadata lookup failed (HTTP 500)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Has metadata (2)' })).toBeVisible();

  await page.reload();
  await openList();
  await expect(page.getByRole('button', { name: 'Not Checked (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Has metadata (2)' })).toBeVisible();
});

test('Fetch All searches album entries once and excludes individual audio tracks', async ({ page }) => {
  const base = { type: 'album', year: 0, overview: '', posterUrl: '', genres: [], rating: 0, recommendedFilenames: [] };
  const items = [
    { ...base, id: 'album', title: 'Test Album', path: '/media/Music/Artist/Test Album/01 - First.mp3', recommendedFolderStructure: '/media/Music/Artist/Test Album', matchedFilename: 'Test Album' },
    { ...base, id: 'track1', title: 'First', path: '/media/Music/Artist/Test Album/01 - First.mp3', recommendedFolderStructure: '/media/Music/Artist/Test Album/01 - First.mp3', matchedFilename: '01 - First.mp3' },
    { ...base, id: 'track2', title: 'Second', path: '/media/Music/Artist/Test Album/02 - Second.flac', recommendedFolderStructure: '/media/Music/Artist/Test Album/02 - Second.flac', matchedFilename: '02 - Second.flac' },
  ];
  const checked: string[] = [];
  const saved: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'POST') saved.push(request.postDataJSON().id);
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/media/fetch-art') {
      const { title } = request.postDataJSON();
      checked.push(title);
      body = { success: true, title, source: 'itunes', posterUrl: 'https://example.com/album.jpg' };
    }
    await route.fulfill({ json: body });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await expect(page.getByText('2 audio track entries excluded.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Fetch All (1)' }).click();
  await expect(page.getByText('Finished: 1/1 checked, 0 matched, 1 without a verified match, 0 failed.', { exact: true })).toBeVisible();
  expect(checked).toEqual(['Test Album']);
  expect(saved).toEqual(['album']);
  await expect(page.getByRole('log', { name: 'Fetch All log' })).toContainText('2 individual audio tracks excluded');
  await expect(page.getByRole('log', { name: 'Fetch All log' })).toContainText('Album artist cannot be verified; review this result manually');
});

test('Fetch All runs media types concurrently while keeping each type sequential', async ({ page }) => {
  const items = (['movie', 'series', 'album'] as const).flatMap(type => [1, 2].map(number => ({
    id: `${type}-${number}`, title: `${type} title ${number}`, type, year: 0,
    overview: '', posterUrl: '', genres: [], rating: 0,
    recommendedFolderStructure: `${type} title ${number}`, recommendedFilenames: [],
  })));
  const checked: string[] = [];
  let releaseFirstRequests!: () => void;
  const firstRequests = new Promise<void>(resolve => { releaseFirstRequests = resolve; });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'GET') body = { success: true, items: [] };
    else if (pathname === '/api/media/fetch-art') {
      const { title } = request.postDataJSON() as { title: string };
      checked.push(title);
      if (title.endsWith('1')) await firstRequests;
      body = { success: true, source: 'omdb', title: 'Different title' };
    }
    await route.fulfill({ json: body });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch All (6)' }).click();
  try {
    await expect.poll(() => checked.length).toBe(3);
    expect(checked.sort()).toEqual(['album title 1', 'movie title 1', 'series title 1']);
    await expect(page.getByRole('status')).toContainText('movie title 1');
    await expect(page.getByRole('status')).toContainText('series title 1');
    await expect(page.getByRole('status')).toContainText('album title 1');
  } finally {
    releaseFirstRequests();
  }
  await expect(page.getByRole('status')).toContainText('Finished: 6/6 checked');
  expect(checked).toHaveLength(6);
});

test('backend failure stops new work across types while in-flight lookups finish', async ({ page }) => {
  const items = (['movie', 'series', 'album'] as const).flatMap(type => [1, 2].map(number => ({
    id: `${type}-${number}`, title: `${type} title ${number}`, type, year: 0,
    overview: '', posterUrl: '', genres: [], rating: 0,
    recommendedFolderStructure: `${type} title ${number}`, recommendedFilenames: [],
  })));
  const checked: string[] = [];
  const saved: string[] = [];
  let releaseRequests!: () => void;
  const pendingRequests = new Promise<void>(resolve => { releaseRequests = resolve; });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'POST') saved.push(request.postDataJSON().id);
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/media/fetch-art') {
      const { title } = request.postDataJSON() as { title: string };
      checked.push(title);
      if (title.startsWith('movie')) {
        await expect.poll(() => checked.length).toBe(3);
        body = { success: true, fallback: true, source: 'local_storage_cache' };
      } else {
        await pendingRequests;
        body = { success: true, source: 'omdb', title: 'Different title' };
      }
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch All (6)' }).click();
  try {
    await expect(page.getByRole('log', { name: 'Fetch All log' })).toContainText('Failed to fetch or save "movie title 1"');
  } finally {
    releaseRequests();
  }
  await expect(page.getByRole('status')).toContainText('Stopped: 3/6 checked');
  expect(checked.sort()).toEqual(['album title 1', 'movie title 1', 'series title 1']);
  expect(saved.sort()).toEqual(['album-1', 'series-1']);
});

test('offline metadata responses stop the batch without marking items as no-match, and can be retried', async ({ page }) => {
  const items = ['First Movie', 'Second Movie'].map((title, index) => ({
    id: `offline-${index}`, title, type: 'movie', year: 2020, yearSource: 'user',
    overview: '', posterUrl: '', genres: [], rating: 0, recommendedFolderStructure: title, recommendedFilenames: [],
    ...(index === 0 ? { metadataFetchStatus: 'no-match' } : {}),
  }));
  let online = false;
  let requests = 0;
  const saved: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === '/api/vault/state' && request.method() === 'GET') body = { success: true, state: { mediaLibrary: items } };
    else if (pathname === '/api/db/media' && request.method() === 'POST') saved.push(request.postDataJSON());
    else if (pathname === '/api/db/media') body = { success: true, items: [] };
    else if (pathname === '/api/media/fetch-art') {
      requests++;
      body = online
        ? { success: true, source: 'omdb', title: request.postDataJSON().title, year: 2020, overview: 'Synopsis', posterUrl: 'https://example.com/poster.jpg' }
        : { success: true, fallback: true, source: 'local_storage_cache' };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Web Search & Categorize' }).first().click();
  await page.getByRole('button', { name: /Missing & Unfetched/ }).click();
  await page.getByRole('button', { name: 'Fetch All (2)' }).click();
  await expect(page.getByRole('status')).toContainText('Stopped: 1/2 checked, 0 matched, 0 without a verified match, 1 failed');
  expect(requests).toBe(1);
  expect(saved).toHaveLength(0);
  online = true;
  await page.getByRole('button', { name: 'Fetch All (2)' }).click();
  await expect(page.getByText('Finished: 2/2 checked, 2 matched, 0 without a verified match, 0 failed.', { exact: true })).toBeVisible();
  expect(saved).toHaveLength(2);
});
