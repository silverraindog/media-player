import fs from 'fs';
import path from 'path';
import type { Request, Response, Router } from 'express';
import {
  cleanUniverseTitle, curatedUniverse, selectConfidentCandidate,
  type UniverseAssignment, type UniverseCandidate, type UniverseMatch,
} from '../shared/universeMatcher';

type Assignments = Record<string, UniverseAssignment>;

export function registerUniverseRoutes(router: Router, dataDir: string): void {
  router.use('/api/universes', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1420'].includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  const file = path.join(dataDir, 'universe-assignments.json');
  const readAssignments = (): Assignments => {
    if (!fs.existsSync(file)) return {};
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid universe assignments file');
    return data as Assignments;
  };
  const tmdb = async (endpoint: string, query: Record<string, string> = {}): Promise<unknown> => {
    const token = process.env.TMDB_READ_ACCESS_TOKEN;
    if (!token) throw new Error('TMDB_READ_ACCESS_TOKEN is not configured in the backend environment.');
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`TMDB request failed (HTTP ${response.status}).`);
    return response.json();
  };
  const fail = (res: Response, error: unknown) => {
    console.error('[Universe Matcher]', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Universe matcher failed.' });
  };

  router.get('/api/universes/assignments', (_req, res) => {
    try { res.json({ assignments: readAssignments() }); } catch (error) { fail(res, error); }
  });
  router.put('/api/universes/assignment', (req, res) => {
    try {
      const { itemKey, assignment } = req.body || {};
      if (typeof itemKey !== 'string' || !itemKey.trim() || itemKey.length > 4096 ||
          !assignment || !['matched', 'unmatched', 'review'].includes(assignment.status) ||
          (assignment.match && (typeof assignment.match.key !== 'string' || typeof assignment.match.name !== 'string' ||
            !['tmdb', 'curated', 'manual'].includes(assignment.match.source))) ||
          (assignment.status === 'matched' && !assignment.match)) {
        return res.status(400).json({ error: 'Invalid universe assignment.' });
      }
      const assignments = readAssignments();
      Object.defineProperty(assignments, itemKey, { value: assignment, enumerable: true, configurable: true, writable: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(assignments, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, file);
      res.json({ success: true });
    } catch (error) { fail(res, error); }
  });
  router.post('/api/universes/search', async (req, res) => {
    try {
      const { title, type } = req.body || {};
      if (typeof title !== 'string' || !title.trim() || title.length > 300 || !['movie', 'series'].includes(type)) {
        return res.status(400).json({ error: 'A title and movie or series type are required.' });
      }
      const cleaned = cleanUniverseTitle(title);
      if (!cleaned.title) return res.status(400).json({ error: 'The title is empty after cleaning.' });
      const result = await tmdb(`search/${type === 'series' ? 'tv' : 'movie'}`, { query: cleaned.title, include_adult: 'false' }) as {
        results?: Array<{ id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; overview?: string; poster_path?: string }>;
      };
      const candidates: UniverseCandidate[] = (result.results || []).slice(0, 10).flatMap((entry) => {
        const name = type === 'series' ? entry.name : entry.title;
        if (!name || !Number.isInteger(entry.id)) return [];
        const date = type === 'series' ? entry.first_air_date : entry.release_date;
        const year = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined;
        return [{ id: entry.id, type, title: name, year, overview: entry.overview,
          posterUrl: entry.poster_path ? `https://image.tmdb.org/t/p/w500${entry.poster_path}` : undefined }];
      });
      const confident = selectConfidentCandidate(cleaned.title, cleaned.year, candidates);
      res.json({ cleaned, candidates, confidentId: confident?.id ?? null });
    } catch (error) { fail(res, error); }
  });
  router.post('/api/universes/resolve', async (req, res) => {
    try {
      const candidate = req.body?.candidate as UniverseCandidate | undefined;
      if (!candidate || !Number.isInteger(candidate.id) || candidate.id <= 0 ||
          !['movie', 'series'].includes(candidate.type) || typeof candidate.title !== 'string') {
        return res.status(400).json({ error: 'A valid TMDB candidate is required.' });
      }
      let match: UniverseMatch | undefined;
      if (candidate.type === 'movie') {
        const details = await tmdb(`movie/${candidate.id}`) as {
          belongs_to_collection?: { id: number; name: string } | null;
        };
        const collection = details.belongs_to_collection;
        if (collection && Number.isInteger(collection.id) && collection.name) {
          match = { key: `tmdb:${collection.id}`, name: collection.name, source: 'tmdb' };
        }
      }
      match = curatedUniverse(candidate) || match;
      res.json({ match: match || null });
    } catch (error) { fail(res, error); }
  });
}
