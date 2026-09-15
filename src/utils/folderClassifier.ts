import {
  MediaType,
  RegexCategoryRule,
  FolderScanClassification,
  ClassifierSettings,
} from '../types';

export const DEFAULT_REGEX_RULES: RegexCategoryRule[] = [
  {
    id: 'rule-series',
    name: 'TV Series & Shows',
    targetType: 'series',
    pattern: '^(series|tv[\\s_-]?shows?|anime|dramas?|shows?|television|animation|kdramas?|cartoons?)',
    priority: 1,
    confidenceScore: 0.96,
    description: 'Matches TV Series, Anime, Drama, and episodic television folders',
  },
  {
    id: 'rule-movies',
    name: 'Movies & Cinema',
    targetType: 'movie',
    pattern: '^(movies?|films?|cinema|features?|4k[\\s_-]?movies?|vod|blockbusters?|hollywood)',
    priority: 2,
    confidenceScore: 0.96,
    description: 'Matches Feature films, cinema, 4K movies, and VOD directories',
  },
  {
    id: 'rule-documentaries',
    name: 'Documentaries',
    targetType: 'series',
    pattern: '^(documentaries|documentary|docu[\\s_-]?series|docu|docos?)',
    priority: 3,
    confidenceScore: 0.92,
    description: 'Matches Documentary series and factual film archives',
  },
  {
    id: 'rule-music',
    name: 'Music & Audio Albums',
    targetType: 'album',
    pattern: '^(music|soundtracks?|audio|flac|lossless|albums?|discography|artists?|ost)',
    priority: 4,
    confidenceScore: 0.95,
    description: 'Matches Music discographies, artist albums, and FLAC/MP3 collections',
  },
  {
    id: 'rule-audiobooks',
    name: 'Audiobooks & Spoken Audio',
    targetType: 'album',
    pattern: '^(audio[\\s_-]?books?|audiobooks?|spoken[\\s_-]?word|podcasts?)',
    priority: 5,
    confidenceScore: 0.90,
    description: 'Matches Audiobooks, spoken word chapters, and podcasts',
  },
  {
    id: 'rule-franchises',
    name: 'Franchises & Box Sets',
    targetType: 'movie',
    pattern: '^(franchises?|collections?|box[\\s_-]?sets?|sagas?|marvel|star[\\s_-]?wars|dc[\\s_-]?universe)',
    priority: 6,
    confidenceScore: 0.88,
    description: 'Matches Multi-movie franchises, sagas, and box-set collections',
  },
  {
    id: 'rule-unsorted',
    name: 'Unsorted / Staging / Downloads',
    targetType: 'movie',
    pattern: '^(sort|unsorted|in[\\s_-]?flight|downloads?|incoming|temp|staging|scratch|misc)',
    priority: 99,
    confidenceScore: 0.55,
    description: 'Unsorted staging directories requiring user classification review',
  },
];

export const DEFAULT_CLASSIFIER_SETTINGS: ClassifierSettings = {
  confidenceThreshold: 0.85,
  autoImportConfident: true,
  alwaysPromptReview: false,
  rules: DEFAULT_REGEX_RULES,
};

/**
 * Classifies a root or subfolder name against active regex rules
 */
