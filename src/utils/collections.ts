import { MediaCollection, MediaMetadata, SambaShareNode } from '../types';
import { KNOWN_FRANCHISES_MAP } from './franchiseHierarchy';
import { extractFranchiseRoot } from './duplicateDetector';

export interface UnifiedCollection {
  id: string;
  name: string;
  description: string;
  overview: string;
  posterUrl: string;
  fanartUrl?: string;
  source: 'folder' | 'custom' | 'hybrid' | 'auto-franchise';
  folderPath?: string;
  customCollectionId?: string;
  itemIds: string[];
  excludedItemIds: string[];
  movies: MediaMetadata[];
  series: MediaMetadata[];
  music: MediaMetadata[];
  items: MediaMetadata[];
  createdAt: string;
  updatedAt?: string;
}

export const COLLECTION_FALLBACK_POSTER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230f172a'/><rect x='24' y='24' width='592' height='312' rx='16' fill='%231e293b' stroke='%23334155' stroke-width='2'/><text x='320' y='175' text-anchor='middle' fill='%23818cf8' font-family='system-ui, sans-serif' font-size='22' font-weight='700'>SambaVault Collection</text><text x='320' y='208' text-anchor='middle' fill='%2394a3b8' font-family='system-ui, sans-serif' font-size='14'>Movies · Series · Music</text></svg>";

const COLLECTION_CONTAINER_REGEX = /^(franchis(?:es?|ies)|franchies|collections?|universes?|sagas?)$/i;
const FILE_EXTENSION_REGEX = /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv|flv|flac|mp3|wav|aac|m4a|ogg|opus|nfo|jpg|jpeg|png|webp|srt|ass|vtt|iso|epub|pdf|cbz|cbr)$/i;

export function normalizeCollectionKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Extracts a collection/universe name from a file or folder path when housed inside
 * a container directory like Franchises/$parentfolder/, Franchies/$parentfolder/,
 * or collections/$parentfolder/.
 *
 * Examples:
 * - "/Volumes/media/Franchises/MCU/Iron Man (2008)/Iron Man.mkv" -> "MCU"
 * - "Franchies/Star Wars/The Mandalorian/Season 01/S01E01.mkv" -> "Star Wars"
 * - "collections/Battlestar Galactica/Season 01/ep1.mkv" -> "Battlestar Galactica"
 */
export function extractCollectionFromPath(
  rawPath?: string | null
): { name: string; matchedRootPath: string; matchedRootSegment: string } | null {
  if (!rawPath || typeof rawPath !== 'string') return null;

  const cleaned = rawPath.replace(/\\/g, '/').trim();
  if (!cleaned) return null;

  const segments = cleaned.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length < 2) return null;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].trim();
    if (!COLLECTION_CONTAINER_REGEX.test(seg)) continue;

    const candidateFolder = segments[i + 1]?.trim();
    if (!candidateFolder) continue;

    // Ignore generic media type buckets right beneath a container if someone nested Collections/Movies/Foo
    if (
      /^(movies?|films?|series|tv[\s_-]?shows?|shows?|music|albums?|audio|soundtracks?|extras?|specials?|bonus)$/i.test(
        candidateFolder
      ) &&
      segments[i + 2] &&
      !FILE_EXTENSION_REGEX.test(segments[i + 2])
    ) {
      const deeper = segments[i + 2].trim();
      const hasLeadingSlash = cleaned.startsWith('/');
      const rootSegments = segments.slice(0, i + 3);
      return {
        name: deeper,
        matchedRootPath: (hasLeadingSlash ? '/' : '') + rootSegments.join('/'),
        matchedRootSegment: seg,
      };
    }

    // Only skip if candidateFolder is clearly a standalone file right inside Franchises/foo.mkv
    if (i + 1 === segments.length - 1 && FILE_EXTENSION_REGEX.test(candidateFolder)) {
      return null;
    }

    const hasLeadingSlash = cleaned.startsWith('/');
    const rootSegments = segments.slice(0, i + 2);

    return {
      name: candidateFolder,
      matchedRootPath: (hasLeadingSlash ? '/' : '') + rootSegments.join('/'),
      matchedRootSegment: seg,
    };
  }

  return null;
}

