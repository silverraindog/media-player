import React, { useState } from 'react';
import { Terminal, Copy, Trash2, CheckCircle2, AlertTriangle, Shield, RefreshCw, Filter, Search } from 'lucide-react';
import { SyncLog } from '../types';

interface ConsoleLogSectionProps {
  logs: SyncLog[];
  onClearLogs?: () => void;
}

export const ConsoleLogSection: React.FC<ConsoleLogSectionProps> = ({ logs, onClearLogs }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter((log) => {
    const matchesType = filterType === 'all' || log.status === filterType || log.type === filterType;
    const matchesSearch =
      log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.timestamp.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.status.toUpperCase()}] ${l.title}: ${l.details}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Application & Samba Console Logs</h3>
            <p className="text-xs text-slate-400">Real-time event stream, folder scans, network probes, and NFO sync actions.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            title="Copy logs to clipboard"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
          </button>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 transition cursor-pointer"
              title="Clear console logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {['all', 'success', 'connected', 'samba_pushed', 'warning', 'error'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1 rounded-lg font-medium transition whitespace-nowrap cursor-pointer ${
                filterType === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search log messages..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
      </div>

      {/* Log Feed Terminal Screen */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-2 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-slate-600">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No console logs match the selected filter.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isSuccess = log.status === 'success';
            const isError = log.status === 'error';
            const isWarning = log.status === 'warning';

            return (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border transition ${
                  isError
                    ? 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                    : isWarning
                    ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                    : 'bg-slate-900/80 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[10px]">[{log.timestamp}]</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isError
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isWarning
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="font-bold text-white">{log.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{log.type}</span>
                </div>
                <p className="text-slate-400 pl-4 border-l-2 border-indigo-500/40 text-[11px] leading-relaxed break-all">
                  {log.details}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
