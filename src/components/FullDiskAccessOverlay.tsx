import React, { useState } from 'react';
import {
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Terminal,
  FolderLock,
  ArrowRight,
  HardDrive
} from 'lucide-react';
import { permissionsManager, FullDiskAccessStatus } from '../utils/permissionsManager';

interface FullDiskAccessOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  status?: FullDiskAccessStatus | null;
  onRecheck?: () => Promise<boolean>;
  onOpenSettings?: () => Promise<void> | void;
}

export const FullDiskAccessOverlay: React.FC<FullDiskAccessOverlayProps> = ({
  isOpen,
  onClose,
  status,
  onRecheck,
  onOpenSettings,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ text: string; success: boolean } | null>(null);
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
        await onOpenSettings();
      } else {
        await permissionsManager.requestAndRegisterFullDiskAccess();
      }
    } catch (err: any) {
      console.warn('Could not launch system settings automatically:', err);
    } finally {
      setTimeout(() => setIsOpeningSettings(false), 1200);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      let isGranted = false;
      if (onRecheck) {
        isGranted = await onRecheck();
      } else {
        const freshStatus = await permissionsManager.checkFullDiskAccess(true);
        isGranted = Boolean(freshStatus.hasFullDiskAccess);
      }

      if (isGranted) {
        setVerifyMessage({
          text: '✓ Full Disk Access successfully verified! You now have full access to network shares in /Volumes.',
          success: true,
        });
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setVerifyMessage({
          text: 'Permission not yet detected. Make sure SambaVault is toggled ON in System Settings, then try again.',
          success: false,
        });
      }
    } catch (err: any) {
      setVerifyMessage({
        text: `Verification error: ${err?.message || 'Check failed'}`,
        success: false,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      id="fda-preflight-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fda-overlay-title"
    >
      <div className="relative bg-slate-900 border border-amber-500/50 rounded-2xl shadow-2xl max-w-xl w-full p-6 sm:p-7 space-y-5 text-slate-100 ring-1 ring-amber-500/20 my-auto">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0 shadow-inner">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Pre-Flight System Check
                </span>
                <span className="text-[10px] font-semibold text-rose-400">
                  Permission Missing
                </span>
              </div>
              <h2 id="fda-overlay-title" className="text-lg font-bold text-white mt-1">
                macOS Full Disk Access Required
              </h2>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-fda-overlay"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Dismiss overlay (access remains pending)"
            aria-label="Dismiss overlay"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Explanation */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200/90 space-y-2 leading-relaxed">
          <div className="flex items-start gap-2">
            <FolderLock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              macOS Transparency, Consent, and Control (TCC) security blocks access to mounted network shares in <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[11px]">/Volumes/</code> unless <strong>SambaVault</strong> is granted <strong>Full Disk Access</strong> in System Settings.
            </p>
          </div>
          {status?.checkedPath && (
            <div className="text-[11px] text-amber-300/80 pl-6 font-mono">
              Target checked: {status.checkedPath}
            </div>
          )}
        </div>

        {/* 3 Step Visual Guide */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick 3-Step Setup
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-3 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                1
              </span>
              <p className="text-slate-300">
                Click <strong className="text-white">"Open System Settings"</strong> below (or  Apple Menu &rarr; System Settings).
              </p>
            </div>
            <div className="flex items-start gap-3 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                2
              </span>
              <p className="text-slate-300">
                In the sidebar choose <strong className="text-white">Privacy &amp; Security</strong> &rarr; <strong className="text-white">Full Disk Access</strong>.
              </p>
            </div>
            <div className="flex items-start gap-3 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                3
              </span>
              <p className="text-slate-300">
                Toggle <strong className="text-emerald-400 font-semibold">SambaVault</strong> to <strong className="text-emerald-400">ON</strong>. (If not listed, click <strong className="text-white font-mono">+</strong> to add it from Applications).
              </p>
            </div>
          </div>
        </div>

        {/* Direct Terminal Command Fallback */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              Direct URL / Terminal Deep-Link:
            </span>
            <button
              type="button"
              onClick={handleCopyCli}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition cursor-pointer"
            >
              {copiedCli ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedCli ? 'Copied' : 'Copy'}
            </button>
          </div>
          <code className="block p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-300 select-all border border-slate-800 break-all">
            {cliCommand}
          </code>
        </div>

        {/* Verification status feedback */}
        {verifyMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              verifyMessage.success
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
            }`}
          >
            {verifyMessage.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{verifyMessage.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            id="btn-dismiss-fda-overlay"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium rounded-xl text-xs transition cursor-pointer text-center order-2 sm:order-1"
          >
            Dismiss &amp; Continue to App
          </button>

          <div className="flex items-center gap-2.5 order-1 sm:order-2">
            <button
              type="button"
              id="btn-verify-fda-overlay"
              onClick={handleVerify}
              disabled={isVerifying}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isVerifying ? 'Verifying...' : 'Verify Access'}</span>
            </button>

            <button
              type="button"
              id="btn-open-system-settings-overlay"
              onClick={handleOpenSettings}
              disabled={isOpeningSettings}
              className="flex-1 sm:flex-none px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-900/30 cursor-pointer disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isOpeningSettings ? 'Opening...' : 'Open System Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
