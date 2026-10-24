import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Zap,
  HardDrive,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Database,
} from 'lucide-react';
import { SambaShareNode, ThumbnailMetadata } from '../types';
import { thumbnailStorage } from '../utils/thumbnailStorage';

interface CachedThumbnailProps {
  node: SambaShareNode;
  parentPath?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showBadge?: boolean;
  showMetadata?: boolean;
  className?: string;
  onClick?: () => void;
}

export const CachedThumbnail: React.FC<CachedThumbnailProps> = ({
  node,
  parentPath = '',
  size = 'md',
  showBadge = true,
  showMetadata = false,
  className = '',
  onClick,
}) => {
  const fullPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
  const [thumb, setThumb] = useState<ThumbnailMetadata>(() =>
    thumbnailStorage.resolveForNode(node, parentPath)
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const resolved = thumbnailStorage.resolveForNode(node, parentPath);
    setThumb(resolved);
  }, [node, parentPath]);

  // Size styling classes
  const sizeClasses = {
    sm: 'w-10 h-14 rounded-lg text-[10px]',
    md: 'w-24 h-36 rounded-xl text-xs',
    lg: 'w-36 h-52 rounded-xl text-xs',
    hero: 'w-48 h-72 rounded-2xl text-sm shadow-2xl',
  }[size];

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'sidecar_poster':
        return <HardDrive className="w-3 h-3 text-emerald-400" />;
      case 'matched_media':
      case 'curated_library':
        return <Sparkles className="w-3 h-3 text-indigo-400" />;
      case 'sqlite_backend':
        return <Database className="w-3 h-3 text-purple-400" />;
      default:
        return <Zap className="w-3 h-3 text-amber-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'sidecar_poster':
        return 'Local Sidecar Poster';
      case 'curated_library':
        return 'Curated Vault Poster';
      case 'matched_media':
        return 'Matched NFO Poster';
      case 'sqlite_backend':
        return 'SQLite Disk Cache';
      default:
        return 'Auto-Generated Cache';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden shrink-0 border border-slate-800/80 transition-all duration-300 ${sizeClasses} ${className} ${
        onClick ? 'cursor-pointer hover:border-indigo-500/60 hover:shadow-lg' : ''
      }`}
      style={{ backgroundColor: thumb.colorDominant || '#0f172a' }}
    >
      {/* Background Image with Referrer Policy and smooth transition */}
      {!imageError ? (
        <img
          src={thumb.thumbnailUrl}
          alt={thumb.title || node.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-900/90 text-slate-400">
          <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
          <span className="text-[10px] font-mono leading-tight truncate w-full px-1">
            {node.name}
          </span>
        </div>
      )}

      {/* Dominant Color Skeleton / Placeholder when loading */}
      {!imageLoaded && !imageError && (
        <div
          className="absolute inset-0 animate-pulse flex items-center justify-center"
          style={{ backgroundColor: thumb.colorDominant || '#1e1b4b' }}
        >
          <div className="flex flex-col items-center gap-1 opacity-40">
            <ImageIcon className="w-5 h-5 text-white animate-spin" />
            <span className="text-[9px] text-white font-mono uppercase">Cached</span>
          </div>
        </div>
      )}

      {/* Subtle overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none opacity-80 group-hover:opacity-95 transition-opacity" />

      {/* Top Badge: Cache Tier & Storage Hit */}
      {showBadge && (
        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md border border-emerald-500/30 text-[9px] font-mono font-semibold text-emerald-300 shadow">
            <Zap className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span>0ms</span>
          </span>

          {thumb.isSidecarLocal && (
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/80 backdrop-blur-md border border-indigo-500/30 text-[9px] font-mono text-indigo-300">
              Sidecar
            </span>
          )}
        </div>
      )}

      {/* Bottom Metadata Info */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white pointer-events-none truncate">
        <div className="text-[10px] font-bold truncate leading-tight font-sans">
          {thumb.title}
        </div>
        <div className="flex items-center gap-1 text-[8px] text-slate-300 font-mono">
          <span>{thumb.resolutionLabel}</span>
          <span>•</span>
          <span className="uppercase">{thumb.format}</span>
        </div>
      </div>

      {/* Optional Expanded Metadata Hover Card */}
      {showMetadata && (
        <div className="absolute inset-x-0 bottom-0 p-2 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 text-[10px] text-slate-300 space-y-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center justify-between text-[9px] text-emerald-400 font-mono">
            <span className="flex items-center gap-1">
              {getSourceIcon(thumb.source)}
              <span>{getSourceLabel(thumb.source)}</span>
            </span>
            <span>Hits: {thumb.hitCount}</span>
          </div>
          <div className="text-[9px] text-slate-400 truncate">
            {thumb.resolutionLabel} • {Math.round(thumb.fileSizeBytes / 1024)} KB
          </div>
        </div>
      )}
    </div>
  );
};
