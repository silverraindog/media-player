import { normalizeUniverseTitle } from '../shared/universeMatcher';
import { fetchMetadataWithDiagnostics, type MetadataDiagnostic } from './metadataRequestDiagnostics';
import { fetchTmdbCollectionMetadata } from './tmdbMetadata';
import { APP_VERSION } from '../version';
import type { FranchiseCandidate, FranchiseOverview } from '../types';

export class FranchiseOverviewError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
    readonly providerStatus?: 429 | 503,
  ) {
    super(message);
    this.name = 'FranchiseOverviewError';
  }
}

let wikipediaQueue: Promise<void> = Promise.resolve();
let wikipediaRetryAt = 0;
let wikipediaPauseStatus: 429 | 503 = 429;

function wikipediaPauseError(status: 429 | 503, retryAfterSeconds: number): FranchiseOverviewError {
  const reason = status === 429 ? 'Wikipedia rate limit reached (HTTP 429).' : 'Wikipedia is temporarily unavailable (HTTP 503).';
  return new FranchiseOverviewError(`${reason} Wait at least ${retryAfterSeconds} seconds before retrying.`, retryAfterSeconds, status);
}

function wikipediaRetryDelay(value: string | null): number {
  if (value && /^\d+$/.test(value.trim())) {
    return Math.min(Number(value.trim()) * 1000, Number.MAX_SAFE_INTEGER - Date.now());
  }
  const date = value && /[a-z]/i.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 5000;
}

async function requestWikipedia(url: URL, diagnostics: MetadataDiagnostic[]): Promise<unknown> {
  const request = wikipediaQueue.then(async () => {
    const remaining = wikipediaRetryAt - Date.now();
    if (remaining > 0) throw wikipediaPauseError(wikipediaPauseStatus, Math.ceil(remaining / 1000));
    wikipediaRetryAt = 0;
    let response: Response;
    try {
      response = await fetchMetadataWithDiagnostics(url, {
        headers: { 'User-Agent': `SambaVault/${APP_VERSION} (https://github.com/silverraindog/media-player)`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }, 'Wikipedia', diagnostics, ['action', 'prop', 'titles', 'pageids']);
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new FranchiseOverviewError('Wikipedia request timed out. Retry when the connection is available.');
      }
      throw new FranchiseOverviewError('Could not connect to Wikipedia. Check the connection and retry.');
    }
    if (response.status === 429 || response.status === 503) {
      wikipediaPauseStatus = response.status;
      wikipediaRetryAt = Date.now() + wikipediaRetryDelay(response.headers.get('Retry-After'));
      throw wikipediaPauseError(response.status, Math.ceil(Math.max(0, wikipediaRetryAt - Date.now()) / 1000));
    }
    if (!response.ok) throw new FranchiseOverviewError(`Wikipedia request failed (HTTP ${response.status}).`);
    return response.json();
  });
  wikipediaQueue = request.then(() => undefined, () => undefined);
  return request;
}

