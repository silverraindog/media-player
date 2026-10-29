import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  RotateCw,
  Folder,
  FileText,
  CornerDownRight,
  Filter,
  Search,
  ExternalLink,
  Code,
  FileCode,
  Layers,
} from 'lucide-react';
import { debugPathResolution, DebugPathResolutionReport, OsStringArtifactReport } from '../utils/tauriBridge';

interface DebugPathResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath?: string;
  autoRun?: boolean;
}

export const DebugPathResolutionModal: React.FC<DebugPathResolutionModalProps> = ({
  isOpen,
  onClose,
  targetPath = '',
  autoRun = true,
}) => {
  const [currentPath, setCurrentPath] = useState(targetPath || '/Volumes/media');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<DebugPathResolutionReport | null>(null);
  const [artifactFilter, setArtifactFilter] = useState<'all' | 'suspicious' | 'dirs' | 'files' | 'appledouble'>('all');
  const [artifactSearch, setArtifactSearch] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (targetPath) {
      setCurrentPath(targetPath);
      if (autoRun && isOpen) {
        runDiagnostic(targetPath);
      }
    } else if (isOpen && !report) {
      runDiagnostic(currentPath);
    }
  }, [isOpen, targetPath]);

  if (!isOpen) return null;

  const runDiagnostic = async (pathToInspect?: string) => {
    const p = pathToInspect || currentPath;
    setIsLoading(true);
    try {
      const res = await debugPathResolution(p);
      setReport(res);
    } catch (e: any) {
      console.error('[DebugPathResolutionModal] Error executing debug_path_resolution:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredArtifacts = (report?.artifacts || []).filter((art) => {
    const matchesSearch =
      !artifactSearch ||
      art.name.toLowerCase().includes(artifactSearch.toLowerCase()) ||
      art.raw_os_string.toLowerCase().includes(artifactSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (artifactFilter === 'suspicious') {
      return art.has_hidden_control_chars || art.has_trailing_space || !art.is_valid_unicode;
    }
    if (artifactFilter === 'appledouble') {
      return art.is_appledouble;
    }
    if (artifactFilter === 'dirs') {
      return art.is_dir;
    }
    if (artifactFilter === 'files') {
      return art.is_file;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-amber-950/70 overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Diagnostic: <code>debug_path_resolution</code>
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-950 text-amber-300 border border-amber-500/40">
                  OsString Artifact Inspector
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Full <code>fs::metadata</code> and <code>fs::read_dir</code> audit revealing hidden filesystem character mismatches
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runDiagnostic()}
              placeholder="/Volumes/media/Franchises/Battlestar Galactica/..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500 placeholder-slate-600"
            />
          </div>
          <button
            onClick={() => runDiagnostic()}
            disabled={isLoading || !currentPath}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-lg shadow-amber-600/30 cursor-pointer shrink-0"
          >
            {isLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
            <span>{isLoading ? 'Running Stat...' : 'Run Diagnostic'}</span>
          </button>
        </div>

        {/* Report Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {report && (
            <>
              {/* Primary Stat Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                  report.exists
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {report.exists ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        {report.exists ? 'Target Exists on Local Filesystem' : 'Target NOT FOUND on Local Filesystem (ENOENT)'}
                      </span>
                      <span
                        className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold ${
                          report.exists
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-900/60 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {report.is_dir ? 'Directory' : report.is_file ? 'File' : 'Missing'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono break-all">
                      Resolved Path: <code>{report.resolved_path}</code>
                    </p>
                    {report.parent_path && (
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>Parent folder:</span>
                        <span className="text-slate-300">{report.parent_path}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            report.parent_exists
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {report.parent_exists ? 'Parent Exists' : 'Parent Missing'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stat Telemetry Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    fs::metadata Permissions
                  </span>
                  <span className="font-mono text-xs text-slate-200 block truncate" title={report.permissions}>
                    {report.permissions || 'N/A'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Items Count
                  </span>
                  <span className="font-mono text-xs text-amber-300 font-bold block">
                    {report.file_count} items found
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    File Size
                  </span>
                  <span className="font-mono text-xs text-slate-200 block">
                    {report.size_bytes > 0 ? `${(report.size_bytes / (1024 * 1024)).toFixed(2)} MB` : '0 B'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Inspected Directory
                  </span>
                  <span className="font-mono text-[10px] text-cyan-300 block truncate" title={report.inspected_dir}>
                    {report.inspected_dir}
                  </span>
                </div>
              </div>

              {/* Diagnostic Notes Feed */}
              {report.diagnostic_notes && report.diagnostic_notes.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                    Backend Diagnostic Notes & Warnings
                  </span>
                  <div className="space-y-1 text-xs">
                    {report.diagnostic_notes.map((note, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg font-mono text-[11px] flex items-start gap-2 ${
                          note.includes('WARNING')
                            ? 'bg-amber-950/30 text-amber-200 border border-amber-500/30'
                            : note.includes('error')
                            ? 'bg-rose-950/30 text-rose-200 border border-rose-500/30'
                            : 'bg-slate-900 text-slate-300 border border-slate-800'
                        }`}
                      >
                        <span className="text-slate-500 shrink-0">#{idx + 1}</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Encountered OsString Artifacts Table */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Encountered <code>OsString</code> Artifacts ({report.artifacts.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      in <code>{report.inspected_dir}</code>
                    </span>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="text"
                      placeholder="Filter artifacts..."
                      value={artifactSearch}
                      onChange={(e) => setArtifactSearch(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-amber-500 w-36"
                    />
                    {(['all', 'suspicious', 'dirs', 'files', 'appledouble'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setArtifactFilter(mode)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer capitalize ${
                          artifactFilter === mode
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                        }`}
                      >
                        {mode === 'suspicious' ? 'Hidden Chars/Spaces' : mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Filename / Name</th>
                        <th className="py-2 px-3">Raw OsString</th>
                        <th className="py-2 px-3">Unicode</th>
                        <th className="py-2 px-3">Hex Stream</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredArtifacts.length > 0 ? (
                        filteredArtifacts.map((art, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2 px-3 shrink-0">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  art.is_dir
                                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {art.is_dir ? 'DIR' : 'FILE'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-200 break-all">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{art.name}</span>
                                {art.has_trailing_space && (
                                  <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 text-[9px]">
                                    Trailing Space
                                  </span>
                                )}
                                {art.has_hidden_control_chars && (
                                  <span className="px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/40 text-[9px]">
                                    Control Char
                                  </span>
                                )}
                                {art.is_appledouble && (
                                  <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px]">
                                    AppleDouble
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-xs" title={art.raw_os_string}>
                              {art.raw_os_string}
                            </td>
                            <td className="py-2 px-3">
                              <span className={art.is_valid_unicode ? 'text-emerald-400' : 'text-rose-400'}>
                                {art.is_valid_unicode ? 'Valid' : 'Invalid'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[10px] truncate max-w-[120px]" title={art.hex_bytes}>
                              {art.hex_bytes}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500 text-xs italic">
                            No directory artifacts match the selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0 text-xs">
          <button
            onClick={handleCopyReport}
            disabled={!report}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            <span>{copied ? 'Copied JSON Report!' : 'Copy Full Report (JSON)'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
