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
    pattern: '(series|tv[\\s._-]?shows?|anime|dramas?|shows?|television|animation|kdramas?|cartoons?|web[\\s._-]?series|serien|staffel|saisons?|docu[\\s._-]?series)',
    priority: 1,
    confidenceScore: 0.98,
    description: 'Matches TV Series, Anime, Drama, Seasons, and episodic television folders',
  },
  {
    id: 'rule-movies',
    name: 'Movies & Cinema',
    targetType: 'movie',
    pattern: '(movies?|films?|cinema|features?|4k[\\s._-]?movies?|vod|blockbusters?|hollywood|bluray[\\s._-]?movies?)',
    priority: 2,
    confidenceScore: 0.96,
    description: 'Matches Feature films, cinema, 4K movies, and VOD directories',
  },
  {
    id: 'rule-documentaries',
    name: 'Documentaries',
    targetType: 'series',
    pattern: '(documentaries|documentary|docu[\\s._-]?series|docu|docos?)',
    priority: 3,
    confidenceScore: 0.94,
    description: 'Matches Documentary series and factual film archives',
  },
  {
    id: 'rule-music',
    name: 'Music & Audio Albums',
    targetType: 'album',
    pattern: '(music|soundtracks?|audio|flac|lossless|albums?|discography|artists?|ost|mp3s?)',
    priority: 4,
    confidenceScore: 0.96,
    description: 'Matches Music discographies, artist albums, and FLAC/MP3 collections',
  },
  {
    id: 'rule-audiobooks',
    name: 'Audiobooks & Spoken Audio',
    targetType: 'album',
    pattern: '(audio[\\s._-]?books?|audiobooks?|spoken[\\s._-]?word|podcasts?)',
    priority: 5,
    confidenceScore: 0.94,
    description: 'Matches Audiobooks, spoken word chapters, and podcasts',
  },
  {
    id: 'rule-franchises',
    name: 'Franchises & Box Sets',
    targetType: 'movie',
    pattern: '(franchises?|collections?|box[\\s._-]?sets?|sagas?|marvel|star[\\s._-]?wars|dc[\\s._-]?universe)',
    priority: 6,
    confidenceScore: 0.90,
    description: 'Matches Multi-movie franchises, sagas, and box-set collections',
  },
  {
    id: 'rule-unsorted',
    name: 'Unsorted / Staging / Downloads',
    targetType: 'movie',
    pattern: '(sort|unsorted|in[\\s._-]?flight|downloads?|incoming|temp|staging|scratch|misc)',
    priority: 99,
    confidenceScore: 0.60,
    description: 'Unsorted staging directories requiring user classification review',
  },
];

export const DEFAULT_CLASSIFIER_SETTINGS: ClassifierSettings = {
  confidenceThreshold: 0.75,
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
  threshold: number = 0.75
): {
  detectedType: MediaType;
  confidence: number;
  isConfident: boolean;
  matchedRuleName: string;
  matchedRegexPattern: string;
} {
  const trimmed = folderName.trim().toLowerCase();

  // 1. Direct inspection of folder content heuristics (Highest fidelity)
  const hasSeasonEpisodes = sampleFiles.some((f) => 
    /s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}|season[\s._-]?\d+|staffel[\s._-]?\d+|saison[\s._-]?\d+|ep[\s._-]?\d+|episode[\s._-]?\d+|specials/i.test(f)
  );
  const hasAudioFiles = sampleFiles.some((f) => /\.(flac|mp3|m4a|m4b|aac|ogg|oga|opus|wav|aiff|alac|wma|ape|wv|dsf|dff|mid)$/i.test(f));
  const hasBookFiles = sampleFiles.some((f) => /\.(epub|pdf|mobi|azw|azw3|cbr|cbz|djvu|fb2)$/i.test(f));
  const hasVideoFiles = sampleFiles.some((f) => /\.(mkv|mp4|m4v|avi|mov|wmv|webm|flv|f4v|ts|m2ts|mts|vob|ogv|3gp|rm|rmvb|divx|asf|iso|img)$/i.test(f));

  // If files inside clearly have TV series markers (e.g. S01E01 or Season folders)
  if (hasSeasonEpisodes) {
    return {
      detectedType: 'series',
      confidence: 0.98,
      isConfident: true,
      matchedRuleName: 'TV Series Episodic Structure (SxxExx / Season / Episode markers)',
      matchedRegexPattern: 's\\d{1,2}e\\d{1,2}|season\\s*\\d+|\\d+x\\d+',
    };
  }

  // 2. Try sorting configured regex rules by priority
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(trimmed)) {
        let confidenceBonus = 0;

        if (rule.targetType === 'series' && hasSeasonEpisodes) {
          confidenceBonus += 0.05;
        } else if (rule.targetType === 'album' && (hasAudioFiles || hasBookFiles)) {
          confidenceBonus += 0.04;
        } else if (rule.targetType === 'movie' && hasVideoFiles && !hasSeasonEpisodes) {
          confidenceBonus += 0.03;
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

  // 3. Fallback heuristics if folder name wasn't a standard keyword
  if (hasAudioFiles) {
    return {
      detectedType: 'album',
      confidence: 0.92,
      isConfident: 0.92 >= threshold,
      matchedRuleName: 'File Heuristic: Audio / Music Files (.flac, .mp3, .m4a)',
      matchedRegexPattern: '.*\\.(flac|mp3|m4a|m4b|aac|ogg|opus|wav)',
    };
  }

  if (hasBookFiles) {
    return {
      detectedType: 'album',
      confidence: 0.90,
      isConfident: 0.90 >= threshold,
      matchedRuleName: 'File Heuristic: Books & Comics (.epub, .pdf, .cbr)',
      matchedRegexPattern: '.*\\.(epub|pdf|mobi|cbr|cbz)',
    };
  }

  if (hasVideoFiles) {
    return {
      detectedType: 'movie',
      confidence: 0.88,
      isConfident: 0.88 >= threshold,
      matchedRuleName: 'File Heuristic: Video / Film Files (.mkv, .mp4, .iso)',
      matchedRegexPattern: '.*\\.(mkv|mp4|avi|mov|iso)',
    };
  }

  return {
    detectedType: 'movie',
    confidence: 0.70,
    isConfident: 0.70 >= threshold,
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
