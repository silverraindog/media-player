import { MediaMetadata, MediaType, SambaShareNode, SeasonMetadata } from '../types';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';
import { resolveMediaWithFallback } from './clientMediaResolver';

export interface SmartSearchSuggestion {
  id: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type: MediaType;
  confidence: number; // 0 - 100
  source: 'TVMaze' | 'TMDB' | 'iTunes' | 'Encyclopedic Vault' | 'Alias Match';
  overview?: string;
  posterUrl?: string;
  genres?: string[];
  rating?: number;
  matchedAlias?: string;
  preloadedMetadata?: MediaMetadata;
}

export interface IndexerTelemetry {
  status: 'idle' | 'indexing' | 'ready';
  totalIndexedItems: number;
  totalAliases: number;
  lastIndexedAt: number;
  lastQueryTimeMs: number;
  activeSources: string[];
}

// Common industry alias and abbreviation mappings
const COMMON_ALIASES: Record<string, { canonical: string; year?: number; type: MediaType }> = {
  '24': { canonical: '24', year: 2001, type: 'series' },
  'twenty four': { canonical: '24', year: 2001, type: 'series' },
  'jack bauer': { canonical: '24', year: 2001, type: 'series' },
  '24 lad': { canonical: '24: Live Another Day', year: 2014, type: 'series' },
  '24 live another day': { canonical: '24: Live Another Day', year: 2014, type: 'series' },
  '24 legacy': { canonical: '24: Legacy', year: 2017, type: 'series' },
  'bsg': { canonical: 'Battlestar Galactica', year: 2004, type: 'series' },
  'battlestar': { canonical: 'Battlestar Galactica', year: 2004, type: 'series' },
  'battlestar galactica 2004': { canonical: 'Battlestar Galactica', year: 2004, type: 'series' },
  'battlestar galactica 1978': { canonical: 'Battlestar Galactica (1978)', year: 1978, type: 'series' },
  'caprica': { canonical: 'Caprica', year: 2010, type: 'series' },
  'got': { canonical: 'Game of Thrones', year: 2011, type: 'series' },
  'game of thrones': { canonical: 'Game of Thrones', year: 2011, type: 'series' },
  'hotd': { canonical: 'House of the Dragon', year: 2022, type: 'series' },
  'house of the dragon': { canonical: 'House of the Dragon', year: 2022, type: 'series' },
  'bb': { canonical: 'Breaking Bad', year: 2008, type: 'series' },
  'breaking bad': { canonical: 'Breaking Bad', year: 2008, type: 'series' },
  'bcs': { canonical: 'Better Call Saul', year: 2015, type: 'series' },
  'better call saul': { canonical: 'Better Call Saul', year: 2015, type: 'series' },
  'twd': { canonical: 'The Walking Dead', year: 2010, type: 'series' },
  'the walking dead': { canonical: 'The Walking Dead', year: 2010, type: 'series' },
  'ftwd': { canonical: 'Fear the Walking Dead', year: 2015, type: 'series' },
  'lotr': { canonical: 'The Lord of the Rings', year: 2001, type: 'movie' },
  'lord of the rings': { canonical: 'The Lord of the Rings', year: 2001, type: 'movie' },
  'sw': { canonical: 'Star Wars', year: 1977, type: 'movie' },
  'star wars': { canonical: 'Star Wars', year: 1977, type: 'movie' },
  'mando': { canonical: 'The Mandalorian', year: 2019, type: 'series' },
  'the mandalorian': { canonical: 'The Mandalorian', year: 2019, type: 'series' },
  'andor': { canonical: 'Andor', year: 2022, type: 'series' },
  'st': { canonical: 'Star Trek', year: 1966, type: 'series' },
  'st tng': { canonical: 'Star Trek: The Next Generation', year: 1987, type: 'series' },
  'tng': { canonical: 'Star Trek: The Next Generation', year: 1987, type: 'series' },
  'ds9': { canonical: 'Star Trek: Deep Space Nine', year: 1993, type: 'series' },
  'snw': { canonical: 'Star Trek: Strange New Worlds', year: 2022, type: 'series' },
  'interstellar': { canonical: 'Interstellar', year: 2014, type: 'movie' },
  'dune': { canonical: 'Dune', year: 2021, type: 'movie' },
  'dune 2': { canonical: 'Dune - Part Two', year: 2024, type: 'movie' },
  'dune part two': { canonical: 'Dune - Part Two', year: 2024, type: 'movie' },
  'avatar': { canonical: 'Avatar', year: 2009, type: 'movie' },
  'avatar 2': { canonical: 'Avatar: The Way of Water', year: 2022, type: 'movie' },
  'avatar the way of water': { canonical: 'Avatar: The Way of Water', year: 2022, type: 'movie' },
  'severance': { canonical: 'Severance', year: 2022, type: 'series' },
  'stranger things': { canonical: 'Stranger Things', year: 2016, type: 'series' },
  'the wire': { canonical: 'The Wire', year: 2002, type: 'series' },
  'the sopranos': { canonical: 'The Sopranos', year: 1999, type: 'series' },
  'sopranos': { canonical: 'The Sopranos', year: 1999, type: 'series' },
};

