import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';
// @ts-ignore
import { invoke } from '@tauri-apps/api/tauri';

export const PermissionDiagnostics: React.FC = () => {
  const [tccAccess, setTccAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const checkAccess = async () => {
    setLoading(true);
    try {
      const result = await invoke('check_tcc_access');
      setTccAccess(result);
    } catch (e) {
      console.error('Failed to check TCC access', e);
      setTccAccess(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, []);

  return (
    <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-3">
      <div className="flex items-center justify-between">
         <h4 className="text-sm font-bold text-white">Full Disk Access Check</h4>
         <button onClick={checkAccess} disabled={loading} className="text-indigo-400 hover:text-indigo-300">
           <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
         </button>
      </div>
      <div className={`flex items-center gap-2 text-xs font-semibold ${tccAccess ? 'text-emerald-400' : 'text-rose-400'}`}>
        {tccAccess ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
        {tccAccess === null ? 'Checking...' : tccAccess ? 'Full Disk Access Verified' : 'Access Restricted'}
      </div>
      <p className="text-[11px] text-slate-400">
        {tccAccess ? 'The app has access to restricted folders.' : 'Please grant Full Disk Access to SambaVault in macOS System Settings.'}
      </p>
    </div>
  );
};
