import { MediaMetadata } from '../types';

export type MediaLibraryAction =
  | { type: 'HYDRATE'; items: MediaMetadata[] }
  | { type: 'SET_ALL'; items: MediaMetadata[] }
  | { type: 'UPSERT_ITEMS'; items: MediaMetadata[] }
  | { type: 'REMOVE_BY_IDS'; ids: string[] };

/**
 * Shallow-equality guard checking whether a merged media object has any field changes
 * compared to the existing reference in mediaLibrary, preserving referential identity
 * when scans or batch syncs re-report unchanged records.
 */
function areMediaItemsEqual(a: MediaMetadata, b: MediaMetadata): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.title !== b.title ||
    a.type !== b.type ||
    a.year !== b.year ||
    a.rating !== b.rating ||
    a.overview !== b.overview ||
    a.posterUrl !== b.posterUrl ||
    a.fanartUrl !== b.fanartUrl ||
    a.folderPath !== b.folderPath ||
    a.path !== b.path ||
    a.playbackUrl !== b.playbackUrl ||
    a.localBlobUrl !== b.localBlobUrl ||
    a.matchedFilename !== b.matchedFilename ||
    a.recommendedFolderStructure !== b.recommendedFolderStructure ||
    a.source !== b.source
  ) {
    return false;
  }

  const aSeasonsLen = a.seasons?.length ?? 0;
  const bSeasonsLen = b.seasons?.length ?? 0;
  if (aSeasonsLen !== bSeasonsLen) return false;
  if (aSeasonsLen > 0 && JSON.stringify(a.seasons) !== JSON.stringify(b.seasons)) return false;

  const aTracksLen = a.tracks?.length ?? 0;
  const bTracksLen = b.tracks?.length ?? 0;
  if (aTracksLen !== bTracksLen) return false;

  const aColsLen = a.collectionNames?.length ?? 0;
  const bColsLen = b.collectionNames?.length ?? 0;
  if (aColsLen !== bColsLen) return false;
  if (aColsLen > 0 && a.collectionNames?.some((c, i) => c !== b.collectionNames?.[i])) return false;

  return true;
}

export function mediaLibraryReducer(
  state: MediaMetadata[],
  action: MediaLibraryAction
): MediaMetadata[] {
  switch (action.type) {
    case 'HYDRATE':
    case 'SET_ALL': {
      const next = action.items;
      if (next === state) return state;
      if (
        next.length === state.length &&
        next.every((item, idx) => item === state[idx] || areMediaItemsEqual(item, state[idx]))
      ) {
        return state;
      }
      return next;
    }

    case 'UPSERT_ITEMS': {
      const incoming = action.items;
      if (!Array.isArray(incoming) || incoming.length === 0) return state;

      // Build O(1) lookup indices for existing items
      const idToIndex = new Map<string, number>();
      const titleTypeToIndex = new Map<string, number>();
      for (let i = 0; i < state.length; i++) {
        const m = state[i];
        idToIndex.set(m.id, i);
        if (m.title) {
          titleTypeToIndex.set(`${m.type}:${m.title.toLowerCase()}`, i);
        }
      }

      let mutated = false;
      const next = [...state];
      const prepended: MediaMetadata[] = [];

      for (const item of incoming) {
        if (!item || !item.id) continue;
        let idx = idToIndex.get(item.id);
        if (idx === undefined && item.title) {
          idx = titleTypeToIndex.get(`${item.type}:${item.title.toLowerCase()}`);
        }

        if (idx !== undefined) {
          const existing = next[idx];
          const merged: MediaMetadata = { ...existing, ...item };
          if (!areMediaItemsEqual(existing, merged)) {
            next[idx] = merged;
            mutated = true;
          }
        } else {
          prepended.push(item);
          idToIndex.set(item.id, -1);
          if (item.title) {
            titleTypeToIndex.set(`${item.type}:${item.title.toLowerCase()}`, -1);
          }
          mutated = true;
        }
      }

      if (!mutated) return state;
      return prepended.length > 0 ? [...prepended.reverse(), ...next] : next;
    }

    case 'REMOVE_BY_IDS': {
      if (!Array.isArray(action.ids) || action.ids.length === 0) return state;
      const removeSet = new Set(action.ids);
      let removedAny = false;
      const filtered = state.filter((m) => {
        if (removeSet.has(m.id)) {
          removedAny = true;
          return false;
        }
        return true;
      });
      return removedAny ? filtered : state;
    }

    default:
      return state;
  }
}
