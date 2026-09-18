import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Settings2, 
  ChevronRight, 
  Filter,
  Music4
} from 'lucide-react';
import { SmartPlaylist, MediaMetadata, SambaConfig } from '../types';

interface SmartPlaylistSidebarProps {
  playlists: SmartPlaylist[];
  onSelect: (playlist: SmartPlaylist | null) => void;
  selectedPlaylistId: string | null;
  onDelete: (id: string) => void;
  onCreate: (playlist: Omit<SmartPlaylist, 'id' | 'createdAt'>) => void;
  onExport: (playlist: SmartPlaylist) => void;
}

export const SmartPlaylistSidebar: React.FC<SmartPlaylistSidebarProps> = ({
  playlists,
  onSelect,
  selectedPlaylistId,
  onDelete,
  onCreate,
  onExport,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRules, setNewRules] = useState({
    genre: '',
    artist: '',
    yearMin: '',
    yearMax: '',
    minRating: '',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    onCreate({
      name: newName,
      rules: {
        genre: newRules.genre || undefined,
        artist: newRules.artist || undefined,
        yearMin: newRules.yearMin ? parseInt(newRules.yearMin) : undefined,
        yearMax: newRules.yearMax ? parseInt(newRules.yearMax) : undefined,
        minRating: newRules.minRating ? parseFloat(newRules.minRating) : undefined,
      }
    });
    setNewName('');
    setNewRules({ genre: '', artist: '', yearMin: '', yearMax: '', minRating: '' });
    setIsCreating(false);
  };

  return (
    <div className="w-full lg:w-72 flex flex-col gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">
            <Music4 className="w-4 h-4 text-emerald-400" />
            <span>Smart Playlists</span>
          </h3>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="p-1 rounded-lg hover:bg-slate-800 text-emerald-400 transition"
            title="Create Smart Playlist"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="space-y-3 bg-slate-950 p-3 rounded-xl border border-emerald-500/20 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Awesome Mix"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Genre</label>
                <input
                  type="text"
                  value={newRules.genre}
                  onChange={(e) => setNewRules({...newRules, genre: e.target.value})}
                  placeholder="Rock, Jazz..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Artist</label>
                <input
                  type="text"
                  value={newRules.artist}
                  onChange={(e) => setNewRules({...newRules, artist: e.target.value})}
                  placeholder="Pink Floyd..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">From Year</label>
                  <input
                    type="number"
                    value={newRules.yearMin}
                    onChange={(e) => setNewRules({...newRules, yearMin: e.target.value})}
                    placeholder="1990"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">To Year</label>
                  <input
                    type="number"
                    value={newRules.yearMax}
                    onChange={(e) => setNewRules({...newRules, yearMax: e.target.value})}
                    placeholder="2024"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Min Rating (0-10)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={newRules.minRating}
                  onChange={(e) => setNewRules({...newRules, minRating: e.target.value})}
                  placeholder="8.5"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-lg shadow-emerald-900/20"
            >
              Create Playlist
            </button>
          </form>
        )}

        <div className="space-y-1.5">
          <button
            onClick={() => onSelect(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              selectedPlaylistId === null 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="font-semibold">All Music</span>
          </button>

          {playlists.map((playlist) => (
            <div key={playlist.id} className="group relative">
              <button
                onClick={() => onSelect(playlist)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                  selectedPlaylistId === playlist.id 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className={`w-1.5 h-1.5 rounded-full ${selectedPlaylistId === playlist.id ? 'bg-white' : 'bg-emerald-500/50'}`} />
                  <span className="truncate">{playlist.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(playlist);
                    }}
                    className="p-1 hover:text-emerald-300"
                    title="Export as M3U"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(playlist.id);
                    }}
                    className="p-1 hover:text-rose-400"
                    title="Delete Playlist"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </button>
            </div>
          ))}

          {playlists.length === 0 && !isCreating && (
            <div className="py-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-600">
                <Music4 className="w-5 h-5" />
              </div>
              <p className="text-[10px] text-slate-500 px-4">Create your first smart playlist using metadata filters.</p>
            </div>
          )}
        </div>
      </div>

      {selectedPlaylistId && playlists.find(p => p.id === selectedPlaylistId) && (
        <div className="bg-emerald-950/20 border border-emerald-500/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
            <Settings2 className="w-3 h-3" />
            <span>Active Filter Rules</span>
          </div>
          <div className="space-y-1">
            {Object.entries(playlists.find(p => p.id === selectedPlaylistId)!.rules).map(([key, value]) => (
              value && (
                <div key={key} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 capitalize">{key}:</span>
                  <span className="text-emerald-300 font-mono font-bold">{value}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
