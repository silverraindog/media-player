import { MediaMetadata, MediaVersionBranch } from '../types';

export interface DuplicateGroupSummary {
  groupId: string;
  franchiseOrRoot: string;
  itemCount: number;
  titles: string[];
  branches: string[];
}

/**
 * Normalizes title strings by removing common release tags, resolution flags,
 * years, and non-alphanumeric noise to uncover the underlying core title or franchise.
 */
export function normalizeTitleForGrouping(title: string): string {
  if (!title) return '';

  let normalized = title.toLowerCase();

  // Strip file extensions if present
  normalized = normalized.replace(/\.(mkv|mp4|avi|mov|wmv|iso|flac|mp3|m4a|epub|pdf)$/i, '');

  // Strip resolution, audio, and codec tags
  normalized = normalized.replace(
    /\[?(1080p|2160p|720p|480p|4k|uhd|hdr|hdr10\+?|dv|dolby\s*vision|remux|bluray|bdrip|web-?dl|webrip|dvdrip|x264|x265|hevc|aac|dts|dts-hd|atmos|flac|mp3)\]?/gi,
    ' '
  );

  // Strip edition tags
  normalized = normalized.replace(
    /\b(directors?\s*cut|extended(\s*edition)?|unrated|theatrical(\s*cut)?|imax(\s*edition)?|remastered|special\s*edition)\b/gi,
    ' '
  );

  // Strip years in parentheses or brackets e.g. (2010) or [2024]
  normalized = normalized.replace(/[\(\[]?(19\d\d|20\d\d)[\)\]]?/g, ' ');

  // Strip season and episode markers e.g. S01E01, Season 1
  normalized = normalized.replace(/\b(s\d{1,2}e\d{1,2}|season\s*\d{1,2}|staffel\s*\d{1,2})\b/gi, ' ');

  // Remove punctuation and excess whitespace
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Extracts a franchise root key for related series and spin-offs.
 * e.g., "The Walking Dead", "Fear the Walking Dead", "The Walking Dead: Dead City" all map to "walking-dead".
 */
export function extractFranchiseRoot(title: string): string {
  const norm = normalizeTitleForGrouping(title);

  // Franchise stem patterns
  const franchisePatterns: { regex: RegExp; rootKey: string }[] = [
    { regex: /walking\s*dead/i, rootKey: 'walking-dead' },
    { regex: /breaking\s*bad|better\s*call\s*saul|el\s*camino/i, rootKey: 'breaking-bad-universe' },
    { regex: /game\s*of\s*thrones|house\s*of\s*the\s*dragon/i, rootKey: 'game-of-thrones-universe' },
    { regex: /star\s*wars|mandalorian|andor|ahsoka/i, rootKey: 'star-wars-universe' },
    { regex: /marvel|avengers|iron\s*man|captain\s*america|thor|loki/i, rootKey: 'marvel-cinematic-universe' },
    { regex: /star\s*trek/i, rootKey: 'star-trek' },
    { regex: /lord\s*of\s*the\s*rings|rings\s*of\s*power|hobbit/i, rootKey: 'middle-earth' },
    { regex: /dune/i, rootKey: 'dune' },
    { regex: /avatar/i, rootKey: 'avatar' },
    { regex: /blade\s*runner/i, rootKey: 'blade-runner' },
    { regex: /batman|dark\s*knight|joker/i, rootKey: 'batman-universe' },
  ];

  for (const item of franchisePatterns) {
    if (item.regex.test(norm)) {
      return item.rootKey;
    }
  }

  // If no predefined franchise, use the normalized title directly
  return norm;
}

/**
 * Determine a user-friendly branch label for a media item relative to its franchise or duplicate group.
 */
function deriveBranchLabel(item: MediaMetadata, franchiseRoot: string): string {
  const lowerTitle = item.title.toLowerCase();

  // Known franchise branch labelers
  if (franchiseRoot === 'walking-dead') {
    if (lowerTitle.includes('fear the walking dead')) {
      return `Spin-Off: Fear the Walking Dead (${item.year || 2015})`;
    }
    if (lowerTitle.includes('dead city')) {
      return `Spin-Off: The Walking Dead: Dead City (${item.year || 2023})`;
    }
    if (lowerTitle.includes('daryl dixon')) {
      return `Spin-Off: The Walking Dead: Daryl Dixon (${item.year || 2023})`;
    }
    if (lowerTitle.includes('the ones who live')) {
      return `Spin-Off: The Ones Who Live (${item.year || 2024})`;
    }
    return `Original Series: The Walking Dead (${item.year || 2010})`;
  }

  if (franchiseRoot === 'breaking-bad-universe') {
    if (lowerTitle.includes('better call saul')) {
      return `Prequel Series: Better Call Saul (${item.year || 2015})`;
    }
    if (lowerTitle.includes('el camino')) {
      return `Sequel Movie: El Camino (${item.year || 2019})`;
    }
    return `Flagship Series: Breaking Bad (${item.year || 2008})`;
  }

  if (franchiseRoot === 'game-of-thrones-universe') {
    if (lowerTitle.includes('house of the dragon')) {
      return `Prequel Series: House of the Dragon (${item.year || 2022})`;
    }
    return `Original Series: Game of Thrones (${item.year || 2011})`;
  }

  // Check for quality or edition indicators in recommendedFolderStructure or filenames
  const rawHints = [
    item.recommendedFolderStructure || '',
    ...(item.recommendedFilenames || []),
    item.matchedFilename || '',
  ].join(' ');

  if (/2160p|4k|hdr|remux/i.test(rawHints)) {
    return `${item.title} (4K HDR Remux / ${item.year})`;
  }
  if (/1080p/i.test(rawHints)) {
    return `${item.title} (1080p Standard / ${item.year})`;
  }
  if (/directors?\s*cut|extended/i.test(rawHints)) {
    return `${item.title} (Extended Director's Cut / ${item.year})`;
  }

  // Default branch label
  return `${item.title} (${item.year || 'Unknown'})`;
}

/**
 * Samba Sync Duplicate & Multi-Version Detection Algorithm:
 * Scans all media items, groups related franchise branches and multi-version files
 * (such as "The Walking Dead" and "Fear the Walking Dead"), and injects the
 * versions array so the Multi-Version Selector can seamlessly switch branches.
 */
export function detectDuplicatesAndVersionBranches(
  items: MediaMetadata[],
  discoveredPaths?: string[]
): {
  enrichedItems: MediaMetadata[];
  duplicateCount: number;
  detectedGroups: DuplicateGroupSummary[];
} {
  if (!items || items.length === 0) {
    return { enrichedItems: [], duplicateCount: 0, detectedGroups: [] };
  }

  // 1. Group items by franchise root or normalized stem
  const groups = new Map<string, MediaMetadata[]>();

  for (const item of items) {
    const rootKey = extractFranchiseRoot(item.title);
    if (!groups.has(rootKey)) {
      groups.set(rootKey, []);
    }
    groups.get(rootKey)!.push(item);
  }

  // Also check discoveredPaths for multiple versions that might share a stem
  if (discoveredPaths && discoveredPaths.length > 0) {
    // Paths can confirm multiple branches in storage
  }

  let totalDuplicateItems = 0;
  const detectedGroups: DuplicateGroupSummary[] = [];

  // 2. Process groups: if a group has > 1 item, it's a multi-version / franchise branch cluster
  const enrichedMap = new Map<string, MediaMetadata>();

  for (const [rootKey, groupItems] of groups.entries()) {
    if (groupItems.length > 1) {
      totalDuplicateItems += groupItems.length;

      // Build branch descriptors
      const branches: MediaVersionBranch[] = groupItems.map((git) => {
        const branchLabel = deriveBranchLabel(git, rootKey);
        return {
          id: git.id,
          title: git.title,
          branchName: branchLabel,
          year: git.year,
          seasonsCount: git.seasons ? git.seasons.length : undefined,
          rating: git.rating,
          posterUrl: git.posterUrl,
          overview: git.overview,
          folderPath: git.recommendedFolderStructure,
          media: git,
        };
      });

      detectedGroups.push({
        groupId: rootKey,
        franchiseOrRoot: rootKey,
        itemCount: groupItems.length,
        titles: groupItems.map((g) => g.title),
        branches: branches.map((b) => b.branchName),
      });

      // Enrich each item in the group with the complete versions list
      for (const git of groupItems) {
        enrichedMap.set(git.id, {
          ...git,
          versions: branches,
          selectedVersionId: git.id,
          isMultiVersion: true,
        });
      }
    } else {
      // Single version item
      enrichedMap.set(groupItems[0].id, groupItems[0]);
    }
  }

  // Return all items in original order
  const enrichedItems = items.map((orig) => enrichedMap.get(orig.id) || orig);

  return {
    enrichedItems,
    duplicateCount: totalDuplicateItems,
    detectedGroups,
  };
}
