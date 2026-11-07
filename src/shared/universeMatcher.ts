import type { MediaMetadata } from '../types';

export interface UniverseMatch {
  key: string;
  name: string;
  source: 'tmdb' | 'curated' | 'manual';
}

export interface UniverseCandidate {
  id: number;
  type: 'movie' | 'series';
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
}

export interface UniverseAssignment {
  match?: UniverseMatch;
  candidate?: UniverseCandidate;
  status: 'matched' | 'unmatched' | 'review';
  manualOverride?: boolean;
}

export function universeItemKey(item: MediaMetadata): string {
  return `${item.type}:${(item.type === 'series' ? item.folderPath || item.path : item.path || item.folderPath) || item.id}`;
}

export function cleanUniverseTitle(title: string): { title: string; year?: number } {
  const year = title.match(/(?:^|[\s.([])((?:19|20)\d{2})(?=$|[\s.)\]])/)?.[1];
  const cleaned = title
    .replace(/\.(mkv|mp4|avi|mov|m4v|webm)$/i, '')
    .replace(/\b(?:s\d{1,2}e\d{1,3}|season[\s._-]*\d{1,2})\b.*$/i, '')
    .replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|hdr10|hdr|x264|x265|h264|h265|hevc|remux|blu[ ._-]?ray|web[ ._-]?(?:dl|rip)|bdrip|dvdrip|aac|dts)\b.*$/i, '')
    .replace(/[\[(](?:19|20)\d{2}[\])]/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[\[\]()]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return { title: cleaned, year: year ? Number(year) : undefined };
}

export function normalizeUniverseTitle(title: string): string {
  return title.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function selectConfidentCandidate(
  title: string, year: number | undefined, candidates: UniverseCandidate[]
): UniverseCandidate | null {
  const exact = candidates.filter((candidate) =>
    normalizeUniverseTitle(candidate.title) === normalizeUniverseTitle(title) &&
    (!year || candidate.year === year)
  );
  return exact.length === 1 ? exact[0] : null;
}

export function curatedUniverse(candidate: UniverseCandidate): UniverseMatch | undefined {
  const title = normalizeUniverseTitle(candidate.title);
  if ((candidate.type === 'series' && ['battlestar galactica', 'caprica', 'battlestar galactica blood chrome'].includes(title)) ||
      (candidate.type === 'movie' && candidate.year === 2009 && ['battlestar galactica the plan', 'the plan'].includes(title))) {
    return { key: 'curated:battlestar-galactica', name: 'Battlestar Galactica Universe', source: 'curated' };
  }
  const known: Array<{ key: string; name: string; series: string[]; movies: string[] }> = [
    { key: 'walking-dead', name: 'The Walking Dead Universe', series: ['the walking dead', 'fear the walking dead', 'the walking dead dead city', 'the walking dead daryl dixon', 'the walking dead the ones who live'], movies: [] },
    { key: 'breaking-bad', name: 'Breaking Bad Universe', series: ['breaking bad', 'better call saul'], movies: ['el camino a breaking bad movie'] },
    { key: 'westeros', name: 'Westeros Universe', series: ['game of thrones', 'house of the dragon'], movies: [] },
    { key: 'star-wars', name: 'Star Wars Universe', series: ['the mandalorian', 'andor', 'ahsoka'], movies: ['star wars', 'the empire strikes back', 'return of the jedi'] },
  ];
  const group = known.find((entry) => (candidate.type === 'movie' ? entry.movies : entry.series).includes(title));
  if (group) return { key: `curated:${group.key}`, name: group.name, source: 'curated' };
  return undefined;
}