/**
 * Collects all path hints on a MediaMetadata object as well as any linked SambaShareNode paths.
 */
export function getMediaCandidatePaths(
  media: MediaMetadata,
  sambaNodePathIndex?: Map<string, string[]>
): string[] {
  const paths: string[] = [];

  if (media.folderPath) paths.push(media.folderPath);
  if (media.path) paths.push(media.path);
  if (media.recommendedFolderStructure) paths.push(media.recommendedFolderStructure);
  if (media.matchedFilename) paths.push(media.matchedFilename);
  if (media.playbackUrl) paths.push(media.playbackUrl);

  if (Array.isArray(media.seasons)) {
    for (const season of media.seasons) {
      if (!Array.isArray(season.episodes)) continue;
      for (const ep of season.episodes) {
        if (ep.filePath) paths.push(ep.filePath);
        if (ep.playbackUrl) paths.push(ep.playbackUrl);
        if (ep.filename) paths.push(ep.filename);
      }
    }
  }

  if (Array.isArray(media.tracks)) {
    for (const track of media.tracks) {
      if (track.playbackUrl) paths.push(track.playbackUrl);
    }
  }

  if (sambaNodePathIndex) {
    const byId = sambaNodePathIndex.get(`id:${media.id}`);
    if (byId) paths.push(...byId);
    const byTitle = sambaNodePathIndex.get(`title:${(media.title || '').trim().toLowerCase()}`);
    if (byTitle) paths.push(...byTitle);
  }

  return paths;
}

/**
 * Indexes sambaTree nodes to quickly look up real share paths for MediaMetadata items.
 */
