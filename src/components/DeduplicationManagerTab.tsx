import React, { useState, useMemo } from 'react';
import { MediaMetadata } from '../types';
import { detectDuplicatesAndVersionBranches } from '../utils/duplicateDetector';
import { Trash2, GitMerge, FileCode2, HardDrive, CheckCircle2, Film, Sparkles, ShieldCheck, ArrowRight, Layers } from 'lucide-react';

interface DeduplicationManagerTabProps {
  mediaLibrary: MediaMetadata[];
  onRemoveItem: (id: string) => void;
}

interface QualityEvaluation {
  resolutionRank: number; // 4 = 4K/2160p, 3 = 1080p, 2 = 720p, 1 = 480p, 0 = unknown
  resolutionLabel: string;
  sizeBytes: number;
  sizeLabel: string;
  totalScore: number;
}

function evaluateQuality(item: MediaMetadata): QualityEvaluation {
  const hints = [
    item.title,
    item.matchedFilename || '',
    ...(item.recommendedFilenames || []),
    item.recommendedFolderStructure || '',
    item.folderPath || '',
    item.path || '',
  ].join(' ').toLowerCase();

  // Resolution detection
  let resolutionRank = 0;
  let resolutionLabel = 'Standard Resolution';
  if (/2160p|4k|uhd|hdr10|remux\s*2160/i.test(hints)) {
    resolutionRank = 4;
    resolutionLabel = '4K UHD (2160p)';
  } else if (/1080p|fhd|bluray|bdrip/i.test(hints)) {
    resolutionRank = 3;
    resolutionLabel = '1080p Full HD';
  } else if (/720p|hd/i.test(hints)) {
    resolutionRank = 2;
    resolutionLabel = '720p HD';
  } else if (/480p|dvd|sd/i.test(hints)) {
    resolutionRank = 1;
    resolutionLabel = '480p SD';
  }

  // File size detection
  let sizeBytes = 0;
  let sizeLabel = 'Size unindexed';
  const sizeMatch = hints.match(/(\d+(?:\.\d+)?)\s*(gb|mb|kb|g|m)\b/i);
  if (sizeMatch) {
    const val = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    if (unit.startsWith('g')) {
      sizeBytes = val * 1024 * 1024 * 1024;
      sizeLabel = `${val.toFixed(1)} GB`;
    } else if (unit.startsWith('m')) {
      sizeBytes = val * 1024 * 1024;
      sizeLabel = `${val.toFixed(1)} MB`;
    } else if (unit.startsWith('k')) {
      sizeBytes = val * 1024;
      sizeLabel = `${val.toFixed(0)} KB`;
    }
  }

  // Score prioritizes highest resolution first, then highest discovered file size, then metadata rating
  const totalScore = (resolutionRank * 1_000_000_000_000) + sizeBytes + ((item.rating || 0) * 1_000_000);

  return {
    resolutionRank,
    resolutionLabel,
    sizeBytes,
    sizeLabel,
    totalScore,
  };
}

