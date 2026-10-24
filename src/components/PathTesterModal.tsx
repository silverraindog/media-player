import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  RefreshCw,
  Code,
  Layers,
  ArrowRight,
  ExternalLink,
  Download,
  Flame,
} from 'lucide-react';
import {
  sanitizeSambaPath,
  diagnoseSambaPath,
  calculatePathCleanlinessScore,
  encodeSambaPathForUrl,
  sanitizeFilename,
  PathDiagnosticReport,
} from '../utils/pathSanitizer';

interface PathTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPath?: string;
  onSendToTraces?: (path: string) => void;
}

const SAMPLE_PRESETS = [
  {
    label: 'UNC Double-Slash & Unclosed Paren',
    category: 'Samba UNC',
    path: '//192.168.1.25/media/Series/Stranger Things (2016/Season 01/Stranger.Things.S01E01.mkv',
  },
  {
    label: 'Windows UNC & Illegal Colon',
    category: 'Windows SMB',
    path: '\\\\192.168.1.100\\vault\\Movies\\Dune: Part Two (2024\\Dune.Part.Two.mkv',
  },
  {
    label: 'Mixed Slash Directions & Drive Letter',
    category: 'Mixed Slashes',
    path: 'C:\\Users\\Media/Series/Breaking Bad [2008/Season 1/S01E01.mkv',
  },
  {
    label: 'Forbidden Chars & Wildcards',
    category: 'Illegal Chars',
    path: 'smb://nas.local/share/Anime/Neon Genesis Evangelion <1995>?*/ep01.mp4',
  },
  {
    label: 'Volume Prefix with Redundant Slashes',
    category: 'macOS Mount',
    path: '/Volumes/Media///Movies//Avatar (2009/Avatar.mkv',
  },
  {
    label: 'Multi-nested Trailing Dots & Whitespace',
    category: 'Edge Case',
    path: '//10.0.0.5/Media/Music/Pink Floyd/The Wall ./Disc 1 /01. In the Flesh?.flac',
  },
];

