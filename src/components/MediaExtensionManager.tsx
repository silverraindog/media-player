import React, { useState } from 'react';
import {
  FileVideo,
  FileAudio,
  BookOpen,
  Disc,
  FileCode,
  Image,
  FileText,
  Check,
  Plus,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  Info,
  Filter,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { MediaExtensionCategory, MediaScanExtensionConfig } from '../types';
import {
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_DISC_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_BOOK_EXTENSIONS,
  SUPPORTED_SUBTITLE_EXTENSIONS,
  SUPPORTED_ARTWORK_EXTENSIONS,
  SUPPORTED_METADATA_EXTENSIONS,
} from '../utils/mediaExtractor';

interface MediaExtensionManagerProps {
  config: MediaScanExtensionConfig;
  onChangeConfig: (newConfig: MediaScanExtensionConfig) => void;
  activeFilterExtension: string | null;
  onSelectFilterExtension: (ext: string | null) => void;
  discoveredExtensionCounts?: Record<string, number>;
  onTriggerScan?: () => void;
}

export const CATEGORY_DEFINITIONS: Array<{
  key: MediaExtensionCategory;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  extensions: string[];
  description: string;
}> = [
  {
    key: 'video',
    name: 'Video Containers',
    icon: FileVideo,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/30',
    extensions: SUPPORTED_VIDEO_EXTENSIONS,
    description: 'Movies, TV shows, anime, and 4K HDR streams (Matroska, MP4, AVI, WebM, Transport Streams)',
  },
  {
    key: 'disc_images',
    name: 'Disc Images & Rips',
    icon: Disc,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    extensions: SUPPORTED_DISC_EXTENSIONS,
    description: '1:1 optical disc images, Blu-ray / DVD raw dumps, and ISO filesystem structures',
  },
  {
    key: 'audio',
    name: 'Audio & Audiobooks',
    icon: FileAudio,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    extensions: SUPPORTED_AUDIO_EXTENSIONS,
    description: 'Lossless Hi-Fi music, FLAC, M4B chaptered audiobooks, Opus, MP3, and DSD audio',
  },
  {
    key: 'books',
    name: 'E-Books & Comics',
    icon: BookOpen,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    extensions: SUPPORTED_BOOK_EXTENSIONS,
    description: 'Digital literature, ePubs, PDF manuals, Kindle formats, and CBZ/CBR comic book archives',
  },
  {
    key: 'subtitles',
    name: 'Subtitle Tracks',
    icon: FileText,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    extensions: SUPPORTED_SUBTITLE_EXTENSIONS,
    description: 'External subtitles, SRT, WebVTT, and stylized ASS/SSA anime subtitles',
  },
  {
    key: 'artwork',
    name: 'Cover Art & Posters',
    icon: Image,
    color: 'text-fuchsia-400',
    bgColor: 'bg-fuchsia-500/10',
    borderColor: 'border-fuchsia-500/30',
    extensions: SUPPORTED_ARTWORK_EXTENSIONS,
    description: 'Posters, fanart, backdrops, banner graphics, and folder thumbnails',
  },
  {
    key: 'metadata',
    name: 'Metadata & Playlists',
    icon: FileCode,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    extensions: SUPPORTED_METADATA_EXTENSIONS,
    description: 'Kodi/Jellyfin NFO XMLs, cuesheets, M3U8 playlists, and JSON metadata sidecars',
  },
];

export const MediaExtensionManager: React.FC<MediaExtensionManagerProps> = ({
  config,
  onChangeConfig,
  activeFilterExtension,
  onSelectFilterExtension,
  discoveredExtensionCounts = {},
  onTriggerScan,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [newCustomExt, setNewCustomExt] = useState<string>('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<MediaExtensionCategory>('video');

  const totalExtensionsCount =
    CATEGORY_DEFINITIONS.reduce((acc, cat) => acc + cat.extensions.length, 0) +
    (config.customExtensions?.length || 0);

  const toggleSearchAll = () => {
    onChangeConfig({
      ...config,
      searchAllExtensions: !config.searchAllExtensions,
    });
  };

  const toggleCategory = (catKey: MediaExtensionCategory) => {
    onChangeConfig({
      ...config,
      searchAllExtensions: false,
      enabledCategories: {
        ...config.enabledCategories,
        [catKey]: !config.enabledCategories[catKey],
      },
    });
  };

  const handleAddCustomExtension = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCustomExt.trim().toLowerCase().replace(/^\./, '');
    if (!clean) return;

    if (!config.customExtensions.includes(clean)) {
      onChangeConfig({
        ...config,
        customExtensions: [...config.customExtensions, clean],
      });
    }
    setNewCustomExt('');
  };

  const handleRemoveCustomExtension = (ext: string) => {
    onChangeConfig({
      ...config,
      customExtensions: config.customExtensions.filter((e) => e !== ext),
    });
    if (activeFilterExtension === ext) {
      onSelectFilterExtension(null);
    }
  };

  const applyPreset = (preset: 'all' | 'video_audio' | 'video_only' | 'music_books') => {
    if (preset === 'all') {
      onChangeConfig({
        ...config,
        searchAllExtensions: true,
        enabledCategories: {
          video: true,
          disc_images: true,
          audio: true,
          books: true,
          subtitles: true,
          artwork: true,
          metadata: true,
        },
      });
    } else if (preset === 'video_audio') {
      onChangeConfig({
        ...config,
        searchAllExtensions: false,
        enabledCategories: {
          video: true,
          disc_images: true,
          audio: true,
          books: false,
          subtitles: true,
          artwork: true,
          metadata: true,
        },
      });
    } else if (preset === 'video_only') {
      onChangeConfig({
        ...config,
        searchAllExtensions: false,
        enabledCategories: {
          video: true,
          disc_images: true,
          audio: false,
          books: false,
          subtitles: true,
          artwork: true,
          metadata: true,
        },
      });
    } else if (preset === 'music_books') {
      onChangeConfig({
        ...config,
        searchAllExtensions: false,
        enabledCategories: {
          video: false,
          disc_images: false,
          audio: true,
          books: true,
          subtitles: false,
          artwork: true,
          metadata: true,
        },
      });
    }
  };

  const activeCategoryDef = CATEGORY_DEFINITIONS.find((c) => c.key === activeCategoryTab) || CATEGORY_DEFINITIONS[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl transition-all">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Media Extensions & Format Scanner</h3>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold border border-indigo-500/20 font-mono">
                {config.searchAllExtensions ? 'Searching All Formats' : 'Custom Extension Filter'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Configured to search for {totalExtensionsCount} media extensions across 7 categories (Video, Disc Images, Audio, Books, Subtitles, Artwork, Metadata).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="toggle-all-extensions-btn"
            onClick={toggleSearchAll}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              config.searchAllExtensions
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {config.searchAllExtensions ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3.5 h-3.5 text-slate-400" />}
            <span>Search All Media Extensions</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            {isExpanded ? 'Hide Formats Panel' : 'Customize Formats & Rules'}
          </button>
        </div>
      </div>

      {/* Discovered Extension Quick Filter Badges */}
      <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="flex items-center gap-1 text-slate-400 font-medium">
          <Filter className="w-3 h-3 text-indigo-400" />
          <span>Quick Filter:</span>
        </span>

        <button
          onClick={() => onSelectFilterExtension(null)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeFilterExtension === null
              ? 'bg-indigo-600 text-white font-semibold'
              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
          }`}
        >
          All Formats
        </button>

        {Object.entries(discoveredExtensionCounts).map(([ext, count]) => {
          const isSelected = activeFilterExtension === ext;
          return (
            <button
              key={ext}
              onClick={() => onSelectFilterExtension(isSelected ? null : ext)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                isSelected
                  ? 'bg-emerald-600 text-white font-bold border border-emerald-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
              }`}
            >
              <span>.{ext}</span>
              <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded Extension Configurator */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
          {/* Preset Buttons */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span className="text-slate-400 font-medium">Scan Presets:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => applyPreset('all')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                Universal (All 50+ Formats)
              </button>
              <button
                onClick={() => applyPreset('video_audio')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                Video & Audio Only
              </button>
              <button
                onClick={() => applyPreset('video_only')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                Video Containers Only
              </button>
              <button
                onClick={() => applyPreset('music_books')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                Music & E-Books Only
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {CATEGORY_DEFINITIONS.map((cat) => {
              const Icon = cat.icon;
              const isEnabled = config.searchAllExtensions || config.enabledCategories[cat.key];
              const isTabActive = activeCategoryTab === cat.key;

              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategoryTab(cat.key)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isTabActive
                      ? 'bg-slate-800 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className={`p-1.5 rounded-lg ${cat.bgColor} ${cat.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(cat.key);
                      }}
                      className={`w-4 h-4 rounded flex items-center justify-center transition ${
                        isEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                      title={isEnabled ? 'Enabled for scanning' : 'Disabled for scanning'}
                    >
                      {isEnabled && <Check className="w-3 h-3" />}
                    </button>
                  </div>

                  <span className="text-xs font-semibold text-slate-200 mt-2 truncate w-full">
                    {cat.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {cat.extensions.length} formats
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Category Format Details */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <activeCategoryDef.icon className={`w-4 h-4 ${activeCategoryDef.color}`} />
                <h4 className="text-xs font-bold text-white">{activeCategoryDef.name} ({activeCategoryDef.extensions.length} extensions)</h4>
              </div>
              <p className="text-[11px] text-slate-400">{activeCategoryDef.description}</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {activeCategoryDef.extensions.map((ext) => (
                <span
                  key={ext}
                  className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700/60 flex items-center gap-1"
                >
                  <span className="text-slate-500">.</span>
                  <span>{ext}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Add Custom Media Extension */}
          <form onSubmit={handleAddCustomExtension} className="flex items-center gap-2 pt-1">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Add Custom Extension:</span>
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                value={newCustomExt}
                onChange={(e) => setNewCustomExt(e.target.value)}
                placeholder="e.g. dat, vcf, bdmv, cue"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 w-full"
              />
              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>

            {config.customExtensions.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-xs text-slate-500">Custom:</span>
                {config.customExtensions.map((ext) => (
                  <span
                    key={ext}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 text-indigo-200 text-xs font-mono border border-indigo-800"
                  >
                    <span>.{ext}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomExtension(ext)}
                      className="text-indigo-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </form>

          {onTriggerScan && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={onTriggerScan}
                className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span>Re-Scan Share with Active Extensions</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
