import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MediaMetadata } from '../types';
import type { FetchedLibraryMetadata } from '../utils/libraryMetadataFetch';
import { isTauri } from '../lib/api';
import { universeItemKey, type UniverseAssignment, type UniverseCandidate, type UniverseMatch } from '../shared/universeMatcher';
import { ProviderSearch } from './ProviderSearch';

interface Props {
  items: MediaMetadata[];
  onClose: () => void;
  onOpenDetails: (item: MediaMetadata) => void;
  onFetchLibraryMetadata: (id: string, metadata: FetchedLibraryMetadata | null) => Promise<void>;
}

function endpoint(path: string): string {
  if (!isTauri) return path;
  const port = (window as Window & { __EXPRESS_PORT__?: number }).__EXPRESS_PORT__ || 3000;
  return `http://localhost:${port}${path}`;
}

async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(endpoint(path), {
    method, signal, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (HTTP ${response.status})`);
  return result as T;
}

export function UniverseMatcherModal({ items, onClose, onOpenDetails, onFetchLibraryMetadata }: Props) {
  const [assignments, setAssignments] = useState<Record<string, UniverseAssignment>>({});
  const [candidates, setCandidates] = useState<Record<string, UniverseCandidate[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [providerSearchItem, setProviderSearchItem] = useState<string | null>(null);
  const [showProviderSearch, setShowProviderSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, title: '' });
  const controller = useRef<AbortController | null>(null);
  const assignmentRef = useRef(assignments);
  assignmentRef.current = assignments;
  const eligible = useMemo(() => items.filter((item) => item.type === 'movie' || item.type === 'series'), [items]);

  useEffect(() => {
    const abort = new AbortController();
    request<{ assignments: Record<string, UniverseAssignment> }>('/api/universes/assignments', 'GET', undefined, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if (!result.assignments || typeof result.assignments !== 'object' || Array.isArray(result.assignments)) {
          throw new Error('Invalid universe assignments response.');
        }
        assignmentRef.current = result.assignments;
        setAssignments(result.assignments);
      })
      .catch((error) => { if (!abort.signal.aborted) setMessage(`Could not load universe assignments: ${error.message}`); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  const save = async (item: MediaMetadata, assignment: UniverseAssignment) => {
    const itemKey = universeItemKey(item);
    const result = await request<{ success?: boolean }>('/api/universes/assignment', 'PUT', { itemKey, assignment });
    if (!result.success) throw new Error('Universe assignment was not saved.');
    const next = { ...assignmentRef.current, [itemKey]: assignment };
    assignmentRef.current = next;
    setAssignments(next);
  };

  const confirmCandidate = async (item: MediaMetadata, candidate: UniverseCandidate, signal?: AbortSignal) => {
    const result = await request<{ match: UniverseMatch | null }>('/api/universes/resolve', 'POST', { candidate }, signal);
    if (!Object.hasOwn(result, 'match')) throw new Error('Invalid universe resolution response.');
    if (signal?.aborted) return;
    await onFetchLibraryMetadata(item.id, {
      title: candidate.title, source: 'tmdb', overview: candidate.overview, posterUrl: candidate.posterUrl,
    });
    await save(item, { status: result.match ? 'matched' : 'unmatched', match: result.match || undefined, candidate });
  };

  const run = async () => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    const todo = eligible.filter((item) => {
      const assignment = assignmentRef.current[universeItemKey(item)];
      return !assignment?.manualOverride && assignment?.match?.source !== 'manual';
    });
    let done = 0;
    setBusy(true);
    setErrors({});
    setMessage('');
    setProgress({ done: 0, total: todo.length, title: '' });
    for (const item of todo) {
      if (abort.signal.aborted) break;
      const key = universeItemKey(item);
      setProgress({ done, total: todo.length, title: item.title });
      try {
        const result = await request<{ candidates: UniverseCandidate[]; confidentId: number | null }>(
          '/api/universes/search', 'POST', { title: item.title, type: item.type }, abort.signal
        );
        if (!Array.isArray(result.candidates)) throw new Error('Invalid TMDB search response.');
        if (abort.signal.aborted) break;
        const exact = result.candidates.find((candidate) => candidate.id === result.confidentId);
        if (exact) {
          await confirmCandidate(item, exact, abort.signal);
        } else {
          setCandidates((prev) => ({ ...prev, [key]: result.candidates }));
          await save(item, { status: result.candidates.length ? 'review' : 'unmatched' });
        }
      } catch (error) {
        if (abort.signal.aborted) break;
        const detail = error instanceof Error ? error.message : String(error);
        setErrors((prev) => ({ ...prev, [key]: detail }));
        if (detail.includes('TMDB_READ_ACCESS_TOKEN') || detail.includes('HTTP 401') || detail.includes('HTTP 429')) {
          setMessage(`Stopped: ${detail}`);
          break;
        }
      }
      done++;
      setProgress({ done, total: todo.length, title: '' });
    }
    if (!abort.signal.aborted) setMessage((previous) => previous || `Finished ${done} of ${todo.length} lookups. Review unmatched or ambiguous items below.`);
    else setMessage(`Stopped after ${done} of ${todo.length} lookups.`);
    controller.current = null;
    setBusy(false);
  };

  const groups = new Map<string, { match: UniverseMatch; items: MediaMetadata[] }>();
  const remaining: MediaMetadata[] = [];
  for (const item of eligible) {
    const match = assignments[universeItemKey(item)]?.match;
    if (!match) { remaining.push(item); continue; }
    if (!groups.has(match.key)) groups.set(match.key, { match, items: [] });
    groups.get(match.key)!.items.push(item);
  }
  const groupOptions = Array.from(groups.values());

  const manualAssign = async (item: MediaMetadata) => {
    const key = universeItemKey(item);
    const name = names[key]?.trim();
    if (!name) { setErrors((prev) => ({ ...prev, [key]: 'Enter a universe name.' })); return; }
    const existing = groupOptions.find((group) => group.match.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const match: UniverseMatch = existing ? { ...existing.match, source: 'manual' } :
      { key: `manual:${name.toLocaleLowerCase()}`, name, source: 'manual' };
    try {
      await save(item, { status: 'matched', match, candidate: assignments[key]?.candidate, manualOverride: true });
      setErrors((prev) => ({ ...prev, [key]: '' }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : String(error) }));
    }
  };

  const removeAssignment = async (item: MediaMetadata) => {
    const key = universeItemKey(item);
    try {
      await save(item, { status: 'unmatched', candidate: assignments[key]?.candidate, manualOverride: true });
    } catch (error) {
      setErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : String(error) }));
    }
  };

  const review = async (item: MediaMetadata, candidate: UniverseCandidate) => {
    setBusy(true);
    try {
      await confirmCandidate(item, candidate);
      setCandidates((prev) => ({ ...prev, [universeItemKey(item)]: [] }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [universeItemKey(item)]: error instanceof Error ? error.message : String(error) }));
    } finally { setBusy(false); }
  };

  const searchAgain = async (item: MediaMetadata) => {
    const key = universeItemKey(item);
    setBusy(true);
    try {
      const result = await request<{ candidates: UniverseCandidate[] }>('/api/universes/search', 'POST', { title: item.title, type: item.type });
      if (!Array.isArray(result.candidates)) throw new Error('Invalid TMDB search response.');
      setCandidates((prev) => ({ ...prev, [key]: result.candidates }));
      if (!result.candidates.length) setErrors((prev) => ({ ...prev, [key]: 'No TMDB results found.' }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : String(error) }));
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/85 p-4 flex items-center justify-center">
      <div role="dialog" aria-modal="true" aria-label="Universe Matcher" className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-slate-950 border border-slate-700 p-5 space-y-4 text-slate-200">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">Universe Matcher</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 bg-slate-800 rounded">Close</button>
        </div>
        <p className="text-sm text-slate-400">Searches send cleaned movie and series titles to TMDB. Groups are virtual; files are never moved or deleted. Albums are not included.</p>
        <button type="button" onClick={() => setShowProviderSearch(!showProviderSearch)} className="bg-slate-700 rounded px-3 py-2 text-sm">Search providers by title</button>
        {showProviderSearch && <ProviderSearch initialTitle="" type="all" />}
        <div className="flex gap-2 items-center">
          <button type="button" disabled={busy || loading || !eligible.length} onClick={run} className="bg-indigo-600 px-3 py-2 rounded disabled:opacity-50">Match library ({eligible.length})</button>
          {busy && controller.current && <button type="button" onClick={() => controller.current?.abort()} className="bg-slate-700 px-3 py-2 rounded">Stop</button>}
          {busy && <span role="status" className="text-sm">{progress.done}/{progress.total} {progress.title}</span>}
        </div>
        {message && <p role="status" className="text-sm text-amber-300">{message}</p>}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
            <img className="w-16" alt="TMDB" src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" />
          </a>
          <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        </div>
        <datalist id="universe-options">{groupOptions.map(({ match }) => <option key={match.key} value={match.name} />)}</datalist>
        {groupOptions.map(({ match, items: groupItems }) => (
          <section key={match.key} className="rounded border border-indigo-800 p-3 space-y-2">
            <h3 className="font-bold">{match.name} <span className="text-xs text-slate-400">({groupItems.length})</span></h3>
            {groupItems.map((item) => (
              <div key={item.id} className="flex flex-wrap gap-2 items-center text-sm">
                <button type="button" className="text-indigo-300 underline" onClick={() => { onClose(); onOpenDetails(item); }}>{item.title}</button>
                <span className="text-slate-400">{item.type}</span>
                <input aria-label={`Change universe for ${item.title}`} list="universe-options" value={names[universeItemKey(item)] || ''} onChange={(e) => setNames((prev) => ({ ...prev, [universeItemKey(item)]: e.target.value }))} placeholder="Change universe" className="bg-slate-900 rounded p-1" />
                <button type="button" disabled={busy || loading} onClick={() => manualAssign(item)} className="bg-slate-700 rounded px-2 py-1">Save</button>
                <button type="button" disabled={busy || loading} onClick={() => removeAssignment(item)} className="bg-slate-700 rounded px-2 py-1">Remove from universe</button>
                {errors[universeItemKey(item)] && <span className="text-red-300">{errors[universeItemKey(item)]}</span>}
              </div>
            ))}
          </section>
        ))}
        <h3 className="font-bold">Unmatched or needs review ({remaining.length})</h3>
        {remaining.map((item) => {
          const key = universeItemKey(item);
          const status = assignments[key]?.status || 'not checked';
          return <div key={item.id} className="rounded border border-slate-800 p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2"><strong>{item.title}</strong><span className="text-slate-400">{item.type} · {status}</span>
              <button type="button" disabled={busy || loading} onClick={() => searchAgain(item)} className="bg-slate-700 rounded px-2 py-1">Find matches</button>
              <button type="button" onClick={() => setProviderSearchItem(providerSearchItem === key ? null : key)} className="bg-slate-700 rounded px-2 py-1">Search TVMaze / OMDb</button>
            </div>
            {providerSearchItem === key && <ProviderSearch key={key} initialTitle={item.title} type={item.type === 'movie' ? 'movie' : 'series'} />}
            {errors[key] && <p className="text-red-300">{errors[key]}</p>}
            {(candidates[key] || []).map((candidate) => <button key={candidate.id} type="button" disabled={busy} onClick={() => review(item, candidate)} className="block text-left text-indigo-300 underline">{candidate.title} {candidate.year ? `(${candidate.year})` : ''}</button>)}
            <div className="flex flex-wrap gap-2">
              <input aria-label={`Universe for ${item.title}`} list="universe-options" value={names[key] || ''} onChange={(e) => setNames((prev) => ({ ...prev, [key]: e.target.value }))} placeholder="Enter or select a universe" className="bg-slate-900 rounded p-1" />
              <button type="button" disabled={busy || loading} onClick={() => manualAssign(item)} className="bg-slate-700 rounded px-2 py-1">Assign universe</button>
            </div>
          </div>;
        })}
      </div>
    </div>, document.body
  );
}
