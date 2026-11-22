import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Edit3,
  Film,
  FolderOpen,
  HardDrive,
  Layers,
  Music,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import {
  EpisodeMetadata,
  MediaCollection,
  MediaMetadata,
  MediaType,
  SambaShareNode,
  TrackMetadata,
} from '../types';
import {
  buildUnifiedCollections,
  COLLECTION_FALLBACK_POSTER,
  UnifiedCollection,
} from '../utils/collections';

export interface CollectionsTabProps {
  mediaLibrary: MediaMetadata[];
  sambaTree?: SambaShareNode[];
  customCollections: MediaCollection[];
  onCreateCollection: (collection: MediaCollection) => Promise<void> | void;
  onUpdateCollection: (collection: MediaCollection) => Promise<void> | void;
  onDeleteCollection: (id: string) => Promise<void> | void;
  onPlayMedia?: (media: MediaMetadata, episode?: EpisodeMetadata, track?: TrackMetadata) => void;
  onOpenDetails: (media: MediaMetadata) => void;
  onPushToSamba?: (media: MediaMetadata) => void;
  onNavigateToSearch?: () => void;
  initialCollectionId?: string | null;
}

type OriginFilter = 'all' | 'folder' | 'custom';
type SortMode = 'count-desc' | 'name-asc' | 'movies-desc';

const QUICK_UNIVERSE_PRESETS = ['MCU', 'Star Wars', 'Dune', 'Star Trek', 'Alien', 'Middle-earth'];

interface CollageTile {
  id: string;
  src: string;
  alt: string;
}

function getCollectionCollageTiles(col: UnifiedCollection): CollageTile[] {
  const firstFour = col.items.slice(0, 4);
  if (firstFour.length === 0) return [];
  return firstFour.map((item) => ({
    id: item.id,
    src: item.posterUrl || item.fanartUrl || col.posterUrl || COLLECTION_FALLBACK_POSTER,
    alt: item.title || col.name,
  }));
}

interface CollectionCollageThumbnailProps {
  collection: UnifiedCollection;
  className?: string;
}

