import React, { useState, useEffect, useMemo } from 'react';
import {
  Film,
  Tv,
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
import { MediaMetadata, TrackMetadata, SambaConfig } from '../types';
import { sanitizeSambaPath } from '../utils/pathSanitizer';

interface FranchisesTabProps {
  mediaLibrary: MediaMetadata[];
  onPlayMedia: (media: MediaMetadata, track?: TrackMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  sambaConfig: SambaConfig;
}

export const FranchisesTab: React.FC<FranchisesTabProps> = ({
  mediaLibrary,
  onPlayMedia,
  onOpenDetails,
  sambaConfig,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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

  // Filter media from Franchises and Collections folders - includes both movies and series
  const franchiseMedia = useMemo(() => {
    if (!Array.isArray(mediaLibrary)) return [];
    return mediaLibrary.filter((media) => {
      // Include items from Franchises folder
      const path = media.recommendedFolderStructure || '';
      return path.startsWith('Franchises/') || 
             path.includes('/Franchises/') ||
             path.startsWith('Collections/') ||
             path.includes('/Collections/');
    });
  }, [mediaLibrary]);

  // Extract all unique categories safely
  const allCategories = useMemo(() => {
    const list: string[] = [];
    franchiseMedia.forEach((m) => {
      if (m && Array.isArray(m.categories) && m.categories.length > 0) {
        m.categories.forEach((c) => {
          if (c && typeof c === 'string') list.push(c);
        });
      } else {
        list.push('Franchises');
      }
    });
    return Array.from(new Set(list));
  }, [franchiseMedia]);

  const filteredFranchises = useMemo(() => {
    return franchiseMedia.filter((item) => {
      if (!item) return false;
      const title = (item.title || '').toLowerCase();
      const overview = (item.overview || '').toLowerCase();
      const queryLower = (query || '').toLowerCase().trim();
      const categories = Array.isArray(item.categories) ? item.categories : [];

      // 1. Check Query
      if (queryLower) {
        const matchesQuery =
          title.includes(queryLower) ||
          overview.includes(queryLower) ||
          categories.some((c) => c?.toLowerCase().includes(queryLower));
        if (!matchesQuery) return false;
      }

      // 2. Check Category Filter
      const matchesCategory =
        selectedCategory === 'all' || categories.includes(selectedCategory);
      
      if (!matchesCategory) return false;

      // 3. Check Smart Playlist Rules
      if (activePlaylist && activePlaylist.rules) {
        const { rules } = activePlaylist;
        
        if (rules.category && !categories.some((c) => c?.toLowerCase().includes(rules.category!.toLowerCase()))) return false;
        if (rules.yearMin && (item.year || 0) < rules.yearMin) return false;
        if (rules.yearMax && (item.year || 0) > rules.yearMax) return false;
        if (rules.minRating && (item.rating || 0) < rules.minRating) return false;
      }

      return true;
    });
  }, [franchiseMedia, query, selectedCategory, activePlaylist]);

  const getSafeSharePath = (item: MediaMetadata) => {
    const rawFolder = item.recommendedFolderStructure || ('Franchises/' + (item.title || 'Collection'));
    const safeFolder = sanitizeSambaPath(rawFolder);
    const server = sambaConfig?.server || '192.168.1.100';
    const share = sambaConfig?.share || 'media';
    return `//${server}/${share}/${safeFolder}`;
  };

  const handleExportM3U = (playlist: SmartPlaylist) => {
    const items = filteredFranchises.filter((item) => {
      if (!item || !playlist.rules) return false;
      const categories = Array.isArray(item.categories) ? item.categories : [];
      if (playlist.rules.category && !categories.some((c) => c?.toLowerCase().includes(playlist.rules.category!.toLowerCase()))) return false;
      if (playlist.rules.yearMin && (item.year || 0) < playlist.rules.yearMin) return false;
      if (playlist.rules.yearMax && (item.year || 0) > playlist.rules.yearMax) return false;
      if (playlist.rules.minRating && (item.rating || 0) < playlist.rules.minRating) return false;
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
  };

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 shadow-md p-4">
        <div className="flex items-center justify-between h-12">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Franchises & Collections</h2>
            <p className="text-sm text-slate-400">Movies and series from your franchise collections</p>
          </div>
          
          {/* Search */}
          <div className="relative w-64">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search franchises..."
              className="w-full pl-3 pr-10 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="all">All Categories</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Media Grid */}
      <div className="p-4">
        {filteredFranchises.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p>No franchises found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFranchises.map((item) => (
              <div key={item.id} className="bg-slate-800 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                    {item.type === 'movie' ? 'Movie' : 'Series'}
                  </span>
                </div>
                
                <p className="text-sm text-slate-400 mb-2">{item.year || 'Unknown'}</p>
                
                {item.categories && item.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {item.categories.slice(0, 3).map((cat) => (
                      <span key={cat} className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                        {cat}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => onPlayMedia(item)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => onOpenDetails(item)}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Playlists */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4">Playlists</h3>
        {playlists.length === 0 ? (
          <p className="text-slate-500 text-sm">No playlists created yet</p>
        ) : (
          <div className="space-y-2">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                <div>
                  <h4 className="text-sm font-semibold text-white">{playlist.name}</h4>
                  <p className="text-xs text-slate-400">{playlist.rules?.category || 'All categories'}</p>
                </div>
                <button
                  onClick={() => handleExportM3U(playlist)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Export M3U
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
