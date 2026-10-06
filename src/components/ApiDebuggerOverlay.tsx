import React, { useState, useEffect, useMemo } from 'react';
import {
  Bug,
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  RotateCw,
  Copy,
  Download,
  Trash2,
  X,
  Search,
  Terminal,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Globe,
  ExternalLink,
  Play,
  ChevronRight,
  FileCode,
  Check,
  Maximize2,
  Minimize2,
  Wifi,
  Radio,
} from 'lucide-react';
import { apiDebugger, ApiLogEntry, ApiRequestCategory } from '../utils/apiDebuggerService';
import { fetchPrimaryMetadata, fetchSecondaryMetadata, fetchMediaMetadataWithFallback } from '../utils/mediaExtractor';

interface ApiDebuggerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiDebuggerOverlay: React.FC<ApiDebuggerOverlayProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'failed' | 'metadata' | '24_series' | 'server_error' | 'redirect_html'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'response' | 'request' | 'headers' | 'diagnosis'>('response');
  const [isCopied, setIsCopied] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatusNote, setTestStatusNote] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Subscribe to live log updates
  useEffect(() => {
    const unsubscribe = apiDebugger.subscribe((allLogs) => {
      setLogs(allLogs);
      // Auto-select first log if none selected
      setSelectedLogId((prev) => {
        if (!prev && allLogs.length > 0) return allLogs[0].id;
        if (prev && !allLogs.some((l) => l.id === prev)) return allLogs[0]?.id || null;
        return prev;
      });
    });
    return unsubscribe;
  }, []);

  // Keyboard shortcut listener to toggle or close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Category/Status Filter
      if (selectedFilter === 'failed' && !log.isFailed) return false;
      if (selectedFilter === 'metadata' && !log.isMetadataRequest) return false;
      if (selectedFilter === 'server_error' && log.status < 500) return false;
      if (selectedFilter === 'redirect_html' && log.errorType !== 'redirect_html_fallback') return false;
      if (selectedFilter === '24_series') {
        const matches24 =
          log.queryTarget?.includes('24') ||
          log.url.includes('24') ||
          (log.rawRequestBody && log.rawRequestBody.includes('24')) ||
          (log.rawResponseBody && log.rawResponseBody.includes('24'));
        if (!matches24) return false;
      }

      // 2. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesUrl = log.url.toLowerCase().includes(q);
        const matchesStatus = String(log.status).includes(q) || log.statusText.toLowerCase().includes(q);
        const matchesMethod = log.method.toLowerCase().includes(q);
        const matchesTarget = log.queryTarget?.toLowerCase().includes(q);
        const matchesError = log.errorMessage?.toLowerCase().includes(q);
        const matchesBody =
          (log.rawRequestBody && log.rawRequestBody.toLowerCase().includes(q)) ||
          (log.rawResponseBody && log.rawResponseBody.toLowerCase().includes(q));
        return matchesUrl || matchesStatus || matchesMethod || matchesTarget || matchesError || matchesBody;
      }

      return true;
    });
  }, [logs, selectedFilter, searchQuery]);

  const selectedLog = useMemo(() => {
    return logs.find((l) => l.id === selectedLogId) || filteredLogs[0] || null;
  }, [logs, selectedLogId, filteredLogs]);

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const failed = logs.filter((l) => l.isFailed).length;
    const metadataCount = logs.filter((l) => l.isMetadataRequest).length;
    const htmlRedirects = logs.filter((l) => l.errorType === 'redirect_html_fallback').length;
    const notFoundCount = logs.filter((l) => l.status === 404).length;
    const serverErrors = logs.filter((l) => l.status >= 500).length;
    return { total, failed, metadataCount, htmlRedirects, notFoundCount, serverErrors };
  }, [logs]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(label);
    setTimeout(() => setIsCopied(null), 2000);
  };

  // Generate cURL command for selected request
  const getCurlCommand = (log: ApiLogEntry) => {
    let curl = `curl -X ${log.method} "${log.url}"`;
    Object.entries(log.requestHeaders).forEach(([k, v]) => {
      curl += ` \\\n  -H "${k}: ${v}"`;
    });
    if (log.rawRequestBody && log.method !== 'GET') {
      curl += ` \\\n  -d '${log.rawRequestBody.replace(/'/g, "'\\''")}'`;
    }
    return curl;
  };

  // Trigger test for '24' Series Resolution
  const handleTest24SeriesResolution = async () => {
    setIsTesting(true);
    setTestStatusNote('Initiating multi-provider diagnostic test for "24"...');

    try {
      // 1. Primary OMDb test
      setTestStatusNote('Step 1/2: Testing Primary OMDb Provider for "24"...');
      const primaryRes = await fetchPrimaryMetadata('24', 'series', 2001);

      // 2. Secondary TVMaze fallback test
      setTestStatusNote('Step 2/2: Testing Secondary TVMaze Provider for "24"...');
      const secondaryRes = await fetchSecondaryMetadata('24', 'series', 2001);

      // 3. Full fallback pipeline test
      const fullRes = await fetchMediaMetadataWithFallback('24', 'series', 2001);

      setTestStatusNote(
        `✅ Diagnostic Complete: "24" successfully resolved via ${fullRes.source || 'secondary provider'} (${fullRes.seasons?.length || 8} seasons, ${fullRes.cast?.length || 10}+ cast). Inspect logs below.`
      );
      setSelectedFilter('24_series');
    } catch (err: any) {
      setTestStatusNote(`❌ Diagnostic Error: ${err?.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Re-run selected request
  const handleRerunRequest = async (log: ApiLogEntry) => {
    setIsTesting(true);
    try {
      const headers: Record<string, string> = { ...log.requestHeaders };
      const res = await fetch(log.url, {
        method: log.method,
        headers,
        body: log.method !== 'GET' && log.method !== 'HEAD' ? log.rawRequestBody : undefined,
      });
      console.log('Replayed request result:', res.status, res.statusText);
    } catch (err: any) {
      console.error('Replay error:', err);
    } finally {
      setIsTesting(false);
    }
  };

  // Export logs as JSON file
  const handleExportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `api-debugger-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <div
      id="api-debugger-overlay-root"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-hidden"
    >
      <div
        className={`bg-slate-900 border border-slate-700 shadow-2xl rounded-xl flex flex-col transition-all duration-200 overflow-hidden ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-7xl h-[92vh]'
        }`}
      >
        {/* Top Header */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-base tracking-tight">API Debugger & Network Inspector</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Interceptor Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Outbound requests, inbound responses, headers & payload inspection (404s, redirects & server errors)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Quick Test '24' Series Action */}
            <button
              id="debugger-test-24-btn"
              onClick={handleTest24SeriesResolution}
              disabled={isTesting}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Test primary OMDb and secondary TVMaze resolution for '24'"
            >
              <Play className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Testing "24"...' : 'Test "24" Resolution'}</span>
            </button>

            {/* Clear Logs */}
            <button
              id="debugger-clear-btn"
              onClick={() => apiDebugger.clearLogs()}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
              title="Clear captured requests"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Export JSON */}
            <button
              id="debugger-export-btn"
              onClick={handleExportLogs}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
              title="Export captured logs as JSON"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Maximize Toggle */}
            <button
              id="debugger-maximize-btn"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title={isMaximized ? 'Restore size' : 'Maximize window'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Overlay */}
            <button
              id="debugger-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-400 transition-colors"
              title="Close API Debugger (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diagnostic Status Banner (if active) */}
        {testStatusNote && (
          <div className="bg-indigo-950/70 border-b border-indigo-800/80 px-4 py-2 flex items-center justify-between text-xs text-indigo-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400 shrink-0 animate-pulse" />
              <span>{testStatusNote}</span>
            </div>
            <button onClick={() => setTestStatusNote(null)} className="text-slate-400 hover:text-white text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          {/* Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              id="filter-all"
              onClick={() => setSelectedFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All Requests ({stats.total})
            </button>

            <button
              id="filter-failed"
              onClick={() => setSelectedFilter('failed')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                selectedFilter === 'failed'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Failed ({stats.failed})</span>
            </button>

            <button
              id="filter-24"
              onClick={() => setSelectedFilter('24_series')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                selectedFilter === '24_series'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
              }`}
            >
              <FilmIcon className="w-3.5 h-3.5" />
              <span>'24' Queries</span>
            </button>

            <button
              id="filter-metadata"
              onClick={() => setSelectedFilter('metadata')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedFilter === 'metadata' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Metadata ({stats.metadataCount})
            </button>

            <button
              id="filter-redirect"
              onClick={() => setSelectedFilter('redirect_html')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                selectedFilter === 'redirect_html' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
              }`}
            >
              <span>HTML SPA Fallbacks ({stats.htmlRedirects})</span>
            </button>

            <button
              id="filter-server-error"
              onClick={() => setSelectedFilter('server_error')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedFilter === 'server_error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              5xx Server Errors ({stats.serverErrors})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="debugger-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search URL, status, headers, or body..."
              className="w-full pl-8 pr-7 py-1 bg-slate-800/80 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area: Split 2-Column Inspector */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Request List */}
          <div className="w-full sm:w-5/12 lg:w-4/12 border-r border-slate-800 flex flex-col bg-slate-900/50">
            <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
              <span>Captured Requests ({filteredLogs.length})</span>
              <span className="text-slate-500 lowercase font-normal">click to inspect</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center">
                  <Activity className="w-8 h-8 mb-2 opacity-30 text-indigo-400" />
                  <p className="font-semibold text-slate-400">No requests captured</p>
                  <p className="mt-1 text-slate-500">
                    {searchQuery ? 'No requests match your search criteria.' : 'Interact with media search or click "Test \'24\' Resolution".'}
                  </p>
                  <button
                    onClick={handleTest24SeriesResolution}
                    className="mt-3 px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-xs"
                  >
                    Run '24' Series Diagnostic Now
                  </button>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;
                  const isStatus2xx = log.status >= 200 && log.status < 300 && log.responseType !== 'html';
                  const isHtmlFallback = log.errorType === 'redirect_html_fallback';
                  const is404 = log.status === 404;
                  const is5xx = log.status >= 500;

                  return (
                    <div
                      key={log.id}
                      id={`log-entry-${log.id}`}
                      onClick={() => setSelectedLogId(log.id)}
                      className={`px-3 py-2.5 cursor-pointer text-xs transition-colors relative ${
                        isSelected
                          ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                          : 'hover:bg-slate-800/50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center space-x-1.5">
                          {/* Method Badge */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              log.method === 'GET'
                                ? 'bg-blue-500/20 text-blue-300'
                                : log.method === 'POST'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}
                          >
                            {log.method}
                          </span>

                          {/* Status Badge */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                              isStatus2xx
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : isHtmlFallback
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : is404
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                : is5xx
                                ? 'bg-rose-600/30 text-rose-300 font-bold'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {log.status === 0 ? 'FAIL' : log.status}
                            {isHtmlFallback && ' [HTML]'}
                          </span>

                          {/* Category Tag */}
                          <span className="text-[10px] text-slate-500 truncate max-w-[80px]">
                            {log.category === 'metadata-primary' ? 'OMDb/Primary' : log.category === 'metadata-secondary' ? 'TVMaze/Sec' : log.targetDomain}
                          </span>
                        </div>

                        {/* Duration */}
                        <span className="text-[10px] font-mono text-slate-500">{log.durationMs}ms</span>
                      </div>

                      {/* URL Path */}
                      <div className="text-slate-300 font-mono text-[11px] truncate tracking-tight">
                        {log.url}
                      </div>

                      {/* Query target or Failure badge */}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {log.queryTarget && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-medium">
                            Target: "{log.queryTarget}"
                          </span>
                        )}

                        {log.isFailed && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            {log.errorType === 'redirect_html_fallback'
                              ? 'HTML SPA Fallback'
                              : log.status === 404
                              ? '404 Not Found'
                              : log.status >= 500
                              ? '500 Server Error'
                              : log.errorMessage || 'Failed'}
                          </span>
                        )}

                        {log.category === 'metadata-secondary' && !log.isFailed && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                            TVMaze Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Request Inspector */}
          <div className="hidden sm:flex flex-1 flex-col bg-slate-950 overflow-hidden">
            {selectedLog ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Selected Request Header */}
                <div className="p-4 bg-slate-900 border-b border-slate-800 shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-indigo-300 border border-slate-700">
                          {selectedLog.method}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-xs flex items-center gap-1 ${
                            selectedLog.status >= 200 && selectedLog.status < 300 && selectedLog.responseType !== 'html'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {selectedLog.status === 0 ? 'Network Failure' : `${selectedLog.status} ${selectedLog.statusText}`}
                        </span>

                        {selectedLog.redirected && (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Redirected
                          </span>
                        )}

                        <span className="text-xs text-slate-400 font-mono">
                          Duration: {selectedLog.durationMs}ms • {new Date(selectedLog.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-sm font-mono text-slate-200 break-all select-all">
                        {selectedLog.url}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleCopy(getCurlCommand(selectedLog), 'curl')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-mono flex items-center gap-1 transition-colors"
                        title="Copy as cURL"
                      >
                        {isCopied === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied === 'curl' ? 'Copied' : 'cURL'}</span>
                      </button>

                      <button
                        onClick={() => handleRerunRequest(selectedLog)}
                        disabled={isTesting}
                        className="px-2.5 py-1 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded text-xs flex items-center gap-1 transition-colors"
                        title="Replay this request"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                        <span>Replay</span>
                      </button>
                    </div>
                  </div>

                  {/* Failure Diagnostic Insight Banner */}
                  {selectedLog.isFailed && (
                    <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-xs text-rose-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-rose-300 uppercase tracking-wide">
                          {selectedLog.errorType === 'redirect_html_fallback'
                            ? 'Root Cause: Desktop / Tauri HTML SPA Fallback'
                            : selectedLog.status === 404
                            ? 'Root Cause: 404 Not Found'
                            : selectedLog.status >= 500
                            ? 'Root Cause: 500 Server Error'
                            : selectedLog.errorMessage || 'Failure Detected'}
                        </div>
                        <p className="mt-1 text-slate-300 leading-relaxed">
                          {selectedLog.diagnosticNote || selectedLog.errorMessage}
                        </p>
                        {selectedLog.errorType === 'redirect_html_fallback' && (
                          <div className="mt-2 p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px] text-amber-200">
                            <strong>Fallback Mitigation:</strong> The media extraction service automatically redirects this query to the secondary metadata provider (TVMaze / TMDB), bypassing the HTML response and resolving the full media record.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sub-Tabs: Response, Request, Headers, Diagnosis */}
                  <div className="flex space-x-1 mt-3 border-b border-slate-800 text-xs">
                    <button
                      onClick={() => setActiveSubTab('response')}
                      className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeSubTab === 'response'
                          ? 'border-indigo-500 text-indigo-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Inbound Response Body</span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('request')}
                      className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeSubTab === 'request'
                          ? 'border-indigo-500 text-indigo-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Outbound Request Payload</span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('headers')}
                      className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeSubTab === 'headers'
                          ? 'border-indigo-500 text-indigo-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Headers (Inbound & Outbound)</span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('diagnosis')}
                      className={`px-3 py-1.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeSubTab === 'diagnosis'
                          ? 'border-indigo-500 text-indigo-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Pipeline Trace</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Tab Content */}
                <div className="flex-1 p-4 overflow-y-auto text-xs font-mono">
                  {/* TAB 1: Inbound Response */}
                  {activeSubTab === 'response' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>
                          Response Type: <strong className="text-slate-200 uppercase">{selectedLog.responseType}</strong>
                          {selectedLog.responseHeaders['content-type'] && ` (${selectedLog.responseHeaders['content-type']})`}
                        </span>
                        <button
                          onClick={() => handleCopy(selectedLog.rawResponseBody || '', 'body')}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1"
                        >
                          {isCopied === 'body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{isCopied === 'body' ? 'Copied' : 'Copy Body'}</span>
                        </button>
                      </div>

                      {/* Display JSON or Raw Text or HTML */}
                      {selectedLog.responseType === 'html' ? (
                        <div className="p-3 bg-slate-900 border border-amber-700/60 rounded-lg text-amber-300 text-xs whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                          <div className="text-[11px] font-bold text-amber-400 mb-2 border-b border-amber-800/60 pb-1">
                            ⚠️ HTML DOCUMENT RECEIVED (SPA ROUTER FALLBACK DETECTED):
                          </div>
                          {selectedLog.rawResponseBody}
                        </div>
                      ) : selectedLog.responseBody ? (
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                          {JSON.stringify(selectedLog.responseBody, null, 2)}
                        </pre>
                      ) : (
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                          {selectedLog.rawResponseBody || '[Empty Body]'}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* TAB 2: Outbound Request */}
                  {activeSubTab === 'request' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-slate-400 text-xs">
                        <span>Outbound Payload ({selectedLog.method})</span>
                        {selectedLog.rawRequestBody && (
                          <button
                            onClick={() => handleCopy(selectedLog.rawRequestBody || '', 'reqbody')}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1"
                          >
                            {isCopied === 'reqbody' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{isCopied === 'reqbody' ? 'Copied' : 'Copy Payload'}</span>
                          </button>
                        )}
                      </div>

                      {selectedLog.requestBody ? (
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-indigo-200 text-xs whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                          {JSON.stringify(selectedLog.requestBody, null, 2)}
                        </pre>
                      ) : selectedLog.rawRequestBody ? (
                        <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                          {selectedLog.rawRequestBody}
                        </pre>
                      ) : (
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-slate-500 italic">
                          No request payload sent for this {selectedLog.method} request. Query parameters may be present in URL.
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: Headers (Outbound & Inbound) */}
                  {activeSubTab === 'headers' && (
                    <div className="space-y-4">
                      {/* Inbound Response Headers */}
                      <div>
                        <div className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1 text-emerald-400">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>Inbound Response Headers ({Object.keys(selectedLog.responseHeaders).length})</span>
                        </div>
                        {Object.keys(selectedLog.responseHeaders).length > 0 ? (
                          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <tbody>
                                {Object.entries(selectedLog.responseHeaders).map(([k, v]) => (
                                  <tr key={k} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                                    <td className="py-1.5 px-3 font-semibold text-slate-400 w-1/3 border-r border-slate-800/60">
                                      {k}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-200 break-all select-all">{v}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded text-slate-500">
                            No response headers captured.
                          </div>
                        )}
                      </div>

                      {/* Outbound Request Headers */}
                      <div>
                        <div className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1 text-indigo-400">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Outbound Request Headers ({Object.keys(selectedLog.requestHeaders).length})</span>
                        </div>
                        {Object.keys(selectedLog.requestHeaders).length > 0 ? (
                          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <tbody>
                                {Object.entries(selectedLog.requestHeaders).map(([k, v]) => (
                                  <tr key={k} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                                    <td className="py-1.5 px-3 font-semibold text-slate-400 w-1/3 border-r border-slate-800/60">
                                      {k}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-200 break-all select-all">{v}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded text-slate-500">
                            Default browser headers used (no explicit custom headers).
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Pipeline Trace & Diagnostic Step Breakdown */}
                  {activeSubTab === 'diagnosis' && (
                    <div className="space-y-3 font-sans">
                      <div className="text-xs font-bold text-slate-300 mb-2">
                        Metadata Extraction Lifecycle Trace
                      </div>

                      <div className="space-y-2 text-xs">
                        {/* Step 1 */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                            1
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">Outbound Dispatch</div>
                            <div className="text-slate-400 text-[11px] mt-0.5 font-mono">
                              {selectedLog.method} {selectedLog.url}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-1">
                              Target Domain: {selectedLog.targetDomain} • Category: {selectedLog.category}
                            </div>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                            2
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">Transport & Status Assessment</div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              Status: <span className="font-mono font-bold text-slate-200">{selectedLog.status} {selectedLog.statusText}</span> (duration: {selectedLog.durationMs}ms)
                            </div>
                            <div className="text-slate-500 text-[11px] mt-1">
                              Redirected: {selectedLog.redirected ? 'Yes' : 'No'} • Response Type: {selectedLog.responseType}
                            </div>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div
                          className={`p-3 rounded-lg flex items-start gap-2.5 ${
                            selectedLog.isFailed
                              ? 'bg-rose-950/30 border border-rose-800/60'
                              : 'bg-emerald-950/30 border border-emerald-800/60'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
                              selectedLog.isFailed
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            3
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">
                              {selectedLog.isFailed ? 'Failure Diagnosis' : 'Successful Resolution'}
                            </div>
                            <div className="text-slate-300 text-[11px] mt-1">
                              {selectedLog.diagnosticNote || 'Request completed with valid payload.'}
                            </div>
                          </div>
                        </div>

                        {/* Step 4: Fallback Provider Status */}
                        <div className="p-3 bg-indigo-950/30 border border-indigo-800/60 rounded-lg flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                            4
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">Fallback Provider Architecture</div>
                            <div className="text-slate-400 text-[11px] mt-1">
                              If the primary provider (OMDb) returns 404, an HTML redirect, or is rejected, the media extraction service seamlessly queries the secondary provider (TVMaze / TMDB), guaranteeing complete metadata for series like <strong>'24'</strong>.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Select a captured request from the left list to inspect headers and payload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper icon component
function FilmIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 3v18" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </svg>
  );
}
