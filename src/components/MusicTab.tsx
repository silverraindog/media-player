import React, { useState, useEffect, useMemo } from 'react';
import {
  Music,
  Play,
  Disc,
  ListMusic,
  FolderOpen,
  Search,
  Sparkles,
  Info,
  ExternalLink,
  Copy,
  Check,
  Radio,
  Headphones,
  Mic2,
  Download,
} from 'lucide-react';
import { MediaMetadata, TrackMetadata, SambaConfig, SmartPlaylist } from '../types';
import { SmartPlaylistSidebar } from './SmartPlaylistSidebar';
import { sanitizeSambaPath } from '../utils/pathSanitizer';

interface MusicTabProps {
  mediaLibrary: MediaMetadata[];
  onPlayMedia: (media: MediaMetadata, track?: TrackMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  sambaConfig: SambaConfig;
}

export const MusicTab: React.FC<MusicTabProps> = ({
  mediaLibrary,
  onPlayMedia,
  onOpenDetails,
  sambaConfig,
}) => {
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<SmartPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const res = await fetch('/api/playlists');
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists)) {
        setPlaylists(data.playlists);
      }
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  };

  const handleCreatePlaylist = async (newPlaylist: Omit<SmartPlaylist, 'id' | 'createdAt'>) => {
    const playlist: SmartPlaylist = {
      ...newPlaylist,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlist),
      });
      const data = await res.json();
      if (data.success) {
        setPlaylists([playlist, ...playlists]);
      }
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPlaylists(playlists.filter((p) => p.id !== id));
        if (selectedPlaylistId === id) setSelectedPlaylistId(null);
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const activePlaylist = useMemo(() => 
    playlists.find(p => p.id === selectedPlaylistId) || null
  , [playlists, selectedPlaylistId]);

  // Filter media items that are albums or audio books with defensive checks
  const musicItems = useMemo(() => {
    if (!Array.isArray(mediaLibrary)) return [];
    return mediaLibrary.filter((m) => {
      if (!m) return false;
      const folder = (m.recommendedFolderStructure || '').toLowerCase();
      const genres = Array.isArray(m.genres) ? m.genres : [];
      return (
        m.type === 'album' ||
        folder.includes('music') ||
        folder.includes('audio') ||
        genres.some((g) => typeof g === 'string' && /music|audio|album|rock|electronic|pop|jazz|classical/i.test(g))
      );
    });
  }, [mediaLibrary]);

  // Extract all unique genres safely
  const allGenres = useMemo(() => {
    const list: string[] = [];
    musicItems.forEach((m) => {
      if (m && Array.isArray(m.genres) && m.genres.length > 0) {
        m.genres.forEach((g) => {
          if (g && typeof g === 'string') list.push(g);
        });
      } else {
        list.push('Music');
      }
    });
    return Array.from(new Set(list));
  }, [musicItems]);

  const filteredMusic = useMemo(() => {
    return musicItems.filter((item) => {
      if (!item) return false;
      const title = (item.title || '').toLowerCase();
      const overview = (item.overview || '').toLowerCase();
      const queryLower = (query || '').toLowerCase().trim();
      const artists = Array.isArray(item.artists) ? item.artists : [];
      const genres = Array.isArray(item.genres) ? item.genres : [];

      // 1. Check Query
      if (queryLower) {
        const matchesQuery =
          title.includes(queryLower) ||
          artists.some((a) => (a || '').toLowerCase().includes(queryLower)) ||
          overview.includes(queryLower);
        if (!matchesQuery) return false;
      }

      // 2. Check Tab Genre Filter
      const matchesTabGenre =
        selectedGenre === 'all' || genres.includes(selectedGenre);
      
      if (!matchesTabGenre) return false;

      // 3. Check Smart Playlist Rules
      if (activePlaylist && activePlaylist.rules) {
        const { rules } = activePlaylist;
        
        if (rules.genre && !genres.some((g) => (g || '').toLowerCase().includes(rules.genre!.toLowerCase()))) return false;
        if (rules.artist && !artists.some((a) => (a || '').toLowerCase().includes(rules.artist!.toLowerCase()))) return false;
        if (rules.yearMin && (item.year || 0) < rules.yearMin) return false;
        if (rules.yearMax && (item.year || 0) > rules.yearMax) return false;
        if (rules.minRating && (item.rating || 0) < rules.minRating) return false;
      }

      return true;
    });
  }, [musicItems, query, selectedGenre, activePlaylist]);

  const getSafeSharePath = (item: MediaMetadata) => {
    const rawFolder = item.recommendedFolderStructure || ('Music/' + (item.title || 'Album'));
    const safeFolder = sanitizeSambaPath(rawFolder);
    const server = sambaConfig?.server || '192.168.1.100';
    const share = sambaConfig?.share || 'media';
    return `//${server}/${share}/${safeFolder}`;
  };

  const handleExportM3U = (playlist: SmartPlaylist) => {
    const items = musicItems.filter((item) => {
      if (!item || !playlist.rules) return false;
      const { rules } = playlist;
      const genres = Array.isArray(item.genres) ? item.genres : [];
      const artists = Array.isArray(item.artists) ? item.artists : [];
      if (rules.genre && !genres.some((g) => (g || '').toLowerCase().includes(rules.genre!.toLowerCase()))) return false;
      if (rules.artist && !artists.some((a) => (a || '').toLowerCase().includes(rules.artist!.toLowerCase()))) return false;
      if (rules.yearMin && (item.year || 0) < rules.yearMin) return false;
      if (rules.yearMax && (item.year || 0) > rules.yearMax) return false;
      if (rules.minRating && (item.rating || 0) < rules.minRating) return false;
      return true;
    });

    let m3uContent = '#EXTM3U\n';
    items.forEach(item => {
      const tracks = Array.isArray(item.tracks) && item.tracks.length > 0 ? item.tracks : [{ title: item.title || 'Track', duration: '0:00' }];
      tracks.forEach(track => {
        const artists = Array.isArray(item.artists) ? item.artists : [];
        const artist = artists.length > 0 ? artists.join(', ') : 'Various Artists';
        const title = track?.title || item.title || 'Track';
        const durationSec = 0;
        m3uContent += `#EXTINF:${durationSec},${artist} - ${title}\n`;
        const sharePath = getSafeSharePath(item);
        m3uContent += `${sharePath}/${track?.title || 'album'}.mp3\n`;
      });
    });

    const blob = new Blob([m3uContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(playlist.name || 'playlist').replace(/\s+/g, '_')}.m3u`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyPath = (item: MediaMetadata) => {
    const path = getSafeSharePath(item);
    navigator.clipboard.writeText(path);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-900/60 via-slate-900 to-indigo-950/80 border border-emerald-500/30 p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Music className="w-48 h-48 text-emerald-400" />
        </div>
        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
            <Headphones className="w-3.5 h-3.5" /> Lossless Audio & Music Vault
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Music & Discography Hub
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Manage your high-resolution music albums, audiobooks, lossless flac masters, and artist discographies streamed directly from your Samba network share.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Component */}
        <SmartPlaylistSidebar
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          onSelect={(p) => setSelectedPlaylistId(p ? p.id : null)}
          onCreate={handleCreatePlaylist}
          onDelete={handleDeletePlaylist}
          onExport={handleExportM3U}
        />

        <div className="flex-1 space-y-6">
          {/* Controls Bar: Search & Genre Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-lg">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search albums, artists, composers, or track titles..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
              />
            </div>

            {/* Genre Pill Selectors */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedGenre('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedGenre === 'all'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Genres ({musicItems.length})
              </button>
              {allGenres.slice(0, 6).map((genre) => (
                <button
                  key={genre}
                  onClick={() => setSelectedGenre(genre)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    selectedGenre === genre
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Active Playlist Header if any */}
          {activePlaylist && (
            <div className="flex items-center justify-between bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white leading-none">{activePlaylist.name}</h2>
                  <p className="text-[10px] text-emerald-400 mt-1 uppercase tracking-widest font-bold">Smart Collection</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400 px-2 py-1 rounded bg-slate-950 border border-slate-800">
                  {filteredMusic.length} Items Match
                </span>
                <button
                  onClick={() => handleExportM3U(activePlaylist)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[10px] font-bold transition border border-emerald-500/20"
                >
                  <Download className="w-3 h-3" />
                  EXPORT M3U
                </button>
              </div>
            </div>
          )}

          {/* Music Albums Grid */}
          {filteredMusic.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <Disc className="w-8 h-8 animate-spin-slow" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No Music Albums Found</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No music albums matched your filter. Use the <strong className="text-slate-300">Search & Metadata Downloader</strong> tab to scan and import audio albums from your Samba share.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredMusic.map((album) => {
                const tracks = Array.isArray(album.tracks) ? album.tracks : [];
                const artists = Array.isArray(album.artists) ? album.artists : [];
                const directors = Array.isArray(album.directors) ? album.directors : [];
                const artistDisplay = artists.length > 0 ? artists.join(', ') : (directors.length > 0 ? directors.join(', ') : 'Various Artists');

                return (
                  <div
                    key={album.id}
                    className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 flex flex-col"
                  >
                    {/* Album Art Cover Header */}
                    <div className="relative aspect-square overflow-hidden bg-slate-950">
                      <img
                        src={album.posterUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'}
                        alt={album.title || 'Music Album'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                      {/* Top Badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                        <Disc className="w-3 h-3 animate-spin-slow" />
                        <span>{album.year || 'Album'} • {tracks.length || 1} Tracks</span>
                      </div>

                      {/* Play Album Overlay Button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                        <button
                          onClick={() => onPlayMedia(album, tracks[0])}
                          className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition cursor-pointer"
                          title="Play Album"
                        >
                          <Play className="w-6 h-6 fill-white ml-0.5" />
                        </button>
                      </div>
                    </div>

                    {/* Album Body Info */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition truncate">
                            {album.title || 'Untitled Album'}
                          </h3>
                          <span className="text-xs font-mono text-emerald-400 shrink-0">
                            ★ {(album.rating ?? 0).toFixed(1)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate flex items-center gap-1">
                          <Mic2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{artistDisplay}</span>
                        </p>
                        <p className="text-xs text-slate-400 line-clamp-2 pt-1">
                          {album.overview || 'Audio album imported from Samba network share.'}
                        </p>
                      </div>

                      {/* Tracklist Preview */}
                      {tracks.length > 0 && (
                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 pb-1 border-b border-slate-800">
                            <span className="flex items-center gap-1">
                              <ListMusic className="w-3 h-3 text-emerald-400" /> Featured Tracks
                            </span>
                            <span>{tracks.length} songs</span>
                          </div>
                          <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                            {tracks.slice(0, 3).map((track, idx) => (
                              <button
                                key={track?.trackNumber || idx}
                                onClick={() => onPlayMedia(album, track)}
                                className="w-full text-left flex items-center justify-between p-1 rounded hover:bg-slate-800/80 text-[11px] text-slate-300 transition cursor-pointer group/track"
                              >
                                <span className="truncate pr-2 group-hover/track:text-emerald-300">
                                  {track?.trackNumber || (idx + 1)}. {track?.title || 'Track'}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {track?.duration || '0:00'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                        <button
                          onClick={() => onOpenDetails(album)}
                          className="flex items-center gap-1.5 text-slate-300 hover:text-white transition cursor-pointer font-semibold"
                        >
                          <Info className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Album Details</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyPath(album)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Copy Samba share path"
                          >
                            {copiedId === album.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => onPlayMedia(album, tracks[0])}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-600/30"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Play</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
