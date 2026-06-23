// Firebase initialization for the Aether Dynasty slot.
// ---------------------------------------------------------------------------
// `initializeApp` is isomorphic (safe during SSR / `next build`). The app is
// created at import time; the Realtime Database is built lazily in the browser.
//
// Firebase Analytics is intentionally NOT loaded: it injects Google's gtag.js
// script, which ad/privacy blockers cancel with `net::ERR_BLOCKED_BY_CLIENT`
// (a browser-level error that no try/catch can suppress), and we log no events.
//
// NOTE: the Firebase web config (incl. apiKey) is a public client identifier, not
// a secret — it's meant to ship in the browser bundle. Access is controlled by
// Firebase security rules, not by hiding this config.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD5DKlzlx06FIzvWPGjXfhcD2Owalcizog",
  authDomain: "matching-game-3bf15.firebaseapp.com",
  databaseURL: "https://matching-game-3bf15-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "matching-game-3bf15",
  storageBucket: "matching-game-3bf15.firebasestorage.app",
  messagingSenderId: "336440464725",
  appId: "1:336440464725:web:7d0e8c5e496950664a0bdc",
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