const CollectionCollageThumbnail: React.FC<CollectionCollageThumbnailProps> = ({
  collection,
  className = '',
}) => {
  const tiles = useMemo(() => getCollectionCollageTiles(collection), [collection]);

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.src !== COLLECTION_FALLBACK_POSTER) {
      e.currentTarget.src = COLLECTION_FALLBACK_POSTER;
    }
  };

  if (tiles.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 bg-slate-950 ${className}`}>
        {tiles.map((tile) => (
          <div key={tile.id} className="relative w-full h-full overflow-hidden bg-slate-900">
            <img
              src={tile.src}
              alt={tile.alt}
              loading="lazy"
              onError={handleImgError}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  if (tiles.length === 3) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 bg-slate-950 ${className}`}>
        <div className="relative row-span-2 w-full h-full overflow-hidden bg-slate-900">
          <img
            src={tiles[0].src}
            alt={tiles[0].alt}
            loading="lazy"
            onError={handleImgError}
            className="w-full h-full object-cover"
          />
        </div>
        {tiles.slice(1).map((tile) => (
          <div key={tile.id} className="relative w-full h-full overflow-hidden bg-slate-900">
            <img
              src={tile.src}
              alt={tile.alt}
              loading="lazy"
              onError={handleImgError}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  if (tiles.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 bg-slate-950 ${className}`}>
        {tiles.map((tile) => (
          <div key={tile.id} className="relative w-full h-full overflow-hidden bg-slate-900">
            <img
              src={tile.src}
              alt={tile.alt}
              loading="lazy"
              onError={handleImgError}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <img
      src={tiles[0]?.src || collection.posterUrl || COLLECTION_FALLBACK_POSTER}
      alt={collection.name}
      loading="lazy"
      onError={handleImgError}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

export const CollectionsTab: React.FC<CollectionsTabProps> = ({
  mediaLibrary,
  sambaTree,
  customCollections,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
  onPlayMedia,
  onOpenDetails,
  onPushToSamba,
  onNavigateToSearch,
  initialCollectionId = null,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('count-desc');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(initialCollectionId);
  const [detailTypeFilter, setDetailTypeFilter] = useState<'all' | MediaType>('all');
  const [detailSearch, setDetailSearch] = useState('');

  // Create / Edit Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<UnifiedCollection | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPosterUrl, setFormPosterUrl] = useState('');
  const [formSelectedIds, setFormSelectedIds] = useState<Set<string>>(new Set());
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerType, setPickerType] = useState<'all' | MediaType>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add-items-only quick modal when inside detail view
  const [isAddItemsOpen, setIsAddItemsOpen] = useState(false);

  const unifiedCollections = useMemo(
    () => buildUnifiedCollections(mediaLibrary, customCollections, sambaTree),
    [mediaLibrary, customCollections, sambaTree]
  );

  const selectedCollection = useMemo(
    () => unifiedCollections.find((c) => c.id === selectedCollectionId) || null,
    [unifiedCollections, selectedCollectionId]
  );

  const stats = useMemo(() => {
    const folderCount = unifiedCollections.filter(
      (c) => c.source === 'folder' || c.source === 'hybrid'
    ).length;
    const customCount = unifiedCollections.filter(
      (c) => c.source === 'custom' || c.source === 'hybrid'
    ).length;
    const totalJoinedItems = unifiedCollections.reduce((sum, c) => sum + c.items.length, 0);
    return {
      total: unifiedCollections.length,
      folderCount,
      customCount,
      totalJoinedItems,
    };
  }, [unifiedCollections]);

  const filteredCollections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = unifiedCollections.filter((col) => {
      if (originFilter === 'folder' && col.source !== 'folder' && col.source !== 'hybrid') {
        return false;
      }
      if (originFilter === 'custom' && col.source !== 'custom' && col.source !== 'hybrid') {
        return false;
      }
      if (!q) return true;
      if (col.name.toLowerCase().includes(q)) return true;
      if (col.description.toLowerCase().includes(q)) return true;
      if (col.folderPath && col.folderPath.toLowerCase().includes(q)) return true;
      return col.items.some((item) => item.title.toLowerCase().includes(q));
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'name-asc') return a.name.localeCompare(b.name);
      if (sortMode === 'movies-desc') return b.movies.length - a.movies.length || b.items.length - a.items.length;
      return b.items.length - a.items.length || a.name.localeCompare(b.name);
    });
  }, [unifiedCollections, originFilter, searchQuery, sortMode]);

  const pickerCandidates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (mediaLibrary || []).filter((item) => {
      if (pickerType !== 'all' && item.type !== pickerType) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.folderPath || '').toLowerCase().includes(q) ||
        (item.genres || []).some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [mediaLibrary, pickerSearch, pickerType]);

  const openCreateModal = () => {
    setEditingTarget(null);
    setFormName('');
    setFormDescription('');
    setFormPosterUrl('');
    setFormSelectedIds(new Set());
    setPickerSearch('');
    setPickerType('all');
    setFormError(null);
    setIsEditorOpen(true);
  };

  const openEditModal = (col: UnifiedCollection, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTarget(col);
    setFormName(col.name);
    setFormDescription(col.description || '');
    setFormPosterUrl(col.posterUrl === COLLECTION_FALLBACK_POSTER ? '' : col.posterUrl || '');
    setFormSelectedIds(new Set(col.items.map((item) => item.id)));
    setPickerSearch('');
    setPickerType('all');
    setFormError(null);
    setIsEditorOpen(true);
  };

  const togglePickerItem = (id: string) => {
    setFormSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Collection name is required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const selectedArray = Array.from(formSelectedIds);
      const firstSelectedMedia = mediaLibrary.find((m) => formSelectedIds.has(m.id));
      const resolvedPoster =
        formPosterUrl.trim() || firstSelectedMedia?.posterUrl || editingTarget?.posterUrl || undefined;

      if (editingTarget) {
        const existingCustom = customCollections.find(
          (c) =>
            c.id === editingTarget.customCollectionId ||
            c.id === editingTarget.id ||
            c.name.trim().toLowerCase() === editingTarget.name.trim().toLowerCase()
        );

        // Track folder items that were explicitly unchecked so they don't re-appear
        const folderInferredIds = editingTarget.items
          .filter((item) => !(existingCustom?.itemIds || []).includes(item.id))
          .map((item) => item.id);
        const excludedItemIds = folderInferredIds.filter((id) => !formSelectedIds.has(id));

        const payload: MediaCollection = {
          id: existingCustom?.id || `col-${Date.now()}`,
          name: trimmedName,
          description: formDescription.trim() || `${trimmedName} unified collection`,
          posterUrl: resolvedPoster === COLLECTION_FALLBACK_POSTER ? undefined : resolvedPoster,
          fanartUrl: editingTarget.fanartUrl,
          source: editingTarget.source === 'folder' || existingCustom?.source === 'folder' ? 'folder' : 'custom',
          folderPath: existingCustom?.folderPath || editingTarget.folderPath,
          itemIds: selectedArray,
          excludedItemIds,
          createdAt: existingCustom?.createdAt || editingTarget.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (existingCustom) {
          await onUpdateCollection(payload);
        } else {
          await onCreateCollection(payload);
        }
        setSelectedCollectionId(payload.id);
      } else {
        const payload: MediaCollection = {
          id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: trimmedName,
          description:
            formDescription.trim() || `Unified ${trimmedName} universe spanning movies, series, and music.`,
          posterUrl: resolvedPoster,
          source: 'custom',
          itemIds: selectedArray,
          excludedItemIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await onCreateCollection(payload);
        setSelectedCollectionId(payload.id);
      }

      setIsEditorOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save collection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveItemFromCollection = async (col: UnifiedCollection, mediaId: string) => {
    const existingCustom = customCollections.find(
      (c) =>
        c.id === col.customCollectionId ||
        c.id === col.id ||
        c.name.trim().toLowerCase() === col.name.trim().toLowerCase()
    );

    const remainingIds = col.itemIds.filter((id) => id !== mediaId);
    const nextExcluded = Array.from(new Set([...col.excludedItemIds, mediaId]));

    const payload: MediaCollection = {
      id: existingCustom?.id || `col-${Date.now()}`,
      name: col.name,
      description: col.description,
      posterUrl: col.posterUrl === COLLECTION_FALLBACK_POSTER ? undefined : col.posterUrl,
      fanartUrl: col.fanartUrl,
      source: col.source === 'folder' ? 'folder' : 'custom',
      folderPath: col.folderPath,
      itemIds: remainingIds,
      excludedItemIds: nextExcluded,
      createdAt: existingCustom?.createdAt || col.createdAt,
      updatedAt: new Date().toISOString(),
    };

    if (existingCustom) {
      await onUpdateCollection(payload);
    } else {
      await onCreateCollection(payload);
    }
  };

  const handleQuickAddItemToCollection = async (col: UnifiedCollection, mediaId: string) => {
    const existingCustom = customCollections.find(
      (c) =>
        c.id === col.customCollectionId ||
        c.id === col.id ||
        c.name.trim().toLowerCase() === col.name.trim().toLowerCase()
    );

    const nextIds = Array.from(new Set([...col.itemIds, mediaId]));
    const nextExcluded = col.excludedItemIds.filter((id) => id !== mediaId);

    const payload: MediaCollection = {
      id: existingCustom?.id || `col-${Date.now()}`,
      name: col.name,
      description: col.description,
      posterUrl: col.posterUrl === COLLECTION_FALLBACK_POSTER ? undefined : col.posterUrl,
      fanartUrl: col.fanartUrl,
      source: col.source === 'folder' ? 'folder' : 'custom',
      folderPath: col.folderPath,
      itemIds: nextIds,
      excludedItemIds: nextExcluded,
      createdAt: existingCustom?.createdAt || col.createdAt,
      updatedAt: new Date().toISOString(),
    };

    if (existingCustom) {
      await onUpdateCollection(payload);
    } else {
      await onCreateCollection(payload);
      setSelectedCollectionId(payload.id);
    }
  };

  const handleDelete = async (col: UnifiedCollection) => {
    const targetId = col.customCollectionId || col.id;
    await onDeleteCollection(targetId);
    if (selectedCollectionId === col.id || selectedCollectionId === targetId) {
      setSelectedCollectionId(null);
    }
  };

  const formatSourceLabel = (col: UnifiedCollection) => {
    if (col.source === 'folder' && col.folderPath) return `Folder: ${col.folderPath}`;
    if (col.source === 'hybrid' && col.folderPath) return `Folder + Custom · ${col.folderPath}`;
    if (col.source === 'auto-franchise') return 'Auto-Matched Franchise';
    return 'Custom Collection';
  };

  const detailFilteredItems = useMemo(() => {
    if (!selectedCollection) return [];
    const q = detailSearch.trim().toLowerCase();
    return selectedCollection.items.filter((item) => {
      if (detailTypeFilter !== 'all' && item.type !== detailTypeFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.overview || '').toLowerCase().includes(q) ||
        (item.genres || []).some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [selectedCollection, detailTypeFilter, detailSearch]);

  const unaddedItemsForDetail = useMemo(() => {
    if (!selectedCollection) return [];
    const memberSet = new Set(selectedCollection.items.map((i) => i.id));
    const q = pickerSearch.trim().toLowerCase();
    return mediaLibrary.filter((m) => {
      if (memberSet.has(m.id)) return false;
      if (pickerType !== 'all' && m.type !== pickerType) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.folderPath || '').toLowerCase().includes(q)
      );
    });
  }, [selectedCollection, mediaLibrary, pickerSearch, pickerType]);

  return (
    <div id="collections-tab-view" className="space-y-6 pb-12">
      {/* Detail Drill-Down View */}
      {selectedCollection ? (
        <div className="space-y-6">
          {/* Breadcrumb & Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              id="collections-back-btn"
              onClick={() => {
                setSelectedCollectionId(null);
                setDetailTypeFilter('all');
                setDetailSearch('');
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Collections</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="collection-detail-add-items-btn"
                onClick={() => {
                  setPickerSearch('');
                  setPickerType('all');
                  setIsAddItemsOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Media Items</span>
              </button>

              <button
                id="collection-detail-edit-btn"
                onClick={() => openEditModal(selectedCollection)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Edit</span>
              </button>

              {(selectedCollection.customCollectionId || selectedCollection.source === 'custom' || selectedCollection.source === 'hybrid') && (
                <button
                  id="collection-detail-delete-btn"
                  onClick={() => handleDelete(selectedCollection)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{selectedCollection.source === 'hybrid' ? 'Reset Custom Edits' : 'Delete Collection'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Collection Hero Header */}
          <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-4 relative h-52 md:h-auto min-h-[14rem] bg-slate-950 overflow-hidden">
                <CollectionCollageThumbnail
                  collection={selectedCollection}
                  className="w-full h-full opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-slate-900/90 via-slate-900/25 to-transparent pointer-events-none" />
              </div>

              <div className="md:col-span-8 p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{formatSourceLabel(selectedCollection)}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {selectedCollection.name}
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                    {selectedCollection.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-6 text-xs tabular-nums">
                  <div>
                    <span className="text-slate-400">Total Titles </span>
                    <span className="text-white font-semibold">{selectedCollection.items.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Movies </span>
                    <span className="text-cyan-300 font-semibold">{selectedCollection.movies.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Series </span>
                    <span className="text-purple-300 font-semibold">{selectedCollection.series.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Music </span>
                    <span className="text-emerald-300 font-semibold">{selectedCollection.music.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Row Inside Detail View */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all', label: 'All Titles', count: selectedCollection.items.length },
                  { id: 'movie', label: 'Movies', count: selectedCollection.movies.length },
                  { id: 'series', label: 'TV Series', count: selectedCollection.series.length },
                  { id: 'album', label: 'Music', count: selectedCollection.music.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetailTypeFilter(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    detailTypeFilter === t.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                placeholder="Filter titles in collection..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Member Media Grid */}
          {detailFilteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {detailFilteredItems.map((media) => (
                <div
                  key={media.id}
                  onClick={() => onOpenDetails(media)}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-xl overflow-hidden flex flex-col justify-between transition-colors cursor-pointer group"
                >
                  <div className="flex gap-3.5 p-4">
                    <img
                      src={media.posterUrl || COLLECTION_FALLBACK_POSTER}
                      alt={media.title}
                      onError={(e) => {
                        e.currentTarget.src = COLLECTION_FALLBACK_POSTER;
                      }}
                      className="w-16 h-24 rounded-lg object-cover bg-slate-950 shrink-0 border border-slate-800"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 tabular-nums">
                        <span className="uppercase tracking-wider font-semibold text-indigo-300">
                          {media.type === 'series' ? 'TV Series' : media.type === 'album' ? 'Music' : 'Movie'}
                        </span>
                        <span>
                          {media.year} · ★ {typeof media.rating === 'number' ? media.rating.toFixed(1) : '8.0'}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 truncate transition-colors">
                        {media.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {media.overview || 'No synopsis available.'}
                      </p>
                      {(media.folderPath || media.recommendedFolderStructure) && (
                        <p className="text-[11px] font-mono text-slate-500 truncate pt-0.5">
                          {media.folderPath || media.recommendedFolderStructure}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-2.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {onPlayMedia && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayMedia(media);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Play</span>
                        </button>
                      )}
                      {onPushToSamba && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPushToSamba(media);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <HardDrive className="w-3 h-3 text-emerald-400" />
                          <span>Push</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItemFromCollection(selectedCollection, media.id);
                      }}
                      title="Remove from collection"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-200">
                No matching titles in {selectedCollection.name}.
              </p>
              <p className="text-xs text-slate-400">
                Add movies, series, or music albums to unify them inside this collection.
              </p>
              <button
                onClick={() => setIsAddItemsOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Media Items</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Collections Overview Grid */
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium">
                  <Layers className="w-4 h-4" />
                  <span>Unified Franchises & Custom Universes</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Collections & Universes
                </h1>
                <p className="text-sm text-slate-400 max-w-2xl">
                  Group movies, TV series, and music together into custom universes like MCU or Star Wars. Folders inside{' '}
                  <code className="text-slate-200 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-xs">
                    Franchises/$parentfolder/
                  </code>{' '}
                  or{' '}
                  <code className="text-slate-200 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-xs">
                    collections/$parentfolder/
                  </code>{' '}
                  are automatically grouped by their parent folder name.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  id="collections-create-btn"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Collection</span>
                </button>
                {onNavigateToSearch && (
                  <button
                    onClick={onNavigateToSearch}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Browse Library</span>
                  </button>
                )}
              </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800 tabular-nums">
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Collections</div>
                <div className="text-xl font-bold text-white mt-0.5">{stats.total}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Folder-Detected</div>
                <div className="text-xl font-bold text-cyan-300 mt-0.5">{stats.folderCount}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Custom Universes</div>
                <div className="text-xl font-bold text-indigo-300 mt-0.5">{stats.customCount}</div>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Joined Media Items</div>
                <div className="text-xl font-bold text-emerald-300 mt-0.5">{stats.totalJoinedItems}</div>
              </div>
            </div>
          </div>

          {/* Search & Origin Filter Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Collections' },
                  { id: 'folder', label: 'Folder-Detected' },
                  { id: 'custom', label: 'Custom Universes' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOriginFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    originFilter === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 flex-1 md:max-w-lg justify-end">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="collections-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections, folders, or titles..."
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                />
              </div>

              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="count-desc">Most Titles</option>
                <option value="name-asc">Name A–Z</option>
                <option value="movies-desc">Movies Count</option>
              </select>
            </div>
          </div>

          {/* Collections Gallery Grid */}
          {filteredCollections.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
              {filteredCollections.map((col) => {
                const originBadge =
                  col.source === 'folder'
                    ? 'Folder'
                    : col.source === 'hybrid'
                    ? 'Hybrid'
                    : col.source === 'auto-franchise'
                    ? 'Auto'
                    : 'Custom';

                return (
                  <div
                    key={col.id}
                    onClick={() => setSelectedCollectionId(col.id)}
                    className="group flex flex-col cursor-pointer focus:outline-none"
                  >
                    {/* Thumbnail Collage Frame */}
                    <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group-hover:border-indigo-500/70 shadow-lg transition-all duration-300 group-hover:-translate-y-0.5">
                      <CollectionCollageThumbnail
                        collection={col}
                        className="w-full h-full opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/50 pointer-events-none" />

                      {/* Top Overlays: Source & Item Count */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
                        <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-800/90 text-[10px] font-medium text-slate-200 truncate">
                          {originBadge}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-800/90 text-[11px] font-mono font-semibold text-indigo-300 tabular-nums shrink-0">
                          {col.items.length}
                        </span>
                      </div>

                      {/* Bottom Hover Edit Control */}
                      <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                        <button
                          type="button"
                          onClick={(e) => openEditModal(col, e)}
                          title={`Edit ${col.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700/80 hover:border-indigo-500 text-[11px] font-medium shadow-md transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>

                    {/* Gallery Thumbnail Caption */}
                    <div className="pt-2.5 px-0.5 space-y-1">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                        {col.name}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400 tabular-nums">
                        {col.movies.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Film className="w-3 h-3 text-cyan-400" />
                            <span>{col.movies.length}</span>
                          </span>
                        )}
                        {col.series.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Tv className="w-3 h-3 text-purple-400" />
                            <span>{col.series.length}</span>
                          </span>
                        )}
                        {col.music.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Music className="w-3 h-3 text-emerald-400" />
                            <span>{col.music.length}</span>
                          </span>
                        )}
                        {col.items.length === 0 && (
                          <span className="text-slate-500">Empty collection</span>
                        )}
                      </div>

                      {col.folderPath && (
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          {col.folderPath}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-indigo-400">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-semibold text-white">No collections matched your filter</h3>
                <p className="text-xs text-slate-400">
                  Create a custom universe like MCU or Star Wars, or import folders under{' '}
                  <code className="text-slate-300">Franchises/&lt;Name&gt;/</code> or{' '}
                  <code className="text-slate-300">collections/&lt;Name&gt;/</code> to group items automatically.
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Collection</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Collection Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                {editingTarget ? `Edit Collection: ${editingTarget.name}` : 'Create Custom Collection'}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-200">
                  Collection / Universe Name
                </label>
                <input
                  id="collection-name-input"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., MCU, Star Wars, Dune"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
                />
                {!editingTarget && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="text-slate-500 mr-1">Quick presets:</span>
                    {QUICK_UNIVERSE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormName(preset)}
                        className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional universe summary..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200">Poster Image URL</label>
                  <input
                    type="text"
                    value={formPosterUrl}
                    onChange={(e) => setFormPosterUrl(e.target.value)}
                    placeholder="Optional custom cover URL..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Multi-Select Library Item Picker */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200 tabular-nums">
                    Select Media Items ({formSelectedIds.size} selected)
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['all', 'movie', 'series', 'album'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPickerType(t)}
                        className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          pickerType === t
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                        }`}
                      >
                        {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : t === 'series' ? 'Series' : 'Music'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search library items to include..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/70 bg-slate-950">
                  {pickerCandidates.length > 0 ? (
                    pickerCandidates.map((item) => {
                      const checked = formSelectedIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-900/70 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePickerItem(item.id)}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                          />
                          <img
                            src={item.posterUrl || COLLECTION_FALLBACK_POSTER}
                            alt={item.title}
                            onError={(e) => {
                              e.currentTarget.src = COLLECTION_FALLBACK_POSTER;
                            }}
                            className="w-8 h-10 object-cover rounded bg-slate-900 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-100 truncate">{item.title}</div>
                            <div className="text-[11px] text-slate-400 truncate tabular-nums">
                              {item.type === 'series' ? 'TV Series' : item.type === 'album' ? 'Music' : 'Movie'} · {item.year}
                              {item.folderPath ? ` · ${item.folderPath}` : ''}
                            </div>
                          </div>
                          {checked && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No library items match your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="collection-save-btn"
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {isSaving ? 'Saving...' : editingTarget ? 'Save Changes' : 'Create Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Media Items Modal */}
      {isAddItemsOpen && selectedCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Add Titles to {selectedCollection.name}
              </h3>
              <button
                onClick={() => setIsAddItemsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search movies, series, or albums to add..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'movie', 'series', 'album'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPickerType(t)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                      pickerType === t
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : t === 'series' ? 'Series' : 'Music'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
              {unaddedItemsForDetail.length > 0 ? (
                unaddedItemsForDetail.map((item) => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-950/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.posterUrl || COLLECTION_FALLBACK_POSTER}
                        alt={item.title}
                        onError={(e) => {
                          e.currentTarget.src = COLLECTION_FALLBACK_POSTER;
                        }}
                        className="w-9 h-12 object-cover rounded bg-slate-950 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {item.type === 'series' ? 'TV Series' : item.type === 'album' ? 'Music' : 'Movie'} · {item.year}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleQuickAddItemToCollection(selectedCollection, item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  All matching library items are already in this collection.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};