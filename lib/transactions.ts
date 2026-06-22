// Player transaction-history persistence backed by the Firebase Realtime Database.
// ---------------------------------------------------------------------------
// The game has no login, so each browser gets a stable anonymous player id kept
// in localStorage. Every spin/free-game result is pushed to
// `transactions/{playerId}` (push() keys are time-ordered), and the most recent
// entries are loaded back on boot so a returning player sees their history.
// All calls are browser-only and fail soft — Firebase problems never break play.

import { ref, push, get, query, orderByKey, limitToLast } from "firebase/database";
import { getDb } from "./firebase";

export interface TxnEntry {
  time: string;                 // human-readable time-of-day (as shown in the modal)
  type: "spin" | "free";
  bet: number;
  win: number;
  balance: number;
  ts?: number;                  // epoch ms, added on save
}

const MAX = 500;                // keep history bounded (matches the in-memory cap)
const PID_KEY = "aether_playerId";

let _memPlayerId: string | null = null;
const newPlayerId = (): string => "player_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);

export function getPlayerId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id) { id = newPlayerId(); localStorage.setItem(PID_KEY, id); }
    return id;
  } catch {
    // localStorage blocked (private mode / disabled cookies) — use a stable
    // per-session id so history still works in memory for this session.
    return (_memPlayerId ||= newPlayerId());
  }
}

// Load the player's most recent transactions, newest first (to match the log).
export async function loadTransactions(): Promise<TxnEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const snap = await get(query(ref(getDb(), `transactions/${getPlayerId()}`), orderByKey(), limitToLast(MAX)));
    const out: TxnEntry[] = [];
    // Coerce every field — the DB is shared/tamperable, so never trust its shape
    // (prevents Rs NaN and bad types flowing into the renderer).
    snap.forEach((c) => {
      const v = c.val() as Partial<TxnEntry> | null;
      if (!v || typeof v !== "object") return;
      out.push({
        time: String(v.time ?? ""),
        type: v.type === "free" ? "free" : "spin",
        bet: Number(v.bet) || 0,
        win: Number(v.win) || 0,
        balance: Number(v.balance) || 0,
        ts: Number(v.ts) || 0,
      });
    });
    return out.reverse();
  } catch (e) {
    console.warn("[firebase] loadTransactions failed (check RTDB rules):", e);
    return [];
  }
}

// Append one transaction (fire-and-forget; never throws into the game loop).
export function saveTransaction(entry: TxnEntry): void {
  if (typeof window === "undefined") return;
  try {
    push(ref(getDb(), `transactions/${getPlayerId()}`), { ...entry, ts: Date.now() })
      .catch((e) => console.warn("[firebase] saveTransaction failed (check RTDB rules):", e));
  } catch (e) {
    console.warn("[firebase] saveTransaction failed (check RTDB rules):", e);
  }
}
