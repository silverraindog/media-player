import React, { useState, useMemo } from 'react';
import { MediaMetadata } from '../types';
import { detectDuplicatesAndVersionBranches } from '../utils/duplicateDetector';
import { Trash2, AlertTriangle, GitMerge, FileCode2, HardDrive, CheckCircle2, Film } from 'lucide-react';

interface DeduplicationManagerTabProps {
  mediaLibrary: MediaMetadata[];
  onRemoveItem: (id: string) => void;
}

export const DeduplicationManagerTab: React.FC<DeduplicationManagerTabProps> = ({
  mediaLibrary,
  onRemoveItem
}) => {
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedLog, setDeletedLog] = useState<string[]>([]);

  // Get grouped items
  const groupedItems = useMemo(() => {
    const { enrichedItems } = detectDuplicatesAndVersionBranches(mediaLibrary);
    
    // Group them by their selectedVersionId or the first version's ID, or just find all items that have isMultiVersion
    const multiVersionItems = enrichedItems.filter(item => item.isMultiVersion && item.versions && item.versions.length > 1);
    
    // We want to display them side-by-side per group.
    // Each group will have a `groupId` (can just be the rootKey from the algorithm, or we group by versions[0].id)
    const map = new Map<string, MediaMetadata[]>();
    
    multiVersionItems.forEach(item => {
      // Use the first version's ID as the group key, since all items in a group share the same `versions` array
      const groupId = item.versions![0].id;
      if (!map.has(groupId)) {
        map.set(groupId, []);
      }
      map.get(groupId)!.push(item);
    });
    
    return Array.from(map.values());
  }, [mediaLibrary]);

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
          logs.push(`Successfully removed ID: ${id}`);
          onRemoveItem(id);
        } else {
          logs.push(`Failed to remove ID: ${id}`);
        }
      } catch (err) {
        logs.push(`Error removing ID: ${id}`);
      }
    }

    setDeletedLog((prev) => [...logs, ...prev]);
    setSelectedForDeletion(new Set());
    setIsDeleting(false);
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

  return (
    <div className="space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-300">
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
                Found {groupedItems.length} duplicate groups. Select redundant or lower-quality files to remove from the SQLite database.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={selectedForDeletion.size === 0 || isDeleting}
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition"
            >
              <Trash2 className={`w-4 h-4 ${isDeleting ? 'animate-pulse' : ''}`} />
              {isDeleting ? 'Deleting...' : `Delete Selected (${selectedForDeletion.size})`}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {groupedItems.map((group, idx) => {
          return (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-slate-950/50 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-bold text-slate-200">
                    Group {idx + 1} ({group.length} items)
                  </span>
                </div>
              </div>
              <div className="p-4 overflow-x-auto">
                <div className="flex gap-4 min-w-max">
                  {group.map((item) => {
                    const isSelected = selectedForDeletion.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`w-72 shrink-0 border rounded-xl overflow-hidden transition-all ${
                          isSelected ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-950/20' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="relative h-40 bg-slate-900 border-b border-slate-800">
                          <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute top-2 right-2">
                            <button
                              onClick={() => toggleSelection(item.id)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-rose-500 text-white' : 'bg-slate-800/80 border border-slate-700 text-transparent hover:border-slate-500'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1">
                            <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-white text-[10px] font-bold truncate">
                              {item.title}
                            </span>
                          </div>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-center text-slate-300">
                            <span className="text-slate-500">Year</span>
                            <span className="font-semibold">{item.year || 'Unknown'}</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-300">
                            <span className="text-slate-500">Rating</span>
                            <span className="font-semibold text-amber-400">★ {item.rating?.toFixed(1) || 'N/A'}</span>
                          </div>
                          <div className="flex flex-col gap-1 text-slate-300 pt-1 border-t border-slate-800/60">
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <FileCode2 className="w-3 h-3" />
                              Folder Path
                            </span>
                            <span className="font-mono text-[9px] text-indigo-300 break-all bg-indigo-950/30 p-1.5 rounded border border-indigo-900/50">
                              {item.matchedFilename || item.recommendedFolderStructure || 'Unknown Path'}
                            </span>
                          </div>
                          {item.recommendedFilenames && item.recommendedFilenames.length > 0 && (
                            <div className="flex flex-col gap-1 text-slate-300">
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                File Name
                              </span>
                              <span className="font-mono text-[9px] text-slate-400 break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                                {item.recommendedFilenames[0]}
                              </span>
                            </div>
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