export function buildSambaPathIndex(nodes?: SambaShareNode[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (!Array.isArray(nodes) || nodes.length === 0) return index;

  const pushPath = (key: string, p?: string) => {
    if (!p) return;
    const arr = index.get(key) || [];
    if (!arr.includes(p)) arr.push(p);
    index.set(key, arr);
  };

  const traverse = (list: SambaShareNode[]) => {
    for (const node of list) {
      if (node.matchedMedia) {
        pushPath(`id:${node.matchedMedia.id}`, node.path);
        if (node.matchedMedia.title) {
          pushPath(`title:${node.matchedMedia.title.trim().toLowerCase()}`, node.path);
        }
      }
      if (node.name && node.path) {
        pushPath(`title:${node.name.trim().toLowerCase()}`, node.path);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        traverse(node.children);
      }
    }
  };

  traverse(nodes);
  return index;
}

function getCollectionAliases(normalizedName: string): string[] {
  if (normalizedName === 'mcu' || normalizedName === 'marvel cinematic universe' || normalizedName === 'marvel') {
    return ['mcu', 'marvel cinematic universe', 'marvel'];
  }
  if (normalizedName === 'star wars' || normalizedName === 'star wars saga') {
    return ['star wars', 'star wars saga'];
  }
  if (normalizedName === 'bsg' || normalizedName === 'battlestar galactica') {
    return ['bsg', 'battlestar galactica'];
  }
  return [normalizedName];
}

function detectKnownFranchiseForItem(media: MediaMetadata): {
  key: string;
  name: string;
  overview: string;
} | null {
  const titleLower = (media.title || '').toLowerCase();
  const folderHint = `${media.folderPath || ''} ${media.path || ''} ${media.recommendedFolderStructure || ''}`.toLowerCase();
  const rootKey = extractFranchiseRoot(media.title || '');

  // Explicit MCU movie/series/soundtrack pattern recognition
  if (
    /\b(iron man|avengers|captain america|thor|guardians of the galaxy|spider-man|doctor strange|black panther|wandavision|loki|hawkeye|moon knight|ant-man|eternals|shang-chi|mcu|marvel)\b/i.test(
      `${titleLower} ${folderHint}`
    )
  ) {
    return {
      key: 'mcu',
      name: 'MCU',
      overview: KNOWN_FRANCHISES_MAP['marvel'].overview,
    };
  }

  if (/\b(star wars|mandalorian|andor|obi-wan|ahsoka|boba fett|clone wars|rogue one|empire strikes back|jedi)\b/i.test(`${titleLower} ${folderHint}`)) {
    return {
      key: 'star wars',
      name: 'Star Wars',
      overview: KNOWN_FRANCHISES_MAP['star wars'].overview,
    };
  }

  for (const k of Object.keys(KNOWN_FRANCHISES_MAP)) {
    if (rootKey.includes(k) || titleLower.includes(k) || folderHint.includes(k)) {
      const info = KNOWN_FRANCHISES_MAP[k];
      return {
        key: normalizeCollectionKey(info.franchiseName),
        name: info.franchiseName,
        overview: info.overview,
      };
    }
  }

  return null;
}

/**
 * Unifies Movies, TV Series, and Music into shared Collections & Universes:
 * 1. Explicit custom collections saved by the user (with itemIds & excludedItemIds).
 * 2. Default parent-folder collections (Franchises/$parentfolder/ or collections/$parentfolder/).
 * 3. Known franchise matches when no explicit parent folder was given.
 */
export function buildUnifiedCollections(
  mediaLibrary: MediaMetadata[],
  customCollections: MediaCollection[] = [],
  sambaTree?: SambaShareNode[]
): UnifiedCollection[] {
  const safeLibrary = Array.isArray(mediaLibrary) ? mediaLibrary : [];
  const safeCustom = Array.isArray(customCollections) ? customCollections : [];
  const sambaPathIndex = buildSambaPathIndex(sambaTree);

  const mediaById = new Map<string, MediaMetadata>();
  for (const item of safeLibrary) {
    if (item?.id) mediaById.set(item.id, item);
  }

  const collectionsMap = new Map<string, UnifiedCollection>();
  const keyLookup = new Map<string, string>(); // normalized name / alias -> map key

  const registerKeyAliases = (mapKey: string, name: string) => {
    const norm = normalizeCollectionKey(name);
    if (!norm) return;
    keyLookup.set(norm, mapKey);
    for (const alias of getCollectionAliases(norm)) {
      if (!keyLookup.has(alias)) {
        keyLookup.set(alias, mapKey);
      }
    }
  };

  const resolveExistingKey = (nameOrId: string): string | undefined => {
    if (collectionsMap.has(nameOrId)) return nameOrId;
    const norm = normalizeCollectionKey(nameOrId);
    if (keyLookup.has(norm)) return keyLookup.get(norm);
    for (const alias of getCollectionAliases(norm)) {
      if (keyLookup.has(alias)) return keyLookup.get(alias);
    }
    return undefined;
  };

  const addMediaToCollection = (col: UnifiedCollection, media: MediaMetadata) => {
    if (col.excludedItemIds.includes(media.id)) return;
    if (col.items.some((existing) => existing.id === media.id)) return;

    col.items.push(media);
    if (!col.itemIds.includes(media.id)) col.itemIds.push(media.id);

    if (media.type === 'movie') col.movies.push(media);
    else if (media.type === 'series') col.series.push(media);
    else if (media.type === 'album') col.music.push(media);
    else col.movies.push(media);

    if ((!col.posterUrl || col.posterUrl === COLLECTION_FALLBACK_POSTER) && media.posterUrl) {
      col.posterUrl = media.posterUrl;
    }
    if (!col.fanartUrl && media.fanartUrl) {
      col.fanartUrl = media.fanartUrl;
    }
  };

  // Step 1: Seed from explicit user-saved custom / persisted collections first
  for (const custom of safeCustom) {
    if (!custom || !custom.name?.trim()) continue;
    const mapKey = custom.id || `col-${normalizeCollectionKey(custom.name).replace(/\s+/g, '-')}`;
    const excluded = Array.isArray(custom.excludedItemIds) ? [...custom.excludedItemIds] : [];
    const entry: UnifiedCollection = {
      id: mapKey,
      name: custom.name.trim(),
      description: custom.description || `Curated ${custom.name.trim()} collection across movies, series, and music.`,
      overview: custom.description || `Curated ${custom.name.trim()} collection across movies, series, and music.`,
      posterUrl: custom.posterUrl || COLLECTION_FALLBACK_POSTER,
      fanartUrl: custom.fanartUrl,
      source: custom.source === 'folder' ? 'folder' : 'custom',
      folderPath: custom.folderPath,
      customCollectionId: custom.id,
      itemIds: Array.isArray(custom.itemIds) ? [...custom.itemIds] : [],
      excludedItemIds: excluded,
      movies: [],
      series: [],
      music: [],
      items: [],
      createdAt: custom.createdAt || new Date().toISOString(),
      updatedAt: custom.updatedAt,
    };

    for (const id of entry.itemIds) {
      const m = mediaById.get(id);
      if (m) addMediaToCollection(entry, m);
    }

    collectionsMap.set(mapKey, entry);
    registerKeyAliases(mapKey, entry.name);
  }

  // Step 2: Inspect every media item for default parent-folder grouping (Franchises/$parentfolder/ or collections/$parentfolder/)
  // and explicit media.collectionNames
  for (const media of safeLibrary) {
    const candidatePaths = getMediaCandidatePaths(media, sambaPathIndex);
    let matchedFolder: { name: string; matchedRootPath: string; matchedRootSegment: string } | null = null;

    for (const p of candidatePaths) {
      const extracted = extractCollectionFromPath(p);
      if (extracted) {
        matchedFolder = extracted;
        break;
      }
    }

    if (matchedFolder) {
      const existingKey = resolveExistingKey(matchedFolder.name);
      if (existingKey && collectionsMap.has(existingKey)) {
        const col = collectionsMap.get(existingKey)!;
        if (col.source === 'custom') col.source = 'hybrid';
        if (!col.folderPath) col.folderPath = matchedFolder.matchedRootPath;
        addMediaToCollection(col, media);
      } else {
        const slug = normalizeCollectionKey(matchedFolder.name).replace(/[^a-z0-9]+/g, '-') || 'collection';
        const mapKey = `folder-${slug}`;
        const entry: UnifiedCollection = {
          id: mapKey,
          name: matchedFolder.name,
          description: `Grouped automatically from ${matchedFolder.matchedRootSegment}/${matchedFolder.name}/`,
          overview: `Auto-grouped collection from folder path ${matchedFolder.matchedRootPath}`,
          posterUrl: media.posterUrl || COLLECTION_FALLBACK_POSTER,
          fanartUrl: media.fanartUrl,
          source: 'folder',
          folderPath: matchedFolder.matchedRootPath,
          itemIds: [],
          excludedItemIds: [],
          movies: [],
          series: [],
          music: [],
          items: [],
          createdAt: new Date().toISOString(),
        };
        addMediaToCollection(entry, media);
        collectionsMap.set(mapKey, entry);
        registerKeyAliases(mapKey, entry.name);
      }
      continue;
    }

    // Explicit collectionNames tag on media item
    if (Array.isArray(media.collectionNames) && media.collectionNames.length > 0) {
      for (const colName of media.collectionNames) {
        if (!colName?.trim()) continue;
        const existingKey = resolveExistingKey(colName);
        if (existingKey && collectionsMap.has(existingKey)) {
          addMediaToCollection(collectionsMap.get(existingKey)!, media);
        } else {
          const slug = normalizeCollectionKey(colName).replace(/[^a-z0-9]+/g, '-') || 'custom';
          const mapKey = `custom-${slug}`;
          const entry: UnifiedCollection = {
            id: mapKey,
            name: colName.trim(),
            description: `Unified collection for ${colName.trim()}.`,
            overview: `Unified collection for ${colName.trim()}.`,
            posterUrl: media.posterUrl || COLLECTION_FALLBACK_POSTER,
            fanartUrl: media.fanartUrl,
            source: 'custom',
            itemIds: [],
            excludedItemIds: [],
            movies: [],
            series: [],
            music: [],
            items: [],
            createdAt: new Date().toISOString(),
          };
          addMediaToCollection(entry, media);
          collectionsMap.set(mapKey, entry);
          registerKeyAliases(mapKey, entry.name);
        }
      }
      continue;
    }

    // Step 3: Auto-join into matching existing folder/custom collection OR known franchise if recognized
    const knownFranchise = detectKnownFranchiseForItem(media);
    if (knownFranchise) {
      const existingKey = resolveExistingKey(knownFranchise.name) || resolveExistingKey(knownFranchise.key);
      if (existingKey && collectionsMap.has(existingKey)) {
        addMediaToCollection(collectionsMap.get(existingKey)!, media);
      } else {
        const slug = normalizeCollectionKey(knownFranchise.name).replace(/[^a-z0-9]+/g, '-');
        const mapKey = `franchise-${slug}`;
        const entry: UnifiedCollection = {
          id: mapKey,
          name: knownFranchise.name,
          description: knownFranchise.overview,
          overview: knownFranchise.overview,
          posterUrl: media.posterUrl || COLLECTION_FALLBACK_POSTER,
          fanartUrl: media.fanartUrl,
          source: 'auto-franchise',
          itemIds: [],
          excludedItemIds: [],
          movies: [],
          series: [],
          music: [],
          items: [],
          createdAt: new Date().toISOString(),
        };
        addMediaToCollection(entry, media);
        collectionsMap.set(mapKey, entry);
        registerKeyAliases(mapKey, entry.name);
      }
    }
  }

  // Also scan sambaTree folders inside Franchises/ or Collections/ even if no MediaMetadata item is linked yet
  if (Array.isArray(sambaTree) && sambaTree.length > 0) {
    const scanNodes = (nodes: SambaShareNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder' && node.path) {
          const extracted = extractCollectionFromPath(`${node.path}/placeholder`);
          if (extracted && node.name && COLLECTION_CONTAINER_REGEX.test(node.name) === false) {
            // Check if node itself is directly under Franchises/ or Collections/
            const directExtracted = extractCollectionFromPath(node.path);
            if (directExtracted && directExtracted.name.toLowerCase() === node.name.toLowerCase()) {
              const existingKey = resolveExistingKey(directExtracted.name);
              if (!existingKey) {
                const slug = normalizeCollectionKey(directExtracted.name).replace(/[^a-z0-9]+/g, '-');
                const mapKey = `folder-${slug}`;
                const entry: UnifiedCollection = {
                  id: mapKey,
                  name: directExtracted.name,
                  description: `Folder collection discovered at ${directExtracted.matchedRootPath}`,
                  overview: `Folder collection discovered at ${directExtracted.matchedRootPath}`,
                  posterUrl: COLLECTION_FALLBACK_POSTER,
                  source: 'folder',
                  folderPath: directExtracted.matchedRootPath,
                  itemIds: [],
                  excludedItemIds: [],
                  movies: [],
                  series: [],
                  music: [],
                  items: [],
                  createdAt: new Date().toISOString(),
                };
                collectionsMap.set(mapKey, entry);
                registerKeyAliases(mapKey, entry.name);
              }
            }
          }
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          scanNodes(node.children);
        }
      }
    };
    scanNodes(sambaTree);
  }

  // Sort: custom & hybrid & folder collections first, then by item count desc, then alphabetical
  const rankSource = (src: UnifiedCollection['source']) => {
    if (src === 'custom' || src === 'hybrid') return 0;
    if (src === 'folder') return 1;
    return 2;
  };

  return Array.from(collectionsMap.values()).sort((a, b) => {
    const rankDiff = rankSource(a.source) - rankSource(b.source);
    if (rankDiff !== 0) return rankDiff;
    const countDiff = b.items.length - a.items.length;
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}
