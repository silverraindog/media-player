import React, { useState } from 'react';
import {
  HardDrive,
  Terminal,
  Laptop,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Shield,
  Server,
  FolderOpen,
  Wifi,
  HelpCircle,
  AlertTriangle,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { SambaConfig } from '../types';
import { generateSambaMountConfigs } from '../utils/sambaScriptGenerator';
import { downloadTextFile } from '../utils/zipDownloader';
import { attemptMountSambaShare, MountActionResult } from '../utils/tauriBridge';

interface SambaMountHubProps {
  sambaConfig: SambaConfig;
  setSambaConfig: React.Dispatch<React.SetStateAction<SambaConfig>>;
  isConnected: boolean;
  onTestConnection: () => Promise<void>;
  isTesting: boolean;
  connectionDetails: any;
  isMountedInFinder?: boolean;
  mountedVolumeInfo?: any;
  systemVolumes?: string[];
  isDesktopApp?: boolean;
}

export const SambaMountHub: React.FC<SambaMountHubProps> = ({
  sambaConfig,
  setSambaConfig,
  isConnected,
  onTestConnection,
  isTesting,
  connectionDetails,
  isMountedInFinder = false,
  mountedVolumeInfo = null,
  systemVolumes = [],
  isDesktopApp = false,
}) => {
  const [activePlatformTab, setActivePlatformTab] = useState<'macos' | 'linux' | 'windows'>('macos');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isMounting, setIsMounting] = useState(false);
  const [mountFeedback, setMountFeedback] = useState<MountActionResult | null>(null);

  const mountConfigs = generateSambaMountConfigs(sambaConfig);
  const currentInstructions = mountConfigs[activePlatformTab];

  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleAttemptMount = async () => {
    setIsMounting(true);
    setMountFeedback(null);
    try {
      const result = await attemptMountSambaShare({
        server: sambaConfig.server,
        share: sambaConfig.share,
        port: Number(sambaConfig.port) || 445,
        username: sambaConfig.username,
        password: sambaConfig.password,
        isGuest: sambaConfig.isGuest,
      });
      setMountFeedback(result);
      // Wait a moment for OS mount to register and re-test
      setTimeout(() => {
        onTestConnection();
      }, 1200);
    } catch (e: any) {
      setMountFeedback({
        success: false,
        message: `Mount invocation failed: ${e?.message || e}`,
      });
    } finally {
      setIsMounting(false);
    }
  };

  const handleDownloadScript = () => {
    downloadTextFile(currentInstructions.downloadFilename, currentInstructions.terminalScript);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-3">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span>Cross-Platform Network Storage Hub</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Samba (SMB / CIFS) Setup for macOS, Linux & Windows
        </h2>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
          Connect your media server, TrueNAS, Synology, Unraid, or Ubuntu Samba share to your local workstation. Use these verified commands, auto-mount configs, and one-click scripts to mount your media directories directly into your operating system's native file explorer.
        </p>
      </div>

      {/* Main Grid: Server Config & OS Connectors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Samba Server Configuration Form */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Samba Share Settings</h3>
            </div>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              {isConnected ? 'Connected' : 'Offline / Pending'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Server Host & Share */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Server Host / IP</label>
                <input
                  id="samba-input-server"
                  type="text"
                  value={sambaConfig.server}
                  onChange={(e) => setSambaConfig({ ...sambaConfig, server: e.target.value })}
                  placeholder="192.168.1.150 or nas.local"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Share Name</label>
                <input
                  id="samba-input-share"
                  type="text"
                  value={sambaConfig.share}
                  onChange={(e) => setSambaConfig({ ...sambaConfig, share: e.target.value })}
                  placeholder="media or movies"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Port & Workgroup */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Port (SMB)</label>
                <input
                  id="samba-input-port"
                  type="number"
                  value={sambaConfig.port}
                  onChange={(e) => setSambaConfig({ ...sambaConfig, port: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Workgroup</label>
                <input
                  id="samba-input-workgroup"
                  type="text"
                  value={sambaConfig.workgroup}
                  onChange={(e) => setSambaConfig({ ...sambaConfig, workgroup: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Guest Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-300 font-medium">Guest / Anonymous Access</span>
              <button
                id="samba-toggle-guest"
                type="button"
                onClick={() => setSambaConfig({ ...sambaConfig, isGuest: !sambaConfig.isGuest })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  sambaConfig.isGuest ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    sambaConfig.isGuest ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Credentials (if not guest) */}
            {!sambaConfig.isGuest && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Username</label>
                  <input
                    id="samba-input-username"
                    type="text"
                    value={sambaConfig.username}
                    onChange={(e) => setSambaConfig({ ...sambaConfig, username: e.target.value })}
                    placeholder="samba_user"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Password</label>
                  <input
                    id="samba-input-password"
                    type="password"
                    value={sambaConfig.password}
                    onChange={(e) => setSambaConfig({ ...sambaConfig, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Finder /Volumes Status Card */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            isMountedInFinder
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <FolderOpen className={`w-4 h-4 ${isMountedInFinder ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-xs font-bold text-white">macOS /Volumes Mount:</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                isMountedInFinder
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {isMountedInFinder ? 'Active in Finder' : 'Not Mounted at /Volumes'}
              </span>
            </div>

            <div className="text-[11px] font-mono space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Target Path:</span>
                <span className="text-slate-200">/Volumes/{sambaConfig.share}</span>
              </div>
              {isMountedInFinder && mountedVolumeInfo && (
                <div className="flex items-center justify-between text-emerald-400">
                  <span>Accessible Items:</span>
                  <span>{mountedVolumeInfo.files.length} items detected</span>
                </div>
              )}
              {mountedVolumeInfo?.permissionDenied && (
                <div className="p-2 mt-1 rounded bg-amber-950/60 border border-amber-600/40 text-amber-300 text-[10px] space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-400" />
                    <span>Permission Denied on /Volumes</span>
                  </div>
                  <p>macOS Sandbox or Files and Folders privacy prevented reading volume contents. Please check System Settings ➔ Privacy &amp; Security.</p>
                </div>
              )}
              {mountedVolumeInfo?.errorDetails && !isMountedInFinder && (
                <div className="text-[10px] text-slate-500 pt-0.5">
                  {mountedVolumeInfo.errorDetails}
                </div>
              )}
              {systemVolumes.length > 0 && (
                <div className="pt-1 text-[10px] text-slate-400">
                  <span>Other mounted volumes: </span>
                  <span className="text-indigo-300">{systemVolumes.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Test Connection & Attempt Mount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              id="samba-test-conn-btn"
              onClick={onTestConnection}
              disabled={isTesting || !sambaConfig.server || !sambaConfig.share}
              className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition cursor-pointer"
            >
              {isTesting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Probing Share...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Test Samba Connection</span>
                </>
              )}
            </button>

            <button
              id="samba-attempt-mount-btn"
              onClick={handleAttemptMount}
              disabled={isMounting || !sambaConfig.server || !sambaConfig.share}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition cursor-pointer"
              title="Executes native mount_smbfs on macOS or mount.cifs on Linux"
            >
              {isMounting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Mounting via Shell...</span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Attempt Mount</span>
                </>
              )}
            </button>
          </div>

          {/* Mount Feedback Banner (if executed) */}
          {mountFeedback && (
            <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1 ${
              mountFeedback.success
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
            }`}>
              <div className="flex items-center gap-1.5 font-semibold">
                {mountFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{mountFeedback.message}</span>
              </div>
              {mountFeedback.stderr && (
                <div className="text-[10px] font-mono text-rose-300 bg-slate-950/80 p-2 rounded border border-rose-900/50 overflow-x-auto">
                  {mountFeedback.stderr}
                </div>
              )}
            </div>
          )}

          {/* Connection Probe Stats (if tested) */}
          {connectionDetails && (
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5 text-[11px] font-mono text-slate-300">
              <div className="flex justify-between text-slate-400">
                <span>Protocol:</span>
                <span className="text-indigo-300">{connectionDetails.protocol}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Finder Status:</span>
                <span className={connectionDetails.isMountedInFinder ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {connectionDetails.isMountedInFinder ? `Mounted at ${connectionDetails.mountPath}` : 'Not in /Volumes'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Auth:</span>
                <span className="text-emerald-300">{connectionDetails.authenticatedAs}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Latency:</span>
                <span className="text-emerald-400">{connectionDetails.latencyMs} ms</span>
              </div>
            </div>
          )}

          {/* macOS Local Network Privacy Explainer */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>macOS Local Network Privacy Note:</span>
            </div>
            <p className="leading-relaxed">
              On macOS Sequoia & Sonoma, macOS prompts for permission when an app initiates a local socket or broadcasts UDP/Bonjour to local IP addresses (like <code className="text-indigo-300 bg-slate-900 px-1 rounded">{sambaConfig.server}</code>).
            </p>
            <p className="leading-relaxed">
              If macOS did not prompt or if you denied it, you can toggle it on manually anytime in:
              <br />
              <strong className="text-slate-300">System Settings ➔ Privacy & Security ➔ Local Network ➔ SambaVault</strong> (enable switch).
            </p>
          </div>
        </div>

        {/* Right: OS Mount Commands and Walkthrough */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            {/* Platform Selector Tabs */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex space-x-2">
                <button
                  id="tab-mount-macos"
                  onClick={() => setActivePlatformTab('macos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activePlatformTab === 'macos'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>macOS</span>
                </button>

                <button
                  id="tab-mount-linux"
                  onClick={() => setActivePlatformTab('linux')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activePlatformTab === 'linux'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Linux (CIFS)</span>
                </button>

                <button
                  id="tab-mount-windows"
                  onClick={() => setActivePlatformTab('windows')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activePlatformTab === 'windows'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Windows (SMB)</span>
                </button>
              </div>

              {/* Download script for current OS */}
              <button
                id="btn-download-mount-script"
                onClick={handleDownloadScript}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-slate-700 transition"
                title={`Download executable ${currentInstructions.downloadFilename}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .{currentInstructions.fileExtension}</span>
              </button>
            </div>

            {/* OS Content */}
            <div className="mt-4 space-y-4 text-xs">
              {/* Quick CLI Command Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-slate-400">
                  <span className="font-semibold text-slate-200">1. Instant Terminal / CLI Command:</span>
                  <button
                    id="btn-copy-quick-cmd"
                    onClick={() => handleCopy(currentInstructions.quickCommand, 'quick-cmd')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {copiedSection === 'quick-cmd' ? (
                      <span className="text-emerald-400">Copied!</span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-cyan-300 text-[11px] overflow-x-auto select-all">
                  {currentInstructions.quickCommand}
                </pre>
              </div>

              {/* GUI Step-by-Step Guide */}
              <div>
                <span className="font-semibold text-slate-200 block mb-2">
                  2. Native Graphical Setup ({activePlatformTab === 'macos' ? 'Finder' : activePlatformTab === 'linux' ? 'Nautilus / Dolphin' : 'File Explorer'}):
                </span>
                <ol className="space-y-1.5 list-decimal list-inside text-slate-300 pl-1 leading-relaxed">
                  {currentInstructions.guiSteps.map((step, idx) => (
                    <li key={idx} className="text-slate-300">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Permanent fstab / PowerShell snippet */}
              {currentInstructions.fstabOrPermanentConfig && (
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-slate-400">
                    <span className="font-semibold text-slate-200">
                      {activePlatformTab === 'linux' ? '3. Permanent /etc/fstab Auto-Mount:' : '3. PowerShell Network Mapping:'}
                    </span>
                    <button
                      id="btn-copy-fstab"
                      onClick={() => handleCopy(currentInstructions.fstabOrPermanentConfig!, 'fstab')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      {copiedSection === 'fstab' ? (
                        <span className="text-emerald-400">Copied!</span>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-amber-300 text-[11px] overflow-x-auto select-all">
                    {currentInstructions.fstabOrPermanentConfig}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Quick Troubleshooting Tip Box */}
          <div className="p-3 bg-indigo-950/30 border border-indigo-900/40 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Samba Compatibility Tip: </span>
              Ensure your Samba server in <code className="text-indigo-300 bg-indigo-950/60 px-1 rounded">smb.conf</code> allows <code className="text-indigo-300 bg-indigo-950/60 px-1 rounded">server min protocol = SMB2</code> or <code className="text-indigo-300 bg-indigo-950/60 px-1 rounded">SMB3</code>. Firewall port <code className="text-indigo-300 bg-indigo-950/60 px-1 rounded">445 TCP</code> must be open between your machine and server.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
