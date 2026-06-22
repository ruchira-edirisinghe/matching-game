// Firebase initialization for the Aether Dynasty slot.
// ---------------------------------------------------------------------------
// `initializeApp` is isomorphic (safe during SSR / `next build`), but Firebase
// Analytics is browser-only — calling `getAnalytics()` at module load would crash
// server rendering. So the app is created at import time and analytics is created
// lazily on the client via `initAnalytics()`, guarded by `isSupported()`.
//
// NOTE: the Firebase web config (incl. apiKey) is a public client identifier, not
// a secret — it's meant to ship in the browser bundle. Access is controlled by
// Firebase security rules, not by hiding this config.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD5DKlzlx06FIzvWPGjXfhcD2Owalcizog",
  authDomain: "matching-game-3bf15.firebaseapp.com",
  databaseURL: "https://matching-game-3bf15-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "matching-game-3bf15",
  storageBucket: "matching-game-3bf15.firebasestorage.app",
  messagingSenderId: "336440464725",
  appId: "1:336440464725:web:7d0e8c5e496950664a0bdc",
  measurementId: "G-GKSKWMSD3V",
};

// Reuse an existing app so Fast Refresh / repeated imports don't re-initialize.
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Realtime Database — created lazily so it's only built in the browser (never at
// SSR/build) and only when something actually reads/writes.
let _db: Database | null = null;
export function getDb(): Database {
  if (!_db) _db = getDatabase(app);
  return _db;
}

// Analytics is created once, only in a supporting browser environment.
export let analytics: Analytics | null = null;

export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined" || analytics) return analytics;
  try {
    if (await isSupported()) analytics = getAnalytics(app);
  } catch (e) {
    // Unsupported browser, blocked by privacy settings, offline, etc. — never fatal.
    console.warn("[firebase] analytics init skipped:", e);
  }
  return analytics;
}
