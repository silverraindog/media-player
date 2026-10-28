import React, { useState } from 'react';
import { Search, AlertCircle, CheckCircle, FileText, Folder, Info } from 'lucide-react';
import { checkPathMetadata, PathMetadata } from '../utils/tauriBridge';

export const PathIntegrityDiagnosticPanel: React.FC = () => {
  const [path, setPath] = useState('');
  const [metadata, setMetadata] = useState<PathMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runDiagnostic = async () => {
    if (!path.trim()) return;
    setIsLoading(true);
    const result = await checkPathMetadata(path);
    setMetadata(result);
    setIsLoading(false);
  };

  return (
    <div className="p-4 bg-slate-900 rounded-xl border border-slate-700">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-indigo-400" />
        Filesystem Integrity Diagnostic
      </h3>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/Volumes/media/..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        />
        <button
          onClick={runDiagnostic}
          disabled={isLoading || !path.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium disabled:opacity-50"
        >
          {isLoading ? 'Checking...' : 'Check Path'}
        </button>
      </div>
      {metadata && (
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
          {metadata.error ? (
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-4 h-4" />
              <span>{metadata.error}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2">
                  {metadata.isDir ? <Folder className="w-4 h-4 text-amber-400" /> : <FileText className="w-4 h-4 text-cyan-400" />}
                  {metadata.exists ? 'Path Exists' : 'Path Not Found'}
                </span>
                <span className={`px-2 py-0.5 rounded ${metadata.exists ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-900 text-rose-200'}`}>
                  {metadata.exists ? 'Verified' : 'Invalid'}
                </span>
              </div>
              <div className="text-slate-400">Permissions: {metadata.permissions}</div>
              <div className="text-slate-400">Size: {metadata.size} bytes</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
