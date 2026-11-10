import { metadataTitleVariants, normalizeUniverseTitle } from '../shared/universeMatcher';
import { fetchMetadataWithDiagnostics } from './metadataRequestDiagnostics';

type Diagnostic = { provider: string; outcome: string };
class RankedSearchError extends Error {}

export interface TmdbMetadata {
  source: 'tmdb';
  title: string;
  year: number;
  overview?: string;
  posterUrl?: string;
  matchMode?: 'ranked';
}

export async function fetchRankedTmdbMetadata(
  title: string, type: string, year: number | undefined, diagnostics?: Diagnostic[],
): Promise<{ metadata?: TmdbMetadata; unsafeToMatch?: boolean }> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token || !year || (type !== 'movie' && type !== 'series')) return {};
  const variants = metadataTitleVariants(title);
  const candidates: Array<{ metadata: TmdbMetadata; variant: number; distance: number; popularity: number; votes: number; id: number }> = [];
  diagnostics?.push({ provider: 'TMDB', outcome: 'Trying ranked title variants and release years within one year; this may select a different film' });
  try {
    const searches = await Promise.allSettled(variants.map(async (query, variant) => {
      const url = new URL(`https://api.themoviedb.org/3/search/${type === 'movie' ? 'movie' : 'tv'}`);
      url.searchParams.set('query', query);
      url.searchParams.set('include_adult', 'false');
      const getPage = async (page: number): Promise<{ results: unknown[]; totalPages: number }> => {
        const pageUrl = new URL(url);
        if (page > 1) pageUrl.searchParams.set('page', String(page));
        const response = await fetchMetadataWithDiagnostics(pageUrl, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        }, 'TMDB', diagnostics, ['query', 'include_adult', 'page']);
        if (!response.ok) throw new RankedSearchError(`HTTP ${response.status} during ranked search`);
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new RankedSearchError('Invalid provider response during ranked search');
        }
        if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results) ||
            !('total_pages' in data) || !Number.isInteger(data.total_pages) || Number(data.total_pages) < 0) {
          throw new RankedSearchError('Invalid provider response during ranked search');
        }
        return { results: data.results, totalPages: Number(data.total_pages) };
      };
      const first = await getPage(1);
      if (first.totalPages > 5) return { variant, query, incomplete: true, results: [] };
      const remaining = await Promise.allSettled(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => getPage(index + 2)));
      const failedPage = remaining.find(result => result.status === 'rejected');
      if (failedPage?.status === 'rejected') throw failedPage.reason;
      const rest = remaining.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (rest.some(page => page.totalPages !== first.totalPages)) throw new RankedSearchError('Invalid provider response: result pages changed during ranked search');
      return { variant, query, incomplete: false, results: [first, ...rest].flatMap(page => page.results) };
    }));
    const failedSearch = searches.find(result => result.status === 'rejected');
    if (failedSearch?.status === 'rejected') throw failedSearch.reason;
    const pages = searches.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (pages.some(page => page.incomplete)) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Too many results to rank safely; review manually' });
      return { unsafeToMatch: true };
    }
    for (const page of pages) {
      for (const entry of page.results) {
        if (!entry || typeof entry !== 'object') continue;
        const result = entry as Record<string, unknown>;
        const name = type === 'movie' ? result.title : result.name;
        const date = type === 'movie' ? result.release_date : result.first_air_date;
        if (typeof name !== 'string' || normalizeUniverseTitle(name) !== normalizeUniverseTitle(page.query) ||
            typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isSafeInteger(result.id) || Number(result.id) <= 0) continue;
        const resultYear = Number(date.slice(0, 4));
        const distance = Math.abs(resultYear - year);
        if (distance > 1) continue;
        candidates.push({
          metadata: {
            source: 'tmdb', title: name, year: resultYear, matchMode: 'ranked',
            overview: typeof result.overview === 'string' ? result.overview : undefined,
            posterUrl: typeof result.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(result.poster_path)
              ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : undefined,
          },
          variant: page.variant, distance,
          popularity: typeof result.popularity === 'number' && Number.isFinite(result.popularity) ? result.popularity : 0,
          votes: typeof result.vote_count === 'number' && Number.isFinite(result.vote_count) ? result.vote_count : 0,
          id: Number(result.id),
        });
      }
    }
    candidates.sort((a, b) => a.variant - b.variant || a.distance - b.distance ||
      b.popularity - a.popularity || b.votes - a.votes || a.id - b.id);
    const unique = candidates.filter((candidate, index) => candidates.findIndex(other => other.id === candidate.id) === index);
    if (!unique.length) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'No ranked title variant and nearby year result found' });
      return {};
    }
    const selected = unique[0];
    diagnostics?.push({ provider: 'TMDB', outcome: `Ranked selection: ${selected.metadata.title} (${selected.metadata.year}), TMDB ID ${selected.id}; ${unique.length} candidate(s), popularity ${selected.popularity}, votes ${selected.votes}; verify this match` });
    return { metadata: selected.metadata };
  } catch (error) {
    diagnostics?.push({ provider: 'TMDB', outcome: error instanceof RankedSearchError
      ? `${error.message}; no ranked match selected`
      : 'Network error or timeout during ranked search; no ranked match selected' });
    console.warn('[TMDB metadata] Ranked search failed or returned an invalid response.');
    return { unsafeToMatch: true };
  }
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
