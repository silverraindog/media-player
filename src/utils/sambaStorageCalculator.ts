import { SambaShareNode } from '../types';

export type StorageMediaType = 'movies' | 'series' | 'music' | 'other';

export interface StorageEntityItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  formattedSize: string;
  fileCount: number;
  mediaType: StorageMediaType;
  isFolder: boolean;
}

export interface MediaTypeStorageStats {
  mediaType: StorageMediaType;
  label: string;
  totalBytes: number;
  formattedSize: string;
  percentage: number; // 0 to 100
  fileCount: number;
  folderCount: number;
  largestFile?: {
    name: string;
    path: string;
    sizeBytes: number;
    formattedSize: string;
  };
  topItems: StorageEntityItem[];
  averageFileSizeBytes: number;
  formattedAverageSize: string;
}

export interface SambaStorageSummary {
  totalBytes: number;
  formattedTotalSize: string;
  totalFiles: number;
  totalFolders: number;
  byType: {
    movies: MediaTypeStorageStats;
    series: MediaTypeStorageStats;
    music: MediaTypeStorageStats;
    other: MediaTypeStorageStats;
  };
  largestFileOverall?: {
    name: string;
    path: string;
    sizeBytes: number;
    formattedSize: string;
    mediaType: StorageMediaType;
  };
  timestamp: number;
}

/**
 * Parses size strings like "4.8 GB", "850 MB", "12 KB", "1.2 TB" into raw bytes.
 */
export function parseSizeToBytes(sizeStr?: string | number | null): number {
  if (typeof sizeStr === 'number') return isNaN(sizeStr) ? 0 : sizeStr;
  if (!sizeStr || typeof sizeStr !== 'string') return 0;

  const clean = sizeStr.trim();
  const match = clean.match(/^([\d.,]+)\s*([KMGT]?B|BYTES?)?$/i);
  if (!match) {
    const fallback = parseFloat(clean);
    return isNaN(fallback) ? 0 : fallback;
  }

  const value = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(value)) return 0;

  const unit = match[2] ? match[2].toUpperCase() : 'B';
  switch (unit) {
    case 'TB':
      return value * 1024 * 1024 * 1024 * 1024;
    case 'GB':
      return value * 1024 * 1024 * 1024;
    case 'MB':
      return value * 1024 * 1024;
    case 'KB':
      return value * 1024;
    case 'B':
    case 'BYTE':
    case 'BYTES':
    default:
      return value;
  }
}

/**
 * Formats raw bytes into human-readable strings (e.g. 4.80 GB, 850 MB).
 */
export function formatStorageBytes(
  bytes: number,
  decimals: number = 2,
  forcedUnit?: 'AUTO' | 'GB' | 'MB' | 'TB'
): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';

  if (forcedUnit && forcedUnit !== 'AUTO') {
    switch (forcedUnit) {
      case 'TB':
        return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(decimals)} TB`;
      case 'GB':
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
      case 'MB':
        return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
    }
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(Math.max(0, i), units.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${units[safeI]}`;
}

/**
 * Determines whether a file/folder belongs to Movies, Series, Music, or Other
 * based on explicit node tags, ancestor folder paths, and filename patterns.
 */
