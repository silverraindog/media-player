import { SambaShareNode, MediaMetadata, SeasonMetadata, EpisodeMetadata } from '../types';
import { isSeasonDirectory, getFileExtension, isMediaFile } from './mediaExtractor';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';

/**
 * Interface representing a structured Franchise Collection
 */
export interface FranchiseCollection {
  id: string;
  name: string;
  path: string;
  posterUrl?: string;
  bannerUrl?: string;
  overview?: string;
  series: Array<{
    id: string;
    title: string;
    year?: number;
    path: string;
    mediaType: 'series' | 'movie';
    seasonsCount: number;
    episodesCount: number;
    hasNfo: boolean;
    hasPoster: boolean;
    matchedMedia?: MediaMetadata;
    node: SambaShareNode;
  }>;
}

/**
 * Determines if a path or folder node is inside a Franchises parent container.
 */
export function isFranchisePath(pathOrName: string): boolean {
  const normalized = pathOrName.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.startsWith('franchises') ||
    normalized.startsWith('franchise') ||
    normalized.includes('/franchises/') ||
    normalized.includes('/franchise/') ||
    normalized.startsWith('collections') ||
    normalized.includes('/collections/')
  );
}

/**
 * Canonical known franchises dictionary to automatically group and organize series
 */
export const KNOWN_FRANCHISES_MAP: Record<string, { franchiseName: string; defaultSeries: string; overview: string }> = {
  'battlestar galactica': {
    franchiseName: 'Battlestar Galactica',
    defaultSeries: 'Battlestar Galactica (2004)',
    overview: 'The complete Battlestar Galactica universe including the 2004 reimagined series, 1978 original series, and Caprica prequel.',
  },
  'bsg': {
    franchiseName: 'Battlestar Galactica',
    defaultSeries: 'Battlestar Galactica (2004)',
    overview: 'The complete Battlestar Galactica universe.',
  },
  'star wars': {
    franchiseName: 'Star Wars Saga',
    defaultSeries: 'Star Wars - The Original Trilogy',
    overview: 'The complete Star Wars galaxy spanning feature films, animated sagas, and live-action series.',
  },
  'star trek': {
    franchiseName: 'Star Trek Universe',
    defaultSeries: 'Star Trek: The Next Generation (1987)',
    overview: 'The complete Star Trek franchise spanning Starfleet voyages, movies, and spin-off series.',
  },
  'dune': {
    franchiseName: 'Dune Collection',
    defaultSeries: 'Dune (2021)',
    overview: 'Frank Herbert’s sci-fi epic franchise comprising the feature films and television series.',
  },
  'marvel': {
    franchiseName: 'Marvel Cinematic Universe',
    defaultSeries: 'The Avengers Collection',
    overview: 'The Marvel Cinematic Universe interconnected films and Disney+ television series.',
  },
  'walking dead': {
    franchiseName: 'The Walking Dead Universe',
    defaultSeries: 'The Walking Dead (2010)',
    overview: 'Robert Kirkman’s zombie apocalypse franchise including main series and spin-offs.',
  },
  'game of thrones': {
    franchiseName: 'Game of Thrones / Westeros',
    defaultSeries: 'Game of Thrones (2011)',
    overview: 'George R.R. Martin’s A Song of Ice and Fire universe, including Game of Thrones and House of the Dragon.',
  },
  '24': {
    franchiseName: '24 Franchise',
    defaultSeries: '24 (2001)',
    overview: 'The real-time Counter Terrorist Unit saga following Jack Bauer across 9 seasons and event miniseries.',
  },
};

/**
 * Transforms any flattened or unnested SambaTree nodes into a properly structured hierarchical view
 * where:
 * 1. 'Franchises' is a root parent container.
 * 2. Each franchise (e.g. 'Battlestar Galactica') contains series titles as primary child nodes.
 * 3. Each series title contains its nested seasons ('Season 01', 'Season 02', 'Specials & Extras')
 *    rather than having flat disparate folders like 'Franchises/Battlestar Galactica/Extras/4'.
 */