/**
 * Normalizes release names, scene tags, and punctuation for robust indexing
 */
export function normalizeMediaSearchQuery(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim();
  // Strip resolution tags, audio formats, codec tags, rip sources
  clean = clean.replace(/\[\s*(?:2160p|1080p|720p|480p|4k|uhd|hdr|dvd|bluray|remux)[^\]]*\]/gi, ' ');
  clean = clean.replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|hdr10\+?|hdr|dvdrip|bluray|web-?dl|remux|x264|x265|hevc|aac|dts|ddp5\.1|atmos)\b/gi, ' ');
  clean = clean.replace(/\b(?:season|staffel|saison|series|s)\s*\d+/gi, ' ');
  clean = clean.replace(/\b(?:e|ep|episode)\s*\d+/gi, ' ');
  clean = clean.replace(/\b(?:proper|repack|internal|unrated|extended|directors\.cut|remastered)\b/gi, ' ');
  // Replace dots, underscores, dashes with space
  clean = clean.replace(/[\._\-+]/g, ' ');
  // Clean whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

/**
 * Levenshtein distance calculation for fuzzy search scoring
 */
function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1.toLowerCase() : s2.toLowerCase();
  const shorter = s1.length > s2.length ? s2.toLowerCase() : s1.toLowerCase();
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  if (longer.includes(shorter)) {
    return Math.min(1.0, 0.7 + (shorter.length / longerLength) * 0.3);
  }

  const costs = new Array();
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  const editDistance = costs[shorter.length];
  return (longerLength - editDistance) / longerLength;
}

/**
 * Global Search & Discovery Indexer Engine
 */
class GlobalSearchIndexerService {
  private indexedItemsMap = new Map<string, MediaMetadata>();
  private aliasLookupMap = new Map<string, string>();
  private telemetry: IndexerTelemetry = {
    status: 'idle',
    totalIndexedItems: 0,
    totalAliases: Object.keys(COMMON_ALIASES).length,
    lastIndexedAt: Date.now(),
    lastQueryTimeMs: 0,
    activeSources: ['TVMaze API', 'TMDB Fallback', 'Encyclopedic Knowledge Vault', 'Samba Network Share'],
  };

  private listeners: Set<() => void> = new Set();
  private backgroundTaskTimer: any = null;

  constructor() {
    this.initAliases();
    // Kick off initial indexing pass in the background
    this.scheduleBackgroundIndexing(CURATED_MEDIA_DATABASE, []);
  }