export async function fetchFranchiseOverview(
  title: string,
  type: 'collection' | 'series',
  diagnostics: MetadataDiagnostic[],
  selection?: FranchiseCandidate,
  year?: number,
): Promise<{ overview?: FranchiseOverview; candidates?: FranchiseCandidate[] }> {
  if (type === 'collection' && (!selection || selection.source === 'TMDB')) {
    const collection = await fetchTmdbCollectionMetadata(title, diagnostics, selection?.id);
    if (collection.candidates?.length) {
      return { candidates: collection.candidates.flatMap(candidate => candidate.collectionId
        ? [{ title: candidate.title, source: 'TMDB' as const, id: candidate.collectionId }] : []) };
    }
    if (collection.metadata?.collectionOverview) {
      return { overview: {
        text: collection.metadata.collectionOverview, source: 'TMDB',
        url: `https://www.themoviedb.org/collection/${collection.metadata.collectionId}`,
      } };
    }
    if (selection) throw new FranchiseOverviewError('The selected TMDB collection has no usable collection overview.');
    if (collection.unsafeToMatch && !collection.noUsableDescription) throw new FranchiseOverviewError('TMDB collection lookup could not be verified; check provider diagnostics.');
  }

  const search = new URL('https://en.wikipedia.org/w/api.php');
  search.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'pageprops', titles: [
      `${title} (franchise)`,
      type === 'collection' ? `${title} (film series)` : `${title} (TV series)`,
      title,
    ].join('|'),
  }).toString();
  const searchData = await requestWikipedia(search, diagnostics) as { query?: { pages?: unknown[] } };
  if (!Array.isArray(searchData.query?.pages)) throw new FranchiseOverviewError('Wikipedia returned an invalid search response.');
  const base = normalizeUniverseTitle(title);
  const candidates = searchData.query.pages.flatMap((entry): Array<FranchiseCandidate & { verifiedYear?: number; franchise: boolean }> => {
    if (!entry || typeof entry !== 'object') return [];
    const page = entry as { pageid?: unknown; title?: unknown; pageprops?: Record<string, unknown> };
    if (!Number.isSafeInteger(page.pageid) || Number(page.pageid) <= 0 ||
        typeof page.title !== 'string' || page.pageprops?.disambiguation !== undefined) return [];
    const qualified = page.title.match(/^(.+?) \((franchise|film series|tv series|television series)\)$/i);
    const shortDescription = page.pageprops?.['wikibase-shortdesc'];
    const directSeries = type === 'series' && normalizeUniverseTitle(page.title) === base &&
      typeof shortDescription === 'string' && /\b(?:television|tv)\s+(?:\w+\s+){0,4}series\b|\bfranchise\b/i.test(shortDescription);
    const qualifiedKind = qualified?.[2].toLowerCase();
    const allowedKind = qualifiedKind === 'franchise' ||
      (type === 'collection' ? qualifiedKind === 'film series' : qualifiedKind === 'tv series' || qualifiedKind === 'television series');
    if (!(qualified && allowedKind && normalizeUniverseTitle(qualified[1]) === base) && !directSeries) return [];
    const shortYear = typeof shortDescription === 'string' ? shortDescription.match(/\b(?:19|20)\d{2}\b/) : undefined;
    return [{ title: page.title, source: 'Wikipedia', id: Number(page.pageid),
      verifiedYear: shortYear ? Number(shortYear[0]) : undefined, franchise: qualifiedKind === 'franchise' }];
  }).filter((candidate, index, list) => list.findIndex(other => other.id === candidate.id) === index);
  if (!candidates.length && !selection) return {};
  const chosen = selection?.source === 'Wikipedia' ? candidates.find(candidate => candidate.id === selection.id) : undefined;
  if (selection && !chosen) throw new FranchiseOverviewError('The selected Wikipedia result is no longer available.');
  if (!chosen && (candidates.length > 1 ||
      (type === 'series' && !candidates[0].franchise && (!year || candidates[0].verifiedYear !== year)))) {
    return { candidates: candidates.map(({ title, source, id }) => ({ title, source, id })) };
  }
  const candidate = chosen || candidates[0];
  const extractUrl = new URL('https://en.wikipedia.org/w/api.php');
  extractUrl.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'extracts|info',
    inprop: 'url', explaintext: '1', exsectionformat: 'wiki', pageids: String(candidate.id),
  }).toString();
  const extractData = await requestWikipedia(extractUrl, diagnostics) as { query?: { pages?: Array<{ pageid?: number; extract?: unknown; fullurl?: unknown }> } };
  const page = extractData.query?.pages?.[0];
  if (page?.pageid !== candidate.id || typeof page.extract !== 'string' || typeof page.fullurl !== 'string') {
    throw new FranchiseOverviewError('Wikipedia returned an invalid article response.');
  }
  const url = new URL(page.fullurl);
  if (url.protocol !== 'https:' || url.hostname !== 'en.wikipedia.org') throw new FranchiseOverviewError('Wikipedia returned an invalid article URL.');
  const section = page.extract.match(/^==[ \t]*(?:Premise|Overview|Synopsis|Plot)[ \t]*==[ \t]*\n([\s\S]*?)(?=^==[ \t]*[^=]|$(?![\s\S]))/im);
  const sectionText = section?.[1]?.trim();
  const introduction = chosen ? page.extract.split(/^==[ \t]*[^=].*?==[ \t]*$/m, 1)[0].trim() : '';
  const text = sectionText || introduction;
  if (!text) {
    diagnostics.push({ provider: 'Wikipedia', outcome: 'No premise or overview section found; review manually' });
    return {};
  }
  if (!sectionText) diagnostics.push({ provider: 'Wikipedia', outcome: 'Using the selected article introduction' });
  return { overview: {
    text, source: 'Wikipedia', url: url.toString(), license: 'CC BY-SA 4.0',
    ...(!sectionText ? { excerpt: 'introduction' as const } : {}),
  } };
}
