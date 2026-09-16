import React from 'react';
import {
  HardDrive,
  Film,
  Tv,
  Music,
  FolderSync,
  Terminal,
  FileCode2,
  FolderTree,
  Sparkles,
  Wifi,
  CheckCircle2,
  Laptop,
  Database,
  Bookmark,
  BarChart3,
  History,
} from 'lucide-react';
import { SambaConfig, AppTab } from '../types';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  sambaConfig: SambaConfig;
  setSambaConfig: React.Dispatch<React.SetStateAction<SambaConfig>>;
  isConnected: boolean;
  onOpenQuickMount: () => void;
  watchlistCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  sambaConfig,
  setSambaConfig,
  isConnected,
  onOpenQuickMount,
  watchlistCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">SambaVault</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  Media & Metadata
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Series, Movies & Music for macOS • Linux • Windows
              </p>
            </div>
          </div>

          {/* Center Platform & Samba Status */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Target OS Quick Switch */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs">
              <span className="text-slate-400 px-2 flex items-center gap-1">
                <Laptop className="w-3.5 h-3.5" /> OS:
              </span>
              <button
                id="header-platform-all"
                onClick={() => setSambaConfig((prev) => ({ ...prev, targetPlatform: 'all' }))}
                className={`px-2.5 py-1 rounded transition-colors ${
                  sambaConfig.targetPlatform === 'all'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                id="header-platform-mac"
                onClick={() => setSambaConfig((prev) => ({ ...prev, targetPlatform: 'macos' }))}
                className={`px-2.5 py-1 rounded transition-colors ${
                  sambaConfig.targetPlatform === 'macos'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                macOS
              </button>
              <button
                id="header-platform-linux"
                onClick={() => setSambaConfig((prev) => ({ ...prev, targetPlatform: 'linux' }))}
                className={`px-2.5 py-1 rounded transition-colors ${
                  sambaConfig.targetPlatform === 'linux'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Linux
              </button>
              <button
                id="header-platform-win"
                onClick={() => setSambaConfig((prev) => ({ ...prev, targetPlatform: 'windows' }))}
                className={`px-2.5 py-1 rounded transition-colors ${
                  sambaConfig.targetPlatform === 'windows'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Windows
              </button>
            </div>

            {/* Samba Status Badge */}
            <button
              id="header-samba-status-btn"
              onClick={onOpenQuickMount}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                isConnected
                  ? 'bg-slate-800 hover:bg-slate-750 border-emerald-500/30 text-slate-300 hover:border-emerald-500/50'
                  : 'bg-amber-950/40 hover:bg-amber-950/60 border-amber-500/40 text-amber-200 hover:border-amber-500/60'
              }`}
              title={isConnected ? 'Samba share active & verified' : 'Samba share unverified / pending connection. Click to configure.'}
            >
              <span className="relative flex h-2 w-2">
                {isConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
              </span>
              <span className="font-mono">
                {sambaConfig.server ? `//${sambaConfig.server}/${sambaConfig.share}` : 'Configure Samba Share'}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                isConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {isConnected ? 'SMB3' : 'OFFLINE'}
              </span>
            </button>
          </div>

          {/* Right Action Info */}
          <div className="flex items-center space-x-2">
            <button
              id="header-mount-hub-btn"
              onClick={() => setActiveTab('samba-mount')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>OS Mount Hub</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation (2 Rows) */}
        <div className="border-t border-slate-800/80 py-2 space-y-1.5 overflow-x-auto scrollbar-none text-xs sm:text-sm">
          {/* Row 1: Core Media & Discovery */}
          <div className="flex items-center space-x-1.5 min-w-max">
            <button
              id="tab-search"
              onClick={() => setActiveTab('search')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'search'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span>Search & Metadata</span>
            </button>

            <button
              id="tab-music"
              onClick={() => setActiveTab('music')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'music'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Music className="w-4 h-4 text-emerald-300" />
              <span>Music & Audio Vault</span>
            </button>

            <button
              id="tab-watchlist"
              onClick={() => setActiveTab('watchlist')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'watchlist'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${activeTab === 'watchlist' ? 'text-amber-200 fill-amber-200' : 'text-amber-400'}`} />
              <span>My Watchlist</span>
              {watchlistCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {watchlistCount}
                </span>
              )}
            </button>

            <button
              id="tab-history"
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <History className="w-4 h-4 text-indigo-300" />
              <span>Watch History</span>
            </button>

            <button
              id="tab-sqlite-vault"
              onClick={() => setActiveTab('sqlite-vault')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'sqlite-vault'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>SQLite Vault & Progress</span>
            </button>
          </div>

          {/* Row 2: Advanced Utilities & OS Mount Tools */}
          <div className="flex items-center space-x-1.5 min-w-max">
            <button
              id="tab-stats"
              onClick={() => setActiveTab('stats')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'stats'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>Library Stats</span>
            </button>

            <button
              id="tab-cleaner"
              onClick={() => setActiveTab('cleaner')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'cleaner'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FolderSync className="w-4 h-4 text-cyan-300" />
              <span>Batch File Cleaner</span>
            </button>

            <button
              id="tab-explorer"
              onClick={() => setActiveTab('explorer')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'explorer'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FolderTree className="w-4 h-4 text-emerald-300" />
              <span>Samba Share Browser</span>
            </button>

            <button
              id="tab-samba-mount"
              onClick={() => setActiveTab('samba-mount')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'samba-mount'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-4 h-4 text-amber-300" />
              <span>Cross-Platform Mount</span>
            </button>

            <button
              id="tab-nfo-studio"
              onClick={() => setActiveTab('nfo-studio')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                activeTab === 'nfo-studio'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileCode2 className="w-4 h-4 text-purple-300" />
              <span>NFO / XML Studio</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
