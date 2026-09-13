import React, { useState } from 'react';
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
} from 'lucide-react';
import { SambaConfig, SambaShareNode, SyncLog, MediaMetadata } from '../types';

interface SambaExplorerProps {
  sambaConfig: SambaConfig;
  sambaTree: SambaShareNode[];
  setSambaTree: React.Dispatch<React.SetStateAction<SambaShareNode[]>>;
  syncLogs: SyncLog[];
  onOpenDetails: (media: MediaMetadata) => void;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onRefreshSamba: () => void;
  isMountedInFinder?: boolean;
  mountedVolumeInfo?: any;
}

export const SambaExplorer: React.FC<SambaExplorerProps> = ({
  sambaConfig,
  sambaTree,
  setSambaTree,
  syncLogs,
  onOpenDetails,
  onOpenInNfoStudio,
  onRefreshSamba,
  isMountedInFinder = false,
  mountedVolumeInfo = null,
}) => {
  const [selectedNode, setSelectedNode] = useState<SambaShareNode | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({
    'root-movies': true,
    'root-shows': true,
    'root-music': true,
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Render tree node recursive
  const renderNode = (node: SambaShareNode, depth: number = 0) => {
    const isExpanded = expandedFolderIds[node.id];
    const isSelected = selectedNode?.id === node.id;
    const isFolder = node.type === 'folder';

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
            ) : node.name.endsWith('.nfo') || node.name.endsWith('.xml') ? (
              <FileCode2 className="w-4 h-4 text-purple-400 shrink-0" />
            ) : node.name.endsWith('.jpg') || node.name.endsWith('.png') ? (
              <Image className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : node.name.endsWith('.mp3') || node.name.endsWith('.flac') ? (
              <FileAudio className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />
            )}

            <span className="font-mono truncate">{node.name}</span>

            {node.hasNfo && (
              <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800/40">
                NFO
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium mb-3">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Samba Network Share Browser</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              //{sambaConfig.server}/{sambaConfig.share}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Live filesystem representation of your Samba media library. Inspect files, check NFO metadata status, and monitor sync transactions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                isMountedInFinder
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isMountedInFinder ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>{isMountedInFinder ? `Mounted in Finder (/Volumes/${sambaConfig.share})` : 'Not in /Volumes'}</span>
            </span>

            <button
              id="samba-refresh-btn"
              onClick={onRefreshSamba}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition shadow"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Check /Volumes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Explorer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Directory Tree */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Samba Directory Tree</h3>
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

        {/* Right: Selected Node Details & Live Sync Activity Logs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Selected Item Inspector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Folder className="w-4 h-4 text-cyan-400" />
                <span>Selected Object Details</span>
              </h3>
            </div>

            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-slate-200 font-bold font-mono text-sm break-all">
                    {selectedNode.name}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px] break-all">
                    Path: <span className="text-indigo-300">//{sambaConfig.server}/{sambaConfig.share}/{selectedNode.path}</span>
                  </div>
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                    <span>Type: <strong className="text-white uppercase">{selectedNode.type}</strong></span>
                    {selectedNode.size && <span>Size: <strong className="text-white">{selectedNode.size}</strong></span>}
                  </div>
                </div>

                {selectedNode.matchedMedia && (
                  <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {selectedNode.matchedMedia.title} ({selectedNode.matchedMedia.year})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[10px] font-bold">
                        ★ {selectedNode.matchedMedia.rating}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      {selectedNode.matchedMedia.overview}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => onOpenDetails(selectedNode.matchedMedia!)}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition"
                      >
                        Inspect Full Metadata
                      </button>
                      <button
                        onClick={() => onOpenInNfoStudio(selectedNode.matchedMedia!)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                      >
                        Edit in XML Studio
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 border border-slate-800 rounded-xl">
                Click any file or directory in the Samba tree to view details and metadata actions.
              </div>
            )}
          </div>

          {/* Sync & File Operation Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Network Sync Activity</h3>
              </div>
              <span className="text-[11px] text-slate-400">{syncLogs.length} events</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {syncLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-4 text-xs">
                  No sync events recorded yet.
                </div>
              ) : (
                syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 truncate">{log.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
