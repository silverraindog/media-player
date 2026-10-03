import React from 'react';
import { X, ShieldAlert, ArrowRight, Settings } from 'lucide-react';

interface PermissionHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionHelpModal: React.FC<PermissionHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            Full Disk Access Required
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            SambaVault requires Full Disk Access to scan and manage your media files properly. Follow these steps to grant permission:
          </p>
          
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">1</div>
              <p className="text-xs text-slate-300">Open <strong className="text-white">System Settings</strong> on your Mac.</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">2</div>
              <p className="text-xs text-slate-300">Navigate to <strong className="text-white">Privacy & Security</strong> &gt; <strong className="text-white">Full Disk Access</strong>.</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">3</div>
              <p className="text-xs text-slate-300">Find <strong className="text-white">SambaVault</strong> in the list and <strong className="text-white">toggle the switch to ON</strong>.</p>
            </div>
          </div>
        </div>

        {/* Visual Simulated Path Map */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-400 space-y-2">
            <span className="font-bold text-slate-200">Visual Path:</span>
            <div className="flex items-center gap-1">
                <Settings className="w-3 h-3"/> <span>System Settings</span> 
                <ArrowRight className="w-3 h-3 text-slate-600"/> 
                <span>Privacy & Security</span>
                <ArrowRight className="w-3 h-3 text-slate-600"/> 
                <span className="text-indigo-400">Full Disk Access</span>
            </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-lg cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};
