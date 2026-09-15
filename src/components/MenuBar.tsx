import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  FolderOpen,
  RotateCw,
  Sparkles,
  Search,
  Tv,
  Film,
  Music,
  FolderTree,
  Database,
  FolderSync,
  FileCode2,
  Terminal,
  Trash2,
  Download,
  Upload,
  Layers,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  HardDrive,
  Check,
  CheckCircle2,
  ListFilter,
  MonitorPlay,
  Settings,
  FolderSearch,
} from 'lucide-react';
import { SambaConfig, MediaType } from '../types';

interface MenuBarProps {
  activeTab: 'search' | 'cleaner' | 'samba-mount' | 'explorer' | 'nfo-studio' | 'sqlite-vault';
  setActiveTab: (tab: 'search' | 'cleaner' | 'samba-mount' | 'explorer' | 'nfo-studio' | 'sqlite-vault') => void;
  onSelectViewMediaType?: (type: 'all' | MediaType) => void;
  selectedMediaType?: 'all' | MediaType;
  sambaConfig: SambaConfig;
  isConnected: boolean;
  onScanSamba: () => void;
  onOpenClassifierModal: () => void;
  onOpenQuickMount: () => void;
  onClearThumbnailCache: () => void;
  onTriggerLocalImport: () => void;
  onExportLibraryBackup: () => void;
  onRefreshStatus: () => void;
  onToggleExpandAll?: () => void;
  isAllExpanded?: boolean;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  activeTab,
  setActiveTab,
  onSelectViewMediaType,
  selectedMediaType = 'all',
  sambaConfig,
  isConnected,
  onScanSamba,
  onOpenClassifierModal,
  onOpenQuickMount,
  onClearThumbnailCache,
  onTriggerLocalImport,
  onExportLibraryBackup,
  onRefreshStatus,
  onToggleExpandAll,
  isAllExpanded = true,
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'view' | 'help' | null>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if inside input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        onScanSamba();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setActiveTab('search');
        if (onSelectViewMediaType) onSelectViewMediaType('all');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('search');
        if (onSelectViewMediaType) onSelectViewMediaType('series');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setActiveTab('search');
        if (onSelectViewMediaType) onSelectViewMediaType('movie');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault();
        setActiveTab('search');
        if (onSelectViewMediaType) onSelectViewMediaType('album');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '5') {
        e.preventDefault();
        setActiveTab('explorer');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '6') {
        e.preventDefault();
        setActiveTab('sqlite-vault');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScanSamba, setActiveTab, onSelectViewMediaType]);

  const handleMenuClick = (menu: 'file' | 'edit' | 'view' | 'help') => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const handleMenuHover = (menu: 'file' | 'edit' | 'view' | 'help') => {
    if (openMenu !== null) {
      setOpenMenu(menu);
    }
  };

  const executeAction = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  return (
    <>
      <div
        ref={menuBarRef}
        className="bg-slate-950 border-b border-slate-800/90 text-xs select-none relative z-50 text-slate-300 font-sans"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-7">
          {/* Left Menus: File, Edit, View, Help */}
          <div className="flex items-center space-x-1">
            {/* FILE MENU */}
            <div className="relative">
              <button
                id="menu-bar-file-btn"
                onClick={() => handleMenuClick('file')}
                onMouseEnter={() => handleMenuHover('file')}
                className={`px-2.5 py-1 rounded transition-colors text-xs ${
                  openMenu === 'file'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                File
              </button>

              {openMenu === 'file' && (
                <div className="absolute left-0 top-full mt-0.5 w-64 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-slate-200 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={() =>
                      executeAction(() => {
                        onScanSamba();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Scan Samba Volume (Deep Discover)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘R</span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onTriggerLocalImport();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Import Local Media Files...</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘O</span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onOpenClassifierModal();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Classify Folders & Regex Engine</span>
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onOpenQuickMount();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Configure Samba Connection...</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘K</span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('samba-mount');
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cross-Platform Mount Commands</span>
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onExportLibraryBackup();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export Media Vault (.json)</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* EDIT MENU */}
            <div className="relative">
              <button
                id="menu-bar-edit-btn"
                onClick={() => handleMenuClick('edit')}
                onMouseEnter={() => handleMenuHover('edit')}
                className={`px-2.5 py-1 rounded transition-colors text-xs ${
                  openMenu === 'edit'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                Edit
              </button>

              {openMenu === 'edit' && (
                <div className="absolute left-0 top-full mt-0.5 w-64 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-slate-200 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={() =>
                      executeAction(() => {
                        onOpenClassifierModal();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Edit Folder Classification Rules...</span>
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('cleaner');
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FolderSync className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Batch Rename & Clean Filenames</span>
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('nfo-studio');
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Edit NFO / XML Metadata Templates</span>
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onClearThumbnailCache();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-rose-600 hover:text-white flex items-center justify-between text-xs transition-colors text-rose-300"
                  >
                    <span className="flex items-center gap-2">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Thumbnail & Memory Cache</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* VIEW MENU (Special focus per user request) */}
            <div className="relative">
              <button
                id="menu-bar-view-btn"
                onClick={() => handleMenuClick('view')}
                onMouseEnter={() => handleMenuHover('view')}
                className={`px-2.5 py-1 rounded transition-colors text-xs font-semibold ${
                  openMenu === 'view'
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                View
              </button>

              {openMenu === 'view' && (
                <div className="absolute left-0 top-full mt-0.5 w-72 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-slate-200 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Library Views & Catalogs
                  </div>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('search');
                        if (onSelectViewMediaType) onSelectViewMediaType('all');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'search' && selectedMediaType === 'all' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>All Media (Unified Search)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘1</span>
                  </button>

                  {/* TV Series view under VIEW menu */}
                  <button
                    id="view-menu-series-btn"
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('search');
                        if (onSelectViewMediaType) onSelectViewMediaType('series');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'search' && selectedMediaType === 'series' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Tv className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-medium text-purple-200">TV Series & Shows</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘2</span>
                  </button>

                  {/* Movies view under VIEW menu */}
                  <button
                    id="view-menu-movies-btn"
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('search');
                        if (onSelectViewMediaType) onSelectViewMediaType('movie');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'search' && selectedMediaType === 'movie' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Film className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Feature Films & Cinema</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘3</span>
                  </button>

                  {/* Music view under VIEW menu */}
                  <button
                    id="view-menu-music-btn"
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('search');
                        if (onSelectViewMediaType) onSelectViewMediaType('album');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'search' && selectedMediaType === 'album' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Music className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Music Albums & Audiobooks</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘4</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Samba & Local Storage Tools
                  </div>

                  <button
                    id="view-menu-explorer-btn"
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('explorer');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'explorer' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Samba Share Browser & Pusher</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘5</span>
                  </button>

                  <button
                    id="view-menu-sqlite-btn"
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('sqlite-vault');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'sqlite-vault' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>SQLite Vault & Watch Progress</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">⌘6</span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('cleaner');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'cleaner' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FolderSync className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Batch File Cleaner & Tagging</span>
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('nfo-studio');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'nfo-studio' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>NFO / XML Metadata Studio</span>
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setActiveTab('samba-mount');
                      })
                    }
                    className={`w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors ${
                      activeTab === 'samba-mount' ? 'bg-indigo-950/80 text-indigo-200 font-semibold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cross-Platform OS Mount Hub</span>
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  {onToggleExpandAll && (
                    <button
                      onClick={() =>
                        executeAction(() => {
                          onToggleExpandAll();
                        })
                      }
                      className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isAllExpanded ? 'Collapse All Tree Folders' : 'Expand All Tree Folders'}</span>
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() =>
                      executeAction(() => {
                        onRefreshStatus();
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Refresh Mount & File Status</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">F5</span>
                  </button>
                </div>
              )}
            </div>

            {/* HELP MENU */}
            <div className="relative">
              <button
                id="menu-bar-help-btn"
                onClick={() => handleMenuClick('help')}
                onMouseEnter={() => handleMenuHover('help')}
                className={`px-2.5 py-1 rounded transition-colors text-xs ${
                  openMenu === 'help'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                Help
              </button>

              {openMenu === 'help' && (
                <div className="absolute left-0 top-full mt-0.5 w-64 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-slate-200 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={() =>
                      executeAction(() => {
                        setIsHelpModalOpen(true);
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Kodi / Plex Folder Structure Guide</span>
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      executeAction(() => {
                        setIsAboutModalOpen(true);
                      })
                    }
                    className="w-full px-3 py-1.5 text-left hover:bg-indigo-600 hover:text-white flex items-center justify-between text-xs transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>About SambaVault (v2.4)</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Status Summary */}
          <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
            <span className="hidden md:inline-flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>{sambaConfig.server ? `//${sambaConfig.server}/${sambaConfig.share}` : 'No Share Configured'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Guide Modal */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
                <HelpCircle className="w-5 h-5" />
                <span>Media Organization & Naming Guide (Kodi / Jellyfin / Plex)</span>
              </div>
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                SambaVault uses standardized folder patterns to automatically categorize your media files across network shares.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono space-y-2">
                <div className="text-emerald-400 font-bold">📺 TV Series / Shows Structure:</div>
                <div className="text-slate-400">
                  Series/Breaking Bad (2008)/Season 01/Breaking Bad - S01E01 - Pilot.mkv<br />
                  Series/Breaking Bad (2008)/tvshow.nfo<br />
                  Series/Breaking Bad (2008)/poster.jpg
                </div>

                <div className="text-indigo-400 font-bold pt-2">🎬 Movies / Feature Films Structure:</div>
                <div className="text-slate-400">
                  Movies/Interstellar (2014)/Interstellar (2014) [1080p].mp4<br />
                  Movies/Interstellar (2014)/movie.nfo<br />
                  Movies/Interstellar (2014)/poster.jpg
                </div>

                <div className="text-cyan-400 font-bold pt-2">🎵 Music Albums Structure:</div>
                <div className="text-slate-400">
                  Music/Daft Punk/Random Access Memories (2013)/01 - Give Life Back to Music.flac<br />
                  Music/Daft Punk/Random Access Memories (2013)/album.nfo<br />
                  Music/Daft Punk/Random Access Memories (2013)/folder.jpg
                </div>
              </div>

              <p className="text-slate-400 text-[11px]">
                Tip: You can use the <strong>View</strong> menu at the top or keyboard shortcuts (⌘1 for All, ⌘2 for TV Series, ⌘3 for Movies, ⌘4 for Music) to filter and navigate instantly.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">SambaVault Media Manager</h3>
                <p className="text-xs text-indigo-300">Version 2.4 (Desktop & Web)</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              High-performance network media tagger, Samba SMB3 share pusher, recursive scanner, and NFO generator engineered for Kodi, Plex, Jellyfin, and local SQLite vaults.
            </p>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
              <div>• Non-blocking time-sliced tree extraction</div>
              <div>• Automatic Series & Season detection</div>
              <div>• Virtualized 60FPS list rendering</div>
              <div>• Instant View & Filter switching</div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsAboutModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
