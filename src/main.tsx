import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/firebase'; // Ensure Firebase is initialized
import { ErrorBoundary } from './components/ErrorBoundary';
import VConsole from 'vconsole';

const isLocalDevelopment = typeof window !== 'undefined' &&
  window.location.protocol === 'http:' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

if (isLocalDevelopment) {
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
      <ErrorBoundary tabName="SambaVault Application">
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

