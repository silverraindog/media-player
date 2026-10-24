import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  ArrowRight,
  Settings,
  ExternalLink,
  Copy,
  Check,
  FolderLock,
  Terminal,
  Info,
} from 'lucide-react';
// @ts-ignore
import { invoke } from '@tauri-apps/api/tauri';

interface PermissionHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnosticError?: string | null;
  onOpenSettings?: () => void;
}

export const PermissionHelpModal: React.FC<PermissionHelpModalProps> = ({
  isOpen,
  onClose,
  diagnosticError,
  onOpenSettings,
}) => {
  const [copiedCli, setCopiedCli] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);

  if (!isOpen) return null;

  const cliCommand = 'open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"';

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2500);
  };

  const handleOpenSettings = async () => {
    setIsOpeningSettings(true);
    try {
      if (onOpenSettings) {
        onOpenSettings();
      } else if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        await invoke('open_macos_security_privacy');
      } else {
        // Fallback for browser
        window.open('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles', '_blank');
      }
    } catch (e) {
      console.warn('Could not launch system settings automatically:', e);
    } finally {
      setTimeout(() => setIsOpeningSettings(false), 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                macOS Full Disk Access (FDA) Required
              </h3>
              <p className="text-xs text-slate-400">
                macOS Transparency, Consent, and Control (TCC) subsystem blocks access to protected paths
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic Error Banner if present */}
        {diagnosticError && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs font-mono text-rose-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-300">
              <FolderLock className="w-4 h-4 text-rose-400" />
              <span>Diagnostic Failure Details:</span>
            </div>
            <div className="break-all text-[11px] text-rose-300/90 bg-rose-950/90 p-2 rounded border border-rose-900">
              {diagnosticError}
            </div>
          </div>
        )}

        {/* Step-by-Step Instructions */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Step-by-Step Instructions
          </h4>
          <div className="grid gap-2.5">
            <div className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs">
                1
              </span>
              <div className="text-xs text-slate-300">
                Open <strong className="text-white">System Settings</strong> ( Apple menu &gt; System Settings).
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs">
                2
              </span>
              <div className="text-xs text-slate-300">
                In the sidebar, select <strong className="text-white">Privacy &amp; Security</strong>, then scroll and click <strong className="text-white">Full Disk Access</strong>.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs">
                3
              </span>
              <div className="text-xs text-slate-300">
                Find <strong className="text-white">SambaVault</strong> (or your terminal / dev tool if running locally) in the list and <strong className="text-emerald-400">toggle the switch to ON</strong>.
                If not listed, click the <strong className="text-white font-mono">(+)</strong> button to add it manually from Applications.
              </div>
            </div>
          </div>
        </div>

        {/* Visual Simulated Screenshot & Path Map */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold uppercase tracking-wider">Simulated macOS System Settings Map</span>
            <div className="flex items-center gap-1 font-mono text-[10px] text-cyan-400">
              <Settings className="w-3 h-3" />
              <span>System Settings &gt; Privacy &amp; Security &gt; Full Disk Access</span>
            </div>
          </div>

          {/* Window Mockup */}
          <div className="bg-slate-950 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
            {/* macOS Title Bar */}
            <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600"></div>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">Privacy &amp; Security — Full Disk Access</span>
              <div className="w-12"></div>
            </div>

            {/* Window Content */}
            <div className="grid grid-cols-12 min-h-[160px] text-xs">
              {/* Sidebar */}
              <div className="col-span-4 bg-slate-900/60 border-r border-slate-800 p-2.5 space-y-1">
                <div className="px-2 py-1 text-[11px] text-slate-400 rounded hover:bg-slate-800/40">General</div>
                <div className="px-2 py-1 text-[11px] text-slate-400 rounded hover:bg-slate-800/40">Notifications</div>
                <div className="px-2 py-1 text-[11px] font-bold text-white bg-indigo-600/30 border border-indigo-500/40 rounded flex items-center justify-between">
                  <span>Privacy &amp; Security</span>
                  <ArrowRight className="w-3 h-3 text-indigo-400" />
                </div>
                <div className="px-2 py-1 text-[11px] text-slate-400 rounded hover:bg-slate-800/40">Lock Screen</div>
              </div>

              {/* Main Panel */}
              <div className="col-span-8 p-3 space-y-3 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-200">Full Disk Access</span>
                    <p className="text-[10px] text-slate-400">Allow apps below to access all files on this Mac</p>
                  </div>
                  <span className="text-[10px] bg-indigo-950 border border-indigo-700/60 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">
                    TCC Pane
                  </span>
                </div>

                {/* App Row Simulator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-indigo-500/50 shadow-md">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-[10px] shadow">
                        SV
                      </div>
                      <div>
                        <div className="font-bold text-white text-[11px]">SambaVault</div>
                        <div className="text-[9px] text-slate-400 font-mono">com.sambavault.app</div>
                      </div>
                    </div>
                    {/* Active Switch */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">ON</span>
                      <div className="w-9 h-5 bg-indigo-600 rounded-full p-0.5 flex justify-end shadow-inner ring-2 ring-indigo-400/40">
                        <div className="w-4 h-4 bg-white rounded-full shadow"></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800 opacity-60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-400 text-[10px]">
                        <Terminal className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-[11px] text-slate-300">Terminal</div>
                    </div>
                    <div className="w-9 h-5 bg-slate-800 rounded-full p-0.5 flex items-center">
                      <div className="w-4 h-4 bg-slate-400 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CLI Quick Shortcut */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              Quick Command Line Trigger (macOS Terminal)
            </span>
            <button
              onClick={handleCopyCli}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition"
            >
              {copiedCli ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedCli ? 'Copied' : 'Copy'}
            </button>
          </div>
          <code className="block p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-300 select-all border border-slate-800">
            {cliCommand}
          </code>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleOpenSettings}
            disabled={isOpeningSettings}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isOpeningSettings ? 'Opening...' : 'Open System Settings Directly'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
