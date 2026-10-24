import React, { useState, useEffect, useMemo } from 'react';
import {
  Bookmark,
  Play,
  Eye,
  Trash2,
  HardDrive,
  Search,
  Film,
  Tv,
  Music,
  Star,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { MediaMetadata, MediaType, WatchlistItem, SambaConfig } from '../types';

interface WatchlistTabProps {
  onPlayMedia: (media: MediaMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onPushToSamba?: (media: MediaMetadata) => void;
  onNavigateToSearch?: () => void;
  sambaConfig?: SambaConfig;
  allMediaLibrary?: MediaMetadata[];
  onOpenInNfoStudio?: (media: MediaMetadata) => void;
  onWatchlistCountChange?: (count: number) => void;
}

export const WatchlistTab: React.FC<WatchlistTabProps> = ({
  onPlayMedia,
  onOpenDetails,
  onPushToSamba,
  onNavigateToSearch,
  sambaConfig,
  allMediaLibrary = [],
  onOpenInNfoStudio,
  onWatchlistCountChange,
}) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | MediaType>('all');
  const [pushedIds, setPushedIds] = useState<Record<string, boolean>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/db/watchlist');
      const data = await res.json();
      if (data.success && Array.isArray(data.watchlist)) {
        setWatchlist(data.watchlist);
        if (onWatchlistCountChange) {
          onWatchlistCountChange(data.watchlist.length);
        }
      }
    } catch (err) {
      console.error('Failed to load watchlist from SQLite:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleRemove = async (mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemovingId(mediaId);
    try {
      const res = await fetch(`/api/db/watchlist/${encodeURIComponent(mediaId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setWatchlist((prev) => {
          const next = prev.filter((item) => item.media_id !== mediaId);
          if (onWatchlistCountChange) {
            onWatchlistCountChange(next.length);
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    } finally {
      setRemovingId(null);
    }
  };

  // Resolve full MediaMetadata object or reconstruct from watchlist row
  const resolveMediaObject = (item: WatchlistItem): MediaMetadata => {
    const existing = allMediaLibrary.find(
      (m) => m.id === item.media_id || m.title.toLowerCase() === item.title.toLowerCase()
    );
    if (existing) return existing;

    let parsedGenres: string[] = [];
    try {
      if (item.genres) {
        parsedGenres = JSON.parse(item.genres);
      }
    } catch {
      parsedGenres = item.genres ? item.genres.split(',').map((g) => g.trim()) : [];
    }

    return {
      id: item.media_id,
      title: item.title,
      type: item.media_type,
      year: item.year || 2024,
      rating: item.rating || 8.5,
      posterUrl: item.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      overview: item.synopsis || 'Saved to Watchlist',
      genres: parsedGenres.length > 0 ? parsedGenres : ['Drama'],
      recommendedFolderStructure: item.media_type === 'series'
        ? `TV Shows/${item.title} (${item.year || 2024})/Season 01/`
        : `Movies/${item.title} (${item.year || 2024})/`,
      recommendedFilenames: [
        item.media_type === 'series' ? 'tvshow.nfo' : item.media_type === 'movie' ? 'movie.nfo' : 'album.nfo',
        'poster.jpg',
      ],
      source: 'sqlite-watchlist',
    };
  };

  const handlePush = (item: WatchlistItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const media = resolveMediaObject(item);
    if (onPushToSamba) {
      onPushToSamba(media);
    }
    setPushedIds((prev) => ({ ...prev, [item.media_id]: true }));
    setTimeout(() => {
      setPushedIds((prev) => ({ ...prev, [item.media_id]: false }));
    }, 3000);
  };

  const handlePlay = (item: WatchlistItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const media = resolveMediaObject(item);
    onPlayMedia(media);
  };

  const handleCardClick = (item: WatchlistItem) => {
    const media = resolveMediaObject(item);
    onOpenDetails(media);
  };

  // Filter watchlist items
  const filteredItems = useMemo(() => {
    return watchlist.filter((item) => {
      if (selectedType !== 'all' && item.media_type !== selectedType) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSynopsis = (item.synopsis || '').toLowerCase().includes(q);
        const matchesGenre = (item.genres || '').toLowerCase().includes(q);
        return matchesTitle || matchesSynopsis || matchesGenre;
      }
      return true;
    });
  }, [watchlist, selectedType, searchQuery]);

  const seriesCount = watchlist.filter((w) => w.media_type === 'series').length;
  const moviesCount = watchlist.filter((w) => w.media_type === 'movie').length;
  const albumsCount = watchlist.filter((w) => w.media_type === 'album').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/20 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-2">
              <Bookmark className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>SQLite Watchlist Vault</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <span>My Watchlist</span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-mono font-bold">
                {watchlist.length} {watchlist.length === 1 ? 'item' : 'items'}
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Personal bookmarked titles saved permanently in SQLite. Stream them, view details, or push to Samba share anytime.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-refresh-watchlist"
              onClick={fetchWatchlist}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              id="btn-browse-library-watchlist"
              onClick={onNavigateToSearch}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/25 transition cursor-pointer"
            >
              <span>Browse Library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Type Tabs */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto shrink-0">
          <button
            onClick={() => setSelectedType('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'all'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All ({watchlist.length})</span>
          </button>
          <button
            onClick={() => setSelectedType('series')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'series'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Series ({seriesCount})</span>
          </button>
          <button
            onClick={() => setSelectedType('movie')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'movie'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Movies ({moviesCount})</span>
          </button>
          <button
            onClick={() => setSelectedType('album')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedType === 'album'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Music ({albumsCount})</span>
          </button>
        </div>

        {/* Search within watchlist */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search within your watchlist..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Watchlist Grid */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item) => {
            const isPushed = Boolean(pushedIds[item.media_id]);
            const isRemoving = removingId === item.media_id;
            let genresList: string[] = [];
            try {
              if (item.genres) genresList = JSON.parse(item.genres);
            } catch {
              genresList = item.genres ? item.genres.split(',') : [];
            }

            return (
              <div
                key={item.id || item.media_id}
                id={`watchlist-card-${item.media_id}`}
                onClick={() => handleCardClick(item)}
                className="group relative bg-slate-900 border border-slate-800 hover:border-amber-500/60 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/10 flex flex-col cursor-pointer"
              >
                {/* Poster & Quick Action Overlay */}
                <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                  <img
                    src={item.poster_url || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80'}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 opacity-80 group-hover:opacity-90 transition-opacity" />

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm ${
                        item.media_type === 'series'
                          ? 'bg-purple-900/80 text-purple-200 border border-purple-700/50'
                          : item.media_type === 'movie'
                          ? 'bg-cyan-900/80 text-cyan-200 border border-cyan-700/50'
                          : 'bg-emerald-900/80 text-emerald-200 border border-emerald-700/50'
                      }`}
                    >
                      {item.media_type === 'series' ? 'TV Series' : item.media_type === 'movie' ? 'Movie' : 'Album'}
                    </span>

                    {/* Remove from watchlist button */}
                    <button
                      type="button"
                      onClick={(e) => handleRemove(item.media_id, e)}
                      disabled={isRemoving}
                      title="Remove from Watchlist"
                      className="pointer-events-auto p-1.5 rounded-full bg-black/60 hover:bg-rose-900/80 text-amber-400 hover:text-rose-200 border border-white/10 transition cursor-pointer backdrop-blur-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Center Play Button on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handlePlay(item, e)}
                      className="w-12 h-12 rounded-full bg-amber-600/90 hover:bg-amber-500 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-110 cursor-pointer"
                      title="Play Media"
                    >
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </button>
                  </div>

                  {/* Bottom Rating & Year Badge inside poster */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-xs text-white">
                    {item.rating && (
                      <span className="flex items-center gap-1 font-bold text-amber-400 text-xs drop-shadow-md">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{item.rating}</span>
                      </span>
                    )}
                    {item.year && (
                      <span className="text-[11px] text-slate-300 font-mono font-medium drop-shadow-md">
                        {item.year}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    {item.synopsis && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {item.synopsis}
                      </p>
                    )}
                  </div>

                  {/* Genres Tags */}
                  {genresList.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {genresList.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] text-slate-300 border border-slate-700/50"
                        >
                          {g.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
                    <span className="text-slate-500 font-mono text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{item.added_at ? new Date(item.added_at).toLocaleDateString() : 'Saved'}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handlePlay(item, e)}
                        className="px-2 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Stream Now"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span>Play</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePush(item, e)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                          isPushed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                        }`}
                        title="Push to Samba Share"
                      >
                        {isPushed ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-white" />
                            <span>Pushed</span>
                          </>
                        ) : (
                          <>
                            <HardDrive className="w-3 h-3 text-emerald-400" />
                            <span>SMB</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty Watchlist State */
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Bookmark className="w-8 h-8 fill-amber-400/30" />
          </div>
          <h3 className="text-lg font-bold text-white">Your Watchlist is Empty</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Mark movies, TV shows, and albums by clicking the bookmark button on any card in the Media Search library. They will be saved permanently in your SQLite database here.
          </p>
          <div className="pt-2">
            <button
              id="btn-empty-watchlist-explore"
              onClick={onNavigateToSearch}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition cursor-pointer inline-flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>Explore All Media Library</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