export const PathTesterModal: React.FC<PathTesterModalProps> = ({
  isOpen,
  onClose,
  initialPath = '',
  onSendToTraces,
}) => {
  const [rawInput, setRawInput] = useState<string>(
    initialPath || '//192.168.1.25/media/Series/Stranger Things (2016/Season 01/Stranger.Things.S01E01.mkv'
  );
  const [preserveAbsolute, setPreserveAbsolute] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialPath) {
      setRawInput(initialPath);
    }
  }, [initialPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Real-time evaluation
  const diagnostics: PathDiagnosticReport = useMemo(() => {
    return diagnoseSambaPath(rawInput);
  }, [rawInput]);

  const sanitized = useMemo(() => {
    return sanitizeSambaPath(rawInput, { preserveAbsolutePrefix: preserveAbsolute });
  }, [rawInput, preserveAbsolute]);

  const cleanlinessScore = useMemo(() => {
    return calculatePathCleanlinessScore(rawInput);
  }, [rawInput]);

  const encodedUrl = useMemo(() => {
    return encodeSambaPathForUrl(rawInput);
  }, [rawInput]);

  // Segment breakdown
  const segmentsBreakdown = useMemo(() => {
    if (!rawInput.trim()) return [];
    const normalized = rawInput.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.map((part, index) => {
      const isLast = index === parts.length - 1 && parts.length > 1;
      const cleanPart = sanitizeFilename(part);
      const isChanged = part !== cleanPart;
      return {
        original: part,
        cleaned: cleanPart,
        isChanged,
        type: isLast ? 'file' : 'folder',
      };
    });
  }, [rawInput]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportJson = () => {
    try {
      const data = {
        testTimestamp: new Date().toISOString(),
        rawInput,
        sanitizedOutput: sanitized,
        urlEncodedOutput: encodedUrl,
        cleanlinessScore,
        diagnostics,
        segments: segmentsBreakdown,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `samba_path_test_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export test report', e);
    }
  };

  if (!isOpen) return null;

  const scoreColor =
    cleanlinessScore >= 80
      ? 'text-emerald-400 border-emerald-800 bg-emerald-950/80'
      : cleanlinessScore >= 50
      ? 'text-amber-400 border-amber-800 bg-amber-950/80'
      : 'text-rose-400 border-rose-800 bg-rose-950/80';

  const scoreBarColor =
    cleanlinessScore >= 80
      ? 'bg-emerald-500'
      : cleanlinessScore >= 50
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400 shadow-inner">
              <Code className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Samba Path Regex &amp; Sanitizer Sandbox
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
                  LIVE TESTER
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time validation for <code className="text-cyan-300">sanitizeSambaPath</code> &amp;{' '}
                <code className="text-cyan-300">diagnoseSambaPath</code> regex rules
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 border border-slate-700"
              title="Download test results as JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Presets Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Test Edge-Case Presets
              </label>
              <span className="text-[11px] text-slate-500">Click any preset to load</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setRawInput(preset.path)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition cursor-pointer text-left flex items-center gap-1.5 ${
                    rawInput === preset.path
                      ? 'bg-cyan-950 border-cyan-600 text-cyan-200 font-bold shadow'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-[10px] text-cyan-400 opacity-80 uppercase">[{preset.category}]</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Raw Input Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Raw Input Samba / UNC Path
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={preserveAbsolute}
                    onChange={(e) => setPreserveAbsolute(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                  />
                  <span>Preserve Root Absolute Slash</span>
                </label>
                {rawInput && (
                  <button
                    type="button"
                    onClick={() => setRawInput('')}
                    className="text-[11px] text-slate-500 hover:text-rose-400 transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Enter raw path to test (e.g. //192.168.1.25/media/Series/Stranger Things (2016/Season 01/ep1.mkv)..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-cyan-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-y"
              />
            </div>
          </div>

          {/* Score & Diagnostic Badge Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Cleanliness Score Gauge */}
            <div className={`p-4 rounded-xl border ${scoreColor} flex flex-col justify-between`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Cleanliness Score</span>
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black">{cleanlinessScore}</span>
                <span className="text-xs text-slate-400 font-normal">/ 100</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${scoreBarColor}`}
                  style={{ width: `${cleanlinessScore}%` }}
                />
              </div>
            </div>

            {/* Double Slash Check */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400 uppercase">Double Slash (UNC)</span>
              <div className="flex items-center gap-2 mt-1">
                {diagnostics.hasDoubleSlash ? (
                  <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" /> Detected
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Clean
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Leading // or \\ prefix</span>
            </div>

            {/* Mixed Slash Check */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400 uppercase">Slash Direction</span>
              <div className="flex items-center gap-2 mt-1">
                {diagnostics.hasMixedSlashes ? (
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Mixed (/ &amp; \)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Consistent
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Normalized to /</span>
            </div>

            {/* Parenthesis & Brackets Check */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col justify-between">
              <span className="text-[11px] text-slate-400 uppercase">Parens / Brackets</span>
              <div className="flex items-center gap-2 mt-1">
                {diagnostics.hasUnclosedParens ? (
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Unbalanced
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Balanced
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Auto-closed on sanitize</span>
            </div>
          </div>

          {/* Issues List if any */}
          {diagnostics.issues.length > 0 && (
            <div className="p-3.5 rounded-xl border border-rose-900/60 bg-rose-950/40 space-y-2">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Detected {diagnostics.issues.length} Potential Regex / Filesystem Anomaly:</span>
              </div>
              <ul className="space-y-1 pl-6 list-disc text-xs text-rose-200">
                {diagnostics.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sanitized Result Box */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sanitized Output Path (Ready for Scanner &amp; Storage)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(sanitized, 'sanitized')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition cursor-pointer flex items-center gap-1 border border-slate-700"
                >
                  {copiedKey === 'sanitized' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Sanitized</span>
                    </>
                  )}
                </button>
                {onSendToTraces && (
                  <button
                    type="button"
                    onClick={() => onSendToTraces(rawInput)}
                    className="px-2.5 py-1 bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-200 rounded text-xs transition cursor-pointer flex items-center gap-1 border border-cyan-700"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Send to Debug Traces</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-emerald-900/60 rounded-xl">
              <div className="text-xs font-mono text-emerald-300 break-all select-all font-semibold">
                {sanitized || <span className="text-slate-600 italic">(empty output)</span>}
              </div>
            </div>
          </div>

          {/* URL Encoded Output Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ExternalLink className="w-3 h-3 text-slate-500" />
                URL-Encoded Samba Query Parameter
              </label>
              <button
                type="button"
                onClick={() => handleCopy(encodedUrl, 'encoded')}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
              >
                {copiedKey === 'encoded' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'encoded' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-400 break-all select-all">
              {encodedUrl || <span className="text-slate-600 italic">(empty)</span>}
            </div>
          </div>

          {/* Segment-by-segment Breakdown */}
          {segmentsBreakdown.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Path Segments Breakdown &amp; Transformation ({segmentsBreakdown.length} levels)
                </label>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px]">
                      <th className="p-2.5 font-semibold">#</th>
                      <th className="p-2.5 font-semibold">Type</th>
                      <th className="p-2.5 font-semibold">Raw Segment</th>
                      <th className="p-2.5 font-semibold">Sanitized Segment</th>
                      <th className="p-2.5 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {segmentsBreakdown.map((seg, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition">
                        <td className="p-2.5 text-slate-500 text-[11px]">{idx + 1}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              seg.type === 'file'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                : 'bg-blue-950/80 text-blue-300 border-blue-800'
                            }`}
                          >
                            {seg.type === 'file' ? '📄 File' : '📁 Folder'}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-slate-300 max-w-xs break-all">
                          {seg.original}
                        </td>
                        <td className="p-2.5 font-mono text-cyan-300 max-w-xs break-all font-medium">
                          {seg.cleaned}
                        </td>
                        <td className="p-2.5 text-right">
                          {seg.isChanged ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-bold">
                              Cleaned
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                              Unchanged
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/90 shrink-0">
          <span className="text-xs text-slate-400">
            Regex rules tested against Samba UNC, CIFS, POSIX, and FAT/NTFS standards
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
