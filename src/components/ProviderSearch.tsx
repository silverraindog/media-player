import React, { useEffect, useRef, useState } from 'react';
import { isTauri } from '../lib/api';
import type { ProviderMediaType, ProviderName, ProviderResult } from '../shared/providerSearch';

interface Props {
  initialTitle: string;
  type: ProviderMediaType | 'all';
}

export function ProviderSearch({ initialTitle, type }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [provider, setProvider] = useState<ProviderName>(type === 'movie' ? 'omdb' : 'tvmaze');
  const [results, setResults] = useState<ProviderResult[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const search = async () => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const port = (window as Window & { __EXPRESS_PORT__?: number }).__EXPRESS_PORT__ || 3000;
      const url = isTauri ? `http://localhost:${port}/api/provider-search` : '/api/provider-search';
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, provider }), signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const data: { results?: ProviderResult[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || `Search failed (HTTP ${response.status}).`);
      if (!Array.isArray(data.results)) throw new Error('Invalid provider search response.');
      setResults(data.results);
    } catch (reason) {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
      controller.current = null;
    }
  };

  return <section className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2" aria-label="TVMaze and OMDb search">
    <h3 className="font-bold text-sm">TVMaze &amp; OMDb search</h3>
    <p className="text-xs text-slate-400">Searches send the title to the selected provider. Results are for review and do not change metadata or universe groups.</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Provider search title" className="bg-slate-950 rounded p-2 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} />
      <select aria-label="Search provider" className="bg-slate-950 rounded p-2 text-sm" value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}>
        {type !== 'movie' && <option value="tvmaze">TVMaze (TV only, no key)</option>}
        <option value="omdb">OMDb (requires API key)</option>
      </select>
      <button type="button" disabled={busy || !title.trim()} onClick={search} className="bg-indigo-600 rounded px-3 py-2 text-sm disabled:opacity-50">{busy ? 'Searching...' : 'Search provider'}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {results && (results.length ? <ul className="space-y-2">{results.map((result) =>
      <li key={`${result.source}:${result.id}`} className="text-sm">
        <a className="text-indigo-300 underline" href={result.url} target="_blank" rel="noreferrer">{result.title}{result.year ? ` (${result.year})` : ''}</a>
        <span className="text-slate-400"> · {result.type} · {result.source === 'tvmaze' ? 'TVMaze' : 'OMDb / IMDb'}</span>
        {result.overview && <p className="text-xs text-slate-400">{result.overview}</p>}
      </li>)}</ul> : <p className="text-sm text-slate-400">No results found.</p>)}
    <p className="text-xs text-slate-400">TV data provided by <a className="underline" href="https://www.tvmaze.com/" target="_blank" rel="noreferrer">TVmaze</a>.</p>
  </section>;
}
