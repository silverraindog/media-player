import React, { useEffect, useState } from 'react';

const providers = [
  { name: 'TMDB_READ_ACCESS_TOKEN', label: 'TMDB API Read Access Token', description: 'For Universe Matcher and Fetch All. Use the read access token, not the shorter API key.' },
  { name: 'OMDB_API_KEY', label: 'OMDb API key', description: 'For OMDb movie and series searches.' },
  { name: 'GEMINI_API_KEY', label: 'Gemini API key', description: 'For Google Gemini features.' },
] as const;
type KeyName = typeof providers[number]['name'];
type Status = Record<KeyName, { configured: boolean; source: 'settings' | 'environment' | 'none' }>;

function endpoint(): string {
  const tauri = window.location.protocol === 'tauri:' || window.location.hostname === 'tauri.localhost' ||
    Boolean((window as Window & { __TAURI__?: unknown; __TAURI_IPC__?: unknown }).__TAURI__) ||
    Boolean((window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__) ||
    window.location.origin === 'http://localhost:1420';
  const port = (window as Window & { __EXPRESS_PORT__?: number }).__EXPRESS_PORT__ || 3000;
  return tauri ? `http://localhost:${port}/api/settings/api-keys` : '/api/settings/api-keys';
}

function isStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  return providers.every(({ name }) => {
    const item = (value as Record<string, unknown>)[name];
    if (!item || typeof item !== 'object') return false;
    const state = item as Record<string, unknown>;
    return typeof state.configured === 'boolean' && ['settings', 'environment', 'none'].includes(String(state.source));
  });
}

export function ApiKeySettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [inputs, setInputs] = useState<Partial<Record<KeyName, string>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function request(name?: KeyName, value?: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint(), name ? {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value }),
      } : { cache: 'no-store' });
      const data: unknown = await response.json();
      if (!response.ok) {
        const detail = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : 'The backend could not update API key settings.';
        throw new Error(detail);
      }
      if (!data || typeof data !== 'object' || !('keys' in data) || !isStatus(data.keys) ||
          (name && (!('success' in data) || data.success !== true))) {
        throw new Error('The backend returned an invalid API key settings response.');
      }
      setStatus(data.keys);
      if (name) {
        setInputs((previous) => ({ ...previous, [name]: '' }));
        setMessage(value ? 'Key saved and applied.' : 'Saved key removed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the backend.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void request(); }, []);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4" aria-labelledby="api-key-settings">
      <div>
        <h3 id="api-key-settings" className="text-base font-bold text-white">API keys</h3>
        <p className="text-xs text-slate-400 mt-1">Keys are stored unencrypted in a private local backend file and are never shown again. Settings override environment values and apply immediately. Only available on this computer.</p>
      </div>
      {providers.map(({ name, label, description }) => (
        <div key={name} className="border border-slate-800 rounded-xl p-4 space-y-2">
          <label htmlFor={`key-${name}`} className="text-sm font-semibold text-white">{label}</label>
          <p className="text-xs text-slate-400">{description} {status ? (status[name].configured ? `Configured via ${status[name].source}.` : 'Not configured.') : 'Status unavailable.'}</p>
          <div className="flex flex-wrap gap-2">
            <input id={`key-${name}`} type="password" autoComplete="off" value={inputs[name] || ''}
              onChange={(event) => setInputs((previous) => ({ ...previous, [name]: event.target.value }))}
              placeholder="Enter a new key" className="flex-1 min-w-48 bg-slate-950 text-white border border-slate-700 rounded-lg px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !inputs[name]} onClick={() => void request(name, inputs[name])}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">Save</button>
            <button type="button" disabled={busy || status?.[name].source !== 'settings'} onClick={() => void request(name, '')}
              className="border border-slate-600 text-slate-200 rounded-lg px-4 py-2 text-sm disabled:opacity-50">Remove saved key</button>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">Removing a saved key restores any environment value; edit that environment separately to remove it.</p>
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