export function detectStorageMediaType(
  node: SambaShareNode,
  ancestorCategory?: StorageMediaType
): StorageMediaType {
  // 1. Explicit node mediaType or matchedMedia type
  const nodeType = (node.mediaType || node.matchedMedia?.type || '').toLowerCase();
  if (nodeType === 'movie' || nodeType === 'movies' || nodeType === 'film') return 'movies';
  if (nodeType === 'series' || nodeType === 'tv' || nodeType === 'tvshow') return 'series';
  if (nodeType === 'album' || nodeType === 'music' || nodeType === 'audio') return 'music';

  // 2. Path inspection
  const pathLower = (node.path || node.name || '').toLowerCase();

  if (
    pathLower.startsWith('movies/') ||
    pathLower.includes('/movies/') ||
    pathLower.startsWith('films/') ||
    pathLower.includes('/films/')
  ) {
    return 'movies';
  }

  if (
    pathLower.startsWith('series/') ||
    pathLower.includes('/series/') ||
    pathLower.startsWith('tv shows/') ||
    pathLower.includes('/tv shows/') ||
    pathLower.startsWith('anime/') ||
    pathLower.includes('/anime/') ||
    pathLower.includes('/season ') ||
    /s\d{1,2}e\d{1,2}/i.test(node.name || '')
  ) {
    return 'series';
  }

  if (
    pathLower.startsWith('music/') ||
    pathLower.includes('/music/') ||
    pathLower.startsWith('audio/') ||
    pathLower.includes('/audio/') ||
    pathLower.startsWith('albums/') ||
    pathLower.includes('/albums/') ||
    /\.(mp3|flac|wav|aac|m4a|alac|ogg|aiff)$/i.test(node.name || '')
  ) {
    return 'music';
  }

  // 3. Inherit from ancestor if already determined
  if (ancestorCategory && ancestorCategory !== 'other') {
    return ancestorCategory;
  }

  // 4. Default video files without clear path to movies
  if (/\.(mkv|mp4|avi|mov|iso|webm|ts|m4v)$/i.test(node.name || '')) {
    return 'movies';
  }

  return 'other';
}

/**
 * Traverses the Samba tree hierarchy and computes total storage size,
 * file counts, folder counts, and top storage consumers per media type.
 */
