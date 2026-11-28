import { MediaMetadata, SambaConfig } from '../types';

export interface SelectorOptions<R> {
  argsEqualityCheck?: (a: unknown, b: unknown) => boolean;
  resultEqualityCheck?: (a: R, b: R) => boolean;
}

export interface MemoizedSelector<S, R> {
  (state: S): R;
  recomputations: () => number;
  resetRecomputations: () => void;
  clearCache: () => void;
}

export function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Reselect-compatible createSelector implementation.
 * Memoizes input selector results by reference (or custom equality check) so downstream
 * React.memo components only re-render when actual slice dependencies change.
 */
export function createSelector<S, D1, R>(
  inputSelectors: [(state: S) => D1],
  combiner: (d1: D1) => R,
  options?: SelectorOptions<R>
): MemoizedSelector<S, R>;
export function createSelector<S, D1, D2, R>(
  inputSelectors: [(state: S) => D1, (state: S) => D2],
  combiner: (d1: D1, d2: D2) => R,
  options?: SelectorOptions<R>
): MemoizedSelector<S, R>;
export function createSelector<S, D1, D2, D3, R>(
  inputSelectors: [(state: S) => D1, (state: S) => D2, (state: S) => D3],
  combiner: (d1: D1, d2: D2, d3: D3) => R,
  options?: SelectorOptions<R>
): MemoizedSelector<S, R>;
export function createSelector<S, R>(
  inputSelectors: Array<(state: S) => unknown>,
  combiner: (...args: any[]) => R,
  options?: SelectorOptions<R>
): MemoizedSelector<S, R>;
export function createSelector<S, R>(
  inputSelectors: Array<(state: S) => unknown>,
  combiner: (...args: any[]) => R,
  options: SelectorOptions<R> = {}
): MemoizedSelector<S, R> {
  const argsEq = options.argsEqualityCheck ?? Object.is;
  const resultEq = options.resultEqualityCheck;

  let hasCachedResult = false;
  let lastInputs: unknown[] | null = null;
  let lastResult: R;
  let recomputationCount = 0;

  const selector = ((state: S): R => {
    const nextInputs = new Array<unknown>(inputSelectors.length);
    let inputsChanged = !hasCachedResult || lastInputs === null || lastInputs.length !== inputSelectors.length;

    for (let i = 0; i < inputSelectors.length; i++) {
      const value = inputSelectors[i](state);
      nextInputs[i] = value;
      if (!inputsChanged && !argsEq(lastInputs![i], value)) {
        inputsChanged = true;
      }
    }

    if (!inputsChanged && hasCachedResult) {
      return lastResult;
    }

    const nextResult = combiner(...nextInputs);
    recomputationCount++;
    lastInputs = nextInputs;

    if (hasCachedResult && resultEq && resultEq(lastResult, nextResult)) {
      return lastResult;
    }

    hasCachedResult = true;
    lastResult = nextResult;
    return lastResult;
  }) as MemoizedSelector<S, R>;

  selector.recomputations = () => recomputationCount;
  selector.resetRecomputations = () => {
    recomputationCount = 0;
  };
  selector.clearCache = () => {
    hasCachedResult = false;
    lastInputs = null;
  };

  return selector;
}

export interface MediaLibrarySelectorInput {
  mediaLibrary: MediaMetadata[];
  removedMediaIds: string[];
  sambaConfig?: SambaConfig;
}

const selectRawMediaLibrary = (state: MediaLibrarySelectorInput): MediaMetadata[] => state.mediaLibrary;
const selectRemovedMediaIds = (state: MediaLibrarySelectorInput): string[] => state.removedMediaIds;
const selectSambaConfig = (state: MediaLibrarySelectorInput): SambaConfig | undefined => state.sambaConfig;

/**
 * Factory producing isolated Reselect-style selector instances for App.tsx
 * so unrelated App state updates never recompute mediaLibrary projections or break React.memo.
 */
export function createMediaLibrarySelectors() {
  const selectRemovedMediaIdSet = createSelector(
    [selectRemovedMediaIds],
    (removedIds): Set<string> => new Set(removedIds)
  );

  const selectMediaLibrary = createSelector(
    [selectRawMediaLibrary, selectRemovedMediaIdSet],
    (items, removedSet): MediaMetadata[] => {
      if (!Array.isArray(items) || items.length === 0) return items;
      if (removedSet.size === 0) return items;

      let hasRemoved = false;
      for (let i = 0; i < items.length; i++) {
        if (removedSet.has(items[i].id)) {
          hasRemoved = true;
          break;
        }
      }
      if (!hasRemoved) return items;

      return items.filter((item) => !removedSet.has(item.id));
    },
    { resultEqualityCheck: shallowEqualArrays }
  );

  const selectMediaByIdMap = createSelector(
    [selectMediaLibrary],
    (library): Map<string, MediaMetadata> => {
      const map = new Map<string, MediaMetadata>();
      for (let i = 0; i < library.length; i++) {
        const item = library[i];
        map.set(item.id, item);
      }
      return map;
    }
  );

  const selectScanRootPath = createSelector(
    [selectSambaConfig],
    (cfg): string | undefined => cfg?.hostPath || cfg?.mountPath
  );

  return {
    selectRemovedMediaIdSet,
    selectMediaLibrary,
    selectMediaByIdMap,
    selectScanRootPath,
  };
}

const defaultSelectors = createMediaLibrarySelectors();
export const selectRemovedMediaIdSet = defaultSelectors.selectRemovedMediaIdSet;
export const selectMediaLibrary = defaultSelectors.selectMediaLibrary;
export const selectMediaByIdMap = defaultSelectors.selectMediaByIdMap;
export const selectScanRootPath = defaultSelectors.selectScanRootPath;