export function classifyFolder(
  folderName: string,
  sampleFiles: string[],
  rules: RegexCategoryRule[] = DEFAULT_REGEX_RULES,
  threshold: number = 0.85
): {
  detectedType: MediaType;
  confidence: number;
  isConfident: boolean;
  matchedRuleName: string;
  matchedRegexPattern: string;
} {
  const trimmed = folderName.trim().toLowerCase();

  // Try sorting rules by priority
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(trimmed)) {
        // Adjust confidence slightly based on sample files content
        let confidenceBonus = 0;
        const hasVideoFiles = sampleFiles.some((f) => /\.(mkv|mp4|m4v|avi|mov|wmv|webm|flv|f4v|ts|m2ts|mts|vob|ogv|3gp|rm|rmvb|divx|asf|iso|img)$/i.test(f));
        const hasAudioFiles = sampleFiles.some((f) => /\.(flac|mp3|m4a|m4b|aac|ogg|oga|opus|wav|aiff|alac|wma|ape|wv|dsf|dff|mid)$/i.test(f));
        const hasBookFiles = sampleFiles.some((f) => /\.(epub|pdf|mobi|azw|azw3|cbr|cbz|djvu|fb2)$/i.test(f));
        const hasSeasonEpisodes = sampleFiles.some((f) => /s\d{1,2}e\d{1,2}|season\s*\d/i.test(f));

        if (rule.targetType === 'series' && hasSeasonEpisodes) {
          confidenceBonus += 0.03;
        } else if (rule.targetType === 'album' && (hasAudioFiles || hasBookFiles)) {
          confidenceBonus += 0.03;
        } else if (rule.targetType === 'movie' && hasVideoFiles && !hasSeasonEpisodes) {
          confidenceBonus += 0.02;
        }

        const finalConfidence = Math.min(0.99, Number((rule.confidenceScore + confidenceBonus).toFixed(2)));
        return {
          detectedType: rule.targetType,
          confidence: finalConfidence,
          isConfident: finalConfidence >= threshold,
          matchedRuleName: rule.name,
          matchedRegexPattern: rule.pattern,
        };
      }
    } catch (err) {
      console.warn(`Invalid regex pattern in rule ${rule.name}:`, rule.pattern);
    }
  }

  // Fallback if no specific rule matched: inspect sample files
  const hasAudio = sampleFiles.some((f) => /\.(flac|mp3|m4a|m4b|aac|ogg|oga|opus|wav|aiff|alac|wma|ape|wv|dsf|dff)$/i.test(f));
  const hasBooks = sampleFiles.some((f) => /\.(epub|pdf|mobi|azw|azw3|cbr|cbz|djvu|fb2)$/i.test(f));
  const hasSeasonEp = sampleFiles.some((f) => /s\d{1,2}e\d{1,2}|season\s*\d/i.test(f));

  if (hasAudio) {
    return {
      detectedType: 'album',
      confidence: 0.78,
      isConfident: 0.78 >= threshold,
      matchedRuleName: 'File Heuristic: Audio / Music Files',
      matchedRegexPattern: '.*\\.(flac|mp3|m4a|m4b|aac|ogg|opus|wav)',
    };
  }

  if (hasBooks) {
    return {
      detectedType: 'album',
      confidence: 0.75,
      isConfident: 0.75 >= threshold,
      matchedRuleName: 'File Heuristic: Books & Comics',
      matchedRegexPattern: '.*\\.(epub|pdf|mobi|cbr|cbz)',
    };
  }

  if (hasSeasonEp) {
    return {
      detectedType: 'series',
      confidence: 0.80,
      isConfident: 0.80 >= threshold,
      matchedRuleName: 'File Heuristic: SxxExx Season Markers',
      matchedRegexPattern: 'S\\d{1,2}E\\d{1,2}',
    };
  }

  return {
    detectedType: 'movie',
    confidence: 0.60,
    isConfident: 0.60 >= threshold,
    matchedRuleName: 'Generic Fallback',
    matchedRegexPattern: '.*',
  };
}

/**
 * Groups discovered relative paths into top-level folders and classifies each group
 */
export function classifyAllDiscoveredPaths(
  relativePaths: string[],
  rules: RegexCategoryRule[] = DEFAULT_REGEX_RULES,
  threshold: number = 0.85
): FolderScanClassification[] {
  const groups = new Map<string, { relativePath: string; files: string[] }>();

  relativePaths.forEach((rawPath) => {
    const parts = rawPath.split('/').filter(Boolean);
    const topFolder = parts[0] || 'Root';
    const existing = groups.get(topFolder) || { relativePath: topFolder, files: [] };
    existing.files.push(rawPath);
    groups.set(topFolder, existing);
  });

  const results: FolderScanClassification[] = [];

  groups.forEach((data, folderName) => {
    const classification = classifyFolder(folderName, data.files, rules, threshold);
    results.push({
      id: `folder-class-${folderName.replace(/[^a-zA-Z0-9]/g, '-')}`,
      folderName,
      relativePath: data.relativePath,
      itemCount: data.files.length,
      detectedType: classification.detectedType,
      targetType: classification.detectedType,
      confidence: classification.confidence,
      isConfident: classification.isConfident,
      matchedRuleName: classification.matchedRuleName,
      matchedRegexPattern: classification.matchedRegexPattern,
      sampleFiles: data.files.slice(0, 5),
      selectedForImport: classification.isConfident, // Confident folders selected by default
    });
  });

  return results.sort((a, b) => b.confidence - a.confidence);
}
