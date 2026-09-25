import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup as firebaseSignInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/youtube.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/youtube.force-ssl');

/**
 * Enhanced signInWithPopup that captures, analyzes, and logs detailed telemetry,
 * particularly for diagnosing auth/cancelled-popup-request.
 */
export const signInWithPopup = async (authInstance: any, providerInstance: any) => {
  const startTime = Date.now();
  console.log('[Auth Diagnostics] Triggered signInWithPopup. Start timestamp:', startTime);
  try {
    const result = await firebaseSignInWithPopup(authInstance, providerInstance);
    const duration = Date.now() - startTime;
    console.log('[Auth Diagnostics] signInWithPopup succeeded in', duration, 'ms. User:', result.user?.email);
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Auth Diagnostics] signInWithPopup failed after', duration, 'ms.');
    console.error('[Auth Diagnostics] Full Error Details:', {
      code: error?.code,
      message: error?.message,
      customData: error?.customData,
      stack: error?.stack,
      durationMs: duration
    });
    
    if (error?.code === 'auth/cancelled-popup-request') {
      console.warn(
        '[Auth Diagnostics] DETECTED auth/cancelled-popup-request!\n' +
        'Context Diagnostics:\n' +
        `- Window location origin: ${window.location.origin}\n` +
        `- Is running inside iframe: ${window.self !== window.top}\n` +
        'Analysis:\n' +
        '1. CLIENT-SIDE RACE CONDITION: Multiple sequential clicks on the "Sign In" button triggered multiple popup promises concurrently.\n' +
        '2. PLATFORM BLOCKING CONDITION: The browser popup blocker intercepted the popup, causing Firebase to cancel the pending state immediately.\n' +
        '3. IFRAME BOUNDARY LIMIT: AI Studio preview environment iframes lack permission to open popups directly without sandbox="allow-popups-to-escape-sandbox allow-popups".'
      );
    }
    throw error;
  }
};

export { signOut, onAuthStateChanged, GoogleAuthProvider };
export type { User };
