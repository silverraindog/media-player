import { normalizeUniverseTitle } from '../shared/universeMatcher';
import { fetchMetadataWithDiagnostics, type MetadataDiagnostic } from './metadataRequestDiagnostics';
import { fetchTmdbCollectionMetadata } from './tmdbMetadata';
import type { FranchiseCandidate, FranchiseOverview } from '../types';

export class FranchiseOverviewError extends Error {
  constructor(message: string, readonly rateLimited = false) {
    super(message);
    this.name = 'FranchiseOverviewError';
  }
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
  const request = async (url: URL): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchMetadataWithDiagnostics(url, {
        headers: { 'User-Agent': 'SambaVault/0.0.2 (metadata lookup)' },
        signal: AbortSignal.timeout(8000),
      }, 'Wikipedia', diagnostics, ['action', 'prop', 'titles', 'pageids']);
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new FranchiseOverviewError('Wikipedia request timed out. Retry when the connection is available.');
      }
      throw new FranchiseOverviewError('Could not connect to Wikipedia. Check the connection and retry.');
    }
    if (response.status === 429) throw new FranchiseOverviewError('Wikipedia rate limit reached (HTTP 429). Wait before retrying.', true);
    if (!response.ok) throw new FranchiseOverviewError(`Wikipedia request failed (HTTP ${response.status}).`);
    return response.json();
  };
  const searchData = await request(search) as { query?: { pages?: unknown[] } };
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
  const extractData = await request(extractUrl) as { query?: { pages?: Array<{ pageid?: number; extract?: unknown; fullurl?: unknown }> } };
  const page = extractData.query?.pages?.[0];
  if (page?.pageid !== candidate.id || typeof page.extract !== 'string' || typeof page.fullurl !== 'string') {
    throw new FranchiseOverviewError('Wikipedia returned an invalid article response.');
  }
  const url = new URL(page.fullurl);
  if (url.protocol !== 'https:' || url.hostname !== 'en.wikipedia.org') throw new FranchiseOverviewError('Wikipedia returned an invalid article URL.');
  const section = page.extract.match(/^==[ \t]*(?:Premise|Overview|Synopsis|Plot)[ \t]*==[ \t]*\n([\s\S]*?)(?=^==[ \t]*[^=]|$(?![\s\S]))/im);
  const text = section?.[1]?.trim();
  if (!text) {
    diagnostics.push({ provider: 'Wikipedia', outcome: 'No premise or overview section found; review manually' });
    return {};
  }
  return { overview: { text, source: 'Wikipedia', url: url.toString(), license: 'CC BY-SA 4.0' } };
}
