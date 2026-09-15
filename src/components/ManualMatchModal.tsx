import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Tv,
  Film,
  Music,
  Sparkles,
  Check,
  AlertCircle,
  Folder,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  Database,
  ArrowRight,
  Wand2,
  RefreshCw,
  Image,
  Tag,
  Star,
} from 'lucide-react';
import {
  MediaMetadata,
  MediaType,
  EpisodeMetadata,
  SeasonMetadata,
} from '../types';
import {
  extractSeasonNumberFromPath,
  extractEpisodeInfoFromFilename,
  parseTitleAndYear,
  detectMediaType,
} from '../utils/mediaExtractor';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';

export interface ManualMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawPathOrName?: string;
  onSaveMatchedMedia: (media: MediaMetadata) => void;
  initialMediaType?: MediaType;
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({
  isOpen,
  onClose,
  rawPathOrName = '',
  onSaveMatchedMedia,
  initialMediaType,
}) => {
  if (!isOpen) return null;

  // Extracted folder and file info
  const [folderName, setFolderName] = useState('');
  const [fileName, setFileName] = useState('');
  const [detectedSeason, setDetectedSeason] = useState<number | undefined>(undefined);
  const [detectedEpisode, setDetectedEpisode] = useState<number | undefined>(undefined);

  // Manual inputs
  const [mediaType, setMediaType] = useState<MediaType>(initialMediaType || 'series');
  const [customTitle, setCustomTitle] = useState('');
  const [customYear, setCustomYear] = useState<number>(new Date().getFullYear());
  const [customSeasonNumber, setCustomSeasonNumber] = useState<number>(1);
  
  // Custom Synopsis & Metadata fields
  const [customOverview, setCustomOverview] = useState('');
  const [customTagline, setCustomTagline] = useState('');
  const [customGenres, setCustomGenres] = useState('Drama, Feature');
  const [customRating, setCustomRating] = useState<number>(8.5);
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  
  // Scraped / Generated result
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingSynopsisOnly, setIsFetchingSynopsisOnly] = useState(false);
  const [generatingEpIndex, setGeneratingEpIndex] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<MediaMetadata | null>(null);
  
  // Custom Episode list editor for series
  const [episodesList, setEpisodesList] = useState<EpisodeMetadata[]>([]);
  const [expandedEpisodeIndex, setExpandedEpisodeIndex] = useState<number | null>(0);

  // Parse path when modal opens or path changes
  useEffect(() => {
    if (rawPathOrName) {
      const normalized = rawPathOrName.replace(/\\/g, '/');
      const segments = normalized.split('/').filter(Boolean);
      
      const lastSegment = segments[segments.length - 1] || '';
      const parentFolder = segments.length > 1 ? segments[segments.length - 2] : '';
      
      setFileName(lastSegment);
      setFolderName(parentFolder || segments[0] || '');

      // Check folder for Season number (e.g. season 1, S01, Staffel 2, etc.)
      const seasonFromFolder = extractSeasonNumberFromPath(rawPathOrName);
      
      // Check file for episode & season info
      const epInfo = extractEpisodeInfoFromFilename(lastSegment);
      const parsedGeneral = parseTitleAndYear(lastSegment);

      const detectedType = initialMediaType || detectMediaType(rawPathOrName);
      setMediaType(detectedType);

      const resolvedSeason = epInfo.season ?? seasonFromFolder ?? 1;
      const resolvedEpisode = epInfo.episode ?? parsedGeneral.episode ?? 1;

      setDetectedSeason(seasonFromFolder ?? epInfo.season);
      setDetectedEpisode(epInfo.episode);
      setCustomSeasonNumber(resolvedSeason);

      // Clean default candidate title
      let candidateTitle = parsedGeneral.title;
      if (!candidateTitle || candidateTitle === lastSegment) {
        if (parentFolder && !/^(season|staffel|saison|s\d+|specials)$/i.test(parentFolder)) {
          candidateTitle = parseTitleAndYear(parentFolder).title;
        }
      }
      const initialCandidate = candidateTitle || '';
      setCustomTitle(initialCandidate);
      setCustomYear(parsedGeneral.year || new Date().getFullYear());

      // Initialize default overview placeholder
      setCustomOverview(`${initialCandidate || 'Media Title'} synopsis and description.`);
      setCustomTagline('Original Media Vault Edition');
      setCustomPosterUrl(
        detectedType === 'series'
          ? 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80'
      );

      // Try initial automated match
      handleAutoLookup(initialCandidate, detectedType, resolvedSeason, resolvedEpisode, epInfo.episodeTitle);
    }
  }, [rawPathOrName, initialMediaType]);

  // Automated lookup in local curated database and API
  const handleAutoLookup = async (
    titleQuery: string,
    type: MediaType,
    seasonNum: number = 1,
    episodeNum: number = 1,
    epTitleGuess?: string
  ) => {
    if (!titleQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      // 1. Check local curated database first for fast match
      const localMatch = CURATED_MEDIA_DATABASE.find(
        (m) => m.title.toLowerCase() === titleQuery.toLowerCase().trim() && m.type === type
      );

      if (localMatch) {
        setPreviewMedia(localMatch);
        setCustomOverview(localMatch.overview || '');
        setCustomTagline(localMatch.tagline || '');
        setCustomGenres(localMatch.genres?.join(', ') || 'Drama, Feature');
        setCustomRating(localMatch.rating || 8.5);
        if (localMatch.posterUrl) setCustomPosterUrl(localMatch.posterUrl);

        if (localMatch.seasons && localMatch.seasons.length > 0) {
          const matchedSeason = localMatch.seasons.find((s) => s.seasonNumber === seasonNum) || localMatch.seasons[0];
          setEpisodesList(matchedSeason.episodes || []);
        }
        setIsSearching(false);
        return;
      }

      // 2. Query server metadata scraper / Gemini generator
      const res = await fetch('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleQuery,
          type: type,
          year: customYear,
          seasonNumber: seasonNum,
          episodeNumber: episodeNum,
          episodeTitle: epTitleGuess,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          const overviewText = d.overview || `${titleQuery} synopsis and media package.`;
          const taglineText = d.tagline || 'Original Media Vault Edition';
          const genreList = d.genres || (type === 'series' ? ['Drama', 'Series'] : ['Feature Film', 'Cinema']);
          const ratingNum = d.rating || 8.5;
          const poster =
            type === 'series'
              ? 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80'
              : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80';

          setCustomOverview(overviewText);
          setCustomTagline(taglineText);
          setCustomGenres(genreList.join(', '));
          setCustomRating(ratingNum);
          setCustomPosterUrl(poster);

          const newMedia: MediaMetadata = {
            id: `matched-${type}-${Date.now()}`,
            type: type,
            title: d.title || titleQuery,
            year: d.year || customYear,
            overview: overviewText,
            tagline: taglineText,
            genres: genreList,
            rating: ratingNum,
            posterUrl: poster,
            fanartUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
            recommendedFolderStructure:
              type === 'series'
                ? `TV Shows/${titleQuery}/Season ${String(seasonNum).padStart(2, '0')}/`
                : `Movies/${titleQuery} (${customYear})/`,
            recommendedFilenames: [
              fileName || `${titleQuery}.${type === 'album' ? 'mp3' : 'mkv'}`,
              type === 'series' ? 'tvshow.nfo' : 'movie.nfo',
              'poster.jpg',
            ],
            matchedFilename: fileName,
            source: 'gemini-ai',
            seasons:
              type === 'series'
                ? d.seasons || [
                    {
                      seasonNumber: seasonNum,
                      name: `Season ${seasonNum}`,
                      episodeCount: 1,
                      episodes: [
                        {
                          episodeNumber: episodeNum,
                          seasonNumber: seasonNum,
                          title: d.episodeTitle || epTitleGuess || `Episode ${episodeNum}`,
                          plot: d.plot || `Synopsis for Season ${seasonNum} Episode ${episodeNum} of ${titleQuery}.`,
                          rating: d.rating || 8.5,
                        },
                      ],
                    },
                  ]
                : undefined,
          };

          setPreviewMedia(newMedia);
          if (newMedia.seasons && newMedia.seasons[0]) {
            setEpisodesList(newMedia.seasons[0].episodes || []);
          }
        }
      }
    } catch (err: any) {
      console.warn('Auto match lookup error:', err);
      setSearchError('Could not auto-match metadata. You can enter or fetch the synopsis manually below.');
    } finally {
      setIsSearching(false);
    }
  };

  // Dedicated button to fetch/regenerate just synopsis and tagline via Gemini
  const handleFetchSynopsisWithGemini = async () => {
    if (!customTitle.trim()) return;
    setIsFetchingSynopsisOnly(true);
    setSearchError(null);

    try {
      const res = await fetch('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim(),
          type: mediaType,
          year: customYear,
          seasonNumber: customSeasonNumber,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          if (d.overview) setCustomOverview(d.overview);
          if (d.tagline) setCustomTagline(d.tagline);
          if (d.genres && d.genres.length > 0) setCustomGenres(d.genres.join(', '));
          if (d.rating) setCustomRating(d.rating);
        }
      }
    } catch (err) {
      console.error('Failed to fetch synopsis with Gemini:', err);
      setSearchError('Could not generate synopsis with Gemini. You can type it directly.');
    } finally {
      setIsFetchingSynopsisOnly(false);
    }
  };

  // Dedicated episode AI synopsis generator in modal
  const handleFetchSingleEpisodeSynopsis = async (index: number) => {
    const ep = episodesList[index];
    if (!ep) return;
    setGeneratingEpIndex(index);

    try {
      const res = await fetch('/api/metadata/generate-synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim(),
          type: 'series',
          year: customYear,
          seasonNumber: customSeasonNumber,
          episodeNumber: ep.episodeNumber,
          episodeTitle: ep.title,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const newPlot = json.data.plot || json.data.overview;
          if (newPlot) {
            handleUpdateEpisode(index, 'plot', newPlot);
          }
          if (json.data.episodeTitle) {
            handleUpdateEpisode(index, 'title', json.data.episodeTitle);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch episode synopsis:', err);
    } finally {
      setGeneratingEpIndex(null);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    // Check if user changed season or title
    const seasonFromFolder = extractSeasonNumberFromPath(rawPathOrName);
    const epInfo = extractEpisodeInfoFromFilename(fileName);

    const resolvedSeason = customSeasonNumber || seasonFromFolder || 1;
    const resolvedEpisode = epInfo.episode || detectedEpisode || 1;

    handleAutoLookup(customTitle.trim(), mediaType, resolvedSeason, resolvedEpisode, epInfo.episodeTitle);
  };

  const handleAddEpisode = () => {
    const nextNum = episodesList.length + 1;
    const newEp: EpisodeMetadata = {
      episodeNumber: nextNum,
      seasonNumber: customSeasonNumber,
      title: `Episode ${nextNum}`,
      plot: `Plot summary for ${customTitle || 'Series'} Season ${customSeasonNumber} Episode ${nextNum}.`,
      rating: 8.5,
    };
    setEpisodesList([...episodesList, newEp]);
    setExpandedEpisodeIndex(episodesList.length);
  };

  const handleUpdateEpisode = (index: number, field: keyof EpisodeMetadata, val: any) => {
    setEpisodesList((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleDeleteEpisode = (index: number) => {
    setEpisodesList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyMatch = () => {
    if (!customTitle.trim()) return;

    const parsedGenreArray = customGenres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const finalSeasons: SeasonMetadata[] | undefined =
      mediaType === 'series'
        ? [
            {
              seasonNumber: customSeasonNumber,
              name: `Season ${customSeasonNumber}`,
              episodeCount: episodesList.length || 1,
              episodes:
                episodesList.length > 0
                  ? episodesList
                  : [
                      {
                        episodeNumber: detectedEpisode || 1,
                        seasonNumber: customSeasonNumber,
                        title: `Episode ${detectedEpisode || 1}`,
                        plot: `Synopsis for ${customTitle} S${String(customSeasonNumber).padStart(2, '0')}E${String(detectedEpisode || 1).padStart(2, '0')}.`,
                        rating: customRating || 8.5,
                      },
                    ],
            },
          ]
        : undefined;

    const finalized: MediaMetadata = {
      ...(previewMedia || {
        id: `manual-${mediaType}-${Date.now()}`,
        type: mediaType,
        title: customTitle.trim(),
        year: customYear,
        overview: customOverview || `${customTitle} is a ${mediaType === 'series' ? 'TV series' : 'movie'} cataloged in SambaVault.`,
        tagline: customTagline || 'Custom matched title',
        genres: parsedGenreArray.length > 0 ? parsedGenreArray : (mediaType === 'series' ? ['Drama', 'TV Series'] : ['Feature Film']),
        rating: customRating || 8.5,
        posterUrl: customPosterUrl || (
          mediaType === 'series'
            ? 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80'
        ),
        fanartUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        recommendedFolderStructure:
          mediaType === 'series'
            ? `TV Shows/${customTitle}/Season ${String(customSeasonNumber).padStart(2, '0')}/`
            : `Movies/${customTitle} (${customYear})/`,
        recommendedFilenames: [fileName || `${customTitle}.mkv`, 'movie.nfo', 'poster.jpg'],
        source: 'gemini-ai',
      }),
      title: customTitle.trim(),
      type: mediaType,
      year: customYear,
      overview: customOverview || `${customTitle} synopsis and metadata.`,
      tagline: customTagline || previewMedia?.tagline,
      genres: parsedGenreArray.length > 0 ? parsedGenreArray : (previewMedia?.genres || ['Drama']),
      rating: customRating || previewMedia?.rating || 8.5,
      posterUrl: customPosterUrl || previewMedia?.posterUrl,
      matchedFilename: fileName || rawPathOrName,
      seasons: finalSeasons,
    };

    onSaveMatchedMedia(finalized);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Manual Media Matcher & Synopsis Resolver</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal">
                  Folder & File Hierarchy
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Match unknown folder names, parse Season / Episode numbers, and generate or manually supply synopses
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Detected Raw Information Box */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>Discovered Path Inspection</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Folder Name:</span>
                <span className="text-slate-200 truncate block">{folderName || '(Root Directory)'}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">File Name:</span>
                <span className="text-slate-200 truncate block">{fileName || rawPathOrName}</span>
              </div>
            </div>

            {/* Hierarchy breakdown tags */}
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              {detectedSeason !== undefined && (
                <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  <span>Detected Season: {detectedSeason === 0 ? 'Specials (Season 0)' : `Season ${detectedSeason}`}</span>
                </span>
              )}
              {detectedEpisode !== undefined && (
                <span className="px-2 py-0.5 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  <span>Detected Episode: E{String(detectedEpisode).padStart(2, '0')}</span>
                </span>
              )}
            </div>
          </div>

          {/* Form for entering the Series / Movie Name Manually */}
          <form onSubmit={handleManualSearch} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Media Type & Title Identifier</span>
              </label>

              {/* Type Switcher */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 space-x-1">
                <button
                  type="button"
                  onClick={() => setMediaType('series')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    mediaType === 'series'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>TV Series</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaType('movie')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    mediaType === 'movie'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Movie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaType('album')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    mediaType === 'album'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Music / Audio</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  {mediaType === 'series' ? 'TV Series Name:' : mediaType === 'movie' ? 'Movie Title:' : 'Album / Artist Title:'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={
                      mediaType === 'series'
                        ? 'e.g. Breaking Bad, Severance, Game of Thrones...'
                        : 'e.g. Interstellar, Oppenheimer, Dune...'
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                  />
                  <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Release Year:
                </label>
                <input
                  type="number"
                  value={customYear}
                  onChange={(e) => setCustomYear(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                />
              </div>
            </div>

            {/* Synopsis & Metadata Editing Field (Gemini API Integrated) */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>2. Movie / TV Show Synopsis & Overview</span>
                </span>

                <button
                  type="button"
                  disabled={isFetchingSynopsisOnly || !customTitle.trim()}
                  onClick={handleFetchSynopsisWithGemini}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                  title="Fetch synopsis and storyline using Gemini API"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${isFetchingSynopsisOnly ? 'animate-spin' : ''}`} />
                  <span>{isFetchingSynopsisOnly ? 'Fetching with Gemini...' : 'Fetch AI Synopsis with Gemini'}</span>
                </button>
              </div>

              {/* Editable Synopsis Field */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block">
                  Synopsis / Overview (Edit or supply your own if missing/incorrect):
                </label>
                <textarea
                  rows={3}
                  value={customOverview}
                  onChange={(e) => setCustomOverview(e.target.value)}
                  placeholder="Enter or paste the plot summary / synopsis for this title..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Tagline, Genres, Rating grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Tagline:</label>
                  <input
                    type="text"
                    value={customTagline}
                    onChange={(e) => setCustomTagline(e.target.value)}
                    placeholder="e.g. In space no one can hear you scream"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Genres (comma-separated):</label>
                  <input
                    type="text"
                    value={customGenres}
                    onChange={(e) => setCustomGenres(e.target.value)}
                    placeholder="Drama, Sci-Fi, Thriller"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Rating (out of 10):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={customRating}
                    onChange={(e) => setCustomRating(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* If TV Series: Check Season Folder & Episode Names & Individual Synopses */}
            {mediaType === 'series' && (
              <div className="p-3.5 bg-slate-950 border border-purple-900/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>3. TV Season & Episode Synopses Hierarchy</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddEpisode}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-[11px] font-semibold border border-purple-500/30 transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Episode</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Matched Season Number (Checked from folder: {folderName || 'Root'}):
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={customSeasonNumber}
                      onChange={(e) => setCustomSeasonNumber(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Episode Count for Season {customSeasonNumber}:
                    </label>
                    <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs font-mono">
                      {episodesList.length} Episode{episodesList.length !== 1 ? 's' : ''} Configured
                    </div>
                  </div>
                </div>

                {/* Episode synopses list */}
                {episodesList.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Episode Synopses & Metadata:
                    </span>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {episodesList.map((ep, idx) => {
                        const isExpanded = expandedEpisodeIndex === idx;
                        const isEpGen = generatingEpIndex === idx;

                        return (
                          <div
                            key={idx}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => setExpandedEpisodeIndex(isExpanded ? null : idx)}
                                className="flex items-center gap-2 text-left font-semibold text-white text-xs flex-1 cursor-pointer"
                              >
                                <span className="w-6 h-6 rounded bg-purple-600/30 text-purple-300 flex items-center justify-center font-mono text-[10px]">
                                  E{String(ep.episodeNumber).padStart(2, '0')}
                                </span>
                                <span>{ep.title || `Episode ${ep.episodeNumber}`}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-slate-400 ml-auto" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-auto" />
                                )}
                              </button>

                              <div className="flex items-center gap-1.5 ml-2">
                                <button
                                  type="button"
                                  disabled={isEpGen}
                                  onClick={() => handleFetchSingleEpisodeSynopsis(idx)}
                                  className="px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 text-[10px] font-medium flex items-center gap-1 cursor-pointer transition"
                                  title="Fetch episode synopsis with Gemini"
                                >
                                  <Sparkles className={`w-3 h-3 ${isEpGen ? 'animate-spin' : ''}`} />
                                  <span>{isEpGen ? '...' : 'AI Synopsis'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteEpisode(idx)}
                                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 cursor-pointer transition"
                                  title="Remove episode"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-0.5">
                                    Episode Title:
                                  </label>
                                  <input
                                    type="text"
                                    value={ep.title}
                                    onChange={(e) => handleUpdateEpisode(idx, 'title', e.target.value)}
                                    placeholder="Episode title"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-0.5">
                                    Episode Synopsis / Plot Summary:
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={ep.plot || ''}
                                    onChange={(e) => handleUpdateEpisode(idx, 'plot', e.target.value)}
                                    placeholder="Enter or refine episode synopsis..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500 resize-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                disabled={isSearching || !customTitle.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
                <span>{isSearching ? 'Fetching Full Metadata Package...' : 'Search & Fetch Full AI Package'}</span>
              </button>

              {searchError && (
                <div className="text-amber-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}
            </div>
          </form>

          {/* Generated Synopsis & Media Preview */}
          {previewMedia && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Matched Synopsis & Metadata Preview</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {mediaType.toUpperCase()} • {customYear}
                </span>
              </div>

              <div className="flex gap-4">
                <div className="w-20 h-28 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shrink-0 hidden sm:block">
                  <img
                    src={customPosterUrl || previewMedia.posterUrl}
                    alt={customTitle || previewMedia.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="space-y-1.5 flex-1">
                  <h3 className="text-sm font-bold text-white">{customTitle || previewMedia.title}</h3>
                  {(customTagline || previewMedia.tagline) && (
                    <p className="text-slate-400 italic text-xs font-medium">"{customTagline || previewMedia.tagline}"</p>
                  )}
                  <p className="text-slate-300 text-xs leading-relaxed line-clamp-3">
                    {customOverview || previewMedia.overview}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(customGenres ? customGenres.split(',') : previewMedia.genres)?.map((g, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]"
                      >
                        {typeof g === 'string' ? g.trim() : g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApplyMatch}
            disabled={!customTitle.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Save & Apply Synopsis to Library</span>
          </button>
        </div>
      </div>
    </div>
  );
};