export function normalizeFranchiseHierarchy(nodes: SambaShareNode[]): SambaShareNode[] {
  return nodes.map((rootNode) => {
    // If not the Franchises root folder, traverse its children recursively
    if (rootNode.name.toLowerCase() !== 'franchises' && rootNode.name.toLowerCase() !== 'franchise') {
      if (rootNode.children && rootNode.children.length > 0) {
        return {
          ...rootNode,
          children: normalizeFranchiseHierarchy(rootNode.children),
        };
      }
      return rootNode;
    }

    // Process Franchises root container
    const franchiseChildren = rootNode.children || [];
    const normalizedFranchiseFolders: SambaShareNode[] = [];

    for (const franchiseFolder of franchiseChildren) {
      if (franchiseFolder.type !== 'folder') {
        normalizedFranchiseFolders.push(franchiseFolder);
        continue;
      }

      const franchiseName = franchiseFolder.name;
      const franchiseLower = franchiseName.toLowerCase();
      const rawChildren = franchiseFolder.children || [];

      // Check if this franchise folder has flat subfolders like 'Extras/4', 'Season 01', etc. directly inside it
      // without a Series title container.
      const hasDirectSeasonOrExtras = rawChildren.some(
        (c) => c.type === 'folder' && isSeasonDirectory(c.name)
      );
      const hasDirectMediaFiles = rawChildren.some(
        (c) => c.type === 'file' && isMediaFile(c.name)
      );

      // If already structured with series folders, ensure each series folder's seasons are properly consolidated
      if (!hasDirectSeasonOrExtras && !hasDirectMediaFiles) {
        // Check children to ensure none of them have fragmented extras
        const structuredSeriesNodes = rawChildren.map((seriesNode) => {
          if (seriesNode.type !== 'folder') return seriesNode;
          return consolidateSeriesSeasonsAndExtras(seriesNode, franchiseFolder.path);
        });

        normalizedFranchiseFolders.push({
          ...franchiseFolder,
          isFranchiseContainer: true,
          children: structuredSeriesNodes,
        });
        continue;
      }

      // If flat seasons/extras/files are found directly under the Franchise (e.g., 'Franchises/Battlestar Galactica/Extras/4'),
      // group them under the Primary Series title!
      const knownInfo = KNOWN_FRANCHISES_MAP[franchiseLower] || {
        franchiseName: franchiseName,
        defaultSeries: `${franchiseName} (Main Series)`,
        overview: `Complete ${franchiseName} franchise collection.`,
      };

      const primarySeriesTitle = knownInfo.defaultSeries;
      const primarySeriesPath = `${franchiseFolder.path}/${primarySeriesTitle}`;

      // Group children into organized seasons & extras
      const seasonsMap = new Map<string, SambaShareNode>();
      const directSeriesNodes: SambaShareNode[] = [];

      for (const child of rawChildren) {
        if (child.type === 'folder') {
          const childLower = child.name.toLowerCase();

          // Check if this child folder is another series (e.g. 'Caprica' or 'Battlestar Galactica (1978)')
          if (
            !isSeasonDirectory(child.name) &&
            !childLower.includes('extras') &&
            !childLower.includes('specials') &&
            !childLower.includes('season') &&
            !/^\d+$/.test(child.name)
          ) {
            directSeriesNodes.push(consolidateSeriesSeasonsAndExtras(child, franchiseFolder.path));
            continue;
          }

          // Handle Extras & numbered disc folders (like 'Extras', '4', '5', 'Bonus', 'Behind The Truth')
          if (
            childLower.includes('extras') ||
            childLower.includes('specials') ||
            childLower.includes('bonus') ||
            childLower.includes('behind the') ||
            childLower.includes('making of') ||
            /^\d+$/.test(child.name)
          ) {
            const extrasKey = 'Specials & Extras';
            if (!seasonsMap.has(extrasKey)) {
              seasonsMap.set(extrasKey, {
                id: `folder-${franchiseLower}-extras`,
                name: 'Specials & Extras',
                path: `${primarySeriesPath}/Specials & Extras`,
                type: 'folder',
                hasNfo: false,
                children: [],
              });
            }

            const extrasFolder = seasonsMap.get(extrasKey)!;
            // If child has nested children (e.g. 'Extras/4' or '4' containing discs), flatten into Specials & Extras with clear names
            if (child.children && child.children.length > 0) {
              const subItems = child.children.map((subChild) => ({
                ...subChild,
                name: subChild.name.includes(child.name)
                  ? subChild.name
                  : `Disc ${child.name} - ${subChild.name}`,
                path: `${extrasFolder.path}/${subChild.name}`,
              }));
              extrasFolder.children = [...(extrasFolder.children || []), ...subItems];
            } else {
              extrasFolder.children = [...(extrasFolder.children || []), child];
            }
            continue;
          }

          // Handle standard Season folder (e.g. 'Season 01', 'Season 1')
          const seasonMatch = child.name.match(/(?:season|s)[\s._-]?(\d+)/i);
          const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
          const seasonFormatted = `Season ${String(seasonNum).padStart(2, '0')}`;

          if (!seasonsMap.has(seasonFormatted)) {
            seasonsMap.set(seasonFormatted, {
              id: `folder-${franchiseLower}-season-${seasonNum}`,
              name: seasonFormatted,
              path: `${primarySeriesPath}/${seasonFormatted}`,
              type: 'folder',
              children: [],
            });
          }

          const targetSeason = seasonsMap.get(seasonFormatted)!;
          if (child.children && child.children.length > 0) {
            targetSeason.children = [...(targetSeason.children || []), ...child.children];
          } else {
            targetSeason.children = [...(targetSeason.children || []), child];
          }
        } else if (child.type === 'file') {
          // File directly in franchise root -> move into Season 01 or Specials
          const isExtra = child.name.toLowerCase().includes('extra') || child.name.toLowerCase().includes('special');
          const targetSeasonName = isExtra ? 'Specials & Extras' : 'Season 01';

          if (!seasonsMap.has(targetSeasonName)) {
            seasonsMap.set(targetSeasonName, {
              id: `folder-${franchiseLower}-${isExtra ? 'extras' : 'season-01'}`,
              name: targetSeasonName,
              path: `${primarySeriesPath}/${targetSeasonName}`,
              type: 'folder',
              children: [],
            });
          }
          const targetSeason = seasonsMap.get(targetSeasonName)!;
          targetSeason.children = [...(targetSeason.children || []), child];
        }
      }

      // Sort seasons sequentially (Season 01, Season 02, ..., Specials & Extras)
      const sortedSeasons = Array.from(seasonsMap.values()).sort((a, b) => {
        if (a.name.includes('Specials')) return 1;
        if (b.name.includes('Specials')) return -1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });

      // Find matching curated media if available
      const matchedMedia = CURATED_MEDIA_DATABASE.find(
        (m) =>
          m.title.toLowerCase() === franchiseLower ||
          m.title.toLowerCase().includes(franchiseLower) ||
          franchiseLower.includes(m.title.toLowerCase())
      );

      // Create Primary Series Node
      const primarySeriesNode: SambaShareNode = {
        id: `series-${franchiseLower}-primary`,
        name: primarySeriesTitle,
        path: primarySeriesPath,
        type: 'folder',
        mediaType: 'series',
        hasNfo: true,
        hasPoster: true,
        matchedMedia: matchedMedia || {
          id: `franchise-media-${franchiseLower}`,
          title: primarySeriesTitle,
          type: 'series',
          year: 2004,
          genres: ['Sci-Fi', 'Action', 'Drama'],
          overview: knownInfo.overview,
          rating: 8.7,
          posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
          recommendedFolderStructure: primarySeriesPath,
          recommendedFilenames: ['tvshow.nfo', 'poster.jpg', 'fanart.jpg'],
          source: 'curated-database',
        },
        children: sortedSeasons,
      };

      normalizedFranchiseFolders.push({
        ...franchiseFolder,
        isFranchiseContainer: true,
        children: [primarySeriesNode, ...directSeriesNodes],
      });
    }

    return {
      ...rootNode,
      isFranchiseRoot: true,
      children: normalizedFranchiseFolders,
    };
  });
}

