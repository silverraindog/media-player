import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, RefreshCw, Trash2, Copy, Check, Activity } from 'lucide-react';

export const FfmpegTranscodeLogsCard: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/media/stream/logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.lines)) {
          setLogs(data.lines);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch transcode logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs, autoRefresh]);

  const handleClearLogs = async () => {
    try {
      await fetch('/api/media/stream/logs/clear', { method: 'POST' });
      setLogs([]);
    } catch (err) {
      console.warn('Failed to clear logs:', err);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">FFmpeg Transcode &amp; Stream Logs</h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                Last 50 Lines
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time process stderr and stream transcode diagnostics for debugging playback failures.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-0"
            />
            <span>Auto-poll (3s)</span>
          </label>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            title="Copy Logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleClearLogs}
            className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            title="Clear Logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal Viewport Box */}
      <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-300 h-72 overflow-y-auto shadow-inner space-y-1">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Activity className="w-8 h-8 opacity-40 animate-pulse text-cyan-400" />
            <p>No FFmpeg transcode logs recorded yet. Play a media file to start streaming.</p>
          </div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className="leading-relaxed whitespace-pre-wrap flex items-start gap-2">
              <span className="text-slate-600 select-none text-[10px] w-6 text-right shrink-0 pt-0.5">{idx + 1}</span>
              <span className={
                line.includes('error') || line.includes('Fatal') || line.includes('stalled')
                  ? 'text-rose-400 font-semibold'
                  : line.includes('warning') || line.includes('WARNING')
                  ? 'text-amber-300'
                  : line.includes('Spawning') || line.includes('Resolved') || line.includes('Success')
                  ? 'text-emerald-400'
                  : 'text-slate-300'
              }>
                {line}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
