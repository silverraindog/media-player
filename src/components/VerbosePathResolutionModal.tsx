import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
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
  ExternalLink,
  Trash2,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { resolvePathVerbose, VerbosePathResolutionResult } from '../utils/tauriBridge';

interface VerbosePathResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPath?: string;
  defaultShare?: string;
}

export const VerbosePathResolutionModal: React.FC<VerbosePathResolutionModalProps> = ({
  isOpen,
  onClose,
  initialPath = '',
  defaultShare = 'media',
}) => {
  const [testPath, setTestPath] = useState(initialPath || `/Volumes/${defaultShare}`);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<VerbosePathResolutionResult | null>(null);
  const [history, setHistory] = useState<VerbosePathResolutionResult[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialPath) {
      setTestPath(initialPath);
      handleResolve(initialPath);
    } else if (isOpen && !currentResult) {
      handleResolve(`/Volumes/${defaultShare}`);
    }
  }, [isOpen, initialPath, defaultShare]);

  if (!isOpen) return null;

  const handleResolve = async (pathToResolve?: string) => {
    const target = pathToResolve !== undefined ? pathToResolve : testPath;
    setIsLoading(true);
    try {
      const res = await resolvePathVerbose(target);
      setCurrentResult(res);
      setHistory((prev) => [res, ...prev.filter((item) => item.raw_input !== res.raw_input).slice(0, 20)]);
    } catch (e: any) {
      console.error('[VerbosePathResolutionModal] Error resolving path:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const renderVisualString = (str: string) => {
    if (!str) return <span className="text-slate-500 italic">empty</span>;

    const parts: React.ReactNode[] = [];
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const code = char.charCodeAt(0);

      if (char === '\r') {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50 text-[10px] font-bold"
            title="Carriage Return (\\r / 0x0D)"
          >
            \\r
          </span>
        );
      } else if (char === '\n') {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50 text-[10px] font-bold"
            title="Newline (\\n / 0x0A)"
          >
            \\n
          </span>
        );
      } else if (char === ' ' && (i === 0 || i === str.length - 1 || str[i + 1] === ' ')) {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[10px] font-bold"
            title={i === str.length - 1 ? 'Trailing Space (0x20)' : 'Leading/Consecutive Space (0x20)'}
          >
            ␣
          </span>
        );
      } else if (char === '\u00A0') {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[10px] font-bold"
            title="Non-Breaking Space (\\u00A0)"
          >
            NBSP
          </span>
        );
      } else if (char === '\u200B' || char === '\uFEFF') {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-500/50 text-[10px] font-bold"
            title="Zero-Width Space"
          >
            ZWSP
          </span>
        );
      } else if (code < 32 || code === 127) {
        parts.push(
          <span
            key={i}
            className="inline-block px-1 py-0.2 mx-0.5 rounded bg-red-600/40 text-red-200 border border-red-500 text-[10px] font-bold"
            title={`Control Character (0x${code.toString(16).toUpperCase()})`}
          >
            ^0x{code.toString(16).toUpperCase()}
          </span>
        );
      } else {
        parts.push(<span key={i}>{char}</span>);
      }
    }

    return <span className="font-mono tracking-tight break-all">{parts}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-indigo-950/70 overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Verbose Path Resolution Log</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                  std::path::Path Inspector
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Inspect raw byte sequence, reveal hidden characters (CR, LF, trailing spaces), and trace backend Tauri resolution
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Path Input Box & Quick Injectors */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Target Path to Inspect & Resolve:</span>
              <span className="text-[11px] text-slate-500 font-normal">
                Supports local `/Volumes`, UNC `//192.168.1.25/share`, and complex file paths
              </span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
                  placeholder="/Volumes/media/Franchises/Battlestar Galactica/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                />
              </div>
              <button
                onClick={() => handleResolve()}
                disabled={isLoading || !testPath}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 cursor-pointer shrink-0"
              >
                {isLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>{isLoading ? 'Resolving...' : 'Resolve & Inspect'}</span>
              </button>
            </div>

            {/* Quick Test Inserters */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
              <span className="text-slate-500 text-[10px] uppercase font-semibold mr-1">Inject Hidden Chars:</span>
              <button
                type="button"
                onClick={() => setTestPath((p) => p + ' ')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-amber-300 border border-amber-500/30 font-mono text-[10px] transition cursor-pointer"
                title="Append a trailing space to test if it gets sanitized"
              >
                + Trailing Space (0x20)
              </button>
              <button
                type="button"
                onClick={() => setTestPath((p) => p + '\r')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-rose-300 border border-rose-500/30 font-mono text-[10px] transition cursor-pointer"
                title="Append a carriage return (\r / 0x0D)"
              >
                + Carriage Return (\r)
              </button>
              <button
                type="button"
                onClick={() => setTestPath((p) => p + '\u00A0')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-amber-300 border border-amber-500/30 font-mono text-[10px] transition cursor-pointer"
                title="Append a non-breaking space (0xA0)"
              >
                + Non-Breaking Space
              </button>
              <button
                type="button"
                onClick={() => setTestPath(`/Volumes/${defaultShare}`)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] transition cursor-pointer"
              >
                Reset to /Volumes/{defaultShare}
              </button>
              <button
                type="button"
                onClick={() => setTestPath((p) => p.replace(/\//g, '\\'))}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] transition cursor-pointer"
                title="Convert forward slashes to Windows backslashes"
              >
                Convert to Backslashes (\)
              </button>
            </div>
          </div>

          {/* Current Resolution Inspection Panel */}
          {currentResult && (
            <div className="space-y-4">
              {/* Status Header Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                  currentResult.normalized_path_exists
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {currentResult.normalized_path_exists ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        {currentResult.normalized_path_exists
                          ? 'Path Successfully Resolved & Found on Filesystem'
                          : 'Path NOT Found on Filesystem (ENOENT)'}
                      </span>
                      <span
                        className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold ${
                          currentResult.normalized_path_exists
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-900/60 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {currentResult.is_dir ? 'Directory' : currentResult.is_file ? 'File' : 'Unreachable'}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">
                      {currentResult.normalized_path_exists
                        ? `Target exists as a ${currentResult.is_dir ? `directory with ${currentResult.file_count} items` : 'file'} (${currentResult.permissions || 'Readable'}).`
                        : (currentResult.error || 'The resolved target path does not match any node on disk.')}
                    </p>
                    {currentResult.parent_path && (
                      <div className="mt-2 text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>Parent folder:</span>
                        <span className="text-slate-300">{currentResult.parent_path}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            currentResult.parent_exists
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {currentResult.parent_exists ? 'Parent Exists' : 'Parent Missing'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3-Step Trace Pipeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Raw Input */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                      1. Raw Client Input
                    </span>
                    <button
                      onClick={() => copyToClipboard(currentResult.raw_input, 'raw')}
                      className="text-slate-500 hover:text-slate-300 transition"
                      title="Copy Raw Input"
                    >
                      {copiedKey === 'raw' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 min-h-[50px] flex items-center text-xs">
                    {renderVisualString(currentResult.raw_input)}
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Length: {currentResult.raw_input.length} chars</span>
                      <span>Raw Exists: {currentResult.raw_path_exists ? '✅ Yes' : '❌ No'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Normalization & Sanitization */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                      2. Sanitization Pipeline
                    </span>
                    <button
                      onClick={() => copyToClipboard(currentResult.normalized_string, 'norm')}
                      className="text-slate-500 hover:text-slate-300 transition"
                      title="Copy Normalized String"
                    >
                      {copiedKey === 'norm' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 min-h-[50px] flex items-center text-xs">
                    {renderVisualString(currentResult.normalized_string)}
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-1">
                    {currentResult.sanitized_out && currentResult.sanitized_out.length > 0 ? (
                      currentResult.sanitized_out.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1 text-amber-300">
                          <CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{step}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-1 text-slate-500">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>No hidden characters stripped</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Ultimate std::path::Path */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                      3. Backend std::path::Path
                    </span>
                    <button
                      onClick={() => copyToClipboard(currentResult.std_path, 'std')}
                      className="text-slate-500 hover:text-slate-300 transition"
                      title="Copy std::path"
                    >
                      {copiedKey === 'std' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 min-h-[50px] flex items-center text-xs font-mono text-purple-300 break-all">
                    {currentResult.std_path}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span>FS Check: {currentResult.normalized_path_exists ? '✅ Target Exists' : '❌ Target Missing'}</span>
                    <span>Tauri IPC Verified</span>
                  </div>
                </div>
              </div>

              {/* Hidden Characters & Byte Hex Inspection Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Hidden Character Analysis & Hex Representation
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {currentResult.has_carriage_return && (
                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                        CR (\r) Detected
                      </span>
                    )}
                    {currentResult.has_trailing_spaces && (
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                        Trailing Spaces
                      </span>
                    )}
                    {currentResult.has_non_breaking_spaces && (
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                        NBSP Detected
                      </span>
                    )}
                    {!currentResult.has_carriage_return &&
                      !currentResult.has_trailing_spaces &&
                      !currentResult.has_non_breaking_spaces &&
                      !currentResult.has_control_chars && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                          Zero Hidden Characters
                        </span>
                      )}
                  </div>
                </div>

                {currentResult.hidden_character_details && currentResult.hidden_character_details.length > 0 ? (
                  <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                    <span className="font-semibold block text-amber-300">Detected Hidden Issues:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {currentResult.hidden_character_details.map((detail, idx) => (
                        <li key={idx}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Path string is clean: no carriage returns (\r), newlines (\n), or rogue trailing spaces detected.</span>
                  </div>
                )}

                {/* Raw Hex Byte View */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>UTF-8 Byte Stream (Hexadecimal):</span>
                    <button
                      onClick={() => copyToClipboard(currentResult.raw_bytes_hex, 'hex')}
                      className="text-slate-500 hover:text-slate-300 transition text-[10px] flex items-center gap-1"
                    >
                      {copiedKey === 'hex' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy Hex</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all select-all">
                    {currentResult.raw_bytes_hex}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Historical Resolution Feed */}
          {history.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white uppercase text-[11px] tracking-wider">
                  Session Resolution History ({history.length} paths)
                </span>
                <button
                  onClick={() => setHistory([])}
                  className="flex items-center gap-1 text-slate-500 hover:text-rose-400 transition cursor-pointer text-[10px]"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setTestPath(item.raw_input);
                      setCurrentResult(item);
                    }}
                    className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-850 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 text-xs font-mono transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={item.normalized_path_exists ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.normalized_path_exists ? '●' : '○'}
                      </span>
                      <span className="text-slate-300 truncate">{item.raw_input}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[10px]">
                      {item.has_carriage_return && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/30">
                          \\r
                        </span>
                      )}
                      {item.has_trailing_spaces && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                          Trailing Space
                        </span>
                      )}
                      <span className="text-slate-500">{item.is_dir ? 'dir' : item.is_file ? 'file' : 'missing'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0 text-xs">
          <span className="text-slate-500 text-[11px]">
            Connected via Tauri IPC: <code>check_path_integrity</code> & <code>resolve_path_verbose</code>
          </span>
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
