import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  ExternalLink,
  Lock,
  FolderLock,
} from 'lucide-react';
// @ts-ignore
import { invoke } from '@tauri-apps/api/tauri';
import { PermissionHelpModal } from './PermissionHelpModal';

export const PermissionDiagnostics: React.FC = () => {
  const [tccAccess, setTccAccess] = useState<boolean | null>(null);
  const [fdaDetail, setFdaDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [lastCheckError, setLastCheckError] = useState<string | null>(null);

  const checkAccess = async () => {
    setLoading(true);
    setLastCheckError(null);

    let tccGranted = false;
    let detailMsg = '';

    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        // 1. Check TCC folder access (~/Documents)
        try {
          const res = await invoke<boolean>('check_tcc_access');
          tccGranted = Boolean(res);
        } catch (e: any) {
          console.warn('check_tcc_access invoke error:', e);
          tccGranted = false;
        }

        // 2. Proactive check of TCC database
        try {
          const fdaRes = await invoke<string>('diagnostic_check_full_disk_access');
          detailMsg = fdaRes || 'TCC status verified';
          if (!tccGranted && fdaRes && !fdaRes.toLowerCase().includes('denied')) {
            tccGranted = true;
          }
        } catch (fdaErr: any) {
          const errString = String(fdaErr?.message || fdaErr);
          detailMsg = errString;
          setLastCheckError(errString);
        }
      } else {
        // Web preview fallback: query backend diagnostic endpoint
        try {
          const res = await fetch('/api/samba/whoami');
          if (res.ok) {
            const data = await res.json();
            tccGranted = true;
            detailMsg = `Preview Environment: User ${data.username || 'active'}`;
          } else {
            tccGranted = true;
            detailMsg = 'Web Preview mode active';
          }
        } catch (_) {
          tccGranted = true;
          detailMsg = 'Browser development mode';
        }
      }

      setTccAccess(tccGranted);
      setFdaDetail(detailMsg);
    } catch (e: any) {
      console.error('Failed to check TCC access', e);
      setTccAccess(false);
      const errMsg = e?.message || String(e);
      setLastCheckError(errMsg);
      setFdaDetail(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, []);

  const handleOpenSettings = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        await invoke('open_macos_security_privacy');
      } else {
        window.open('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles', '_blank');
      }
    } catch (err) {
      setIsHelpOpen(true);
    }
  };

  return (
    <>
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${tccAccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {tccAccess ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Full Disk Access / TCC Diagnostic
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                Checks ~/Documents &amp; /Volumes permissions
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkAccess}
              disabled={loading}
              title="Re-run Permission Diagnostics"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              title="View Setup Guide & Visual Path Map"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-2 text-xs font-semibold ${tccAccess ? 'text-emerald-400' : 'text-rose-400'}`}>
          {tccAccess ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Lock className="w-4 h-4 shrink-0" />}
          <span>
            {tccAccess === null
              ? 'Evaluating macOS TCC sandbox...'
              : tccAccess
              ? 'Full Disk Access Verified (Unrestricted read/write)'
              : 'Access Restricted by macOS Security'}
          </span>
        </div>

        {fdaDetail && (
          <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800/80 font-mono text-[10px] text-slate-400 break-all">
            {fdaDetail}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!tccAccess && tccAccess !== null && (
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FolderLock className="w-3.5 h-3.5" />
              <span>How to Grant Access</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenSettings}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <ExternalLink className="w-3 h-3 text-cyan-400" />
            <span>Open Settings</span>
          </button>
        </div>
      </div>

      <PermissionHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        diagnosticError={lastCheckError || fdaDetail}
      />
    </>
  );
};
export default PermissionDiagnostics;