  private initAliases() {
    for (const [alias, data] of Object.entries(COMMON_ALIASES)) {
      this.aliasLookupMap.set(alias.toLowerCase(), data.canonical.toLowerCase());
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getTelemetry(): IndexerTelemetry {
    return { ...this.telemetry };
  }

  /**
   * Schedules background asynchronous indexing without blocking the UI thread
   */
  public scheduleBackgroundIndexing(mediaLibrary: MediaMetadata[], sambaTree: SambaShareNode[]) {
    if (this.backgroundTaskTimer) clearTimeout(this.backgroundTaskTimer);

    this.telemetry.status = 'indexing';
    this.notify();

    this.backgroundTaskTimer = setTimeout(() => {
      this.runIndexingPass(mediaLibrary, sambaTree);
    }, 150);
  }

  private runIndexingPass(mediaLibrary: MediaMetadata[], sambaTree: SambaShareNode[]) {
    const startTime = performance.now();

    // 1. Index media library
    for (const item of mediaLibrary) {
      this.indexedItemsMap.set(item.title.toLowerCase(), item);
      if (item.originalTitle) {
        this.indexedItemsMap.set(item.originalTitle.toLowerCase(), item);
      }
    }

    // 2. Index curated database
    for (const item of CURATED_MEDIA_DATABASE) {
      if (!this.indexedItemsMap.has(item.title.toLowerCase())) {
        this.indexedItemsMap.set(item.title.toLowerCase(), item);
      }
    }

    // 3. Index Samba Tree nodes
    const traverse = (nodes: SambaShareNode[]) => {
      for (const node of nodes) {
        if (node.matchedMedia) {
          this.indexedItemsMap.set(node.matchedMedia.title.toLowerCase(), node.matchedMedia);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(sambaTree);

    this.telemetry.status = 'ready';
    this.telemetry.totalIndexedItems = this.indexedItemsMap.size;
    this.telemetry.lastIndexedAt = Date.now();
    this.telemetry.lastQueryTimeMs = Math.round(performance.now() - startTime);
    this.notify();
  }

  /**
   * Smart Search with Automatic Fallback and 'Did you mean?' Suggestions
   * Runs whenever primary local search returns 0 results or when testing query resolution.
   */
  public async performSmartSearch(
    query: string,
    preferredType: MediaType | 'all' = 'all'
  ): Promise<{
    suggestions: SmartSearchSuggestion[];
    bestMatch: MediaMetadata | null;
  }> {
    const rawQuery = query.trim();
    if (!rawQuery) {
      return { suggestions: [], bestMatch: null };
    }

    const normalized = normalizeMediaSearchQuery(rawQuery).toLowerCase();
    const suggestions: SmartSearchSuggestion[] = [];

    // 1. Check Alias / Abbreviation Dictionary (e.g. '24', 'bsg', 'got', 'bb')
    const aliasCandidate = COMMON_ALIASES[normalized] || COMMON_ALIASES[rawQuery.toLowerCase()];
    if (aliasCandidate) {
      // Find or build metadata for the alias
      const resolved = await resolveMediaWithFallback(aliasCandidate.canonical, aliasCandidate.type, aliasCandidate.year);
      suggestions.push({
        id: `suggestion-alias-${aliasCandidate.canonical.toLowerCase()}`,
        title: aliasCandidate.canonical,
        year: aliasCandidate.year,
        type: aliasCandidate.type,
        confidence: 98,
        source: 'Alias Match',
        overview: resolved.overview,
        posterUrl: resolved.posterUrl,
        genres: resolved.genres,
        rating: resolved.rating,
        matchedAlias: rawQuery,
        preloadedMetadata: resolved,
      });
    }

    // 2. Check Local / Curated Index with fuzzy scoring
    for (const [key, media] of this.indexedItemsMap.entries()) {
      const sim = calculateSimilarity(normalized, key);
      if (sim > 0.55 && !suggestions.some((s) => s.title.toLowerCase() === media.title.toLowerCase())) {
        suggestions.push({
          id: `suggestion-local-${media.id}`,
          title: media.title,
          originalTitle: media.originalTitle,
          year: media.year,
          type: media.type,
          confidence: Math.round(sim * 100),
          source: 'Encyclopedic Vault',
          overview: media.overview,
          posterUrl: media.posterUrl,
          genres: media.genres,
          rating: media.rating,
          preloadedMetadata: media,
        });
      }
    }

    // 3. Query External TVMaze API for TV Shows
    if (preferredType === 'series' || preferredType === 'all') {
      try {
        const tvmazeRes = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(normalized || rawQuery)}`);
        if (tvmazeRes.ok) {
          const shows = await tvmazeRes.json();
          if (Array.isArray(shows)) {
            for (const item of shows.slice(0, 4)) {
              const show = item.show;
              if (!show || !show.name) continue;
              const titleLower = show.name.toLowerCase();
              if (suggestions.some((s) => s.title.toLowerCase() === titleLower)) continue;

              const year = show.premiered ? parseInt(show.premiered.substring(0, 4), 10) : undefined;
              const sim = calculateSimilarity(normalized || rawQuery.toLowerCase(), titleLower);

              const metadata: MediaMetadata = {
                id: `tvmaze-smart-${show.id}`,
                title: show.name,
                originalTitle: show.name,
                type: 'series',
                year: year || 2024,
                premiered: show.premiered || `${year || 2024}-01-01`,
                genres: show.genres && show.genres.length > 0 ? show.genres : ['Drama'],
                overview: show.summary ? show.summary.replace(/<[^>]*>?/gm, '').trim() : `Official TV series profile for ${show.name}`,
                rating: show.rating?.average || 8.2,
                posterUrl: show.image?.original || show.image?.medium || 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80',
                fanartUrl: show.image?.original || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
                recommendedFolderStructure: `series/${show.name} (${year || 2024})/`,
                recommendedFilenames: [`${show.name} - S01E01.mkv`, 'tvshow.nfo', 'poster.jpg'],
                source: 'tvmaze-direct',
              };

              suggestions.push({
                id: `suggestion-tvmaze-${show.id}`,
                title: show.name,
                year,
                type: 'series',
                confidence: Math.max(75, Math.round(sim * 100)),
                source: 'TVMaze',
                overview: metadata.overview,
                posterUrl: metadata.posterUrl,
                genres: metadata.genres,
                rating: metadata.rating,
                preloadedMetadata: metadata,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[GlobalSearchIndexer] TVMaze query non-fatal failure:', err);
      }
    }

    // 4. Fallback to Encyclopedic Resolver if still empty
    if (suggestions.length === 0) {
      const encyclopedic = await resolveMediaWithFallback(rawQuery, preferredType);
      if (encyclopedic && encyclopedic.title) {
        suggestions.push({
          id: `suggestion-fallback-${Date.now()}`,
          title: encyclopedic.title,
          year: encyclopedic.year,
          type: encyclopedic.type,
          confidence: 85,
          source: 'TMDB',
          overview: encyclopedic.overview,
          posterUrl: encyclopedic.posterUrl,
          genres: encyclopedic.genres,
          rating: encyclopedic.rating,
          preloadedMetadata: encyclopedic,
        });
      }
    }

    // Sort suggestions by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    const bestMatch = suggestions.length > 0 && suggestions[0].preloadedMetadata ? suggestions[0].preloadedMetadata : null;

    return {
      suggestions: suggestions.slice(0, 5),
      bestMatch,
    };
  }
}

// Global Singleton Instance
export const globalSearchIndexer = new GlobalSearchIndexerService();