/**
 * Consolidates season folders and nested extras under a single series folder node
 */
function consolidateSeriesSeasonsAndExtras(seriesNode: SambaShareNode, parentPath: string): SambaShareNode {
  if (!seriesNode.children || seriesNode.children.length === 0) return seriesNode;

  const seasonsMap = new Map<string, SambaShareNode>();
  const nonSeasonChildren: SambaShareNode[] = [];

  for (const child of seriesNode.children) {
    if (child.type === 'folder') {
      const childLower = child.name.toLowerCase();

      // Check if folder is an extras / specials / season container
      if (isSeasonDirectory(child.name)) {
        const isExtras = 
          childLower.includes('extras') || 
          childLower.includes('specials') || 
          childLower.includes('bonus') || 
          childLower.includes('behind the') ||
          childLower.includes('making of') ||
          /^\d+$/.test(child.name);

        const extrasKey = 'Specials & Extras';
        
        if (isExtras) {
          if (!seasonsMap.has(extrasKey)) {
            seasonsMap.set(extrasKey, {
              id: `${seriesNode.id}-specials-extras`,
              name: 'Specials & Extras',
              path: `${seriesNode.path}/Specials & Extras`,
              type: 'folder',
              children: [],
            });
          }
          const extras = seasonsMap.get(extrasKey)!;
          if (child.children && child.children.length > 0) {
            const mappedChildren = child.children.map((subChild) => ({
              ...subChild,
              name: subChild.name.includes(child.name)
                ? subChild.name
                : `${child.name} - ${subChild.name}`,
              path: `${extras.path}/${subChild.name}`,
            }));
            extras.children = [...(extras.children || []), ...mappedChildren];
          } else {
            extras.children = [...(extras.children || []), child];
          }
          continue;
        }

        // Standard season directory logic
        const seasonMatch = child.name.match(/(?:season|s)[\s._-]?(\d+)/i);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
        const seasonName = `Season ${String(seasonNum).padStart(2, '0')}`;

        if (!seasonsMap.has(seasonName)) {
          seasonsMap.set(seasonName, {
            id: `${seriesNode.id}-season-${seasonNum}`,
            name: seasonName,
            path: `${seriesNode.path}/${seasonName}`,
            type: 'folder',
            children: [],
          });
        }
        const seasonNode = seasonsMap.get(seasonName)!;
        if (child.children && child.children.length > 0) {
          seasonNode.children = [...(seasonNode.children || []), ...child.children];
        } else {
          seasonNode.children = [...(seasonNode.children || []), child];
        }
        continue;
      }

      nonSeasonChildren.push(child);
    } else {
      // Top-level files in series directory (e.g., tvshow.nfo, poster.jpg, banner.jpg)
      nonSeasonChildren.push(child);
    }
  }

  // Sort seasons
  const sortedSeasons = Array.from(seasonsMap.values()).sort((a, b) => {
    if (a.name.includes('Specials')) return 1;
    if (b.name.includes('Specials')) return -1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  return {
    ...seriesNode,
    children: [...nonSeasonChildren, ...sortedSeasons],
  };
}