export const DeduplicationManagerTab: React.FC<DeduplicationManagerTabProps> = ({
  mediaLibrary,
  onRemoveItem
}) => {
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAutoMerging, setIsAutoMerging] = useState(false);
  const [autoMergeToast, setAutoMergeToast] = useState<string | null>(null);
  const [deletedLog, setDeletedLog] = useState<string[]>([]);

  // Group duplicate and multi-version items
  const groupedItems = useMemo(() => {
    const { enrichedItems } = detectDuplicatesAndVersionBranches(mediaLibrary);
    const multiVersionItems = enrichedItems.filter(item => item.isMultiVersion && item.versions && item.versions.length > 1);
    const map = new Map<string, MediaMetadata[]>();
    
    multiVersionItems.forEach(item => {
      const groupId = item.versions![0].id;
      if (!map.has(groupId)) {
        map.set(groupId, []);
      }
      map.get(groupId)!.push(item);
    });
    
    return Array.from(map.values());
  }, [mediaLibrary]);

  // Pre-calculate best version and redundant duplicates for each group
  const groupAnalysis = useMemo(() => {
    return groupedItems.map((group) => {
      const scored = group.map((item) => ({
        item,
        quality: evaluateQuality(item),
      }));
      scored.sort((a, b) => b.quality.totalScore - a.quality.totalScore);
      const best = scored[0];
      const redundant = scored.slice(1);
      return {
        group,
        best,
        redundant,
        allScored: scored,
      };
    });
  }, [groupedItems]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedForDeletion);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedForDeletion(next);
  };

  const handleBulkDelete = async () => {
    if (selectedForDeletion.size === 0) return;
    setIsDeleting(true);
    const logs: string[] = [];

    for (const id of selectedForDeletion) {
      try {
        const res = await fetch(`/api/db/media/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          logs.push(`Successfully removed redundant media ID: ${id}`);
          onRemoveItem(id);
        } else {
          logs.push(`Failed to remove media ID: ${id}`);
        }
      } catch (err) {
        logs.push(`Error removing media ID: ${id}`);
      }
    }

    setDeletedLog((prev) => [...logs, ...prev]);
    setSelectedForDeletion(new Set());
    setIsDeleting(false);
  };

  const handleAutoMerge = async () => {
    if (groupAnalysis.length === 0) return;
    setIsAutoMerging(true);
    const logs: string[] = [];
    let mergedCount = 0;

    for (const analysis of groupAnalysis) {
      const { best, redundant } = analysis;
      for (const red of redundant) {
        try {
          const res = await fetch(`/api/db/media/${encodeURIComponent(red.item.id)}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            logs.push(
              `Auto-Merged "${red.item.title}": Kept best version "${best.item.title}" (${best.quality.resolutionLabel} • ${best.quality.sizeLabel}), removed redundant duplicate ID ${red.item.id}.`
            );
            onRemoveItem(red.item.id);
            mergedCount++;
          } else {
            logs.push(`Could not delete duplicate ID ${red.item.id}`);
          }
        } catch (err) {
          logs.push(`Failed to auto-merge duplicate ID ${red.item.id}`);
        }
      }
    }

    setDeletedLog((prev) => [...logs, ...prev]);
    setIsAutoMerging(false);
    setAutoMergeToast(
      `Auto-Merge complete! Successfully consolidated ${mergedCount} redundant duplicate(s), preserving the highest resolution and largest file size versions.`
    );
    setTimeout(() => setAutoMergeToast(null), 5000);
  };

  if (groupedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 rounded-2xl border border-slate-800">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Duplicates Detected</h2>
        <p className="text-slate-400 text-sm max-w-md text-center">
          Your media library is clean. No multi-version branches or duplicate franchise entries were found.
        </p>
      </div>
    );
  }

  const totalRedundantCount = groupAnalysis.reduce((sum, g) => sum + g.redundant.length, 0);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-300">
      {/* Toast Notification */}
      {autoMergeToast && (
        <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{autoMergeToast}</span>
          </div>
          <button
            onClick={() => setAutoMergeToast(null)}
            className="text-emerald-400 hover:text-white px-2 py-0.5 rounded bg-emerald-900/60 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <GitMerge className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Deduplication Manager
              </h1>
              <p className="text-sm text-slate-400">
                Found {groupedItems.length} duplicate groups with {totalRedundantCount} redundant version(s).
                Auto-Merge automatically keeps the highest resolution and largest file size version.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Auto-Merge Button */}
            <button
              id="dedup-btn-automerge"
              disabled={isAutoMerging || isDeleting || totalRedundantCount === 0}
              onClick={handleAutoMerge}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-950/40 cursor-pointer active:scale-95"
              title="Automatically merge duplicates based on the highest resolution or file size discovered"
            >
              <Sparkles className={`w-4 h-4 ${isAutoMerging ? 'animate-spin' : ''}`} />
              <span>{isAutoMerging ? 'Merging Duplicates...' : `Auto-Merge All (${totalRedundantCount})`}</span>
            </button>

            {/* Manual Selected Deletion */}
            <button
              id="dedup-btn-bulk-delete"
              disabled={selectedForDeletion.size === 0 || isDeleting || isAutoMerging}
              onClick={handleBulkDelete}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer active:scale-95"
            >
              <Trash2 className={`w-4 h-4 ${isDeleting ? 'animate-pulse' : ''}`} />
              <span>{isDeleting ? 'Deleting...' : `Delete Selected (${selectedForDeletion.size})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Deduplication Logs */}
      {deletedLog.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs font-mono max-h-36 overflow-y-auto space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Activity History</span>
          </div>
          {deletedLog.map((log, i) => (
            <div key={i} className="text-emerald-400/90 truncate">
              {log}
            </div>
          ))}
        </div>
      )}

      {/* Duplicate Groups List */}
      <div className="space-y-6">
        {groupAnalysis.map((analysis, groupIdx) => {
          const { group, best, redundant, allScored } = analysis;
          return (
            <div key={groupIdx} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-slate-950/70 px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-slate-200">
                    Group {groupIdx + 1}: {best.item.title}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {group.length} versions
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Best Quality Pick:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-bold text-[11px]">
                    {best.quality.resolutionLabel} • {best.quality.sizeLabel}
                  </span>
                </div>
              </div>

              <div className="p-5 overflow-x-auto">
                <div className="flex gap-4 min-w-max">
                  {allScored.map(({ item, quality }) => {
                    const isBest = item.id === best.item.id;
                    const isSelected = selectedForDeletion.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`w-72 shrink-0 border rounded-xl overflow-hidden transition-all flex flex-col justify-between ${
                          isBest
                            ? 'border-emerald-500/80 ring-1 ring-emerald-500/50 bg-emerald-950/15'
                            : isSelected
                            ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-950/25'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="relative h-40 bg-slate-900 border-b border-slate-800 overflow-hidden">
                            <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover opacity-60" />
                            
                            {/* Best Badge / Selection Checkbox */}
                            <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                              {isBest ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shadow flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 fill-white" />
                                  Highest Quality Kept
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/90 text-slate-950 text-[10px] font-bold shadow flex items-center gap-1">
                                  Redundant Duplicate
                                </span>
                              )}
                              
                              <button
                                onClick={() => toggleSelection(item.id)}
                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-rose-500 text-white'
                                    : 'bg-slate-900/80 border border-slate-700 text-transparent hover:border-slate-500'
                                }`}
                                title={isSelected ? 'Deselect for deletion' : 'Select for deletion'}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1">
                              <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-white text-[10px] font-bold truncate">
                                {item.title}
                              </span>
                            </div>
                          </div>

                          <div className="p-3.5 space-y-2 text-xs">
                            {/* Quality Metrics */}
                            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-[10px] uppercase font-bold">Resolution</span>
                                <span className={`font-bold ${isBest ? 'text-emerald-400' : 'text-slate-300'}`}>
                                  {quality.resolutionLabel}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-[10px] uppercase font-bold">File Size</span>
                                <span className="font-mono text-cyan-300 font-semibold">
                                  {quality.sizeLabel}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-slate-300 pt-1">
                              <span className="text-slate-500">Year / Rating</span>
                              <span className="font-semibold text-slate-300">
                                {item.year || 'Unknown'} • <span className="text-amber-400">★ {item.rating?.toFixed(1) || 'N/A'}</span>
                              </span>
                            </div>

                            <div className="flex flex-col gap-1 text-slate-300 pt-1 border-t border-slate-800/60">
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <FileCode2 className="w-3 h-3 text-indigo-400" />
                                File / Path
                              </span>
                              <span className="font-mono text-[9px] text-indigo-300 break-all bg-indigo-950/30 p-1.5 rounded border border-indigo-900/50">
                                {item.matchedFilename || item.recommendedFolderStructure || 'Unknown Path'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer Action */}
                        <div className="p-3 pt-0">
                          {isBest ? (
                            <div className="w-full py-1.5 px-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-center text-[11px] font-bold flex items-center justify-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Preserved in Auto-Merge</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleSelection(item.id)}
                              className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                  : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{isSelected ? 'Marked for Deletion' : 'Select for Removal'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
