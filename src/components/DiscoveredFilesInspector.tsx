import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  FileVideo,
  FileAudio,
  FileCode2,
  Image,
  Search,
  HardDrive,
  CheckCircle2,
  BookOpen,
  Disc,
  FileText,
  Filter,
  Zap,
  RotateCw,
} from 'lucide-react';
import { SambaShareNode } from '../types';
import { getFileCategory, getFileExtension } from '../utils/mediaExtractor';
import { thumbnailStorage } from '../utils/thumbnailStorage';

interface DiscoveredFilesInspectorProps {
  sambaTree: SambaShareNode[];
  onSelectNode?: (node: SambaShareNode) => void;
  onSyncTrigger?: () => void;
  onPopulateMediaLibrary?: () => void;
  isImporting?: boolean;
}

export const DiscoveredFilesInspector: React.FC<DiscoveredFilesInspectorProps> = ({
  sambaTree,
  onSelectNode,
  onSyncTrigger,
  onPopulateMediaLibrary,
  isImporting = false,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [extensionFilter, setExtensionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Flatten tree to get all discovered files with memoization
  const allDiscoveredFiles = useMemo(() => {
    const results: Array<{ node: SambaShareNode; category: string; fullPath: string; extension: string; fileCat: string | null }> = [];
    const stack: Array<{ nodes: SambaShareNode[]; parentCategory: string }> = [
      { nodes: sambaTree, parentCategory: 'General' },
    ];

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const node of current.nodes) {
        const cat = current.parentCategory === 'General' ? node.name : current.parentCategory;
        if (node.type === 'file') {
          const ext = getFileExtension(node.name);
          const fileCat = getFileCategory(node.name);
          results.push({ node, category: cat, fullPath: node.path, extension: ext, fileCat });
        }
        if (node.children && node.children.length > 0) {
          stack.push({ nodes: node.children, parentCategory: cat });
        }
      }
    }
    return results;
  }, [sambaTree]);

  const categories = ['all', ...Array.from(new Set(allDiscoveredFiles.map((f) => f.category)))];
  const uniqueExtensions = Array.from(new Set(allDiscoveredFiles.map((f) => f.extension).filter(Boolean)));

  const filteredFiles = allDiscoveredFiles.filter((item) => {
    const matchesCat = categoryFilter === 'all' || item.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchesExt = extensionFilter === 'all' || item.extension.toLowerCase() === extensionFilter.toLowerCase();
    const matchesSearch =
      item.node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.fullPath.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.extension.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesExt && matchesSearch;
  });

  const getFormatBadgeStyle = (cat: string | null) => {
    switch (cat) {
      case 'video':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60';
      case 'disc_images':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/60';
      case 'audio':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
      case 'books':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      case 'subtitles':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      case 'artwork':
        return 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800/60';
      case 'metadata':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const renderFileIcon = (cat: string | null) => {
    switch (cat) {
      case 'video':
        return <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'disc_images':
        return <Disc className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'audio':
        return <FileAudio className="w-4 h-4 text-cyan-400 shrink-0" />;
      case 'books':
        return <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'subtitles':
        return <FileText className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'metadata':
        return <FileCode2 className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'artwork':
        return <Image className="w-4 h-4 text-fuchsia-400 shrink-0" />;
      default:
        return <FileVideo className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">Discovered Files & Media Inspector</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold border border-emerald-500/20 font-mono">
                {filteredFiles.length} files ({uniqueExtensions.length} formats)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Scanned across all media extensions: Video containers, ISO disc images, Hi-Fi audio, e-books, subtitles, and NFO manifests.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onPopulateMediaLibrary && (
            <button
              id="inspector-populate-all-media-btn"
              onClick={onPopulateMediaLibrary}
              disabled={isImporting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              title="Populate All Media, TV Series, Movies, and Music Albums tabs with these discovered files"
            >
              {isImporting ? (
                <RotateCw className="w-3.5 h-3.5 text-white animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isImporting ? 'Importing Media...' : 'Import to All Media'}</span>
            </button>
          )}

          {onSyncTrigger && (
            <button
              id="inspector-sync-btn"
              onClick={onSyncTrigger}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              <FolderTree className="w-3.5 h-3.5 text-white" />
              <span>Re-Scan Share Folders</span>
            </button>
          )}
        </div>
      </div>

      {/* Extension Filters Row */}
      {uniqueExtensions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3 text-indigo-400" />
            <span>Format:</span>
          </span>
          <button
            onClick={() => setExtensionFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap cursor-pointer ${
              extensionFilter === 'all'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Extensions
          </button>
          {uniqueExtensions.map((ext) => {
            const count = allDiscoveredFiles.filter((f) => f.extension === ext).length;
            const isSelected = extensionFilter === ext;
            return (
              <button
                key={ext}
                onClick={() => setExtensionFilter(isSelected ? 'all' : ext)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-bold border border-emerald-400'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                }`}
              >
                <span>.{ext}</span>
                <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Categories & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-400 font-medium mr-1 shrink-0">Folder:</span>
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
            placeholder="Filter files or extensions..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Files Table / Grid */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <div className="flex items-center gap-6">
            <span className="w-48 sm:w-64 truncate">File Name & Format</span>
            <span className="hidden sm:inline">Folder Category</span>
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
              <p>No files match the active category and extension filters.</p>
            </div>
          ) : (
            filteredFiles.map(({ node, category, fullPath, extension, fileCat }, idx) => {
              const thumb = thumbnailStorage.get(fullPath) || thumbnailStorage.resolveForNode(node, fullPath);
              return (
                <div
                  key={node.id || idx}
                  onClick={() => onSelectNode && onSelectNode(node)}
                  className="px-4 py-2 flex items-center justify-between hover:bg-slate-900/80 transition cursor-pointer text-slate-300 group"
                >
                  <div className="flex items-center gap-3 truncate pr-4">
                    {/* Mini Cached Thumbnail Avatar */}
                    <div
                      className="w-7 h-10 rounded bg-slate-900 border border-slate-800 shrink-0 overflow-hidden relative shadow-sm"
                      style={{ backgroundColor: thumb.colorDominant || '#1e293b' }}
                      title={`Cached Thumbnail: ${thumb.title} (${thumb.resolutionLabel})`}
                    >
                      <img
                        src={thumb.thumbnailUrl}
                        alt={thumb.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                        <Zap className="w-3 h-3 text-emerald-400" />
                      </div>
                    </div>

                    <div className="truncate flex items-center gap-2">
                      <div className="font-semibold text-slate-200 truncate">{node.name}</div>
                      {extension && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border uppercase shrink-0 ${getFormatBadgeStyle(fileCat)}`}>
                          {extension}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-slate-400">
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

