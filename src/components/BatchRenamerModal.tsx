import React, { useState, useMemo } from 'react';
import { X, Sparkles, Check, FileText, ArrowRight, Sliders, RefreshCw, Layers } from 'lucide-react';
import { SambaShareNode } from '../types';

interface BatchRenamerModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: SambaShareNode[];
  onApplyRename: (renamedMap: Record<string, string>) => void;
}

export const BatchRenamerModal: React.FC<BatchRenamerModalProps> = ({
  isOpen,
  onClose,
  nodes,
  onApplyRename,
}) => {
  const [selectedNodeIds, setSelectedNodeIds] = useState<Record<string, boolean>>({});
  const [patternType, setPatternType] = useState<'standard' | 'movie' | 'custom'>('standard');
  const [customPattern, setCustomPattern] = useState('$TITLE - S01E$EP - $NAME');
  const [regexFind, setRegexFind] = useState('');
  const [regexReplace, setRegexReplace] = useState('');
  const [toLowerCase, setToLowerCase] = useState(false);
  const [replaceDots, setReplaceDots] = useState(true);

  // Flatten all files from the node tree
  const allFiles = useMemo(() => {
    const list: { node: SambaShareNode; path: string }[] = [];
    const walk = (items: SambaShareNode[], parentPath = '') => {
      items.forEach((item) => {
        const currentPath = parentPath ? `${parentPath}/${item.name}` : item.name;
        if (item.type === 'file') {
          list.push({ node: item, path: currentPath });
        }
        if (item.children && item.children.length > 0) {
          walk(item.children, currentPath);
        }
      });
    };
    walk(nodes);
    return list;
  }, [nodes]);

  // Toggle selection
  const toggleSelectAll = () => {
    if (Object.keys(selectedNodeIds).length === allFiles.length) {
      setSelectedNodeIds({});
    } else {
      const all: Record<string, boolean> = {};
      allFiles.forEach((f) => {
        all[f.node.id] = true;
      });
      setSelectedNodeIds(all);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedNodeIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Preview renamed files
  const previewRenames = useMemo(() => {
    const map: Record<string, { original: string; renamed: string }> = {};
    allFiles.forEach(({ node, path }) => {
      if (!selectedNodeIds[node.id]) return;

      const originalName = node.name;
      const ext = originalName.includes('.') ? originalName.split('.').pop() || 'mkv' : 'mkv';
      let cleanBase = originalName.replace(/\.[^/.]+$/, '');

      if (replaceDots) {
        cleanBase = cleanBase.replace(/[\._]/g, ' ');
      }

      // Extract SxxExx if present
      const sMatch = originalName.match(/s(\d{1,2})e(\d{1,2})/i) || originalName.match(/(\d{1,2})x(\d{1,2})/i);
      const seasonNum = sMatch ? sMatch[1].padStart(2, '0') : '01';
      const episodeNum = sMatch ? sMatch[2].padStart(2, '0') : '01';

      // Extract title / name cleanup
      let titlePart = cleanBase.split(/s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}/i)[0].trim();
      if (!titlePart) titlePart = cleanBase;

      let newName = originalName;

      if (patternType === 'standard') {
        newName = `${titlePart} - S${seasonNum}E${episodeNum} - ${cleanBase}.${ext}`;
      } else if (patternType === 'movie') {
        const yMatch = originalName.match(/(19\d{2}|20\d{2})/);
        const year = yMatch ? yMatch[1] : '2024';
        const pureTitle = titlePart.replace(year, '').trim();
        newName = `${pureTitle} (${year}).${ext}`;
      } else if (patternType === 'custom') {
        newName = customPattern
          .replace(/\$TITLE/g, titlePart)
          .replace(/\$S/g, seasonNum)
          .replace(/\$EP/g, episodeNum)
          .replace(/\$NAME/g, cleanBase) + `.${ext}`;
      }

      // Apply regex Find/Replace if provided
      if (regexFind.trim()) {
        try {
          const rx = new RegExp(regexFind, 'g');
          newName = newName.replace(rx, regexReplace);
        } catch {}
      }

      if (toLowerCase) {
        newName = newName.toLowerCase();
      }

      map[node.id] = { original: originalName, renamed: newName };
    });
    return map;
  }, [allFiles, selectedNodeIds, patternType, customPattern, regexFind, regexReplace, toLowerCase, replaceDots]);

  const handleExecuteBatch = () => {
    const renames: Record<string, string> = {};
    Object.entries(previewRenames).forEach(([id, val]) => {
      renames[id] = (val as any).renamed;
    });
    onApplyRename(renames);
    onClose();
  };

  if (!isOpen) return null;

  const selectedCount = Object.values(selectedNodeIds).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Samba Batch Media Renamer</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select files and apply standardized naming conventions and regex rules.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Pattern Builder Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Renaming Preset</label>
              <select
                value={patternType}
                onChange={(e) => setPatternType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="standard">TV Standard: Title - SxxExx - Name</option>
                <option value="movie">Movie Format: Title (Year)</option>
                <option value="custom">Custom Pattern</option>
              </select>
            </div>

            {patternType === 'custom' && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-slate-300">
                  Custom Pattern ($TITLE, $S, $EP, $NAME)
                </label>
                <input
                  type="text"
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Regex Find (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 720p|1080p"
                value={regexFind}
                onChange={(e) => setRegexFind(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Regex Replace</label>
              <input
                type="text"
                placeholder="replacement"
                value={regexReplace}
                onChange={(e) => setRegexReplace(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-6 pt-4">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceDots}
                  onChange={(e) => setReplaceDots(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-500"
                />
                <span>Replace dots/underscores with spaces</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={toLowerCase}
                  onChange={(e) => setToLowerCase(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-500"
                />
                <span>Lowercase filename</span>
              </label>
            </div>
          </div>

          {/* File Selector Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  Select All / None
                </button>
                <span className="text-xs text-slate-400">
                  {selectedCount} of {allFiles.length} files selected for batch rename
                </span>
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-3 w-10">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="p-3">Original Filename</th>
                    <th className="p-3">Path</th>
                    <th className="p-3">Preview Renamed Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {allFiles.map(({ node, path }) => {
                    const isSelected = Boolean(selectedNodeIds[node.id]);
                    const preview = previewRenames[node.id];
                    return (
                      <tr
                        key={node.id}
                        className={`hover:bg-slate-900/50 transition cursor-pointer ${
                          isSelected ? 'bg-indigo-950/20' : ''
                        }`}
                        onClick={() => toggleSelectOne(node.id)}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(node.id)}
                            className="rounded border-slate-700 bg-slate-950 text-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-slate-300 truncate max-w-[200px]">{node.name}</td>
                        <td className="p-3 text-slate-500 truncate max-w-[180px]">{path}</td>
                        <td className="p-3 text-emerald-400 font-bold truncate max-w-[220px]">
                          {preview ? preview.renamed : node.name}
                        </td>
                      </tr>
                    );
                  })}
                  {allFiles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                        No files discovered in current Samba share tree.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteBatch}
            disabled={selectedCount === 0}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Apply Batch Rename ({selectedCount} files)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
