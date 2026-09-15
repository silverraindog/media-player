import React, { useState } from 'react';
import {
  X,
  Search,
  Sparkles,
  Globe,
  Film,
  Tv,
  Check,
  Plus,
  Play,
  FileCode,
  Tag,
  Star,
  Calendar,
  Clock,
  HardDrive,
  CheckCircle2,
  FolderPlus,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { MediaMetadata, MediaType } from '../types';

interface WebSearchCategorizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategorizedMedia: (media: MediaMetadata) => void;
  onPlayMedia?: (media: MediaMetadata) => void;
  onOpenInNfoStudio?: (media: MediaMetadata) => void;
  initialQuery?: string;
  initialType?: MediaType | 'all';
}

const POPULAR_SEARCH_PRESETS = [
  { name: 'Severance', type: 'series', category: 'Sci-Fi' },
  { name: 'The Bear', type: 'series', category: 'Drama / Comedy' },
  { name: 'Ted Lasso', type: 'series', category: 'Comedy' },
  { name: 'Dune: Part Two', type: 'movie', category: 'Sci-Fi' },
  { name: 'Interstellar', type: 'movie', category: 'Sci-Fi' },
  { name: 'Succession', type: 'series', category: 'Drama' },
  { name: 'Oppenheimer', type: 'movie', category: 'Drama / Biography' },
  { name: 'Stranger Things', type: 'series', category: 'Sci-Fi / Horror' },
  { name: 'Arcane', type: 'series', category: 'Animation / Sci-Fi' },
  { name: 'The Office', type: 'series', category: 'Comedy' },
];

export const WebSearchCategorizerModal: React.FC<WebSearchCategorizerModalProps> = ({
  isOpen,
  onClose,
  onSaveCategorizedMedia,
  onPlayMedia,
  onOpenInNfoStudio,
  initialQuery = '',
  initialType = 'all',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [mediaType, setMediaType] = useState<MediaType | 'all'>(initialType);
  const [yearHint, setYearHint] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultData, setResultData] = useState<MediaMetadata | null>(null);
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [selectedPrimaryCategory, setSelectedPrimaryCategory] = useState<string>('Drama');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (targetQuery?: string, targetType?: MediaType | 'all') => {
    const q = (targetQuery || query).trim();
    if (!q) {
      setErrorMsg('Please enter a movie or series title to categorize.');
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);
    setIsSaved(false);

    try {
      const res = await fetch('/api/metadata/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: q,
          type: targetType || mediaType,
          year: yearHint ? parseInt(yearHint, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to search web for categories');
      }

      const media: MediaMetadata = data.data;
      setResultData(media);
      setDetectedCategories(media.genres || ['Drama']);
      setSelectedPrimaryCategory(media.genres?.[0] || 'Drama');
    } catch (err: any) {
      console.error('Web categorization search error:', err);
      setErrorMsg(err?.message || 'Failed to perform web categorization');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = () => {
    if (!resultData) return;

    // Build finalized media metadata with assigned categories
    const updatedMedia: MediaMetadata = {
      ...resultData,
      genres: Array.from(new Set([selectedPrimaryCategory, ...(resultData.genres || [])])),
    };

    onSaveCategorizedMedia(updatedMedia);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2500);
  };

  const handleCategorizeAndPlay = () => {
    if (!resultData) return;
    const updatedMedia: MediaMetadata = {
      ...resultData,
      genres: Array.from(new Set([selectedPrimaryCategory, ...(resultData.genres || [])])),
    };
    onSaveCategorizedMedia(updatedMedia);
    if (onPlayMedia) {
      onPlayMedia(updatedMedia);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Web Search & Media Categorizer</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                  AI Web Grounded
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Enter any Movie or TV Series title to fetch its official categories, genres, synopsis & Kodi/Plex structure.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Search Inputs */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Severance, Ted Lasso, The Matrix, Dune, Succession..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Auto Detect</option>
                  <option value="movie">Movie</option>
                  <option value="series">TV Series</option>
                  <option value="album">Music Album</option>
                </select>

                <input
                  type="number"
                  value={yearHint}
                  onChange={(e) => setYearHint(e.target.value)}
                  placeholder="Year (opt)"
                  className="w-24 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-center"
                />

                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isSearching ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Searching Web...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Search & Categorize</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Preset Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
              <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>Try:</span>
              </span>
              {POPULAR_SEARCH_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setQuery(preset.name);
                    setMediaType(preset.type as any);
                    handleSearch(preset.name, preset.type as any);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-medium transition cursor-pointer flex items-center gap-1"
                >
                  <span>{preset.name}</span>
                  <span className="text-[10px] text-indigo-400 opacity-80">({preset.category})</span>
                </button>
              ))}
            </div>
          </form>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
                ×
              </button>
            </div>
          )}

          {/* Search Result Card & Category Breakdown */}
          {resultData && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Poster Artwork */}
                <div className="w-28 sm:w-36 h-40 sm:h-52 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-lg relative group">
                  <img
                    src={resultData.posterUrl}
                    alt={resultData.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-white font-bold text-[10px] uppercase">
                    {resultData.type}
                  </div>
                </div>

                {/* Details & Discovered Categories */}
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <span>{resultData.title}</span>
                        <span className="text-sm text-slate-400 font-normal">({resultData.year})</span>
                      </h3>
                      {resultData.tagline && (
                        <p className="text-xs italic text-indigo-400 mt-0.5">"{resultData.tagline}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{resultData.rating?.toFixed(1) || '8.5'} / 10</span>
                    </div>
                  </div>

                  {/* Discovered Categories Section */}
                  <div className="space-y-1.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Discovered Categories & Genres:</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Click to set primary</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {detectedCategories.map((genre) => {
                        const isPrimary = selectedPrimaryCategory === genre;
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => setSelectedPrimaryCategory(genre)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                              isPrimary
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <span>{genre}</span>
                            {isPrimary && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Synopsis */}
                  <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                    {resultData.overview}
                  </p>

                  {/* Meta Tags */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    {resultData.directors && resultData.directors.length > 0 && (
                      <div>
                        <span className="text-slate-500">Director/Creator: </span>
                        <span className="text-slate-300 font-medium">{resultData.directors.join(', ')}</span>
                      </div>
                    )}
                    {resultData.studio && (
                      <div>
                        <span className="text-slate-500">Studio: </span>
                        <span className="text-slate-300 font-medium">{resultData.studio}</span>
                      </div>
                    )}
                    {resultData.certification && (
                      <div>
                        <span className="text-slate-500">Rating: </span>
                        <span className="text-slate-300 font-medium">{resultData.certification}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended File & Directory Structure */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Recommended Samba Share Path:</span>
                </div>
                <div className="font-mono text-emerald-400 text-[11px] truncate bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  {resultData.recommendedFolderStructure}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                      isSaved
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    }`}
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Saved to Media Library!</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-4 h-4" />
                        <span>Add to Media Library</span>
                      </>
                    )}
                  </button>

                  {onPlayMedia && (
                    <button
                      onClick={handleCategorizeAndPlay}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-cyan-600/30 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Categorize & Play</span>
                    </button>
                  )}
                </div>

                {onOpenInNfoStudio && (
                  <button
                    onClick={() => {
                      onOpenInNfoStudio(resultData);
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Open in NFO Studio</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
