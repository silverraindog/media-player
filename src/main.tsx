import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Only load VConsole lazily after initial paint when explicitly requested via ?vconsole=1 or localStorage flag.
// Synchronous VConsole initialization hooks console/fetch/XHR globally and slows down startup and UI updates.
const shouldLoadVConsole =
  typeof window !== 'undefined' &&
  (window.location.search.includes('vconsole=1') ||
    (() => {
      try {
        return localStorage.getItem('sambavault_enable_vconsole') === 'true';
      } catch {
        return false;
      }
    })());

if (shouldLoadVConsole) {
  const loadVConsoleIdle = () => {
    import('vconsole')
      .then(({ default: VConsole }) => {
        new VConsole({ theme: 'dark' });
      })
      .catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(loadVConsoleIdle, { timeout: 2000 });
  } else {
    setTimeout(loadVConsoleIdle, 1000);
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


