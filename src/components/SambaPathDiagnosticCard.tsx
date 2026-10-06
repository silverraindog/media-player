import React, { useState, useEffect } from 'react';
import { 
  FolderLock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Terminal, 
  Copy, 
  Check, 
  RefreshCw,
  UserCheck,
  Cpu,
  Wrench,
  ShieldAlert,
  Loader2,
  Lock,
  Unlock,
  Key,
  Database
} from 'lucide-react';
import { checkPathExists, PathExistsResult } from '../utils/tauriBridge';

// Tauri API import helper
const triggerTauriPermissionsFix = async (path: string, username: string): Promise<string> => {
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<string>('fix_path_permissions', { path, username });
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
};

interface SambaPathDiagnosticCardProps {
  className?: string;
  defaultPathToCheck?: string;
}

export const SambaPathDiagnosticCard: React.FC<SambaPathDiagnosticCardProps> = ({
  className = '',
  defaultPathToCheck = '/Volumes/Media',
}) => {
  const [pathInput, setPathInput] = useState(defaultPathToCheck);
  const [result, setResult] = useState<PathExistsResult | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixLog, setFixLog] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const [activeSystemUser, setActiveSystemUser] = useState({
    username: 'sargus',
    group: 'staff',
    uid: 501,
    gid: 20,
    isTauriProcessUser: true,
    platform: 'darwin'
  });

  // Fetch process user info from backend on load to match diagnostics context
  const loadSystemUser = async () => {
    try {
      const res = await fetch('/api/samba/user-info');
      const data = await res.json();
      if (data.success) {
        setActiveSystemUser({
          username: data.processUser || 'sargus',
          group: data.groups ? data.groups.replace(/^\d+\(([^)]+)\)$/, '$1') : 'staff',
          uid: data.uid || 501,
          gid: data.gid || 20,
          isTauriProcessUser: true,
          platform: data.platform || 'darwin'
        });
      }
    } catch (_) {}
  };

  const runDiagnostic = async (targetPath: string) => {
    setIsDiagnosing(true);
    setFixLog(null);
    setFixError(null);
    try {
      // Direct call to our newly registered native Rust backend path verification command
      const diagResult = await checkPathExists(targetPath);
      setResult(diagResult);
    } catch (err: any) {
      setResult({
        exists: false,
        isDirectory: false,
        fileCount: 0,
        readable: false,
        writable: false,
        accessible: false,
        accessDenied: true,
        errorCode: 'TAURI_INVOKE_ERROR',
        rawInput: targetPath,
        resolvedPath: targetPath,
        path: targetPath,
        message: err?.message || 'Failed to communicate with Tauri checkPathExists backend.'
      });
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleAttemptFix = async () => {
    if (!pathInput.trim()) return;
    setIsFixing(true);
    setFixLog(null);
    setFixError(null);
    try {
      const logOutput = await triggerTauriPermissionsFix(pathInput, activeSystemUser.username);
      setFixLog(logOutput);
      // Automatically re-run diagnostics after attempting a fix to update status badges
      await runDiagnostic(pathInput);
    } catch (err: any) {
      setFixError(err?.message || 'Failed to trigger system chmod/chown fix. Ensure SambaVault is running with correct OS execution clearance.');
    } finally {
      setIsFixing(false);
    }
  };

  useEffect(() => {
    loadSystemUser();
    runDiagnostic(pathInput);
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Generate platform-specific 'how-to' instructions for the detected OS if the path is not writable
  const getHowToInstructions = () => {
    const isWin = (activeSystemUser.platform || '').toLowerCase().includes('win');
    const isMac = (activeSystemUser.platform || '').toLowerCase().includes('darwin') || (activeSystemUser.platform || '').toLowerCase().includes('mac');
    const path = pathInput || '/Volumes/Media';
    const user = activeSystemUser.username;
    const group = activeSystemUser.group;

    if (isWin) {
      return {
        osName: 'Windows OS (PowerShell)',
        instruction: `Windows NTFS/Share permissions mismatched. Open PowerShell as Administrator and run:`,
        command: `icacls "${path}" /grant "${user}:(OI)(CI)F" /T\n# Alternatively, grant full permissions to Everyone:\nicacls "${path}" /grant "Everyone:(OI)(CI)F" /T`,
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      };
    } else if (isMac) {
      return {
        osName: 'macOS (Terminal)',
        instruction: `macOS detected. Run this chmod/chown command to grant user '${user}' full clearance:`,
        command: `sudo chown -R ${user}:${group} "${path}"\nsudo chmod -R 755 "${path}"`,
        badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
      };
    } else {
      return {
        osName: 'Linux OS (Terminal)',
        instruction: `Linux detected. Run this chmod/chown command to grant user '${user}' full clearance:`,
        command: `sudo chown -R ${user}:${user} "${path}"\nsudo chmod -R 755 "${path}"`,
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      };
    }
  };

  // Pre-generate custom Unix helper scripts for terminal copying
  const fixScript = `# 1. Create directory if missing\nsudo mkdir -p "${pathInput}"\n\n# 2. Assign ownership to user "${activeSystemUser.username}"\nsudo chown -R ${activeSystemUser.username}:${activeSystemUser.group} "${pathInput}"\n\n# 3. Grant full read/write permissions (755)\nsudo chmod -R 755 "${pathInput}"`;

  return (
    <div className={`rounded-2xl border border-indigo-500/30 bg-slate-900/95 shadow-2xl overflow-hidden transition-all duration-300 ${className}`}>
      
      {/* SECTION HEADER: Path Permission Analyzer Dashboard */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-950/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <FolderLock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>CheckPathPermissions Suite</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                TAURI RUST INTERFACES
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Runs native POSIX security trace &amp; shell authorization corrections on mounted volumes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500 uppercase font-mono">Path:</span>
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="e.g. /Volumes/Media"
              className="pl-12 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-indigo-300 font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 w-52 sm:w-64"
            />
          </div>
          
          <button
            onClick={() => runDiagnostic(pathInput)}
            disabled={isDiagnosing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            title="Execute checkPathExists command"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDiagnosing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Scan Path</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        
        {/* SUB-COMPONENT: Granular 'Read', 'Write', and 'Owner' Status Badges */}
        <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4.5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
            <div>
              <span className="text-[10px] text-indigo-400 uppercase font-extrabold tracking-wider block">
                NATIVE OS SECURITY TARGET DIAGNOSTIC
              </span>
              <code className="text-xs text-white font-mono font-bold mt-1 block truncate max-w-[340px] sm:max-w-[480px]" title={pathInput}>
                {pathInput}
              </code>
            </div>

            {/* Current Process Active Security Context */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 self-start sm:self-center">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <div className="text-[11px] font-mono leading-tight">
                <span className="text-slate-400">Process Context: </span>
                <strong className="text-indigo-300">{activeSystemUser.username}</strong>
                <span className="text-slate-500 text-[10px]"> (UID: {activeSystemUser.uid} / GID: {activeSystemUser.gid})</span>
              </div>
            </div>
          </div>

          {result ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Badge A: READ STATUS */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                result.readable 
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' 
                  : 'bg-rose-500/5 border-rose-500/20 text-rose-300'
              }`}>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">POSIX Read</span>
                  <strong className="text-xs font-mono font-black">{result.readable ? 'READABLE (OK)' : 'READ BLOCKED'}</strong>
                </div>
                {result.readable ? (
                  <Unlock className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Lock className="w-5 h-5 text-rose-400 animate-bounce" />
                )}
              </div>

              {/* Badge B: WRITE STATUS */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                result.writable 
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' 
                  : 'bg-amber-500/5 border-amber-500/20 text-amber-300'
              }`}>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">POSIX Write</span>
                  <strong className="text-xs font-mono font-black">{result.writable ? 'WRITABLE (OK)' : 'READ-ONLY'}</strong>
                </div>
                {result.writable ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
                )}
              </div>

              {/* Badge C: OWNER ALIGNMENT */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                result.readable && result.writable
                  ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300' 
                  : 'bg-rose-500/5 border-rose-500/20 text-rose-300'
              }`}>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">POSIX Owner Match</span>
                  <strong className="text-xs font-mono font-black">
                    {result.readable && result.writable ? 'MATCH (STAFF)' : 'MISMATCH (ROOT)'}
                  </strong>
                </div>
                <UserCheck className={`w-5 h-5 ${result.readable && result.writable ? 'text-indigo-400' : 'text-rose-400'}`} />
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 italic font-mono">
              Scan path to query status badges.
            </div>
          )}
        </div>

        {/* SECTION: Path Diagnostics Trace Details */}
        {result && (
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-3 font-mono text-xs">
            <span className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">
              DIAGNOSTIC TRACE REPORT
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500">PROBED ABSOLUTE TARGET:</span>
                <p className="text-indigo-300 font-bold break-all">{result.resolvedPath || result.path || pathInput}</p>
              </div>
              <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-800 pt-2.5 md:pt-0 md:pl-3">
                <span className="text-[10px] text-slate-500">BACKEND EVALUATION:</span>
                <p className="text-slate-300 font-medium">
                  {result.message || (result.exists 
                    ? `Path exists natively on Host disk with ${result.fileCount} items.`
                    : `Path missing or unreadable by current active process user (${activeSystemUser.username}).`)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* INTERACTIVE SUITE ACTION: ATTEMPT FIX VIA TAURI SHELL EXEC */}
        {/* ========================================================================= */}
        {result && (!result.readable || !result.writable || !result.exists) && (
          <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wide">
                    Directory Permissions Authorization Error Detected
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your local macOS/Linux directory requires ownership and read/write permission corrections. You can attempt an automated fix natively via SambaVault's helper command or run the commands manually.
                  </p>
                </div>
              </div>

              <button
                onClick={handleAttemptFix}
                disabled={isFixing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 shadow-md shadow-indigo-600/30 cursor-pointer"
                title="Attempt automated authorization fix"
              >
                {isFixing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Attempting Fix...</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Attempt Fix</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Terminal Output for Attempt Fix Execution logs */}
            {(fixLog || fixError) && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] space-y-1.5 animate-in fade-in duration-200">
                <span className="text-[10px] text-slate-500 uppercase font-extrabold flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  Terminal Fix Execution Output Log
                </span>
                {fixError && (
                  <p className="text-rose-400 block whitespace-pre-wrap">{fixError}</p>
                )}
                {fixLog && (
                  <p className="text-emerald-400 block whitespace-pre-wrap">{fixLog}</p>
                )}
              </div>
            )}

            {/* Dynamic OS-Specific Instructions Area */}
            {(() => {
              const info = getHowToInstructions();
              return (
                <div className="relative bg-slate-950 rounded-lg overflow-hidden border border-slate-850">
                  <div className="flex items-center justify-between p-2.5 bg-slate-900 border-b border-slate-850 text-[10px] text-slate-400">
                    <span className="font-mono flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                      <span>MANUAL FIX // {info.osName}</span>
                    </span>
                    <button
                      onClick={() => handleCopy(info.command, 'fix')}
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition cursor-pointer font-bold"
                    >
                      {copiedKey === 'fix' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3.5 space-y-2 text-xs font-mono">
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {info.instruction}
                    </p>
                    <pre className="p-3 bg-slate-900 rounded border border-slate-800 text-[11px] text-indigo-200 overflow-x-auto leading-relaxed">
                      {info.command}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
