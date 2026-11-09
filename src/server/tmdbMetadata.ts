import { normalizeUniverseTitle } from '../shared/universeMatcher';
import { fetchMetadataWithDiagnostics } from './metadataRequestDiagnostics';

type Diagnostic = { provider: string; outcome: string };

export interface TmdbMetadata {
  source: 'tmdb';
  title: string;
  year: number;
  overview?: string;
  posterUrl?: string;
}

export async function fetchTmdbMetadata(
  title: string,
  type: string,
  year: number | undefined,
  diagnostics?: Diagnostic[],
): Promise<{ metadata?: TmdbMetadata; unsafeToMatch?: boolean }> {
  if (type !== 'movie' && type !== 'series') return {};
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token) {
    diagnostics?.push({ provider: 'TMDB', outcome: 'No API token configured' });
    return {};
  }
  try {
    const url = new URL(`https://api.themoviedb.org/3/search/${type === 'movie' ? 'movie' : 'tv'}`);
    url.searchParams.set('query', title);
    url.searchParams.set('include_adult', 'false');
    if (year) url.searchParams.set(type === 'movie' ? 'primary_release_year' : 'first_air_date_year', String(year));
    const response = await fetchMetadataWithDiagnostics(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }, 'TMDB', diagnostics, ['query', 'include_adult', 'primary_release_year', 'first_air_date_year']);
    if (!response.ok) {
      diagnostics?.push({ provider: 'TMDB', outcome: `HTTP ${response.status}${response.status === 401 || response.status === 403 ? ': API token rejected; check Settings' : ''}` });
      return {};
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results) ||
        !('total_pages' in data) || !Number.isInteger(data.total_pages) || Number(data.total_pages) < 0) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Invalid provider response' });
      return {};
    }
    if (Number(data.total_pages) > 1) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Too many results to verify uniquely; review manually' });
      return { unsafeToMatch: true };
    }
    const normalized = normalizeUniverseTitle(title);
    const candidates: TmdbMetadata[] = data.results.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const result = entry as Record<string, unknown>;
      const name = type === 'movie' ? result.title : result.name;
      const date = type === 'movie' ? result.release_date : result.first_air_date;
      if (typeof name !== 'string' || normalizeUniverseTitle(name) !== normalized ||
          typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
      const resultYear = Number(date.slice(0, 4));
      if (year && year !== resultYear) return [];
      return [{
        source: 'tmdb' as const,
        title: name,
        year: resultYear,
        overview: typeof result.overview === 'string' ? result.overview : undefined,
        posterUrl: typeof result.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(result.poster_path)
          ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : undefined,
      }];
    });
    if (candidates.length !== 1) {
      diagnostics?.push({ provider: 'TMDB', outcome: candidates.length ? 'Ambiguous results; review manually' : 'No exact title and year result found' });
      return candidates.length ? { unsafeToMatch: true } : {};
    }
    diagnostics?.push({ provider: 'TMDB', outcome: 'Result returned' });
    return { metadata: candidates[0] };
  } catch {
    diagnostics?.push({ provider: 'TMDB', outcome: 'Network error or timeout' });
    console.warn('[TMDB metadata] Search failed or timed out.');
    return {};
  }
}
