import { normalizeUniverseTitle } from '../shared/universeMatcher';
import { APP_VERSION } from '../version';
import { fetchMetadataWithDiagnostics } from './metadataRequestDiagnostics';

type Diagnostic = { provider: string; outcome: string };
export interface AlbumMetadata {
  source: 'musicbrainz-audiodb';
  title: string;
  artist: string;
  musicBrainzId: string;
  overview?: string;
  posterUrl?: string;
}

class ProviderBusyError extends Error {}

class ProviderRateGate {
  private next = 0;
  private pending = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly interval: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= 4) throw new ProviderBusyError('Provider queue is full; retry later');
    this.pending++;
    const result = this.tail.then(async () => {
      const delay = Math.max(0, this.next - Date.now());
      if (delay > 10000) throw new ProviderBusyError('Provider cooling down; retry later');
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      this.next = Date.now() + this.interval;
      return operation();
    });
    this.tail = result.then(() => undefined, () => undefined);
    try { return await result; }
    finally { this.pending--; }
  }

  cooldown(ms: number): void {
    this.next = Math.max(this.next, Date.now() + ms);
  }
}

const musicBrainzGate = new ProviderRateGate(1100);
const audioDbGate = new ProviderRateGate(2200);

function escapedLucene(value: string): string {
  return value.replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, '\\$&');
}

export async function fetchAlbumMetadata(
  title: string,
  artist: string,
  diagnostics: Diagnostic[],
): Promise<AlbumMetadata | null> {
  const search = new URL('https://musicbrainz.org/ws/2/release-group');
  search.searchParams.set('query', `releasegroup:"${escapedLucene(title)}" AND artist:"${escapedLucene(artist)}"`);
  search.searchParams.set('fmt', 'json');
  search.searchParams.set('limit', '100');
  let groups: unknown;
  try {
    const response = await musicBrainzGate.run(async () => {
      const result = await fetchMetadataWithDiagnostics(search, {
        headers: { 'User-Agent': `SambaVault/${APP_VERSION} (https://github.com/silverraindog/media-player)`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }, 'MusicBrainz', diagnostics, ['query', 'fmt', 'limit']);
      if (result.status === 503 || result.status === 429) musicBrainzGate.cooldown(60000);
      return result;
    });
    if (!response.ok) {
      diagnostics.push({ provider: 'MusicBrainz', outcome: `HTTP ${response.status}` });
      return null;
    }
    groups = await response.json();
  } catch (error) {
    diagnostics.push({ provider: 'MusicBrainz', outcome: error instanceof ProviderBusyError ? error.message : 'Network error or timeout' });
    console.warn('[MusicBrainz] Search failed or provider queue is full.');
    return null;
  }
  if (!groups || typeof groups !== 'object' || !('release-groups' in groups) ||
      !Array.isArray(groups['release-groups']) || !('count' in groups) || typeof groups.count !== 'number') {
    diagnostics.push({ provider: 'MusicBrainz', outcome: 'Invalid provider response' });
    return null;
  }
  if (groups.count > groups['release-groups'].length) {
    diagnostics.push({ provider: 'MusicBrainz', outcome: 'Too many results to verify uniquely; review manually' });
    return null;
  }
  const matches = groups['release-groups'].filter((value: unknown) => {
    if (!value || typeof value !== 'object') return false;
    const group = value as Record<string, unknown>;
    if (typeof group.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(group.id) ||
        typeof group.title !== 'string' || normalizeUniverseTitle(group.title) !== normalizeUniverseTitle(title) ||
        !Array.isArray(group['artist-credit'])) return false;
    const credits = group['artist-credit'];
    if (credits.length !== 1 || !credits[0] || typeof credits[0] !== 'object') return false;
    const credit = credits[0] as Record<string, unknown>;
    const creditedArtist = credit.artist && typeof credit.artist === 'object'
      ? (credit.artist as Record<string, unknown>).name : undefined;
    return typeof creditedArtist === 'string' && normalizeUniverseTitle(creditedArtist) === normalizeUniverseTitle(artist);
  });
  if (matches.length !== 1) {
    diagnostics.push({ provider: 'MusicBrainz', outcome: matches.length ? 'Ambiguous results; review manually' : 'No exact album and artist result found' });
    return null;
  }
  const group = matches[0] as { id: string; title: string };
  diagnostics.push({ provider: 'MusicBrainz', outcome: 'Result returned' });
  const lookup = new URL('https://www.theaudiodb.com/api/v1/json/123/album-mb.php');
  lookup.searchParams.set('i', group.id);
  try {
    const response = await audioDbGate.run(async () => {
      const result = await fetchMetadataWithDiagnostics(lookup, { signal: AbortSignal.timeout(8000) },
        'TheAudioDB', diagnostics, ['i']);
      if (result.status === 429 || result.status === 503) audioDbGate.cooldown(60000);
      return result;
    });
    if (!response.ok) {
      diagnostics.push({ provider: 'TheAudioDB', outcome: `HTTP ${response.status}` });
      return null;
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('album' in data) ||
        (data.album !== null && !Array.isArray(data.album))) {
      diagnostics.push({ provider: 'TheAudioDB', outcome: 'Invalid provider response' });
      return null;
    }
    const albums: unknown[] = Array.isArray(data.album) ? data.album : [];
    const matching = albums.filter((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const album = entry as Record<string, unknown>;
      return album.strMusicBrainzID === group.id && typeof album.strAlbum === 'string' &&
        normalizeUniverseTitle(album.strAlbum) === normalizeUniverseTitle(title) &&
        typeof album.strArtist === 'string' && normalizeUniverseTitle(album.strArtist) === normalizeUniverseTitle(artist);
    });
    if (matching.length !== 1) {
      diagnostics.push({ provider: 'TheAudioDB', outcome: matching.length ? 'Ambiguous results; review manually' : 'No exact album and artist result found' });
      return null;
    }
    const album = matching[0] as Record<string, unknown>;
    diagnostics.push({ provider: 'TheAudioDB', outcome: 'Result returned' });
    const artwork = typeof album.strAlbumThumb === 'string' && /^https:\/\/[^/]+/i.test(album.strAlbumThumb)
      ? album.strAlbumThumb : undefined;
    return {
      source: 'musicbrainz-audiodb', title: group.title, artist, musicBrainzId: group.id,
      overview: typeof album.strDescriptionEN === 'string' ? album.strDescriptionEN :
        typeof album.strDescription === 'string' ? album.strDescription : undefined,
      posterUrl: artwork,
    };
  } catch (error) {
    diagnostics.push({ provider: 'TheAudioDB', outcome: error instanceof ProviderBusyError ? error.message : 'Network error or timeout' });
    console.warn('[TheAudioDB] Lookup failed or provider queue is full.');
    return null;
  }
}
