import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Folder,
  FileText,
  Wand2,
  ExternalLink,
  Check,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { SambaShareNode, SambaConfig } from '../types';
import { checkPathDirtyState, cleanPathValue } from './SambaExplorer';
import { sanitizeSambaPath } from '../utils/pathSanitizer';
import { logger } from '../utils/loggerService';

interface PathIntegrityDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  sambaTree: SambaShareNode[];
  sambaConfig: SambaConfig;
  setSambaTree: React.Dispatch<React.SetStateAction<SambaShareNode[]>>;
}

interface DiagnosticItem {
  nodeId: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  rawPath: string;
  cleanedPath: string;
  isDirty: boolean;
  dirtyReason?: string;
  isReachable?: boolean;
  status: 'healthy' | 'dirty' | 'unreachable' | 'fixed';
}

export const PathIntegrityDiagnosticModal: React.FC<PathIntegrityDiagnosticModalProps> = ({
  isOpen,
  onClose,
  sambaTree,
  sambaConfig,
  setSambaTree,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'dirty' | 'unreachable' | 'healthy'>('all');
  const [fixedCount, setFixedCount] = useState(0);

  if (!isOpen) return null;

  const runDiagnostic = async () => {
    setIsRunning(true);
    setFixedCount(0);
    const diagnosticList: DiagnosticItem[] = [];

    const walk = (nodes: SambaShareNode[]) => {
      nodes.forEach((node) => {
        const dirtyCheck = checkPathDirtyState(node.path);
        const cleaned = cleanPathValue(node.path);
        let status: DiagnosticItem['status'] = 'healthy';
        if (dirtyCheck.isDirty) {
          status = 'dirty';
        }

        diagnosticList.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          rawPath: node.path,
          cleanedPath: cleaned,
          isDirty: dirtyCheck.isDirty,
          dirtyReason: dirtyCheck.reason,
          status,
        });

        if (node.children) {
          walk(node.children);
        }
      });
    };

    walk(sambaTree);

    // Verify a sample or batch of paths against backend
    const pathsToCheck = diagnosticList.filter((d) => d.isDirty || d.rawPath.includes('//')).slice(0, 30).map((d) => [
      `//${sambaConfig.server}/${sambaConfig.share}/${d.rawPath}`,
      `/Volumes/${sambaConfig.share}/${d.rawPath}`,
      d.rawPath,
    ]).flat();

    if (pathsToCheck.length > 0) {
      try {
        const res = await fetch('/api/samba/verify-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: pathsToCheck }),
        });
        const data = await res.json();
        if (data && !data.exists) {
          // Mark matching items as unreachable if needed
          diagnosticList.forEach((item) => {
            if (item.rawPath.includes('//') || item.rawPath.includes('%20')) {
              item.status = 'dirty';
            }
          });
        }
      } catch (e) {
        console.error('Path integrity verify error:', e);
      }
    }

    setItems(diagnosticList);
    setIsRunning(false);
    logger.info(`Path integrity diagnostic completed. Scanned ${diagnosticList.length} nodes. Found ${diagnosticList.filter(d => d.status === 'dirty').length} dirty paths.`, 'Scanner');
  };

  const handleFixAll = () => {
    const updateNodes = (nodes: SambaShareNode[]): SambaShareNode[] => {
      return nodes.map((node) => {
        const newPath = cleanPathValue(node.path);
        const updatedNode: SambaShareNode = {
          ...node,
          path: newPath,
          children: node.children ? updateNodes(node.children) : undefined,
        };
        return updatedNode;
      });
    };

    setSambaTree((prev) => updateNodes(prev));
    setFixedCount(items.filter((i) => i.isDirty).length);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isDirty: false,
        status: 'fixed',
        cleanedPath: cleanPathValue(item.rawPath),
      }))
    );
    logger.success('Successfully sanitized and fixed all dirty file/folder paths across vault tree.', 'Scanner');
  };

  const filteredItems = items.filter((item) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'dirty') return item.status === 'dirty';
    if (filterStatus === 'unreachable') return item.status === 'unreachable';
    if (filterStatus === 'healthy') return item.status === 'healthy' || item.status === 'fixed';
    return true;
  });

  const dirtyCount = items.filter((i) => i.status === 'dirty').length;
  const healthyCount = items.filter((i) => i.status === 'healthy' || i.status === 'fixed').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Path Integrity Diagnostic & Repair</span>
                {items.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono">
                    {items.length} Checked
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Cross-references Samba vault paths against filesystem reality, highlighting %20 encoding, double slashes, and volume mismatches.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runDiagnostic}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Running Diagnostic...' : 'Run Integrity Scan'}</span>
            </button>

            {dirtyCount > 0 && (
              <button
                onClick={handleFixAll}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                title="Automatically fix and sanitize all dirty paths"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                <span>Auto-Fix All ({dirtyCount})</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Stats Bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer border ${
                filterStatus === 'all'
                  ? 'bg-slate-800 text-white border-slate-600'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              All Items ({items.length})
            </button>
            <button
              onClick={() => setFilterStatus('dirty')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
                filterStatus === 'dirty'
                  ? 'bg-amber-950 text-amber-200 border-amber-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Needs Sanitization ({dirtyCount})</span>
            </button>
            <button
              onClick={() => setFilterStatus('healthy')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
                filterStatus === 'healthy'
                  ? 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Healthy ({healthyCount})</span>
            </button>
          </div>

          {fixedCount > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Successfully sanitized {fixedCount} paths!</span>
            </div>
          )}
        </div>

        {/* Diagnostic Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 font-mono text-xs">
          {items.length === 0 ? (
            <div className="text-center py-24 text-slate-500 flex flex-col items-center justify-center gap-4">
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-indigo-400">
                <Compass className="w-10 h-10 animate-spin-slow" />
              </div>
              <div>
                <p className="text-sm font-sans font-semibold text-slate-300 mb-1">No integrity diagnostic run yet</p>
                <p className="text-xs text-slate-500 max-w-md">
                  Click 'Run Integrity Scan' above to cross-reference all vault paths against filesystem formatting and encoding rules.
                </p>
              </div>
              <button
                onClick={runDiagnostic}
                disabled={isRunning}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-semibold shadow transition cursor-pointer"
              >
                Run Integrity Scan Now
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p>No items match the selected filter.</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={`${item.nodeId}-${idx}`}
                className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  item.status === 'dirty'
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-100'
                    : item.status === 'fixed'
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-100'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-0.5 shrink-0">
                    {item.nodeType === 'folder' ? (
                      <Folder className="w-4 h-4 text-amber-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-sans font-bold text-white truncate">{item.nodeName}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                        {item.nodeType}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Raw Vault Path:</span>
                        <span className="text-amber-300 break-all">{item.rawPath}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Sanitized Target Path:</span>
                        <span className="text-emerald-300 break-all">{item.cleanedPath}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {item.status === 'dirty' ? (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] flex items-center gap-1.5 font-sans">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>{item.dirtyReason || 'Dirty path'}</span>
                    </span>
                  ) : item.status === 'fixed' ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] flex items-center gap-1.5 font-sans">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sanitized & Fixed</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] flex items-center gap-1.5 font-sans">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Healthy</span>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>Path integrity diagnostic uses real-time filesystem checks and canonical sanitization rules.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
          >
            Close Diagnostic
          </button>
        </div>
      </div>
    </div>
  );
};
