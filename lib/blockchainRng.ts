/* =============================================================================
   Provably-fair RNG seed source — ported from the horse-racing game.
   ---------------------------------------------------------------------------
   Fetches a verifiable random number derived from a blockchain block via the
   same Azure service (proxied same-origin through the /api/blockchain rewrite in
   next.config.ts) and turns it into the slot's per-spin PRNG seed. If the
   service is unavailable it falls back to Math.random(), flagged via `fallback`.
   ============================================================================= */

export interface BlockchainSeedResult {
  seed: number;          // normalised 0..1 (block number / 99999, or Math.random on fallback)
  number: number | null; // raw block-derived number, 1..99999
  blockNumber: number | null;
  blockHash: string | null;
  fallback: boolean;     // true => chain service unavailable, used local randomness
}

// Same provably-fair service + auth token as the horse-racing game. Always
// proxied same-origin via the /api/blockchain rewrite (avoids browser CORS).
const BLOCKCHAIN_RNG_AUTH_TOKEN =
  process.env.NEXT_PUBLIC_BLOCKCHAIN_RNG_TOKEN || "82912aef-66f9-4572-a40f-c44bb74ab467";
const BLOCKCHAIN_RNG_URL = "/api/blockchain/Generator/GetRandomNumberForRangeByTime";

// The service serves the closest block BEFORE the supplied timestamp and rejects
// timestamps in its own future. The host clock can run ahead of the chain, so we
// send `now - lag` and step `lag` upward on rejection, caching the working value.
let __rngLagSec = 0;
const __RNG_LAG_STEPS = [0, 300, 1800, 7200, 28800, 115200, 460800, 1843200]; // 0,5m,30m,2h,8h,32h,5.3d,21d

export function fetchBlockchainSeed(signal?: AbortSignal): Promise<BlockchainSeedResult> {
  const TIMEOUT_MS = 12000;
  const nowSec = Math.floor(Date.now() / 1000);
  let stepIdx = Math.max(0, __RNG_LAG_STEPS.indexOf(__rngLagSec));
  if (stepIdx < 0) stepIdx = 0;
  let networkRetries = 2;

  return new Promise((resolve) => {
    let settled = false;
    let curController: AbortController | null = null;
    const localSeed = (): BlockchainSeedResult => ({ seed: Math.random(), number: null, blockNumber: null, blockHash: null, fallback: true });
    const finish = (v: BlockchainSeedResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(v);
    };
    const fallback = (reason: string) => {
      // Handled, expected degradation (not a crash) — warn, don't error.
      console.warn(`[BlockchainRNG] ⚠ Falling back to local RNG. ${reason}`);
      finish(localSeed());
    };
    // The caller (controller) passes its cleanup signal; on unmount we stop all
    // in-flight work and retry timers and resolve quietly so nothing leaks.
    function onAbort() {
      try { curController?.abort(); } catch { /* ignore */ }
      finish(localSeed());
    }
    if (signal?.aborted) { finish(localSeed()); return; }
    signal?.addEventListener("abort", onAbort, { once: true });

    function attempt() {
      if (settled) return;
      const lag = __RNG_LAG_STEPS[Math.min(stepIdx, __RNG_LAG_STEPS.length - 1)] ?? 0;
      const timestamp = nowSec - lag;
      const controller = new AbortController();
      curController = controller;
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      fetch(BLOCKCHAIN_RNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: BLOCKCHAIN_RNG_AUTH_TOKEN, min: 1, max: 99999, timestamp, closestBefore: true }),
        signal: controller.signal,
      })
        .then(async (r) => {
          clearTimeout(timeoutId);
          if (settled) return;
          const text = await r.text().catch(() => "");
          if (settled) return;
          let data: { number?: number; blockNumber?: number; blockHash?: string; errorMessage?: string; status?: number } | null = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = null; }

          // Success — a numeric seed was returned.
          if (data && data.number !== undefined && data.number !== null) {
            __rngLagSec = lag; // remember the working offset for next time
            console.log(`[BlockchainRNG] ✅ Seed — block #${data.blockNumber} number=${data.number} (lag ${lag}s)`);
            finish({ seed: data.number / 99999, number: data.number, blockNumber: data.blockNumber ?? null, blockHash: data.blockHash ?? null, fallback: false });
            return;
          }

          const msg = (data && (data.errorMessage as string)) || `HTTP ${r.status}`;
          // Timestamp is in the chain's future — step the lag back and retry.
          if (/greater than/i.test(msg) || data?.status === 1) {
            if (stepIdx < __RNG_LAG_STEPS.length - 1) { stepIdx += 1; attempt(); }
            else fallback(`Service kept rejecting timestamps: ${msg}`);
            return;
          }
          // Other / transient error — short retry at the same lag.
          if (networkRetries-- > 0) setTimeout(attempt, 1200);
          else fallback(`Last error: ${msg}`);
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          if (settled) return;   // aborted (unmounted) or already resolved
          const e = err as { name?: string; message?: string };
          const msg = e?.name === "AbortError" ? `timeout after ${TIMEOUT_MS / 1000}s` : (e?.message || String(err));
          if (networkRetries-- > 0) setTimeout(attempt, 1200);
          else fallback(`Last error: ${msg}`);
        });
    }
    attempt();
  });
}

// Turn a 0..1 base seed + per-spin nonce into a well-separated integer seed for
// the engine's PRNG. The prime stride keeps consecutive spins' PRNG streams from
// overlapping (a single spin draws far fewer than `stride` random numbers), so
// every spin is a distinct, verifiable sequence derived from the same chain seed.
export function deriveSpinSeed(base: number, nonce: number): number {
  const b = Number.isFinite(base) ? base : Math.random();
  return ((Math.floor(b * 1_000_000) + nonce * 100_003) % 2_147_483_647) + 1;
}
