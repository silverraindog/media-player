import React, { useState, useMemo, useEffect } from 'react';
import {
  HardDrive,
  Folder,
  FolderOpen,
  FileVideo,
  FileAudio,
  FileCode2,
  Image,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Tv,
  Film,
  Music,
  FolderTree,
  RotateCw,
  FolderSearch,
  Terminal,
  Disc,
  BookOpen,
  FileText,
  Zap,
} from 'lucide-react';
import { SambaConfig, SambaShareNode, SyncLog, MediaMetadata, MediaScanExtensionConfig } from '../types';
import { DiscoveredFilesInspector } from './DiscoveredFilesInspector';
import { ConsoleLogSection } from './ConsoleLogSection';
import { MediaExtensionManager } from './MediaExtensionManager';
import { ThumbnailCacheBar } from './ThumbnailCacheBar';
import { CachedThumbnail } from './CachedThumbnail';
import { thumbnailStorage } from '../utils/thumbnailStorage';
import {
  DEFAULT_MEDIA_SCAN_CONFIG,
  getFileCategory,
  getFileExtension,
} from '../utils/mediaExtractor';

interface SambaExplorerProps {
  sambaConfig: SambaConfig;
  sambaTree: SambaShareNode[];
  setSambaTree: React.Dispatch<React.SetStateAction<SambaShareNode[]>>;
  syncLogs: SyncLog[];
  onOpenDetails: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onRefreshSamba: () => void;
  onSyncSamba?: (customScanPath?: string) => Promise<void>;
  onOpenClassifierModal?: () => void;
  onPopulateMediaLibrary?: () => void;
  isSyncing?: boolean;
  isImporting?: boolean;
  isMountedInFinder?: boolean;
  mountedVolumeInfo?: any;
  extensionConfig?: MediaScanExtensionConfig;
  onUpdateExtensionConfig?: (config: MediaScanExtensionConfig) => void;
}

