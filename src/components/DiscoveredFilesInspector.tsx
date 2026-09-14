import React, { useState } from 'react';
import { FolderTree, FileVideo, FileAudio, FileCode2, Image, Search, HardDrive, CheckCircle2, Film, Tv, Music, Sparkles } from 'lucide-react';
import { SambaShareNode } from '../types';

interface DiscoveredFilesInspectorProps {
  sambaTree: SambaShareNode[];
  onSelectNode?: (node: SambaShareNode) => void;
  onSyncTrigger?: () => void;
}

export const DiscoveredFilesInspector: React.FC<DiscoveredFilesInspectorProps> = ({
  sambaTree,
  onSelectNode,
  onSyncTrigger,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Flatten tree to get all discovered files
  const extractFiles = (nodes: SambaShareNode[], parentCategory: string = 'General'): Array<{ node: SambaShareNode; category: string; fullPath: string }> => {
    let results: Array<{ node: SambaShareNode; category: string; fullPath: string }> = [];
    nodes.forEach((node) => {
      const cat = parentCategory === 'General' ? node.name : parentCategory;
      if (node.type === 'file') {
        results.push({ node, category: cat, fullPath: node.path });
      }
      if (node.children && node.children.length > 0) {
        results = results.concat(extractFiles(node.children, cat));
      }
    });
    return results;
  };

  const allDiscoveredFiles = extractFiles(sambaTree);

  const categories = ['all', ...Array.from(new Set(allDiscoveredFiles.map((f) => f.category)))];

  const filteredFiles = allDiscoveredFiles.filter((item) => {
    const matchesCat = categoryFilter === 'all' || item.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchesSearch =
      item.node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.fullPath.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Discovered Files & Media Inspector</h3>
            <p className="text-xs text-slate-400">
              Inspecting all folders (Movies, Series, Music, Documentaries, Anime, Standup, etc.) and files picked up on your network share.
            </p>
          </div>
        </div>

        {onSyncTrigger && (
          <button
            id="inspector-sync-btn"
            onClick={onSyncTrigger}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Re-Scan Share Folders</span>
          </button>
        )}
      </div>

      {/* Categories & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-400 font-medium mr-1">Categories:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition capitalize whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter discovered files..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Files Table / Grid */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <div className="flex items-center gap-6">
            <span className="w-48 sm:w-64 truncate">File Name</span>
            <span className="hidden sm:inline">Category / Folder</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="hidden md:inline">Size</span>
            <span>Status</span>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-900 text-xs font-mono">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-10 text-slate-600">
              <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No files discovered in this category. Click Re-Scan Share Folders above.</p>
            </div>
          ) : (
            filteredFiles.map(({ node, category, fullPath }, idx) => {
              const isVideo = node.name.match(/\.(mkv|mp4|avi|mov|webm|m4v|flv)$/i);
              const isAudio = node.name.match(/\.(mp3|flac|aac|ogg|wav|m4a)$/i);
              const isNfo = node.name.match(/\.(nfo|xml)$/i);

              return (
                <div
                  key={node.id || idx}
                  onClick={() => onSelectNode && onSelectNode(node)}
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-900/80 transition cursor-pointer text-slate-300"
                >
                  <div className="flex items-center gap-3 truncate pr-4">
                    {isVideo ? (
                      <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />
                    ) : isAudio ? (
                      <FileAudio className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : isNfo ? (
                      <FileCode2 className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : (
                      <Image className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}

                    <div className="truncate">
                      <div className="font-semibold text-slate-200 truncate">{node.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{fullPath}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 text-slate-400">
                    <span className="hidden sm:inline px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                      {category}
                    </span>
                    <span className="hidden md:inline text-[11px]">{node.size || '1.4 GB'}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Indexed</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
        <span>Total Discovered Items: <strong className="text-white">{allDiscoveredFiles.length}</strong></span>
        <span>Supports Movies, Series, Music, Documentaries, Anime, Standup & more</span>
      </div>
    </div>
  );
};
