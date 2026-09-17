import React from 'react';
import { GitBranch } from 'lucide-react';
import { MediaMetadata } from '../../types';

interface VersionHubProps {
  media: MediaMetadata;
  handleSelectVersionBranch: (versionId: string) => void;
}

export const VersionHub: React.FC<VersionHubProps> = ({ media, handleSelectVersionBranch }) => {
  if (!media.versions || media.versions.length <= 1) return null;

  return (
    <div className="space-y-3 bg-slate-950/90 border border-indigo-500/40 rounded-xl p-4 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-950 border border-indigo-500/40 text-indigo-400">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <span>Multi-Version Selector & Series Branches</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                {media.versions.length} Detected Branches
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Select which version branch to load for playback, season inspection, and metadata generation.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-medium">Active:</span>
          <span className="px-2 py-0.5 rounded bg-indigo-900/60 border border-indigo-600/50 text-indigo-200 text-xs font-bold truncate max-w-[180px]">
            {media.versions.find((v) => v.id === (media.selectedVersionId || media.id))?.branchName || media.title}
          </span>
        </div>
      </div>

      {/* Version selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
        {media.versions.map((ver) => {
          const isActive = ver.id === (media.selectedVersionId || media.id);
          return (
            <button
              key={ver.id}
              type="button"
              onClick={() => handleSelectVersionBranch(ver.id)}
              className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition cursor-pointer group ${
                isActive
                  ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-500 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 hover:border-indigo-500/50'
              }`}
            >
              <div className="w-10 h-14 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-700">
                <img
                  src={ver.posterUrl || media.posterUrl}
                  alt={ver.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold truncate ${isActive ? 'text-indigo-300' : 'text-white'}`}>
                    {ver.branchName || ver.title}
                  </span>
                  {isActive && <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
                </div>

                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  {ver.year && <span>{ver.year}</span>}
                  {ver.rating && <span>★ {ver.rating.toFixed(1)}</span>}
                </div>
                
                <div className="text-[9px] font-mono text-slate-500 truncate">
                  {ver.folderPath || ver.title}
                </div>
              </div>

              <div className="shrink-0">
                {isActive ? (
                  <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold">Active</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-800 group-hover:bg-indigo-900 text-slate-300 group-hover:text-white text-[10px] font-semibold border border-slate-700">
                    Switch
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
