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
  matchMode?: 'ranked' | 'unique-title' | 'unique-variant' | 'manual';
}

export interface TmdbReviewCandidate {
  source: 'tmdb';
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  collectionId?: number;
  candidateType?: 'movie' | 'collection';
  collectionName?: string;
}

export interface TmdbCollectionFilm {
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
}

export interface TmdbCollectionMetadata {
  source: 'tmdb';
  title: string;
  collectionId: number;
  collectionName: string;
  collectionOverview?: string;
  collectionFilms: TmdbCollectionFilm[];
  overview: string;
  posterUrl?: string;
  year?: number;
  matchMode: 'unique-collection';
}

function collectionBase(title: string): string {
  return title.replace(/\s+(?:collection|trilogy|complete)\s*$/i, '').trim();
}

function collectionNameMatches(title: string, collectionName: string): boolean {
  const expected = normalizeUniverseTitle(collectionBase(title));
  const actual = normalizeUniverseTitle(collectionBase(collectionName));
  return !!expected && expected === actual;
}

export async function fetchTmdbCollectionMetadata(
  title: string,
  diagnostics?: Diagnostic[],
  selectedCollectionId?: number,
): Promise<{ metadata?: TmdbCollectionMetadata; candidates?: TmdbReviewCandidate[]; unsafeToMatch?: boolean; noUsableDescription?: boolean }> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token) {
    diagnostics?.push({ provider: 'TMDB', outcome: 'No API token configured' });
    return {};
  }

  const fetchJson = async (url: URL): Promise<Record<string, unknown> | undefined> => {
    const response = await fetchMetadataWithDiagnostics(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }, 'TMDB', diagnostics, ['query', 'page']);
    if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  };

  const fetchDetails = async (id: number): Promise<TmdbCollectionMetadata | undefined> => {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/collection/${id}`);
    const details = await fetchJson(detailsUrl);
    if (!details || !Number.isSafeInteger(details.id) || Number(details.id) !== id ||
        typeof details.name !== 'string' || !collectionNameMatches(title, details.name) ||
        !Array.isArray(details.parts)) return undefined;

    const collectionFilms: TmdbCollectionFilm[] = details.parts.flatMap((part): TmdbCollectionFilm[] => {
      if (!part || typeof part !== 'object') return [];
      const film = part as Record<string, unknown>;
      if (typeof film.title !== 'string' || !film.title.trim()) return [];
      const releaseDate = typeof film.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(film.release_date)
        ? Number(film.release_date.slice(0, 4))
        : undefined;
      return [{
        title: film.title,
        year: releaseDate,
        overview: typeof film.overview === 'string' && film.overview.trim() ? film.overview.trim() : undefined,
        posterUrl: typeof film.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(film.poster_path)
          ? `https://image.tmdb.org/t/p/w500${film.poster_path}` : undefined,
      }];
    });
    const collectionOverview = typeof details.overview === 'string' && details.overview.trim()
      ? details.overview.trim() : undefined;
    const hasFilmDescription = collectionFilms.some(film => film.overview);
    if (!collectionFilms.length || (!collectionOverview && !hasFilmDescription)) return undefined;
    const filmSections = collectionFilms.map(film => {
      const filmTitle = `${film.title}${film.year ? ` (${film.year})` : ''}`;
      return `${filmTitle}\n${film.overview || 'No synopsis available from TMDB.'}`;
    });
    const overview = [
      collectionOverview ? `Collection overview\n${collectionOverview}` : '',
      `Films in this collection\n${filmSections.join('\n\n')}`,
    ].filter(Boolean).join('\n\n');
    return {
      source: 'tmdb',
      title: details.name,
      collectionId: id,
      collectionName: details.name,
      collectionOverview,
      collectionFilms,
      overview,
      posterUrl: typeof details.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(details.poster_path)
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
      matchMode: 'unique-collection',
    };
  };

  try {
    if (selectedCollectionId !== undefined) {
      if (!Number.isSafeInteger(selectedCollectionId) || selectedCollectionId <= 0) return {};
      const metadata = await fetchDetails(selectedCollectionId);
      if (!metadata) {
        diagnostics?.push({ provider: 'TMDB', outcome: 'Selected collection did not match the requested title or had no usable descriptions' });
        return {};
      }
      diagnostics?.push({ provider: 'TMDB', outcome: `Verified collection: ${metadata.collectionName} (${metadata.collectionFilms.length} film(s))` });
      return { metadata };
    }

    const firstUrl = new URL('https://api.themoviedb.org/3/search/collection');
    firstUrl.searchParams.set('query', title);
    const firstPage = await fetchJson(firstUrl);
    if (!firstPage || !Array.isArray(firstPage.results) ||
        !Number.isSafeInteger(firstPage.total_pages) || Number(firstPage.total_pages) < 0) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Invalid provider response during collection search' });
      return { unsafeToMatch: true };
    }
    const totalPages = Number(firstPage.total_pages);
    if (totalPages > 5) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Too many results in collection search to verify safely; review manually' });
      return { unsafeToMatch: true };
    }
    const remaining = await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, async (_, index) => {
      const pageUrl = new URL(firstUrl);
      pageUrl.searchParams.set('page', String(index + 2));
      const page = await fetchJson(pageUrl);
      if (!page || !Array.isArray(page.results) || Number(page.total_pages) !== totalPages) throw new Error('Invalid collection search page');
      return page.results;
    }));
    const exact = [firstPage.results, ...remaining].flat().flatMap((entry): TmdbReviewCandidate[] => {
      if (!entry || typeof entry !== 'object') return [];
      const result = entry as Record<string, unknown>;
      if (!Number.isSafeInteger(result.id) || Number(result.id) <= 0 ||
          typeof result.name !== 'string' || !collectionNameMatches(title, result.name)) return [];
      return [{
        source: 'tmdb',
        title: result.name,
        collectionName: result.name,
        collectionId: Number(result.id),
        candidateType: 'collection',
        overview: typeof result.overview === 'string' && result.overview.trim() ? result.overview : undefined,
        posterUrl: typeof result.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(result.poster_path)
          ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : undefined,
      }];
    }).filter((candidate, index, list) => list.findIndex(other => other.collectionId === candidate.collectionId) === index);
    if (!exact.length) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'No exact collection title found' });
      return {};
    }
    if (exact.length !== 1) {
      diagnostics?.push({ provider: 'TMDB', outcome: `Ambiguous collection results; ${exact.length} exact collections require manual selection` });
      return { unsafeToMatch: true, candidates: exact };
    }
    const metadata = await fetchDetails(exact[0].collectionId!);
    if (!metadata) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Exact collection found, but it contains no usable descriptions' });
      return { unsafeToMatch: true, noUsableDescription: true };
    }
    diagnostics?.push({ provider: 'TMDB', outcome: `Verified collection: ${metadata.collectionName} (${metadata.collectionFilms.length} film(s))` });
    return { metadata };
  } catch {
    diagnostics?.push({ provider: 'TMDB', outcome: 'Network error or timeout during collection lookup' });
    console.warn('[TMDB metadata] Collection lookup failed or returned an invalid response.');
    return { unsafeToMatch: true };
  }
}

