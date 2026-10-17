import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/firebase'; // Ensure Firebase is initialized
import { ErrorBoundary } from './components/ErrorBoundary';


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

