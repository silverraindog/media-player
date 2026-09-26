import React, { useState } from 'react';
import {
  Server,
  HardDrive,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  FolderOpen,
  Terminal,
  ShieldCheck,
  Zap,
  ExternalLink,
  Laptop,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { SambaConfig } from '../types';
import { VolumeMountInfo } from '../utils/tauriBridge';

interface SambaMountHubProps {
  sambaConfig: SambaConfig;
  setSambaConfig: (config: SambaConfig | ((prev: SambaConfig) => SambaConfig)) => void;
  isConnected: boolean;
  onTestConnection: () => Promise<void> | void;
  isTesting: boolean;
  connectionDetails: any;
  isMountedInFinder: boolean;
  mountedVolumeInfo: VolumeMountInfo | null;
  systemVolumes: any[];
  isDesktopApp: boolean;
}

export const SambaMountHub: React.FC<SambaMountHubProps> = ({
  sambaConfig,
  setSambaConfig,
  isConnected,
  onTestConnection,
  isTesting,
  connectionDetails,
  isMountedInFinder,
  mountedVolumeInfo,
  systemVolumes,
  isDesktopApp,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const macMountCommand = `mount_smbfs //${sambaConfig.isGuest ? 'guest@' : (sambaConfig.username ? `${sambaConfig.username}@` : '')}${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'} /Volumes/${sambaConfig.share || 'media'}`;
  const macFinderUrl = `smb://${sambaConfig.isGuest ? '' : (sambaConfig.username ? `${sambaConfig.username}@` : '')}${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'}`;
  const linuxMountCommand = `sudo mount -t cifs //${sambaConfig.server || '192.168.1.150'}/${sambaConfig.share || 'media'} /mnt/${sambaConfig.share || 'media'} -o username=${sambaConfig.isGuest ? 'guest' : (sambaConfig.username || 'user')}${sambaConfig.password ? `,password=***` : ',guest'},iocharset=utf8,vers=3.0`;
  const windowsMountCommand = `net use Z: \\\\${sambaConfig.server || '192.168.1.150'}\\${sambaConfig.share || 'media'} ${sambaConfig.password ? sambaConfig.password : ''} /USER:${sambaConfig.username || 'user'} /PERSISTENT:YES`;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
              <Server className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Samba Network Storage Hub
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Online & Reachable
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    <XCircle className="w-3.5 h-3.5 text-slate-500" /> Offline / Unverified
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Connect your NAS, Kodi, unRAID, or Windows SMB media directory for real-time metadata indexing and artwork synchronization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg font-medium text-sm transition-all shadow-md active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'Testing Probe...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* Local Mount Status Banner */}
        {isMountedInFinder && (
          <div className="mt-4 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between text-sm text-emerald-300">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>
                <strong>System Mount Detected:</strong> Local volume active at{' '}
                <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono text-xs text-emerald-200">
                  {mountedVolumeInfo?.mountPath || `/Volumes/${sambaConfig.share}`}
                </code>
              </span>
            </div>
            <span className="text-xs text-emerald-400 font-medium">Native I/O Ready</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Server Credentials Form */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <HardDrive className="w-4 h-4 text-blue-400" />
            Share Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Server IP or Hostname
              </label>
              <input
                type="text"
                placeholder="e.g. 192.168.1.150 or nas.local"
                value={sambaConfig.server}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, server: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Share Directory Name
              </label>
              <input
                type="text"
                placeholder="e.g. media or Movies"
                value={sambaConfig.share}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, share: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
              />
            </div>
          </div>

          {/* Or Add Custom Volume Path / Local Mount Path */}
          <div className="pt-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-300">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                Or Add Custom Volume Path / Local Mount Path (Optional)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">e.g. /Volumes/Media or /mnt/media</span>
            </label>
            <input
              type="text"
              placeholder="/Volumes/Media or /path/to/share"
              value={sambaConfig.mountPath || ''}
              onChange={(e) => setSambaConfig((prev) => ({ ...prev, mountPath: e.target.value }))}
              className="w-full bg-slate-950 border border-blue-500/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono"
            />
            <p className="text-[11px] text-slate-300 mt-1">
              If specified and not empty, <strong className="text-white">Server IP & Hostname can be left blank</strong>. The scanner will directly read from this local volume path with zero network overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Samba Port
              </label>
              <select
                value={sambaConfig.port}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, port: Number(e.target.value) }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value={445}>445 (SMB Direct over TCP - Recommended)</option>
                <option value={139}>139 (NetBIOS Session Service)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Workgroup / Domain
              </label>
              <input
                type="text"
                placeholder="WORKGROUP"
                value={sambaConfig.workgroup || 'WORKGROUP'}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, workgroup: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Target Operating System
              </label>
              <select
                value={sambaConfig.targetPlatform || 'all'}
                onChange={(e) => setSambaConfig((prev) => ({ ...prev, targetPlatform: e.target.value as any }))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="all">Universal / Auto</option>
                <option value="macos">macOS (Finder / smb://)</option>
                <option value="linux">Linux (CIFS mount)</option>
                <option value="windows">Windows (UNC Share)</option>
              </select>
            </div>
          </div>

          {/* Authentication Section */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Authentication Credentials
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={sambaConfig.isGuest}
                  onChange={(e) => setSambaConfig((prev) => ({ ...prev, isGuest: e.target.checked }))}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-950"
                />
                Connect as Anonymous Guest
              </label>
            </div>

            {!sambaConfig.isGuest && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. smbuser"
                    value={sambaConfig.username}
                    onChange={(e) => setSambaConfig((prev) => ({ ...prev, username: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={sambaConfig.password}
                    onChange={(e) => setSambaConfig((prev) => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mount Commands Tab / Cheatsheet */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              Quick Mount Shortcuts & Terminal Commands
            </h3>

            {/* macOS */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-sky-400" /> macOS Finder Connect (⌘K)
                </span>
                <button
                  onClick={() => handleCopy(macFinderUrl, 'macFinder')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                >
                  {copiedKey === 'macFinder' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'macFinder' ? 'Copied' : 'Copy URI'}
                </button>
              </div>
              <code className="block text-xs font-mono text-sky-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {macFinderUrl}
              </code>
            </div>

            {/* Linux */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" /> Linux Terminal Mount
                </span>
                <button
                  onClick={() => handleCopy(linuxMountCommand, 'linux')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                >
                  {copiedKey === 'linux' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'linux' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block text-xs font-mono text-amber-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {linuxMountCommand}
              </code>
            </div>

            {/* Windows */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-purple-400" /> Windows Command Prompt (cmd)
                </span>
                <button
                  onClick={() => handleCopy(windowsMountCommand, 'win')}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs transition-colors"
                >
                  {copiedKey === 'win' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'win' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block text-xs font-mono text-purple-300 bg-slate-900/90 p-2 rounded select-all break-all">
                {windowsMountCommand}
              </code>
            </div>
          </div>
        </div>

        {/* Right Column: Connection Audit & Discovered Volumes */}
        <div className="space-y-6">
          {/* Connection Audit Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Connection Diagnostics
            </h3>

            {connectionDetails ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Server Target:</span>
                  <span className="font-mono text-slate-200">{connectionDetails.server}:{connectionDetails.port}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Share Resource:</span>
                  <span className="font-mono text-slate-200">/{connectionDetails.share}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Protocol:</span>
                  <span className="text-slate-200">{connectionDetails.protocol || 'SMB3'}</span>
                </div>
                {connectionDetails.latencyMs && (
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Round-Trip Latency:</span>
                    <span className="text-emerald-400 font-mono">{connectionDetails.latencyMs} ms</span>
                  </div>
                )}
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <p className={connectionDetails.connected ? 'text-emerald-400' : 'text-rose-400'}>
                    {connectionDetails.message || connectionDetails.error || (connectionDetails.connected ? 'Probe completed successfully.' : 'Probe failed.')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                Click <strong>"Test Connection"</strong> to run a network socket probe against the configured Samba server.
              </div>
            )}
          </div>

          {/* Mounted Volumes Selector */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-400" />
              Detected System Mounts
            </h3>

            {systemVolumes && systemVolumes.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {systemVolumes.map((vol, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (vol.name) {
                        setSambaConfig((prev) => ({
                          ...prev,
                          share: vol.name,
                          baseMountPath: vol.path || `/Volumes/${vol.name}`,
                        }));
                      }
                    }}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-lg cursor-pointer transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <HardDrive className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="font-medium text-slate-200 truncate">{vol.name}</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[11px] truncate max-w-[120px]">{vol.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {isDesktopApp
                  ? 'No external SMB network mounts currently detected in /Volumes.'
                  : 'Desktop bridge active. Mount your Samba share in Finder (⌘K) to index files at full local bus speed.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