export const SambaExplorer: React.FC<SambaExplorerProps> = ({
  sambaConfig,
  sambaTree,
  setSambaTree,
  syncLogs,
  onOpenDetails,
  onOpenInNfoStudio,
  onRefreshSamba,
  onSyncSamba,
  onOpenClassifierModal,
  onPopulateMediaLibrary,
  isSyncing = false,
  isImporting = false,
  isMountedInFinder = false,
  mountedVolumeInfo = null,
  extensionConfig,
  onUpdateExtensionConfig,
}) => {
  const [selectedNode, setSelectedNode] = useState<SambaShareNode | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({
    'root-movies': true,
    'root-shows': true,
    'root-music': true,
    'root-documentaries': true,
    'root-anime': true,
    'root-books': true,
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [customScanPath, setCustomScanPath] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'explorer' | 'files' | 'logs'>('explorer');

  // Extension scan configuration & active filter state
  const [localExtConfig, setLocalExtConfig] = useState<MediaScanExtensionConfig>(DEFAULT_MEDIA_SCAN_CONFIG);
  const activeExtConfig = extensionConfig || localExtConfig;
  const handleUpdateExtConfig = onUpdateExtensionConfig || setLocalExtConfig;
  const [activeFilterExtension, setActiveFilterExtension] = useState<string | null>(null);

  // Debounced pre-warm of thumbnail storage layer on mount / tree change
  useEffect(() => {
    if (sambaTree && sambaTree.length > 0) {
      const timer = setTimeout(() => {
        thumbnailStorage.prewarmSambaTree(sambaTree);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [sambaTree]);

  // Compute live discovered extension counts
  const discoveredExtensionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const walk = (nodes: SambaShareNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'file') {
          const ext = getFileExtension(n.name);
          if (ext) {
            counts[ext] = (counts[ext] || 0) + 1;
          }
        }
        if (n.children && n.children.length > 0) {
          walk(n.children);
        }
      });
    };
    walk(sambaTree);
    return counts;
  }, [sambaTree]);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const renderFileIcon = (fileName: string) => {
    const category = getFileCategory(fileName);
    switch (category) {
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
      case 'artwork':
        return <Image className="w-4 h-4 text-fuchsia-400 shrink-0" />;
      case 'metadata':
        return <FileCode2 className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <FileVideo className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  // Render tree node recursive
  const renderNode = (node: SambaShareNode, depth: number = 0) => {
    const isExpanded = expandedFolderIds[node.id];
    const isSelected = selectedNode?.id === node.id;
    const isFolder = node.type === 'folder';
    const ext = !isFolder ? getFileExtension(node.name) : null;
    const matchesActiveExt = activeFilterExtension ? ext === activeFilterExtension : true;
    const category = !isFolder ? getFileCategory(node.name) : null;
    const isMediaFile = ['video', 'disc_images', 'audio', 'books'].includes(category || '');
    const thumb = (!isFolder && isMediaFile) || node.hasPoster || node.matchedMedia
      ? thumbnailStorage.get(node.path || node.name)
      : null;

    return (
      <div key={node.id} className="select-none text-xs">
        <div
          id={`tree-node-${node.id}`}
          onClick={() => {
            setSelectedNode(node);
            if (isFolder) toggleFolder(node.id);
          }}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-3 rounded-lg cursor-pointer transition ${
            isSelected
              ? 'bg-indigo-600/30 text-white border border-indigo-500/40'
              : !isFolder && activeFilterExtension && !matchesActiveExt
              ? 'opacity-40 hover:opacity-80 hover:bg-slate-800/50 text-slate-400'
              : !isFolder && activeFilterExtension && matchesActiveExt
              ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-500/40 font-semibold'
              : 'hover:bg-slate-800/80 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-amber-400 shrink-0" />
              )
            ) : thumb ? (
              <div
                className="w-3.5 h-4.5 rounded overflow-hidden bg-slate-800 shrink-0 border border-slate-700/60 shadow-xs"
                title={`Cached Thumbnail: ${thumb.title}`}
              >
                <img
                  src={thumb.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              </div>
            ) : (
              renderFileIcon(node.name)
            )}

            <span className="font-mono truncate">{node.name}</span>

            {ext && !isFolder && (
              <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 text-[10px] font-mono border border-slate-800 uppercase">
                .{ext}
              </span>
            )}

            {node.hasNfo && (
              <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800/40">
                NFO
              </span>
            )}

            {node.hasPoster && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 text-[9px] font-bold border border-emerald-800/40 flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5 text-emerald-400" />
                <span>POSTER</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            {node.size && <span>{node.size}</span>}
          </div>
        </div>

        {isFolder && isExpanded && node.children && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium mb-3">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Samba Network Share Browser</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {sambaConfig.server ? `//${sambaConfig.server}/${sambaConfig.share}` : 'Configure Samba Share'}
            </h2>
            <p className="mt-1 text-sm text-slate-300 max-w-2xl">
              Live filesystem representation of your Samba media library. Recursively scans any folder structure (series, movies, films, or flat files) and pulls canonical metadata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                isMountedInFinder
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isMountedInFinder ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isMountedInFinder ? `Mounted in /Volumes/${sambaConfig.share}` : 'Not in /Volumes'}</span>
            </span>

            {/* Smart Classifier & Folder Review Button */}
            {onOpenClassifierModal && (
              <button
                id="samba-open-classifier-btn"
                onClick={onOpenClassifierModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 border border-purple-800/50 text-xs font-semibold shadow transition cursor-pointer"
                title="Review regex category detection rules, confidence thresholds, and select specific folders to import"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Classify Folders & Rules</span>
              </button>
            )}

            {/* Sync Share Media Button */}
            <button
              id="samba-sync-share-btn"
              onClick={() => onSyncSamba && onSyncSamba(customScanPath || undefined)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition cursor-pointer disabled:opacity-50"
              title="Recursively scan the Samba share, detect movies/series across any folder layout, and pull metadata"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Scanning & Fetching Details...' : 'Sync Share & Media Details'}</span>
            </button>

            <button
              id="samba-refresh-btn"
              onClick={onRefreshSamba}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition shadow cursor-pointer"
              title="Re-check /Volumes mount status"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Check /Volumes</span>
            </button>
          </div>
        </div>

        {/* Custom Folder & Advanced Scan Path Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400 flex-wrap">
            <FolderSearch className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Scan custom mount or directory path:</span>
            <input
              id="samba-custom-scan-path"
              type="text"
              value={customScanPath}
              onChange={(e) => setCustomScanPath(e.target.value)}
              placeholder={`Default: /Volumes/${sambaConfig.share || 'media'}`}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 w-64"
            />
          </div>

          <div className="text-[11px] text-slate-400">
            <span>Supports any folder naming (e.g. <em>Series</em>, <em>Anime</em>, <em>Films</em>, without requiring &quot;TV Shows&quot;).</span>
          </div>
        </div>
      </div>

      {/* Media Format & Extension Controller */}
      <MediaExtensionManager
        config={activeExtConfig}
        onChangeConfig={handleUpdateExtConfig}
        activeFilterExtension={activeFilterExtension}
        onSelectFilterExtension={setActiveFilterExtension}
        discoveredExtensionCounts={discoveredExtensionCounts}
        onTriggerScan={() => onSyncSamba && onSyncSamba(customScanPath || undefined)}
      />

      {/* Sub-navigation for Discovered Files, Directory Explorer, and Console Logs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('files')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSubTab === 'files'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <FolderTree className="w-4 h-4 text-emerald-300" />
          <span>1. Discovered Files Inspector (What it's picking up)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('explorer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSubTab === 'explorer'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <HardDrive className="w-4 h-4 text-indigo-300" />
          <span>2. Directory Tree Browser</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeSubTab === 'logs'
              ? 'bg-purple-600 text-white shadow'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4 text-purple-300" />
          <span>3. Application Console Logs</span>
        </button>
      </div>

      {activeSubTab === 'files' && (
        <DiscoveredFilesInspector
          sambaTree={sambaTree}
          onSelectNode={(node) => {
            setSelectedNode(node);
            if (node.matchedMedia) {
              onOpenDetails(node.matchedMedia);
            }
          }}
          onSyncTrigger={() => onSyncSamba && onSyncSamba(customScanPath || undefined)}
          onPopulateMediaLibrary={onPopulateMediaLibrary}
          isImporting={isImporting}
        />
      )}

      {activeSubTab === 'logs' && (
        <ConsoleLogSection logs={syncLogs} />
      )}

      {activeSubTab === 'explorer' && (
        <>
          {/* Discovered Files preview card at top of explorer as requested */}
          <DiscoveredFilesInspector
            sambaTree={sambaTree}
            onSelectNode={(node) => {
              setSelectedNode(node);
              if (node.matchedMedia) {
                onOpenDetails(node.matchedMedia);
              }
            }}
            onSyncTrigger={() => onSyncSamba && onSyncSamba(customScanPath || undefined)}
            onPopulateMediaLibrary={onPopulateMediaLibrary}
            isImporting={isImporting}
          />

          {/* Dedicated Thumbnail Metadata Storage Layer Telemetry & Control Bar */}
          <ThumbnailCacheBar
            sambaTree={sambaTree}
            onSelectNode={(node) => setSelectedNode(node)}
          />

          {/* Explorer Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Directory Tree */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Samba Directory Tree (Movies, Series, Music, Documentaries, Anime, etc.)</h3>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Protocol: SMB 3.1.1
                  </span>
                </div>

                {/* Tree Viewer */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[460px] overflow-y-auto space-y-1">
                  {sambaTree.map((rootNode) => renderNode(rootNode, 0))}
                </div>
              </div>

              {/* Quick Helper / Status Footer */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Full read/write permissions active</span>
                </span>
                <span className="font-mono text-indigo-400">
                  {sambaConfig.baseMountPath}
                </span>
              </div>
            </div>

            {/* Right: Selected Node Details & Console Logs */}
            <div className="lg:col-span-5 space-y-6">
              {/* Selected Item Inspector with Cached Thumbnail Storage Preview */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Folder className="w-4 h-4 text-cyan-400" />
                    <span>Selected Object Details</span>
                  </h3>
                  {selectedNode && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      ID: {selectedNode.id}
                    </span>
                  )}
                </div>

                {selectedNode ? (
                  <div className="space-y-3.5 text-xs">
                    {/* Path & Technical Info */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="text-slate-200 font-bold font-mono text-sm break-all flex items-start justify-between gap-2">
                        <span>{selectedNode.name}</span>
                        {selectedNode.type === 'file' && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono uppercase shrink-0">
                            .{getFileExtension(selectedNode.name)}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] break-all">
                        Path: <span className="text-indigo-300">//{sambaConfig.server}/{sambaConfig.share}/{selectedNode.path}</span>
                      </div>
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                        <span>Type: <strong className="text-white uppercase">{selectedNode.type}</strong></span>
                        {selectedNode.size && <span>Size: <strong className="text-white">{selectedNode.size}</strong></span>}
                      </div>
                    </div>

                    {/* Cached Thumbnail Storage Card */}
                    {(() => {
                      const thumb = thumbnailStorage.resolveForNode(selectedNode);
                      return (
                        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                            <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs">
                              <Zap className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Storage Layer Thumbnail</span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-800/40">
                              ⚡ Cached (0ms)
                            </span>
                          </div>

                          <div className="flex gap-3.5 items-start">
                            <CachedThumbnail
                              node={selectedNode}
                              size="md"
                              showBadge={true}
                              showMetadata={false}
                              onClick={() => {
                                if (selectedNode.matchedMedia) {
                                  onOpenDetails(selectedNode.matchedMedia);
                                }
                              }}
                            />

                            <div className="flex-1 space-y-2 min-w-0">
                              <div>
                                <h5 className="font-bold text-white text-sm truncate font-sans">
                                  {thumb.title}
                                </h5>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  Resolution: <span className="text-slate-200">{thumb.resolutionLabel}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-slate-500 block text-[9px] uppercase">Format</span>
                                  <span className="text-slate-300 uppercase">{thumb.format}</span>
                                </div>
                                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-slate-500 block text-[9px] uppercase">Source</span>
                                  <span className="text-indigo-300 truncate block capitalize">
                                    {thumb.source.replace('_', ' ')}
                                  </span>
                                </div>
                                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-slate-500 block text-[9px] uppercase">Tier</span>
                                  <span className="text-emerald-300 truncate block">
                                    {thumb.cacheTier === 'memory_lru' ? 'Memory LRU' : thumb.cacheTier === 'persistent_local' ? 'LocalStorage' : 'SQLite DB'}
                                  </span>
                                </div>
                                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-slate-500 block text-[9px] uppercase">Hits</span>
                                  <span className="text-white font-bold">{thumb.hitCount}</span>
                                </div>
                              </div>

                              {/* Dominant Color Swatch */}
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span>Color:</span>
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-slate-700 shadow-sm"
                                  style={{ backgroundColor: thumb.colorDominant }}
                                  title={`Dominant Color: ${thumb.colorDominant}`}
                                />
                                <span className="font-mono text-[10px] text-slate-300">{thumb.colorDominant}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                            {selectedNode.matchedMedia ? (
                              <>
                                <button
                                  onClick={() => onOpenDetails(selectedNode.matchedMedia!)}
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer"
                                >
                                  Inspect Full Metadata
                                </button>
                                <button
                                  onClick={() => onOpenInNfoStudio(selectedNode.matchedMedia!)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                                >
                                  XML Studio
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  thumbnailStorage.resolveForNode(selectedNode);
                                  setSelectedNode({ ...selectedNode });
                                }}
                                className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3 text-slate-400" />
                                <span>Re-cache Thumbnail Metadata</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 border border-slate-800 rounded-xl">
                    Click any file or directory in the Samba tree to view details and metadata actions.
                  </div>
                )}
              </div>

              {/* Console Log Preview Card */}
              <ConsoleLogSection logs={syncLogs} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