export function calculateSambaStorageMetrics(tree: SambaShareNode[]): SambaStorageSummary {
  const categoryData: Record<
    StorageMediaType,
    {
      totalBytes: number;
      files: Array<{ name: string; path: string; sizeBytes: number }>;
      entityFolders: Map<string, { name: string; path: string; sizeBytes: number; fileCount: number }>;
      largestFile?: { name: string; path: string; sizeBytes: number };
    }
  > = {
    movies: { totalBytes: 0, files: [], entityFolders: new Map() },
    series: { totalBytes: 0, files: [], entityFolders: new Map() },
    music: { totalBytes: 0, files: [], entityFolders: new Map() },
    other: { totalBytes: 0, files: [], entityFolders: new Map() },
  };

  let globalTotalFiles = 0;
  let globalTotalFolders = 0;
  let largestFileOverall: { name: string; path: string; sizeBytes: number; mediaType: StorageMediaType } | undefined;

  // Recursive traversal to collect all file sizes and assign to media types
  function walk(
    nodes: SambaShareNode[],
    currentCategory?: StorageMediaType,
    topEntityFolder?: { name: string; path: string; mediaType: StorageMediaType }
  ) {
    for (const node of nodes) {
      const detectedCategory = detectStorageMediaType(node, currentCategory);

      if (node.type === 'folder') {
        globalTotalFolders += 1;

        // Determine if this is a top-level media entity (e.g. "Interstellar (2014)" or "Breaking Bad (2008)" or "Daft Punk")
        let nextTopEntity = topEntityFolder;
        const isRootContainer = ['movies', 'series', 'music', 'franchises', 'documentaries', 'anime'].includes(
          (node.name || '').toLowerCase()
        );

        if (!nextTopEntity && !isRootContainer && !node.isFranchiseRoot && !node.isFranchiseContainer) {
          nextTopEntity = {
            name: node.name,
            path: node.path,
            mediaType: detectedCategory,
          };
          if (!categoryData[detectedCategory].entityFolders.has(node.path)) {
            categoryData[detectedCategory].entityFolders.set(node.path, {
              name: node.name,
              path: node.path,
              sizeBytes: 0,
              fileCount: 0,
            });
          }
        }

        if (node.children && node.children.length > 0) {
          walk(node.children, detectedCategory, nextTopEntity);
        } else if (node.size) {
          // Leaf folder with explicit size and no child file objects in memory
          const folderBytes = parseSizeToBytes(node.size);
          if (folderBytes > 0) {
            categoryData[detectedCategory].totalBytes += folderBytes;
            if (nextTopEntity) {
              const entry = categoryData[detectedCategory].entityFolders.get(nextTopEntity.path);
              if (entry) {
                entry.sizeBytes += folderBytes;
                entry.fileCount += 1;
              }
            }
          }
        }
      } else if (node.type === 'file') {
        globalTotalFiles += 1;
        const fileBytes = parseSizeToBytes(node.size);
        categoryData[detectedCategory].totalBytes += fileBytes;

        const fileRecord = {
          name: node.name,
          path: node.path,
          sizeBytes: fileBytes,
        };
        categoryData[detectedCategory].files.push(fileRecord);

        // Check if this is the largest file in this category
        const catLargest = categoryData[detectedCategory].largestFile;
        if (!catLargest || fileBytes > catLargest.sizeBytes) {
          categoryData[detectedCategory].largestFile = fileRecord;
        }

        // Check if this is the largest file overall
        if (!largestFileOverall || fileBytes > largestFileOverall.sizeBytes) {
          largestFileOverall = {
            ...fileRecord,
            mediaType: detectedCategory,
          };
        }

        // Update top-level media entity folder stats
        if (topEntityFolder) {
          const entry = categoryData[detectedCategory].entityFolders.get(topEntityFolder.path);
          if (entry) {
            entry.sizeBytes += fileBytes;
            entry.fileCount += 1;
          }
        }
      }
    }
  }

  walk(tree);

  const totalBytesAll =
    categoryData.movies.totalBytes +
    categoryData.series.totalBytes +
    categoryData.music.totalBytes +
    categoryData.other.totalBytes;

  const buildStats = (
    mediaType: StorageMediaType,
    label: string
  ): MediaTypeStorageStats => {
    const data = categoryData[mediaType];
    const percentage = totalBytesAll > 0 ? (data.totalBytes / totalBytesAll) * 100 : 0;
    const fileCount = data.files.length;
    const folderCount = data.entityFolders.size;
    const avgBytes = fileCount > 0 ? Math.round(data.totalBytes / fileCount) : 0;

    // Sort entity folders by storage consumption descending
    const topItems: StorageEntityItem[] = Array.from(data.entityFolders.values())
      .map((item) => ({
        id: item.path,
        name: item.name,
        path: item.path,
        sizeBytes: item.sizeBytes,
        formattedSize: formatStorageBytes(item.sizeBytes),
        fileCount: item.fileCount,
        mediaType,
        isFolder: true,
      }))
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10);

    // If no entity folders were captured, use largest individual files
    if (topItems.length === 0 && data.files.length > 0) {
      data.files
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .slice(0, 10)
        .forEach((f) => {
          topItems.push({
            id: f.path,
            name: f.name,
            path: f.path,
            sizeBytes: f.sizeBytes,
            formattedSize: formatStorageBytes(f.sizeBytes),
            fileCount: 1,
            mediaType,
            isFolder: false,
          });
        });
    }

    return {
      mediaType,
      label,
      totalBytes: data.totalBytes,
      formattedSize: formatStorageBytes(data.totalBytes),
      percentage: parseFloat(percentage.toFixed(1)),
      fileCount,
      folderCount,
      largestFile: data.largestFile
        ? {
            ...data.largestFile,
            formattedSize: formatStorageBytes(data.largestFile.sizeBytes),
          }
        : undefined,
      topItems,
      averageFileSizeBytes: avgBytes,
      formattedAverageSize: formatStorageBytes(avgBytes),
    };
  };

  return {
    totalBytes: totalBytesAll,
    formattedTotalSize: formatStorageBytes(totalBytesAll),
    totalFiles: globalTotalFiles,
    totalFolders: globalTotalFolders,
    byType: {
      movies: buildStats('movies', 'Movies & Films'),
      series: buildStats('series', 'Series & TV Shows'),
      music: buildStats('music', 'Music & Audio'),
      other: buildStats('other', 'Other Media & Assets'),
    },
    largestFileOverall: largestFileOverall
      ? {
          ...largestFileOverall,
          formattedSize: formatStorageBytes(largestFileOverall.sizeBytes),
        }
      : undefined,
    timestamp: Date.now(),
  };
}