export async function fetchRankedTmdbMetadata(
  title: string, type: string, year: number | undefined, diagnostics?: Diagnostic[], allowUniqueMovie = false, reviewYearMatches = false,
): Promise<{ metadata?: TmdbMetadata; unsafeToMatch?: boolean; searchFailed?: boolean; candidates?: TmdbReviewCandidate[] }> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if ((!year && type !== 'series' && !(type === 'movie' && allowUniqueMovie)) || (type !== 'movie' && type !== 'series')) return {};
  if (!token) {
    diagnostics?.push({ provider: 'TMDB', outcome: 'No API token configured' });
    return {};
  }
  const variants = metadataTitleVariants(title);
  const candidates: Array<{ metadata: TmdbMetadata; variant: number; distance: number; popularity: number; hasPopularity: boolean; votes: number; id: number }> = [];
  diagnostics?.push({ provider: 'TMDB', outcome: year
    ? reviewYearMatches ? 'Trying the requested year, then the following year; matching titles are ranked by popularity' : 'Trying ranked title variants and release years within one year; this may select a different film'
    : 'Trying title variants without a trusted year; only a unique result can be selected' });
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
        const distance = year ? Math.abs(resultYear - year) : 0;
        if (distance > 1 || (reviewYearMatches && year && resultYear < year)) continue;
        candidates.push({
          metadata: {
            source: 'tmdb', title: name, year: resultYear, matchMode: 'ranked',
            overview: typeof result.overview === 'string' ? result.overview : undefined,
            posterUrl: typeof result.poster_path === 'string' && /^\/[a-zA-Z0-9._-]+$/.test(result.poster_path)
              ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : undefined,
          },
          variant: page.variant, distance,
          popularity: typeof result.popularity === 'number' && Number.isFinite(result.popularity) ? result.popularity : 0,
          hasPopularity: typeof result.popularity === 'number' && Number.isFinite(result.popularity),
          votes: typeof result.vote_count === 'number' && Number.isFinite(result.vote_count) ? result.vote_count : 0,
          id: Number(result.id),
        });
      }
    }
    candidates.sort((a, b) => (reviewYearMatches ? a.distance - b.distance : a.variant - b.variant) ||
      (reviewYearMatches ? a.variant - b.variant : a.distance - b.distance) ||
      b.popularity - a.popularity || b.votes - a.votes || a.id - b.id);
    const unique = candidates.filter((candidate, index) => candidates.findIndex(other => other.id === candidate.id) === index);
    if (!unique.length) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'No ranked title variant and nearby year result found' });
      return {};
    }
    let selected = unique[0];
    if (year && reviewYearMatches) {
      const bestYear = unique.filter(candidate => candidate.distance === unique[0].distance);
      if (bestYear.length > 1) {
        const title = normalizeUniverseTitle(bestYear[0].metadata.title);
        if (bestYear.some(candidate => normalizeUniverseTitle(candidate.metadata.title) !== title)) {
          diagnostics?.push({ provider: 'TMDB', outcome: `Ambiguous results for ${bestYear[0].metadata.year}; review manually` });
          return { unsafeToMatch: true, candidates: bestYear.map(({ metadata }) => metadata) };
        }
        if (bestYear.some(candidate => !candidate.hasPopularity)) {
          diagnostics?.push({ provider: 'TMDB', outcome: 'Ambiguous results with missing popularity; review manually' });
          return { unsafeToMatch: true, candidates: bestYear.map(({ metadata }) => metadata) };
        }
        bestYear.sort((a, b) => b.popularity - a.popularity || b.votes - a.votes || a.id - b.id);
        selected = bestYear[0];
        diagnostics?.push({ provider: 'TMDB', outcome: `Multiple matches for the same title and year; selected the most popular, which may be incorrect` });
      }
    }
    if (!year && unique.length !== 1) {
      diagnostics?.push({ provider: 'TMDB', outcome: 'Ambiguous results without a trusted year; review manually' });
      return { unsafeToMatch: true, candidates: unique.map(({ metadata }) => metadata) };
    }
    if (!year && type === 'movie') {
      if (unique.length === 1 && unique[0].variant === 0) {
        unique[0].metadata.matchMode = 'unique-title';
        diagnostics?.push({ provider: 'TMDB', outcome: `Unique exact movie title: ${unique[0].metadata.title} (${unique[0].metadata.year}); saving provider year` });
        return { metadata: unique[0].metadata };
      }
      diagnostics?.push({ provider: 'TMDB', outcome: 'No unique exact movie title; select a result manually' });
      return { unsafeToMatch: true, candidates: unique.map(({ metadata }) => metadata) };
    }
    if (!year) selected.metadata.matchMode = type === 'series' ? 'unique-variant' : 'unique-title';
    diagnostics?.push({ provider: 'TMDB', outcome: `Ranked selection: ${selected.metadata.title} (${selected.metadata.year}), TMDB ID ${selected.id}; ${unique.length} candidate(s), popularity ${selected.popularity}, votes ${selected.votes}; verify this match` });
    return { metadata: selected.metadata };
  } catch (error) {
    diagnostics?.push({ provider: 'TMDB', outcome: error instanceof RankedSearchError
      ? `${error.message}; no ranked match selected`
      : 'Network error or timeout during ranked search; no ranked match selected' });
    console.warn('[TMDB metadata] Ranked search failed or returned an invalid response.');
    return { unsafeToMatch: true, searchFailed: true };
  }
}

export async function fetchTmdbMetadata(
  title: string,
  type: string,
  year: number | undefined,
  diagnostics?: Diagnostic[],
): Promise<{ metadata?: TmdbMetadata; unsafeToMatch?: boolean; candidates?: TmdbReviewCandidate[] }> {
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
      return candidates.length ? { unsafeToMatch: true, candidates } : {};
    }
    diagnostics?.push({ provider: 'TMDB', outcome: 'Result returned' });
    return { metadata: !year ? { ...candidates[0], matchMode: 'unique-title' } : candidates[0] };
  } catch {
    diagnostics?.push({ provider: 'TMDB', outcome: 'Network error or timeout' });
    console.warn('[TMDB metadata] Search failed or timed out.');
    return {};
  }
}
