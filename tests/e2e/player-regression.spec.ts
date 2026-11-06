import { expect, test } from '@playwright/test';

test('direct reload retains its source and waits for resumed playback', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/tests/e2e/player-fixture.html');
  const result = await page.evaluate(async () => {
    const { reloadDirectMedia } = window as unknown as {
      reloadDirectMedia: typeof import('../../src/utils/reloadDirectMedia').reloadDirectMedia;
    };
    const video = document.createElement('video');
    video.src = 'http://localhost:3000/api/samba/stream?path=%2FVolumes%2Fmedia%2Fmovie.mkv';
    Object.defineProperty(video, 'paused', { value: false });
    video.currentTime = 534;
    let sourceAtLoad = '';
    video.load = () => { sourceAtLoad = video.getAttribute('src') || ''; };
    video.play = () => Promise.resolve();
    const results: string[] = [];
    reloadDirectMedia(video, {
      onSuccess: () => results.push('success'),
      onFailure: (message) => results.push(message),
    });
    const beforeMetadata = [...results];
    video.currentTime = 0;
    video.dispatchEvent(new Event('loadedmetadata'));
    const beforePlaying = [...results];
    video.dispatchEvent(new Event('playing'));
    return { sourceAtLoad, time: video.currentTime, beforeMetadata, beforePlaying, results };
  });
  expect(result.sourceAtLoad).toContain('/api/samba/stream?path=%2FVolumes%2Fmedia');
  expect(result.time).toBe(534);
  expect(result.beforeMetadata).toEqual([]);
  expect(result.beforePlaying).toEqual([]);
  expect(result.results).toEqual(['success']);
});

test('direct reload reports errors and cancellation does not resurrect playback', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/tests/e2e/player-fixture.html');
  const result = await page.evaluate(async () => {
    const { reloadDirectMedia } = window as unknown as {
      reloadDirectMedia: typeof import('../../src/utils/reloadDirectMedia').reloadDirectMedia;
    };
    const video = document.createElement('video');
    video.src = 'http://localhost:3000/movie';
    Object.defineProperty(video, 'paused', { value: false });
    video.load = () => {};
    let playCalls = 0;
    video.play = () => { playCalls += 1; return Promise.resolve(); };
    const results: string[] = [];
    const callbacks = {
      onSuccess: () => results.push('success'),
      onFailure: (message: string) => results.push(message),
    };
    reloadDirectMedia(video, callbacks);
    video.dispatchEvent(new Event('error'));
    video.dispatchEvent(new Event('loadedmetadata'));
    const cancel = reloadDirectMedia(video, callbacks);
    cancel();
    video.dispatchEvent(new Event('loadedmetadata'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { results, playCalls };
  });
  expect(result.results).toEqual(['Media reload failed.']);
  expect(result.playCalls).toBe(0);
});

test('direct reload reports missing sources and timeouts', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/tests/e2e/player-fixture.html');
  const result = await page.evaluate(async () => {
    const { reloadDirectMedia } = window as unknown as {
      reloadDirectMedia: typeof import('../../src/utils/reloadDirectMedia').reloadDirectMedia;
    };
    const video = document.createElement('video');
    let loads = 0;
    video.load = () => { loads += 1; };
    const errors: string[] = [];
    const callbacks = { onSuccess: () => errors.push('unexpected success'), onFailure: (message: string) => errors.push(message) };
    reloadDirectMedia(video, callbacks);
    video.src = 'http://localhost:3000/movie';
    reloadDirectMedia(video, callbacks, 10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { errors, loads };
  });
  expect(result.errors).toEqual([
    'The direct player has no media source to reload.',
    'Media reload timed out before playback resumed.',
  ]);
  expect(result.loads).toBe(1);
});

test('HLS seeking is not reapplied when metadata changes', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/probe')
      ? { probe: { format: { format_name: 'matroska', duration: 120, size: 1 }, reasons: [] } }
      : { success: true };
    await route.fulfill({ json: body });
  });
  await page.goto('/tests/e2e/player-fixture.html');
  const video = page.locator('video');
  await expect(video).toBeAttached();
  await video.evaluate((el: HTMLVideoElement) => {
    Object.defineProperty(el, 'seekable', { value: { length: 1, start: () => 0, end: () => 120 } });
    Object.defineProperty(el, 'duration', { value: 120 });
    el.dispatchEvent(new Event('loadedmetadata'));
  });
  const seek = page.locator('input[type=range][step="0.1"]');
  await seek.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '20');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(20);
  await video.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 35;
    el.dispatchEvent(new Event('timeupdate'));
    el.dispatchEvent(new Event('loadedmetadata'));
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(35);
});

test('HLS playlist updates do not rewind playback after seeking', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({
    json: { success: true, probe: { format: { format_name: 'matroska', duration: 120, size: 1 }, reasons: [] } },
  }));
  await page.goto('/tests/e2e/player-fixture.html?hlsjs');
  const video = page.locator('video');
  await expect(video).toBeAttached();
  await video.evaluate((el: HTMLVideoElement) => {
    Object.defineProperty(el, 'seekable', { value: { length: 1, start: () => 0, end: () => 120 } });
    Object.defineProperty(el, 'duration', { value: 120 });
    el.dispatchEvent(new Event('loadedmetadata'));
  });
  await page.locator('input[type=range][step="0.1"]').evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '20');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(20);
  await video.evaluate((el: HTMLVideoElement) => {
    el.currentTime = 35;
    el.dispatchEvent(new Event('timeupdate'));
  });
  await page.evaluate(() => (window as Window & { emitLevel: () => void }).emitLevel());
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(35);
});

test('VLC playback is not reopened when its parent rerenders', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as Window & { calls: string[]; __TAURI_IPC__: (message: Record<string, unknown>) => void };
    w.calls = [];
    w.__TAURI_IPC__ = (message) => {
      w.calls.push(String(message.cmd));
      const callback = (window as unknown as Record<string, (result: unknown) => void>)[`_${message.callback}`];
      callback(message.cmd === 'vlc_status' ? {
        state: 'playing', timeMs: 10000, lengthMs: 120000, seekable: true,
        volume: 100, muted: false, audioTracks: [], subtitleTracks: [], audioTrack: 0, subtitleTrack: -1,
      } : null);
    };
  });
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/tests/e2e/player-fixture.html?vlc');
  await expect.poll(() => page.evaluate(() => (window as unknown as { calls: string[] }).calls.filter((c) => c === 'vlc_open').length)).toBe(1);
  await page.getByRole('button', { name: 'Rerender parent' }).click();
  await page.getByRole('button', { name: 'Rerender parent' }).click();
  await page.waitForTimeout(1000);
  const calls = await page.evaluate(() => (window as unknown as { calls: string[] }).calls);
  expect(calls.filter((c) => c === 'vlc_open')).toHaveLength(1);
  expect(calls.filter((c) => c === 'vlc_stop')).toHaveLength(0);
});
