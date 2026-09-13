import React, { useState } from 'react';
import {
  Search,
  Film,
  Tv,
  Music,
  Download,
  Share2,
  FolderPlus,
  Eye,
  Star,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  Check,
  HardDrive,
  Copy,
  ExternalLink,
  Info,
  Database,
} from 'lucide-react';
import { MediaMetadata, MediaType, SambaConfig } from '../types';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';
import { downloadMediaBundleZip, downloadTextFile } from '../utils/zipDownloader';
import { generateMetadataFile } from '../utils/nfoGenerator';

interface MediaSearchProps {
  onPushToSamba: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  sambaConfig: SambaConfig;
}

export const MediaSearch: React.FC<MediaSearchProps> = ({
  onPushToSamba,
  onOpenDetails,
  onOpenInNfoStudio,
  sambaConfig,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | MediaType>('all');
  const [searchResults, setSearchResults] = useState<MediaMetadata[]>(CURATED_MEDIA_DATABASE);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [pushedIds, setPushedIds] = useState<Record<string, boolean>>({});
  const [savedDbIds, setSavedDbIds] = useState<Record<string, boolean>>({});
  const [copiedNfoId, setCopiedNfoId] = useState<string | null>(null);

  const handleSaveToSqlite = async (media: MediaMetadata) => {
    try {
      const res = await fetch('/api/db/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(media),
      });
      if (res.ok) {
        setSavedDbIds((prev) => ({ ...prev, [media.id]: true }));
        setTimeout(() => {
          setSavedDbIds((prev) => ({ ...prev, [media.id]: false }));
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to save to SQLite:', err);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(
        selectedType === 'all'
          ? CURATED_MEDIA_DATABASE
          : CURATED_MEDIA_DATABASE.filter((m) => m.type === selectedType)
      );
      return;
    }

    setIsLoading(true);
    setIsAiSearching(true);

    try {
      // 1. Try backend Gemini AI Search
      const targetType = selectedType === 'all' ? 'movie' : selectedType;
      const res = await fetch('/api/metadata/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: targetType }),
      });

      const data = await res.json();

      if (data.success && data.data) {
        // AI found or generated accurate structured metadata
        const aiMedia: MediaMetadata = data.data;
        // Merge with any local matches
        const localMatches = CURATED_MEDIA_DATABASE.filter(
          (m) =>
            m.title.toLowerCase().includes(query.toLowerCase()) ||
            m.genres.some((g) => g.toLowerCase().includes(query.toLowerCase()))
        );

        const merged = [
          aiMedia,
          ...localMatches.filter((m) => m.title.toLowerCase() !== aiMedia.title.toLowerCase()),
        ];
        setSearchResults(merged);
      } else {
        // Fallback to local curated search
        const filtered = CURATED_MEDIA_DATABASE.filter((m) => {
          const matchesType = selectedType === 'all' || m.type === selectedType;
          const matchesQuery =
            m.title.toLowerCase().includes(query.toLowerCase()) ||
            (m.artists && m.artists.some((a) => a.toLowerCase().includes(query.toLowerCase()))) ||
            (m.directors && m.directors.some((d) => d.toLowerCase().includes(query.toLowerCase()))) ||
            m.genres.some((g) => g.toLowerCase().includes(query.toLowerCase()));
          return matchesType && matchesQuery;
        });

        if (filtered.length === 0) {
          // Create synthetic entry if not found
          const synthetic: MediaMetadata = {
            id: `media-${Date.now()}`,
            type: selectedType === 'all' ? 'movie' : selectedType,
            title: query,
            year: new Date().getFullYear(),
            overview: `Metadata profile for "${query}". High-resolution media information formatted for Plex, Jellyfin, Kodi, and Samba network storage.`,
            genres: ['Media', 'General'],
            rating: 8.0,
            posterUrl:
              'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
            recommendedFolderStructure: `${selectedType === 'series' ? 'TV Shows' : selectedType === 'album' ? 'Music' : 'Movies'}/${query}/`,
            recommendedFilenames: [`${query}.mkv`],
            source: 'curated-database',
          };
          setSearchResults([synthetic]);
        } else {
          setSearchResults(filtered);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      // Fallback
      const localMatches = CURATED_MEDIA_DATABASE.filter((m) =>
        m.title.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(localMatches.length > 0 ? localMatches : CURATED_MEDIA_DATABASE);
    } finally {
      setIsLoading(false);
      setIsAiSearching(false);
    }
  };

  const handleTypeChange = (type: 'all' | MediaType) => {
    setSelectedType(type);
    if (!searchQuery) {
      setSearchResults(
        type === 'all'
          ? CURATED_MEDIA_DATABASE
          : CURATED_MEDIA_DATABASE.filter((m) => m.type === type)
      );
    }
  };

  const handlePresetClick = (presetQuery: string, type: MediaType) => {
    setSearchQuery(presetQuery);
    setSelectedType(type);
    const matched = CURATED_MEDIA_DATABASE.find(
      (m) => m.title.toLowerCase() === presetQuery.toLowerCase()
    );
    if (matched) {
      setSearchResults([matched]);
    } else {
      setTimeout(() => handleSearch(), 50);
    }
  };

  const handlePush = (media: MediaMetadata) => {
    onPushToSamba(media);
    setPushedIds((prev) => ({ ...prev, [media.id]: true }));
    setTimeout(() => {
      setPushedIds((prev) => ({ ...prev, [media.id]: false }));
    }, 3000);
  };

  const handleCopyNfo = (media: MediaMetadata) => {
    const xml = generateMetadataFile(media);
    navigator.clipboard.writeText(xml);
    setCopiedNfoId(media.id);
    setTimeout(() => setCopiedNfoId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Explanation */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Automated Media Scraper & Downloader</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Download TV Series, Movie & Album Metadata
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Search any movie, TV show, or music album. Download standard <code className="text-indigo-300 bg-indigo-950/60 px-1 py-0.5 rounded">.nfo</code> files, high-resolution artwork, season & episode guides, and sync them directly to your Samba (SMB) network shares across <span className="text-white font-medium">macOS</span>, <span className="text-white font-medium">Linux</span>, and <span className="text-white font-medium">Windows</span>.
          </p>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Try popular titles:</span>
          <button
            id="preset-severance"
            onClick={() => handlePresetClick('Severance', 'series')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            📺 Severance (2022)
          </button>
          <button
            id="preset-breaking-bad"
            onClick={() => handlePresetClick('Breaking Bad', 'series')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            📺 Breaking Bad
          </button>
          <button
            id="preset-dune-two"
            onClick={() => handlePresetClick('Dune: Part Two', 'movie')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            🎬 Dune: Part Two (2024)
          </button>
          <button
            id="preset-interstellar"
            onClick={() => handlePresetClick('Interstellar', 'movie')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            🎬 Interstellar (2014)
          </button>
          <button
            id="preset-daft-punk"
            onClick={() => handlePresetClick('Random Access Memories', 'album')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            🎵 Daft Punk - RAM
          </button>
          <button
            id="preset-pink-floyd"
            onClick={() => handlePresetClick('The Dark Side of the Moon', 'album')}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            🎵 Pink Floyd - DSOTM
          </button>
        </div>
      </div>

      {/* Search Input and Type Tabs */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Type selector */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs sm:text-sm">
          <button
            id="search-filter-all"
            onClick={() => handleTypeChange('all')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition ${
              selectedType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Media</span>
          </button>
          <button
            id="search-filter-series"
            onClick={() => handleTypeChange('series')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition ${
              selectedType === 'series'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>TV Series</span>
          </button>
          <button
            id="search-filter-movie"
            onClick={() => handleTypeChange('movie')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition ${
              selectedType === 'movie'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Movies</span>
          </button>
          <button
            id="search-filter-album"
            onClick={() => handleTypeChange('album')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition ${
              selectedType === 'album'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Music Albums</span>
          </button>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="media-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Series, Movies, or Albums (e.g. Inception, The Office, Abbey Road)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            id="media-search-submit-btn"
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Scraping...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Lookup</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Media Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {searchResults.map((media) => {
          const isPushed = pushedIds[media.id];
          const isCopied = copiedNfoId === media.id;

          return (
            <div
              key={media.id}
              id={`media-card-${media.id}`}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col transition-all group"
            >
              {/* Media Poster & Header Image */}
              <div className="relative h-48 sm:h-52 bg-slate-950 overflow-hidden">
                <img
                  src={media.fanartUrl || media.posterUrl}
                  alt={media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-70 group-hover:opacity-85"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

                {/* Type Badge & Rating */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-md ${
                      media.type === 'series'
                        ? 'bg-purple-600 text-white'
                        : media.type === 'movie'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {media.type === 'series' && <Tv className="w-3 h-3" />}
                    {media.type === 'movie' && <Film className="w-3 h-3" />}
                    {media.type === 'album' && <Music className="w-3 h-3" />}
                    {media.type}
                  </span>

                  {media.certification && (
                    <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                      {media.certification}
                    </span>
                  )}
                </div>

                {/* Rating badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 border border-amber-500/30 px-2 py-1 rounded-lg text-amber-400 text-xs font-bold shadow-md">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{media.rating.toFixed(1)}</span>
                </div>

                {/* Floating Title and Meta */}
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="text-lg font-bold text-white leading-snug drop-shadow-md">
                    {media.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-indigo-400" />
                      {media.year}
                    </span>
                    {media.runtime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        {media.runtime}
                      </span>
                    )}
                    {media.artists && (
                      <span className="text-slate-200 font-medium truncate max-w-[140px]">
                        {media.artists.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                {/* Genres */}
                <div className="flex flex-wrap gap-1.5">
                  {media.genres.slice(0, 3).map((g, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60"
                    >
                      {g}
                    </span>
                  ))}
                  {media.seasons && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 text-[11px] border border-purple-800/40">
                      {media.seasons.length} {media.seasons.length === 1 ? 'Season' : 'Seasons'}
                    </span>
                  )}
                  {media.tracks && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 text-[11px] border border-emerald-800/40">
                      {media.tracks.length} Tracks
                    </span>
                  )}
                </div>

                {/* Plot / Overview */}
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {media.overview}
                </p>

                {/* Target Samba Folder Path info */}
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">
                      //{sambaConfig.server}/{sambaConfig.share}/{media.recommendedFolderStructure}
                    </span>
                  </div>
                </div>

                {/* Actions Button Grid */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  {/* Primary Download & Push row */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id={`btn-download-bundle-${media.id}`}
                      onClick={() => downloadMediaBundleZip(media)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm cursor-pointer"
                      title="Download complete ZIP package containing .nfo, posters, XML, subtitle templates"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download ZIP</span>
                    </button>

                    <button
                      id={`btn-push-samba-${media.id}`}
                      onClick={() => handlePush(media)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isPushed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700'
                      }`}
                      title="Sync metadata & folder structure directly into Samba network share"
                    >
                      {isPushed ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Pushed to SMB!</span>
                        </>
                      ) : (
                        <>
                          <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Push to Samba</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Secondary Details & NFO buttons */}
                  <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                    <button
                      id={`btn-inspect-${media.id}`}
                      onClick={() => onOpenDetails(media)}
                      className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <Eye className="w-3 h-3 text-cyan-400" />
                      <span>Details</span>
                    </button>

                    <button
                      id={`btn-save-sqlite-${media.id}`}
                      onClick={() => handleSaveToSqlite(media)}
                      className={`flex items-center justify-center gap-1 py-1.5 rounded transition ${
                        savedDbIds[media.id]
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-emerald-300'
                      }`}
                      title="Store Title and Synopsis in SQLite database"
                    >
                      {savedDbIds[media.id] ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Database className="w-3 h-3" />
                          <span>SQLite</span>
                        </>
                      )}
                    </button>

                    <button
                      id={`btn-copy-nfo-${media.id}`}
                      onClick={() => handleCopyNfo(media)}
                      className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-indigo-400" />
                          <span>NFO</span>
                        </>
                      )}
                    </button>

                    <button
                      id={`btn-studio-${media.id}`}
                      onClick={() => onOpenInNfoStudio(media)}
                      className="flex items-center justify-center gap-1 py-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span>Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
