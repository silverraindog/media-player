import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Database,
  FileVideo,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Search,
  ListFilter
} from 'lucide-react';
import { SambaShareNode } from '../types';

interface ScanResultsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  stats: {
    totalScanned: number;
    parsedSuccessfully: number;
    missingMetadata: number;
    errorsCount: number;
    errorList: string[];
    missingMetadataItems: Array<{ name: string; path: string; reason: string }>;
  };
}

export const ScanResultsOverlay: React.FC<ScanResultsOverlayProps> = ({
  isOpen,
  onClose,
  stats,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'missing' | 'errors'>('summary');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredMissing = stats.missingMetadataItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/60 p-5 bg-gradient-to-r from-indigo-950/20 to-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Recursive Scan Results</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Comprehensive real-time media catalog synchronization overview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800/40 px-5 bg-slate-900/20">
          <button
            onClick={() => setActiveTab('summary')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'summary'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Summary Table
          </button>
          <button
            onClick={() => setActiveTab('missing')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'missing'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Missing Metadata ({stats.missingMetadata})
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'errors'
                ? 'border-rose-500 text-rose-400 bg-rose-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Traversal Errors ({stats.errorsCount})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Highlight Dashboard Metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-1">Total Scanned</span>
                  <span className="text-2xl font-extrabold text-white font-mono">{stats.totalScanned}</span>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">Parsed Success</span>
                  <span className="text-2xl font-extrabold text-emerald-400 font-mono">{stats.parsedSuccessfully}</span>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1">Missing Info</span>
                  <span className="text-2xl font-extrabold text-amber-400 font-mono">{stats.missingMetadata}</span>
                </div>
              </div>

              {/* Detailed Summary Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/10">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-3 px-4">Metric Category</th>
                      <th className="py-3 px-4 text-center">Count</th>
                      <th className="py-3 px-4 text-right">Percentage / Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-medium">
                    <tr className="hover:bg-slate-900/20 text-slate-300">
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Successfully Parsed Media</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-white">{stats.parsedSuccessfully}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                        {stats.totalScanned > 0 ? `${Math.round((stats.parsedSuccessfully / stats.totalScanned) * 100)}%` : '0%'}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/20 text-slate-300">
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Items Missing Metadata / Artwork</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-white">{stats.missingMetadata}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                        {stats.totalScanned > 0 ? `${Math.round((stats.missingMetadata / stats.totalScanned) * 100)}%` : '0%'}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/20 text-slate-300">
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>File System Traversal Errors</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-white">{stats.errorsCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                        {stats.errorsCount > 0 ? `${stats.errorsCount} blocked` : '0 failures'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Status Message */}
              {stats.errorsCount === 0 ? (
                <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 p-4 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold">Traversal fully completed.</span> All directory paths were walked recursively without encounter or read restrictions.
                  </div>
                </div>
              ) : (
                <div className="bg-rose-500/5 border border-rose-500/15 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 animate-bounce" />
                  <div className="text-xs">
                    <span className="font-bold">Warning:</span> Some directory branches were locked or unreachable. Click the <span className="font-bold text-rose-300 underline cursor-pointer" onClick={() => setActiveTab('errors')}>Traversal Errors</span> tab to inspect path details.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'missing' && (
            <div className="space-y-4">
              {/* Search filter for Missing items */}
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter missing metadata items by name or path..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition"
                />
              </div>

              {filteredMissing.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <p className="text-xs">No missing metadata items found matching search filters.</p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/10 max-h-[350px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-4">Item Name / Title</th>
                        <th className="py-2.5 px-4">SMB Root / Relative Path</th>
                        <th className="py-2.5 px-4 text-right">Reason Flagged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-[11px]">
                      {filteredMissing.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/20 text-slate-300">
                          <td className="py-3 px-4 font-bold text-white truncate max-w-[180px]">{item.name}</td>
                          <td className="py-3 px-4 font-mono text-slate-400 truncate max-w-[220px]" title={item.path}>
                            {item.path}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
                              {item.reason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-4">
              {stats.errorList.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400/80 mb-1" />
                  <h4 className="text-xs font-bold text-slate-300">Zero System Errors Encoded</h4>
                  <p className="text-[10px] text-slate-500">Perfect volume crawl! Every subdirectory was traversed and indexed successfully.</p>
                </div>
              ) : (
                <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Traversal Error logs ({stats.errorsCount} items found)</span>
                  </h4>
                  <div className="text-[11px] text-rose-300 font-mono space-y-2.5 max-h-[250px] overflow-y-auto pr-2">
                    {stats.errorList.map((err, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10 flex gap-2">
                        <span className="text-rose-500 font-bold shrink-0">{i + 1}.</span>
                        <span className="break-all">{err}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/60 p-5 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>AI powered scraping & automated NFO mapping active.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition cursor-pointer"
          >
            Acknowledge & Close
          </button>
        </div>

      </div>
    </div>
  );
};
