import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup as firebaseSignInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/youtube.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/youtube.force-ssl');

// Enhanced signInWithPopup that handles Tauri desktop & iframe sandboxes cleanly
export const signInWithPopup = async (authInstance: any, providerInstance: any) => {
  const isTauri = typeof window !== 'undefined' && (
    Boolean((window as any).__TAURI_IPC__) ||
    Boolean((window as any).__TAURI__) ||
    window.location.protocol === 'tauri:' ||
    window.location.origin.includes('tauri.localhost') ||
    window.location.origin.includes('tauri://')
  );
  if (isTauri) {
    const tauriErr = new Error('Tauri desktop environment detected. Use system browser authorization with http://localhost:3000.');
    (tauriErr as any).code = 'auth/cancelled-popup-request';
    (tauriErr as any).isTauriDesktop = true;
    throw tauriErr;
  }

  // If running inside an iframe preview sandbox, browser blocks popup auth
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    const iframeErr = new Error('Cross-origin iframe preview restriction: Popup authentication disabled in preview frame.');
    (iframeErr as any).code = 'auth/cancelled-popup-request';
    (iframeErr as any).isIframePreview = true;
    throw iframeErr;
  }

  try {
    const result = await firebaseSignInWithPopup(authInstance, providerInstance);
    return result;
  } catch (error: any) {
    if (error?.code === 'auth/cancelled-popup-request') {
      console.warn('[Auth Diagnostics] Popup request cancelled due to sandbox constraints or popup blocker.');
    }
    throw error;
  }
};

export { signOut, onAuthStateChanged, GoogleAuthProvider };
export type { User };
