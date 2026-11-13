import type { RequestHandler } from 'express';

const TAURI_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
]);

export function tauriCors(methods: string, headers = 'Content-Type'): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && TAURI_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.setHeader('Access-Control-Allow-Methods', methods);
      res.setHeader('Access-Control-Allow-Headers', headers);
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
