import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Copy,
  Trash2,
  Download,
  Filter,
  Search,
  Check,
  AlertTriangle,
  CheckCircle2,
  X,
  Code,
  ShieldCheck,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { pathDebugLogger, PathDebugLogEntry } from '../utils/debugPathLogger';

interface JsonPathInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JsonPathInspectorModal: React.FC<JsonPathInspectorModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<PathDebugLogEntry[]>([]);
  const [filterDirty, setFilterDirty] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLogs(pathDebugLogger.getLogs());
    const unsubscribe = pathDebugLogger.subscribe((updated) => {
      setLogs([...updated]);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterDirty !== null && log.isDirty !== filterDirty) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.nodeName.toLowerCase().includes(q) ||
      log.rawPath.toLowerCase().includes(q) ||
      log.resolvedPath.toLowerCase().includes(q) ||
      log.sanitizedPath.toLowerCase().includes(q) ||
      (log.dirtyReason && log.dirtyReason.toLowerCase().includes(q))
    );
  });

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(filteredLogs, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samba-path-debug-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>JSON Path & Scan Inspector</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono">
                  {logs.length} Log Entries
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Real-time JSON inspection of every raw path, resolved Samba URL, sanitization check, and scan event.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="Copy filtered logs as JSON"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied JSON!' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-xs font-semibold border border-indigo-500/40 transition cursor-pointer"
              title="Download full JSON debug log file"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => pathDebugLogger.clear()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 text-xs font-semibold border border-rose-500/40 transition cursor-pointer"
              title="Clear all debug logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar / Filters */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterDirty(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                filterDirty === null
                  ? 'bg-slate-800 text-white border-slate-600'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              All Paths ({logs.length})
            </button>
            <button
              onClick={() => setFilterDirty(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
                filterDirty === false
                  ? 'bg-emerald-950 text-emerald-200 border-emerald-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sanitized ({logs.filter((l) => !l.isDirty).length})</span>
            </button>
            <button
              onClick={() => setFilterDirty(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
                filterDirty === true
                  ? 'bg-amber-950 text-amber-200 border-amber-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Dirty Paths ({logs.filter((l) => l.isDirty).length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search raw path, node name..."
              className="bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 w-full font-mono"
            />
          </div>
        </div>

        {/* Logs List / JSON Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-3">
              <Terminal className="w-10 h-10 text-slate-600 animate-pulse" />
              <p>No path debug logs recorded yet. Trigger a scan or sync to inspect paths.</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-4 rounded-xl border transition shadow-md ${
                  log.isDirty
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-100'
                    : 'bg-slate-950/80 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold uppercase tracking-wider">
                      {log.eventType}
                    </span>
                    <span className="text-slate-400">{log.timestamp}</span>
                    <span className="text-slate-300 font-sans font-semibold">[{log.nodeType}: {log.nodeName}]</span>
                  </div>
                  <div>
                    {log.isDirty ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Dirty: {log.dirtyReason || 'Unsanitized'}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Sanitized</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] mb-2">
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block mb-1 uppercase tracking-wider text-[10px]">Raw Path Scanned:</span>
                    <span className="text-amber-300 break-all">{log.rawPath || '(empty)'}</span>
                  </div>
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 block mb-1 uppercase tracking-wider text-[10px]">Resolved / Sanitized Path:</span>
                    <span className="text-emerald-300 break-all">{log.resolvedPath || log.sanitizedPath || '(empty)'}</span>
                  </div>
                </div>

                {log.details && Object.keys(log.details).length > 0 && (
                  <details className="mt-2 text-[10px] text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
                    <summary className="cursor-pointer text-cyan-400 font-semibold hover:underline">
                      View Full JSON Event Payload
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-[10px] text-slate-300 font-mono">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>VConsole is also active on screen for full global console debugging.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
