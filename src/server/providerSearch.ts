import type { Router } from 'express';
import type { ProviderResult } from '../shared/providerSearch';
import { cleanUniverseTitle } from '../shared/universeMatcher';

class ProviderSearchError extends Error {}

export function registerProviderSearchRoutes(router: Router): void {
  router.use('/api/provider-search', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1420'].includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.post('/api/provider-search', async (req, res) => {
    const { title, type, provider } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 300 ||
        !['movie', 'series', 'all'].includes(type) || !['tvmaze', 'omdb'].includes(provider)) {
      return res.status(400).json({ error: 'A title, media type and provider are required.' });
    }
    if (provider === 'tvmaze' && type === 'movie') {
      return res.status(400).json({ error: 'TVMaze searches TV series only.' });
    }
    const cleaned = cleanUniverseTitle(title).title;
    if (!cleaned) return res.status(400).json({ error: 'The title is empty after cleaning.' });
    const key = process.env.OMDB_API_KEY?.trim();
    if (provider === 'omdb' && !key) {
      return res.status(503).json({ error: 'OMDB_API_KEY is not configured in the backend environment.' });
    }
    try {
      const url = provider === 'tvmaze'
        ? new URL('https://api.tvmaze.com/search/shows')
        : new URL('https://www.omdbapi.com/');
      if (provider === 'tvmaze') url.searchParams.set('q', cleaned);
      else {
        url.searchParams.set('apikey', key!);
        url.searchParams.set('s', cleaned);
        if (type !== 'all') url.searchParams.set('type', type);
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new ProviderSearchError(`${provider === 'tvmaze' ? 'TVMaze' : 'OMDb'} request failed (HTTP ${response.status}).`);
      const data: unknown = await response.json();
      const results: ProviderResult[] = [];
      if (provider === 'tvmaze') {
        if (!Array.isArray(data)) throw new ProviderSearchError('Invalid TVMaze response.');
        for (const entry of data.slice(0, 10)) {
          const show = entry?.show;
          if (!Number.isInteger(show?.id) || typeof show.name !== 'string') continue;
          results.push({
            id: String(show.id), source: 'tvmaze', title: show.name, type: 'series',
            year: typeof show.premiered === 'string' && /^\d{4}/.test(show.premiered) ? Number(show.premiered.slice(0, 4)) : undefined,
            overview: typeof show.summary === 'string' ? show.summary.replace(/<[^>]*>/g, '') : undefined,
            posterUrl: typeof show.image?.medium === 'string' ? show.image.medium : undefined,
            url: `https://www.tvmaze.com/shows/${show.id}`,
          });
        }
      } else {
        if (!data || typeof data !== 'object' || !('Response' in data)) throw new ProviderSearchError('Invalid OMDb response.');
        const result = data as { Response: string; Error?: string; Search?: Array<{ imdbID?: string; Title?: string; Type?: string; Year?: string; Poster?: string }> };
        if (result.Response === 'False') {
          if (result.Error !== 'Movie not found!') throw new ProviderSearchError('OMDb search failed. Check your API key and quota.');
        } else if (result.Response !== 'True' || !Array.isArray(result.Search)) {
          throw new ProviderSearchError('Invalid OMDb response.');
        }
        for (const entry of (result.Search || []).slice(0, 10)) {
          if (!entry.imdbID || !/^tt\d+$/.test(entry.imdbID) || !entry.Title ||
              (entry.Type !== 'movie' && entry.Type !== 'series')) continue;
          results.push({
            id: entry.imdbID, source: 'omdb', title: entry.Title, type: entry.Type,
            year: entry.Year && /^\d{4}/.test(entry.Year) ? Number(entry.Year.slice(0, 4)) : undefined,
            posterUrl: entry.Poster?.startsWith('https://') ? entry.Poster : undefined,
            url: `https://www.imdb.com/title/${entry.imdbID}/`,
          });
        }
      }
      res.json({ results });
    } catch (error) {
      const message = error instanceof ProviderSearchError ? error.message : `${provider} search failed. Try again.`;
      console.error('[Provider search]', message);
      res.status(502).json({ error: message });
    }
  });
}
