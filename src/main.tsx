import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/firebase'; // Ensure Firebase is initialized
import VConsole from 'vconsole';

if (typeof window !== 'undefined') {
  try {
    const vConsole = new VConsole({ theme: 'dark' });
    console.log('[VConsole] Initialized successfully for full application debug logging.');
  } catch (e) {
    console.error('[VConsole] Failed to initialize:', e);
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

