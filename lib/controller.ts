/* =============================================================================
   Aether Dynasty — UI controller (render + animation + controls)
   ---------------------------------------------------------------------------
   Ported from the original `main.js` IIFE. Instead of booting on
   `DOMContentLoaded`, the work is exposed as `boot()`, which a client React
   component calls from `useEffect` once the markup is mounted. `boot()` returns
   a cleanup function that detaches the document-level key listeners (so Fast
   Refresh / unmount don't stack duplicate handlers).
   ============================================================================= */

import { GTSymbols } from "./symbols";
import { GTEngine } from "./engine";
import { GTRules } from "./rules";
import { fetchBlockchainSeed, deriveSpinSeed, type BlockchainSeedResult } from "./blockchainRng";
import { loadTransactions, saveTransaction } from "./transactions";
import type { Board, Cascade, Cell, Heights, SymbolId } from "./types";

declare global {
  interface Window {
    /** Provably-fair seed inspector + profile chip. Set on boot, removed on cleanup. */
    GT?: {
      /** Provably-fair seed audit for the current chain seed (read-only). */
      seedInfo: () => BlockchainSeedResult | null;
      /** Repaint the top-bar profile chip (avatar + name). */
      setPlayer: (name?: string, avatarUrl?: string | null) => void;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

interface HistoryEntry {
  time: string;
  type: "spin" | "free";
  bet: number;
  win: number;
  balance: number;
}

export function boot(): () => void {
  const S = GTSymbols;
  const COLS = GTEngine.COLS;     // 6
  const ROWS = GTEngine.MAX_ROWS; // 6

  // Standalone demo balance.
  const startBalance = 50000;
  const engine = GTEngine.create({ balance: startBalance, bet: 3 });

  // ---- DOM refs --------------------------------------------------------------
  const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
  let boardEl: HTMLElement, cascadeFx: HTMLElement;
  let cells: HTMLElement[][] = [];
  let balValEl: HTMLElement, betValEl: HTMLElement, winValEl: HTMLElement, waysNumEl: HTMLElement, winPopEl: HTMLElement;
  let btnSpin: HTMLElement, btnAuto: HTMLElement, btnTurbo: HTMLElement;

  // ---- runtime state ---------------------------------------------------------
  let currentBoard: Board = [], currentHeights: Heights = [];
  let spinning = false, skip = false;
  let turbo = 0;                 // 0 = off, 1 = turbo, 2 = super turbo
  let musicVolume = 0.35;        // background-music level (0–1), set in the Sound popup
  let sfxVolume = 1.0;           // game-effects level (0–1), set in the Sound popup
  let bgMusic: HTMLAudioElement | null = null;   // looping background track
  let autoRemaining = 0, autoInfinite = false;
  let autoSelected: number | "inf" = 10;
  let shownBalance = engine.balance;
  let gameReady = false;     // splash "Loading…" clears once the first board + seed are ready
  let splashGone = false;    // guards the splash dismissal so it fires exactly once
  let assetProgress = 0;     // 0..1 real asset-preload fraction, reported by preloadAssets
  let assetsDone = false;    // true once every asset has loaded (or the preload cap fired)
  const history: HistoryEntry[] = [];   // transaction log, newest first

  // Every listener is registered with this signal so one abort() in the cleanup
  // removes them all — document AND element level — which prevents duplicate
  // handlers stacking on the persistent DOM across Fast Refresh remounts.
  const ac = new AbortController();
  const { signal } = ac;

  const speed = (): number => (skip ? 0.001 : turbo === 2 ? 0.28 : turbo === 1 ? 0.5 : 1);
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms * speed())));

  // ---- formatting ------------------------------------------------------------
  const fmtMoney = (n: number): string => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number): string => Math.round(n).toLocaleString("en-US");
  // Escape strings that come from the (shared/tamperable) database before they
  // go into innerHTML — defends against stored XSS via a transaction's time.
  const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  // ---- provably-fair RNG seeding (blockchain) --------------------------------
  // A verifiable seed is pulled from the same blockchain service the horse game
  // uses; the engine is re-seeded before EVERY spin (base + free) so each outcome
  // is provably fair. A throttled background refresh keeps the chain seed fresh,
  // and a per-spin nonce makes each spin a distinct deterministic sequence (so
  // rapid spins that share a block don't repeat). Falls back to Math.random.
  let seedAudit: BlockchainSeedResult | null = null;
  let spinNonce = 0;
  let lastSeedFetch = 0;
  let seedFetching = false;

  function refreshSeed(force = false): void {
    if (seedFetching) return;
    const now = Date.now();
    if (!force && now - lastSeedFetch < 8000) return;
    seedFetching = true; lastSeedFetch = now;
    fetchBlockchainSeed(signal)
      // Keep spinNonce MONOTONIC — never reset it. Blocks advance (~12s) slower
      // than the refresh throttle (8s), so consecutive fetches often return the
      // same block; resetting the nonce would reproduce (base, 0) and replay an
      // identical board. A growing nonce keeps every spin a distinct sequence.
      .then((r) => { if (!signal.aborted) seedAudit = r; })
      .catch(() => { /* keep the previous seed; per-spin fallback covers it */ })
      .finally(() => { seedFetching = false; });
  }

  function seedNextSpin(): void {
    const base = seedAudit ? seedAudit.seed : Math.random();
    engine.setSeed(deriveSpinSeed(base, spinNonce));
    spinNonce++;
    refreshSeed();   // throttled background refresh for upcoming spins
  }

  // ---- player profile chip ---------------------------------------------------
  // Paint the top-bar avatar + name from host-provided values. Imperative (by id)
  // like the rest of the HUD, so a React re-render never clobbers it. Falls back
  // to the name's initials when there's no usable picture (or it fails to load).
  function setPlayer(name?: string, avatarUrl?: string | null): void {
    const nm = name && name.trim() ? name.trim() : "Player";
    const initials = nm.slice(0, 2).toUpperCase();
    const raw = avatarUrl && avatarUrl.trim() ? avatarUrl.trim() : "";
    const url = /^(https?:\/\/|data:image\/)/i.test(raw) ? raw : "";

    function paintDisc(disc: HTMLElement): void {
      if (url) {
        disc.textContent = "";
        const img = document.createElement("img");
        img.src = url;
        img.alt = nm;
        img.referrerPolicy = "no-referrer";
        img.onerror = () => { disc.textContent = initials; };
        disc.appendChild(img);
      } else {
        disc.textContent = initials;
      }
    }

    const nameEl = document.getElementById("playerName");
    if (nameEl) nameEl.textContent = nm;
    const disc = document.getElementById("playerAvatar");
    if (disc) paintDisc(disc);

    // Also paint the splash-screen chip so the player info is visible from the
    // home screen before the game screen is revealed.
    const splashNameEl = document.getElementById("splashPlayerName");
    if (splashNameEl) splashNameEl.textContent = nm;
    const splashDisc = document.getElementById("splashPlayerAvatar");
    if (splashDisc) paintDisc(splashDisc);
  }

  // =============================================================================
  // Boot (runs once the React markup is mounted)
  // =============================================================================
  function init(): void {
    // Reset the boot loading screen to its initial state (loader shown, not yet
    // dissolved; home not yet revealed; START hidden) so a StrictMode / Fast-Refresh
    // remount replays the loading sequence cleanly instead of inheriting a "done"
    // loader / revealed home left in the persistent DOM by the previous mount.
    const alReset = document.getElementById("adLoading");
    if (alReset) { alReset.hidden = false; alReset.classList.remove("done"); }
    const homeReset = document.getElementById("startScreen"); if (homeReset) homeReset.classList.remove("reveal");
    const sbReset = document.getElementById("btnStart"); if (sbReset) sbReset.hidden = true;
    // Hide the home chrome (back / music / player chip) while the loader is up;
    // it's re-shown when the home screen is revealed at the end of loading.
    showSplashChrome(false);

    $("filter-defs").innerHTML = S.FILTER_DEFS;

    // Warm the cascade break-frame GIF so it's cached before the first break
    // animation (replaces the <link rel=preload> the browser flagged as unused).
    if (typeof Image !== "undefined") { new Image().src = "/assets/cell-break.gif"; }

    // Videos: force-mute (React doesn't reliably reflect the `muted` attribute)
    // so autoplay is allowed. Only the splash runs now (intro→loop, setupSplashBg);
    // the in-game background is started later by playGameBg() when the game screen
    // is revealed, and the transition is preloaded only. Decoding several videos at
    // once is the main cause of jank in the mobile webview, so we keep it to one.
    document.querySelectorAll<HTMLVideoElement>("video.start-bg, video.screen-bg, #transitionVid")
      .forEach((v) => { v.muted = true; });
    setupSplashBg();

    // Background music — looping at the music volume (default 35%). Browsers
    // block audio autoplay until a gesture, so we try immediately and again on
    // the first interaction of any kind (mouse move/tap/key) so it starts as
    // soon as the player touches the start screen, then stop retrying.
    bgMusic = document.getElementById("bgMusic") as HTMLAudioElement | null;
    if (bgMusic) { bgMusic.loop = true; bgMusic.volume = musicVolume; }
    startMusic();
    const kickEvents = ["pointerdown", "pointermove", "keydown", "touchstart", "click"];
    const kickMusic = (): void => {
      startMusic();
      if (bgMusic && !bgMusic.paused) kickEvents.forEach((ev) => document.removeEventListener(ev, kickMusic));
    };
    kickEvents.forEach((ev) => document.addEventListener(ev, kickMusic, { signal, passive: true }));

    // decorative art
    $("runeRing").innerHTML = S.art.techRune();

    boardEl = $("board"); cascadeFx = $("cascadeFx");
    balValEl = $("balVal"); betValEl = $("betVal"); winValEl = $("winVal");
    waysNumEl = $("waysNum"); winPopEl = $("winPop");
    btnSpin = $("btnSpin"); btnAuto = $("btnAuto"); btnTurbo = $("btnTurbo");

    buildBoardDOM();
    wireControls();
    buildRules();
    buildAutoGrid();

    // initial idle board
    const idle = engine.idleBoard();
    currentBoard = idle.board; currentHeights = idle.heights;
    renderBoard(true);
    setWaysInstant(engine.waysOf(currentHeights));
    setBalanceInstant(engine.balance);
    betValEl.textContent = String(engine.bet);
    winValEl.textContent = "0.00";

    // Paint the top-bar profile chip. Standalone has no host player, so this
    // renders the default "Player" placeholder.
    setPlayer();

    // Provably-fair seed inspector (no internal-state debug hooks shipped).
    // seedInfo exposes the verifiable chain seed for the current spin; setPlayer
    // lets anything that later learns a name/avatar repaint the profile chip.
    window.GT = {
      seedInfo: () => seedAudit,
      setPlayer,
    };

    // Provably-fair seeding: fetch the first blockchain seed in the background so
    // it's ready for the first spin. Readiness of the splash is now gated on the
    // asset-preload bar (preloadAssets) — NOT on this — so a slow or failed seed
    // fetch never affects when START appears (each spin also has a Math.random
    // fallback). Later spins use the throttled background refresh in seedNextSpin.
    seedFetching = true; lastSeedFetch = Date.now();
    fetchBlockchainSeed(signal)
      .then((r) => { if (!signal.aborted) seedAudit = r; })
      .catch(() => { /* per-spin fallback covers a missing seed */ })
      .finally(() => { seedFetching = false; });

    // Preload all game assets (feeds the loading screen's progress), then run the
    // boot loading screen: it cycles the status text, drives the bar, holds for up
    // to 8s and finally fade-zooms away to reveal the home screen with START.
    preloadAssets();
    runLoadingScreen();

    // Restore this player's transaction history from Firebase (seed once, before
    // any spin this session, so live spins aren't clobbered).
    loadTransactions().then((loaded) => {
      if (!loaded.length) return;
      // Append restored (older) history beneath any spins already played this
      // session — the loaded snapshot predates them, so there's no overlap. (The
      // old "seed only if empty" check dropped restored history whenever a spin
      // landed before this resolved, e.g. on the ?autospin path.)
      history.push(...loaded);
      if (history.length > 500) history.length = 500;
      if (!$("historyModal").hidden) renderHistory();
    });
  }

  // =============================================================================
  // Board rendering
  // =============================================================================
  function buildBoardDOM(): void {
    boardEl.innerHTML = "";
    cells = [];
    for (let c = 0; c < COLS; c++) {
      const reel = document.createElement("div");
      reel.className = "reel";
      const colCells: HTMLElement[] = [];
      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        reel.appendChild(cell);
        colCells.push(cell);
      }
      cells.push(colCells);
      boardEl.appendChild(reel);
    }
  }

  function renderCell(el: HTMLElement, cell: Cell | null, animateDrop?: boolean, dropDelay?: number, breakFill?: boolean): void {
    const wasEmpty = el.classList.contains("locked");
    el.className = "cell";
    el.innerHTML = "";
    if (!cell) { el.classList.add("locked"); return; }
    const sym = document.createElement("div");
    sym.className = "sym";
    sym.innerHTML = cell.wild ? S.buildWild(cell.wildN) : S.get(cell.id as SymbolId).svgHTML;
    el.appendChild(sym);
    if (cell.frame) {
      const f = document.createElement("div");
      f.innerHTML = S.buildFrameOverlay();
      el.appendChild(f.firstElementChild!);
    }
    // a caramel (locked-cell) box being replaced: break it first, then let the
    // symbol pass into the spot. Only genuine empty/caramel boxes break this way.
    if (breakFill && wasEmpty) {
      el.classList.add("break-fill");
      const brk = document.createElement("div");
      brk.className = "break-fx";
      brk.addEventListener("animationend", () => brk.remove());
      el.appendChild(brk);
    } else if (animateDrop && cell.fresh) {
      el.classList.add("drop");
      sym.style.animationDelay = (dropDelay || 0) + "s";
    }
  }

  function renderBoard(animateDrop?: boolean, breakFill?: boolean): void {
    for (let c = 0; c < COLS; c++) {
      const h = currentHeights[c];
      for (let r = 0; r < ROWS; r++) {
        const cell = r < h ? currentBoard[c][r] : null;
        renderCell(cells[c][r], cell, animateDrop, r * 0.035 + c * 0.02, breakFill);
      }
    }
  }

  // =============================================================================
  // HUD helpers (animated counters)
  // =============================================================================
  function animateNumber(setter: (v: number) => void, from: number, to: number, dur: number): Promise<void> {
    const t0 = performance.now();
    const d = Math.max(60, dur * (skip ? 0.05 : 1));
    return new Promise((res) => {
      function tick(t: number) {
        if (signal.aborted) { res(); return; }   // stop the rAF loop once the mount tore down
        const k = Math.min(1, (t - t0) / d);
        const e = 1 - Math.pow(1 - k, 3);
        setter(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick); else { setter(to); res(); }
      }
      requestAnimationFrame(tick);
    });
  }

  const setBalanceInstant = (n: number): void => { shownBalance = n; balValEl.textContent = fmtMoney(n); };
  function animateBalanceTo(n: number): Promise<void> {
    return animateNumber((v) => { shownBalance = v; balValEl.textContent = fmtMoney(v); }, shownBalance, n, 500);
  }
  const setWaysInstant = (n: number): void => { waysNumEl.textContent = fmtInt(n); };
  function animateWaysTo(n: number): Promise<void> {
    const from = parseInt((waysNumEl.textContent || "").replace(/,/g, ""), 10) || 0;
    return animateNumber((v) => { waysNumEl.textContent = fmtInt(v); }, from, n, 400);
  }
  function setWin(n: number): void { winValEl.textContent = fmtMoney(n); }

  function showWinPop(text: string, big?: boolean): void {
    winPopEl.textContent = text;
    winPopEl.style.fontSize = big ? "clamp(28px,7vw,58px)" : "clamp(20px,4vw,34px)";
    winPopEl.classList.remove("show"); void winPopEl.offsetWidth; winPopEl.classList.add("show");
  }

  // =============================================================================
  // Sound (tiny WebAudio blips, fully optional)
  // =============================================================================
  let actx: AudioContext | null = null;
  function beep(freq: number, dur: number, type?: OscillatorType, vol?: number): void {
    if (signal.aborted || sfxVolume <= 0) return;   // never open an AudioContext after teardown
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext!)();
      // Browsers start the context suspended until a user gesture; resume it so
      // sounds aren't silently dropped (e.g. on the ?autospin auto-start path).
      if (actx.state === "suspended") actx.resume().catch(() => { /* ignore */ });
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "triangle"; o.frequency.value = freq;
      g.gain.value = (vol || 0.05) * sfxVolume;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch { /* ignore */ }
  }
  const sndSpin = (): void => beep(180, 0.18, "sawtooth", 0.04);
  const sndWin = (i: number): void => beep(440 + Math.min(i, 8) * 70, 0.16, "triangle", 0.06);
  const sndDrop = (): void => beep(120, 0.08, "square", 0.03);
  const sndBigTimers: ReturnType<typeof setTimeout>[] = [];
  const sndBig = (): void => {
    [523, 659, 784, 1046].forEach((f, i) => {
      sndBigTimers.push(setTimeout(() => { beep(f, 0.25, "triangle", 0.07); }, i * 90));
    });
  };
  signal.addEventListener("abort", () => { sndBigTimers.forEach(clearTimeout); sndBigTimers.length = 0; }, { once: true });

  // Background music: looping mp3 at the current music volume (default 35%, set
  // in the Sound popup). Browsers block audio autoplay until a user gesture, so
  // init() also kicks this off on the first interaction with the start screen.
  function startMusic(): void {
    if (signal.aborted || !bgMusic || musicVolume <= 0) return;
    bgMusic.volume = musicVolume;
    bgMusic.play().catch(() => { /* needs a user gesture; retried on first interaction */ });
  }

  // =============================================================================
  // Spin flow
  // =============================================================================
  function setSpinning(on: boolean): void {
    spinning = on;
    btnSpin.classList.toggle("spinning", on);
    [$("betMinus"), $("betPlus")].forEach((b) => { (b as HTMLButtonElement).disabled = on; });
    refreshSpinBtn();
  }

  // the big spin button doubles as the auto-spin countdown + STOP control
  function refreshSpinBtn(): void {
    const autoActive = autoInfinite || autoRemaining > 0;
    btnSpin.classList.toggle("autoact", autoActive);
    btnSpin.title = autoActive ? "Stop auto spin" : "Spin";
  }

  // pressing spin (or Space): stop auto-spin if it's running, otherwise spin
  function handleSpinPress(): void {
    if (autoInfinite || autoRemaining > 0) { stopAuto(); skip = true; return; }
    doSpin();
  }

  // ---- start / splash screen ------------------------------------------------
  // Splash background: play the start_screen intro once, then crossfade to the
  // looping startscreen2 and loop that one forever.
  function setupSplashBg(): void {
    const intro = document.getElementById("startBg1") as HTMLVideoElement | null;
    const loop = document.getElementById("startBg2") as HTMLVideoElement | null;
    if (!intro || !loop) return;
    // Normalize the crossfade state so every boot starts from a known visual (the
    // intro showing), regardless of a `.show` class left on the persistent DOM by
    // a previous mount (StrictMode / Fast Refresh) — otherwise goHome() could read
    // a stale `.show` and resume the wrong clip.
    intro.classList.add("show"); loop.classList.remove("show");
    intro.muted = true; loop.muted = true;
    intro.play().catch(() => { /* autoplay may defer; harmless */ });
    const toLoop = (): void => {
      // Instant swap, no crossfade. The loop video stacks above the intro, so
      // showing it from frame 0 covers the intro with no cut; we only hide the
      // intro once the loop is actually rendering, so there's never a dark gap.
      try { loop.currentTime = 0; } catch { /* ignore */ }
      loop.play().catch(() => { /* ignore */ });
      loop.classList.add("show");
      const hideIntro = (): void => { intro.classList.remove("show"); try { intro.pause(); } catch { /* ignore */ } };
      if (loop.readyState >= 2) hideIntro();
      else loop.addEventListener("playing", hideIntro, { once: true, signal });
    };
    intro.addEventListener("ended", toLoop, { signal });
  }

  // Preload every game asset up front (images + the in-DOM videos/audio) so by the
  // time the loader ends the videos are buffered and decode-warm and the first play
  // is lag-free. Reports progress into `assetProgress` (0..1) and flips `assetsDone`
  // when everything is ready (or a hard cap fires); runLoadingScreen() turns that
  // into the visible bar and the hand-off to the home screen.
  function preloadAssets(): void {
    const A = "/assets/";
    const images = [
      "logo.png", "cell-bg.png", "cell-locked.png", "cell-break.gif",
      "buttons/turbo.png", "buttons/super-turbo.png", "buttons/auto.png",
      "buttons/spin-idle.png", "buttons/spin-rotating.png",
      "buttons/sound.png", "buttons/history.png", "buttons/info.png", "buttons/close.png",
    ];
    // Wait on the actual in-DOM media (already buffering via preload="auto") so
    // there's no duplicate download. We gate on `loadeddata` (first frame decoded
    // → the hardware decoder is warm) rather than full `canplaythrough`, so the
    // bar finishes in a few seconds; the small videos keep buffering in the
    // background and, since they're paused until needed (transition after START,
    // bg when the game shows), they're fully buffered by the time they play.
    const media: HTMLMediaElement[] = [];
    ["startBg1", "startBg2", "transitionVid", "bgMusic"].forEach((id) => {
      const el = document.getElementById(id) as HTMLMediaElement | null;
      if (el) media.push(el);
    });
    document.querySelectorAll<HTMLMediaElement>("video.screen-bg").forEach((v) => media.push(v));

    const total = images.length + media.length;
    let loaded = 0;
    let finished = false;

    const finish = (): void => {
      if (finished || signal.aborted) return;   // ignore after unmount
      finished = true;
      clearTimeout(cap);
      assetProgress = 1;
      assetsDone = true;
    };
    const bump = (): void => {
      if (finished || signal.aborted) return;   // ignore late asset callbacks after unmount
      loaded++;
      assetProgress = total ? loaded / total : 1;
      if (loaded >= total) finish();
    };
    // hard cap: never leave assetsDone unset if an asset hangs. Track the per-asset
    // timers too so abort (StrictMode unmount) clears them all — none fire
    // bump()/finish() into a torn-down mount.
    const perTimers: Array<ReturnType<typeof setTimeout>> = [];
    const cap = setTimeout(finish, 20000);
    signal.addEventListener("abort", () => { clearTimeout(cap); perTimers.forEach((t) => clearTimeout(t)); }, { once: true });

    images.forEach((src) => {
      const im = new Image();
      im.onload = bump;
      im.onerror = bump;   // count failures as done so progress can still complete
      im.src = A + src;
    });

    media.forEach((el) => {
      if (el.readyState >= 2) { bump(); return; }   // HAVE_CURRENT_DATA (first frame) already
      let settled = false;
      const ok = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(perTimer);   // async callback → perTimer is always assigned by the time this runs
        el.removeEventListener("loadeddata", ok);
        el.removeEventListener("error", ok);
        bump();
      };
      el.addEventListener("loadeddata", ok, { signal });
      el.addEventListener("error", ok, { signal });
      const perTimer = setTimeout(ok, 12000);   // per-asset cap (below the 20s global cap)
      perTimers.push(perTimer);
    });
  }

  // The boot loading screen: cycle the divine status text, drive the bar from the
  // real preload progress (with a time floor so it always creeps forward), hold for
  // up to 8s, then fade-zoom the loader away while the home screen zooms in and the
  // START button appears. Finishes as soon as assets are ready (after a short
  // minimum) or at the 8s hard cap — whichever comes first.
  function runLoadingScreen(): void {
    const screen = document.getElementById("adLoading");
    const fill = document.getElementById("adLoadFill");
    const pctEl = document.getElementById("adLoadPct");
    const statusEl = document.getElementById("adLoadStatus");

    const HARD_CAP = 8000;   // never show the loader longer than 8s
    const MIN_SHOW = 2600;   // ...but always show it long enough to read a few lines
    const TEXTS = [
      "AWAKENING THE AETHER…",
      "SUMMONING THE PANTHEON…",
      "ALIGNING THE CONSTELLATIONS…",
      "FORGING GOLDEN RELICS…",
      "CHARGING THE DIVINE REELS…",
      "CONSULTING THE ORACLE…",
      "ENTERING OLYMPUS…",
    ];
    const t0 = performance.now();
    let display = 0;         // eased 0..1 currently shown on the bar
    let finished = false;

    const setStatus = (txt: string): void => {
      if (!statusEl) return;
      statusEl.textContent = txt;
      // re-trigger the fade-in on each change (reflow between clear + restore)
      statusEl.style.animation = "none";
      void statusEl.offsetWidth;
      statusEl.style.animation = "";
    };
    const paint = (frac: number): void => {
      const v = Math.max(0, Math.min(100, Math.round(frac * 100)));
      if (fill) fill.style.width = v + "%";
      if (pctEl) pctEl.textContent = v + "%";
      if (screen) screen.setAttribute("aria-valuenow", String(v));   // announce progress to assistive tech
    };

    // cycle the status text; hold the final "Entering Olympus…" line
    let ti = 0;
    if (statusEl) statusEl.textContent = TEXTS[0];
    const textTimer = setInterval(() => {
      if (finished) { clearInterval(textTimer); return; }
      ti++;
      if (ti >= TEXTS.length - 1) { setStatus(TEXTS[TEXTS.length - 1]); clearInterval(textTimer); return; }
      setStatus(TEXTS[ti]);
    }, 1150);

    const finishLoading = (): void => {
      if (finished || signal.aborted) return;
      finished = true;
      clearInterval(textTimer);
      clearInterval(tick);
      clearTimeout(capT);
      paint(1);
      setStatus(TEXTS[TEXTS.length - 1]);
      markReady();                     // reveal START on the home screen beneath
      showSplashChrome(true);          // bring back the home chrome (back / music / chip)
      const home = document.getElementById("startScreen");
      if (home) home.classList.add("reveal");   // fade-zoom the home screen in
      // let the full bar + "Entering Olympus…" register, then dissolve the loader
      setTimeout(() => {
        if (signal.aborted) return;
        if (screen) screen.classList.add("done");
        setTimeout(() => { if (screen && !signal.aborted) screen.hidden = true; }, 900);
      }, 300);
    };

    // eased progress ticker
    const tick = setInterval(() => {
      if (finished || signal.aborted) { clearInterval(tick); return; }
      const elapsed = performance.now() - t0;
      const timeFloor = Math.min(0.9, elapsed / HARD_CAP);            // always creeps forward
      const target = Math.min(0.985, Math.max(assetProgress * 0.96, timeFloor));
      display += (target - display) * 0.12;                           // smooth easing
      paint(display);
      if ((assetsDone && elapsed >= MIN_SHOW) || elapsed >= HARD_CAP) finishLoading();
    }, 60);

    // absolute backstop in case the interval is throttled (e.g. backgrounded tab)
    const capT = setTimeout(finishLoading, HARD_CAP + 250);
    signal.addEventListener("abort", () => { clearInterval(textTimer); clearInterval(tick); clearTimeout(capT); }, { once: true });

    paint(0);
  }

  // Reveal the START button once the loading screen hands off to the home screen.
  // Idempotent (gameReady guard).
  function markReady(): void {
    if (signal.aborted || gameReady) return;
    gameReady = true;
    const btn = document.getElementById("btnStart") as HTMLButtonElement | null;
    if (btn) { btn.hidden = false; btn.disabled = false; btn.setAttribute("aria-busy", "false"); }
  }

  // The home-screen nav bar (back / volume / profile) is a top-level overlay
  // (z 120) so it sits above the splash AND the portal transition. Show it on the
  // home screen and through the transition; hide it once the game screen is shown.
  function showSplashChrome(show: boolean): void {
    const bar = document.getElementById("splashTopbar");
    if (bar) bar.hidden = !show;
  }

  // Mobile perf: keep only ONE background video decoding at a time. The in-game
  // background (.screen-bg) plays only while the game is on screen; the splash
  // clips (#startBg1/#startBg2) only while the splash/transition is up. Several
  // simultaneous video decodes are the main source of jank in the mobile webview.
  function playGameBg(): void {
    document.querySelectorAll<HTMLVideoElement>("video.screen-bg").forEach((v) => {
      v.muted = true;
      v.play().catch(() => { /* may defer until a gesture; harmless */ });
    });
  }
  function pauseGameBg(): void {
    document.querySelectorAll<HTMLVideoElement>("video.screen-bg").forEach((v) => { try { v.pause(); } catch { /* ignore */ } });
  }
  function pauseSplashVideos(): void {
    ["startBg1", "startBg2"].forEach((id) => {
      const v = document.getElementById(id) as HTMLVideoElement | null;
      if (v) { try { v.pause(); } catch { /* ignore */ } }
    });
  }

  // Reveal the game on Start. Ignored until the game is ready, and fires exactly
  // once (Start click, Space, and Enter all funnel through here). The sequence is
  // a smooth crossfade: the transition video FADES IN over the splash → plays IN
  // FULL → FADES OUT to reveal the game (race) screen beneath it. No flash.
  function dismissStart(): void {
    if (!gameReady || splashGone) return;
    splashGone = true;
    beep(660, 0.12, "triangle", 0.05);   // confirm blip; also primes the AudioContext on this gesture

    const ss = document.getElementById("startScreen");
    const tr = document.getElementById("transition");
    const vid = document.getElementById("transitionVid") as HTMLVideoElement | null;
    const game = document.getElementById("game");

    // Fallback: if the transition layer isn't present, just hide the splash.
    if (!tr || !vid || !game) { if (ss) ss.hidden = true; showSplashChrome(false); playGameBg(); pauseSplashVideos(); return; }

    let finished = false;
    // Exit — when the clip ends (or the safety net fires), FADE the transition
    // OUT to reveal the game beneath. Detaches its own listener so the Home →
    // Start round-trip re-arms without stacking handlers.
    const finish = (): void => {
      if (finished) return;
      finished = true;
      showSplashChrome(false);             // game is being revealed → drop the home nav bar
      playGameBg(); pauseSplashVideos();   // only the game bg decodes during play (perf)
      vid.removeEventListener("ended", finish);
      tr.classList.remove("show");         // fade out (.55s) → game shows beneath
      setTimeout(() => {
        if (signal.aborted) return;
        tr.hidden = true;
        try { vid.pause(); vid.currentTime = 0; } catch { /* ignore */ }
      }, 600);
    };
    vid.addEventListener("ended", finish, { signal });

    // Enter — FADE the transition IN over the splash, then play it from frame 0.
    tr.hidden = false;
    void tr.offsetWidth;                   // reflow so the fade-in transition runs
    tr.classList.add("show");              // fade in (.55s)
    vid.muted = true;
    try { vid.currentTime = 0; } catch { /* metadata may not be ready; harmless */ }
    const p = vid.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* blocked → safety net covers it */ });
    setTimeout(() => { if (signal.aborted) return; if (ss) ss.hidden = true; }, 600);   // drop the splash once the transition has faded in

    // safety net: if 'ended' never fires (decode stall / blocked play), force-finish.
    // Cleared via signal so a Strict-Mode double-mount doesn't fire this into the
    // second boot's DOM after the first cleanup already ran.
    const durMs = (vid.duration && isFinite(vid.duration) ? vid.duration : 8.5) * 1000 + 1800;
    const safetyNet = setTimeout(finish, durMs);
    signal.addEventListener("abort", () => clearTimeout(safetyNet), { once: true });
  }

  // Back-to-home button: bring the splash (the game's own home screen) back over
  // the running game and re-arm START. The game keeps its state underneath;
  // pressing START replays the portal transition and reveals it. This always
  // returns to the home screen — exiting to the host platform is the splash nav
  // bar's Back button (wired to onExit in React), never this Home button.
  function goHome(): void {
    stopAuto();                           // don't leave auto-spin running on the way out
    if (spinning) skip = true;            // fast-forward any in-flight spin so it settles
                                          // cleanly instead of animating behind the splash
    const ss = document.getElementById("startScreen");
    if (!ss) return;
    const tr = document.getElementById("transition");
    if (tr) tr.hidden = true;
    ss.classList.remove("hide");
    ss.hidden = false;
    showSplashChrome(true);               // bring the home nav bar back with the splash
    splashGone = false;                   // re-arm START (click / Space / Enter)
    // resume whichever splash clip is currently shown — the startscreen2 loop if
    // the intro already finished, otherwise the intro itself
    const intro = document.getElementById("startBg1") as HTMLVideoElement | null;
    const loop = document.getElementById("startBg2") as HTMLVideoElement | null;
    if (loop && loop.classList.contains("show")) { loop.muted = true; loop.play().catch(() => { /* defer */ }); }
    else if (intro) { intro.muted = true; intro.play().catch(() => { /* defer */ }); }
    pauseGameBg();                        // game hidden again → stop decoding its bg video
    beep(420, 0.08, "square", 0.04);      // soft back blip
  }

  async function preSpin(): Promise<void> {
    // quick shuffle illusion on the active cells
    const frames = turbo === 2 ? 2 : turbo === 1 ? 3 : 5;
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < currentHeights[c]; r++) {
          const sym = cells[c][r].querySelector(".sym");
          if (sym) sym.innerHTML = S.get(S.order[(Math.random() * S.order.length) | 0]).svgHTML;
        }
      }
      sndSpin();
      await sleep(55);
    }
  }

  async function doSpin(): Promise<void> {
    if (spinning) { skip = true; return; }
    if (!engine.inFree && !engine.canSpin()) { flashInsufficient(); return; }

    skip = false;
    setSpinning(true);
    setWin(0);
    const prevBal = engine.balance;

    await preSpin();
    if (signal.aborted) { setSpinning(false); return; }   // torn down mid-spin — abandon the zombie spin

    seedNextSpin();              // re-seed the engine from the blockchain seed
    const result = engine.spin();

    // deduct the bet visually (base game only; free spins are free). Capture the
    // stake up front so the history entry records the bet locked in at spin start.
    const betForSpin = engine.bet;
    if (!result.freeMode) {
      setBalanceInstant(prevBal - betForSpin);
    }

    // land the initial board
    currentBoard = result.initial.board;
    currentHeights = result.initial.heights;
    renderBoard(true);
    sndDrop();
    await animateWaysTo(result.initial.ways);
    await sleep(280);

    // play cascades
    let runWin = 0;
    for (let i = 0; i < result.cascades.length; i++) {
      if (signal.aborted) return;
      await playCascade(result.cascades[i], i);
      runWin += result.cascades[i].totalWin;
      // Clamp the WIN readout and balance to the engine's actually-credited
      // (capped) win so neither overshoots when the payout cap binds. lastWin is
      // the capped total for this spin; both clamps are no-ops when uncapped.
      setWin(Math.min(runWin, engine.st.lastWin));
      await animateBalanceTo(Math.min((result.freeMode ? prevBal : prevBal - engine.bet) + runWin, engine.balance));
    }
    runWin = Math.min(runWin, engine.st.lastWin);

    // reconcile balance exactly with the engine
    await animateBalanceTo(engine.balance);
    recordHistory("spin", betForSpin, runWin, engine.balance);   // betForSpin: the stake locked in at spin start

    // feature transitions — keep the spin locked while overlays / free games
    // run so a stray Space or button press can't start a concurrent spin
    if (result.triggeredFree) {
      await featureOverlay("FREE GAME", "You reached 46,656 WAYS!", "6 Free Games", 1600);
      const freeWin = await runFreeGames();
      recordHistory("free", 0, freeWin, engine.balance);
    } else if (runWin >= engine.bet * 20) {
      sndBig();
      await featureOverlay(runWin >= engine.bet * 60 ? "MEGA WIN" : "BIG WIN", "", "Rs " + fmtMoney(runWin), 1700, true);
    }

    setSpinning(false);

    // autospin continuation
    if (autoRemaining > 0 || autoInfinite) {
      if (!autoInfinite) autoRemaining--;
      $("btnAuto").classList.toggle("on", autoRemaining > 0 || autoInfinite);
      updateAutoBtn(); refreshSpinBtn();
      if ((autoRemaining > 0 || autoInfinite) && engine.canSpin() && !signal.aborted) {
        await sleep(450);
        // user may have stopped during the gap — and never re-enter after unmount
        if ((autoRemaining > 0 || autoInfinite) && !signal.aborted) doSpin();
      } else { stopAuto(); }
    }
  }

  async function playCascade(casc: Cascade, index: number): Promise<void> {
    if (signal.aborted) return;
    // 1) highlight winning cells
    casc.winCells.forEach(([c, r]) => { if (cells[c] && cells[c][r]) cells[c][r].classList.add("win"); });
    if (casc.golden) showWinPop("GOLDEN TREASURE!", true);
    else showWinPop("Rs " + fmtMoney(casc.totalWin) + (casc.mult > 1 ? "  x" + casc.mult : ""), casc.totalWin >= engine.bet * 10);
    sndWin(index);
    spawnSparks(casc.winCells);
    await sleep(620);

    // 2) eliminate / transform / decrement
    casc.removed.forEach(([c, r]) => cells[c][r].classList.add("clear"));
    casc.blast.forEach(([c, r]) => cells[c][r].classList.add("clear"));
    spawnMagic(casc.removed.concat(casc.blast));
    casc.transformed.forEach(({ c, r, n }) => {
      const el = cells[c][r];
      el.classList.remove("win"); el.classList.add("transform");
      const sym = el.querySelector(".sym");
      if (sym) sym.innerHTML = S.buildWild(n);
      const f = el.querySelector(".frame-overlay"); if (f) f.remove();
    });
    casc.decremented.forEach(({ c, r, n }) => {
      const sym = cells[c][r].querySelector(".sym");
      if (sym) sym.innerHTML = S.buildWild(n);
      cells[c][r].classList.add("transform");
    });
    sndDrop();
    await sleep(440);   // matched symbols pop / sparkle out

    // 3) drop the resulting board — caramel boxes being replaced break first, then symbols pass in
    currentBoard = casc.resultBoard;
    currentHeights = casc.resultHeights;
    renderBoard(true, true);
    casc.expandCols.forEach((c) => {
      const r = casc.resultHeights[c] - 1;
      if (cells[c][r]) cells[c][r].classList.add("unlock");
    });
    if (casc.expandCols.length) beep(660, 0.12, "triangle", 0.05);
    await animateWaysTo(casc.waysAfter);
    await sleep(360);
  }

  function spawnSparks(winCells: number[][]): void {
    if (turbo === 2) return;
    const wr = cascadeFx.getBoundingClientRect();
    winCells.slice(0, 24).forEach(([c, r]) => {
      const el = cells[c]?.[r];
      if (!el) return;
      const b = el.getBoundingClientRect();
      const s = document.createElement("div");
      s.className = "spark";
      s.style.left = (b.left - wr.left + b.width / 2) + "px";
      s.style.top = (b.top - wr.top + b.height / 2) + "px";
      s.style.setProperty("--dx", ((Math.random() - 0.5) * 60) + "px");
      s.style.setProperty("--dy", ((Math.random() - 0.5) * 60) + "px");
      cascadeFx.appendChild(s);
      setTimeout(() => s.remove(), 700);
    });
  }

  // magical sparkle burst when matched boxes pop away (stars + glitter)
  const MAGIC_COLS: string[][] = [["#ffffff", "#ffd24a"], ["#bfefff", "#43e8ff"], ["#e9c6ff", "#a64bff"], ["#fff6c8", "#ffae3a"]];
  function spawnMagic(popCells: Array<[number, number]>): void {
    if (turbo === 2) return;
    const perCell = turbo === 1 ? 5 : 8;
    const wr = cascadeFx.getBoundingClientRect();
    popCells.slice(0, 18).forEach(([c, r]) => {
      const el = cells[c]?.[r];
      if (!el) return;
      const b = el.getBoundingClientRect();
      const cx = b.left - wr.left + b.width / 2;
      const cy = b.top - wr.top + b.height / 2;
      for (let i = 0; i < perCell; i++) {
        const star = i % 2 === 0;
        const p = document.createElement("div");
        p.className = star ? "mstar" : "mglow";
        const ang = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 36;
        const col = MAGIC_COLS[(Math.random() * MAGIC_COLS.length) | 0];
        p.style.left = cx + "px";
        p.style.top = cy + "px";
        p.style.setProperty("--dx", (Math.cos(ang) * dist).toFixed(1) + "px");
        p.style.setProperty("--dy", (Math.sin(ang) * dist).toFixed(1) + "px");
        p.style.setProperty("--col", col[0]);
        p.style.setProperty("--col2", col[1]);
        p.style.setProperty("--sz", (star ? 9 + Math.random() * 10 : 4 + Math.random() * 5).toFixed(0) + "px");
        p.style.setProperty("--dur", (0.55 + Math.random() * 0.35).toFixed(2) + "s");
        cascadeFx.appendChild(p);
        setTimeout(() => p.remove(), 1000);
      }
    });
  }

  // ---- free games -----------------------------------------------------------
  async function runFreeGames(): Promise<number> {
    const banner = $("freeBanner");
    banner.hidden = false;
    let freeTotalWin = 0;

    while (engine.inFree && engine.st.freeLeft > 0) {
      if (signal.aborted) break;
      $("fgLeft").textContent = String(engine.st.freeLeft);
      $("fgMult").textContent = String(engine.st.mult);
      await sleep(420);

      seedNextSpin();           // each free spin is independently chain-seeded
      const res = engine.spin();
      const before = engine.balance - res.totalWin;

      currentBoard = res.initial.board; currentHeights = res.initial.heights;
      renderBoard(true); sndDrop();
      await animateWaysTo(res.initial.ways);
      await sleep(250);

      let runWin = 0;
      for (let i = 0; i < res.cascades.length; i++) {
        const casc = res.cascades[i];
        if (casc.golden) await featureOverlay("GOLDEN TREASURE", "The whole board transforms!", "", 1300);
        await playCascade(casc, i);
        runWin += casc.totalWin;
        // res.totalWin is this free spin's capped credited win — clamp the
        // readout/balance to it so they can't overshoot when the cap binds.
        setWin(Math.min(runWin, res.totalWin));
        await animateBalanceTo(Math.min(before + runWin, engine.balance));
      }
      freeTotalWin += Math.min(runWin, res.totalWin);
      $("fgLeft").textContent = String(res.freeLeft);
      $("fgMult").textContent = String(res.mult);
      if (res.extraFree > 0) showWinPop("+" + res.extraFree + " FREE GAME", false);

      await animateBalanceTo(engine.balance);
      await sleep(300);
      if (res.freeEnded) break;
    }

    banner.hidden = true;
    await featureOverlay("FREE GAME OVER", "Total Free Game Win", "Rs " + fmtMoney(freeTotalWin), 1900, true);
    setWin(freeTotalWin);
    return freeTotalWin;
  }

  // ---- overlays -------------------------------------------------------------
  function featureOverlay(title: string, sub: string, amount: string, holdMs: number, coins?: boolean): Promise<void> {
    const ov = $("overlay"), inner = $("overlayInner");
    inner.innerHTML =
      `<div class="ov-title">${title}</div>` +
      (sub ? `<div class="ov-sub">${sub}</div>` : "") +
      (amount ? `<div class="ov-amount">${amount}</div>` : "") +
      `<div class="ov-tap">TAP TO CONTINUE</div>`;
    ov.hidden = false;
    if (coins) rainCoins(ov);
    if (title.indexOf("WIN") >= 0 || title.indexOf("TREASURE") >= 0) sndBig();
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; ov.removeEventListener("click", finish); ov.hidden = true; ov.querySelectorAll(".ov-coin").forEach((c) => c.remove()); res(); };
      ov.addEventListener("click", finish, { signal });
      const tid = setTimeout(finish, skip ? 350 : holdMs);
      // On unmount: clear the timer and resolve so the awaiting spin never hangs.
      signal.addEventListener("abort", () => { clearTimeout(tid); finish(); }, { once: true });
    });
  }
  function rainCoins(ov: HTMLElement): void {
    for (let i = 0; i < 26; i++) {
      const c = document.createElement("div");
      c.className = "ov-coin";
      c.style.left = Math.random() * 100 + "%";
      c.style.animationDuration = (1.4 + Math.random() * 1.6) + "s";
      c.style.animationDelay = (Math.random() * 0.8) + "s";
      ov.appendChild(c);
    }
  }

  function flashInsufficient(): void {
    showWinPop("INSUFFICIENT BALANCE", false);
    btnSpin.animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 220, iterations: 2 });
  }

  // ---- transaction history --------------------------------------------------
  function recordHistory(type: "spin" | "free", bet: number, win: number, balance: number): void {
    const entry: HistoryEntry = { time: new Date().toLocaleTimeString(), type, bet, win, balance };
    history.unshift(entry);
    if (history.length > 500) history.length = 500;
    saveTransaction(entry);                            // persist to Firebase Realtime Database
    if (!$("historyModal").hidden) renderHistory();   // live-update if the modal is open
  }
  function renderHistory(): void {
    const list = $("historyList");
    if (!history.length) { list.innerHTML = '<div class="history-empty">No spins yet — press SPIN to play.</div>'; return; }
    list.innerHTML = history.map((h) => {
      const win = h.win > 0
        ? `<span class="history-win">+Rs ${fmtMoney(h.win)}</span>`
        : `<span class="history-win zero">Rs 0.00</span>`;
      const bet = h.type === "free" ? '<span class="history-tag">FREE</span>' : "Rs " + fmtInt(h.bet);
      return `<div class="history-row"><span class="history-time">${esc(h.time)}</span><span>${bet}</span><span>${win}</span><span class="history-bal">Rs ${fmtMoney(h.balance)}</span></div>`;
    }).join("");
  }

  // =============================================================================
  // Controls
  // =============================================================================
  function wireControls(): void {
    // start / splash screen — Start (click) or Space/Enter plays the portal
    // transition to reveal the game. dismissStart() ignores input until the game
    // is ready (see markReady) and only fires once.
    $("btnStart").addEventListener("click", dismissStart, { signal });
    const onStartKey = (e: KeyboardEvent) => {
      if ($("startScreen").hidden) return;   // splash already gone
      // The Sound popup is reachable from the splash (music button). If any modal
      // is open over the splash, the keypress belongs to it — don't launch the
      // game transition behind an open popup.
      if (!$("soundModal").hidden || !$("rulesModal").hidden || !$("historyModal").hidden || !$("autoModal").hidden) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        dismissStart();
      }
    };
    document.addEventListener("keydown", onStartKey, { signal });

    // back-to-home button (top-left) — re-show the splash over the game
    $("btnHome").addEventListener("click", goHome, { signal });

    btnSpin.addEventListener("click", handleSpinPress, { signal });

    const onSpaceKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      // splash is up → Space dismisses it (onStartKey), never spins behind it
      if (!$("startScreen").hidden) return;
      // a feature overlay (BIG WIN / FREE GAME / etc.) is a blocking layer —
      // ignore Space so it can't reach doSpin() and flip the skip flag, which
      // would fast-forward the overlay and any free games that follow it.
      if (!$("overlay").hidden) return;
      // don't spin behind an open modal
      if (!$("rulesModal").hidden || !$("autoModal").hidden || !$("historyModal").hidden || !$("soundModal").hidden) return;
      handleSpinPress();
    };
    document.addEventListener("keydown", onSpaceKey, { signal });

    $("betPlus").addEventListener("click", () => { if (spinning) return; engine.changeBet(1); betValEl.textContent = String(engine.bet); beep(520, 0.05, "square", 0.04); }, { signal });
    $("betMinus").addEventListener("click", () => { if (spinning) return; engine.changeBet(-1); betValEl.textContent = String(engine.bet); beep(420, 0.05, "square", 0.04); }, { signal });

    btnTurbo.addEventListener("click", () => {
      turbo = (turbo + 1) % 3;
      btnTurbo.classList.toggle("on", turbo > 0);
      btnTurbo.classList.toggle("super", turbo === 2);
      $("turboHint").textContent = turbo === 0 ? "Press turbo spin" : turbo === 1 ? "Turbo ON" : "Super Turbo ON";
    }, { signal });

    btnAuto.addEventListener("click", () => {
      if (autoRemaining > 0 || autoInfinite) { stopAuto(); return; }
      closeAllModals();
      $("autoModal").hidden = false;
    }, { signal });

    // sound button → open the volume popup (Music + Effects sliders)
    const fmtPct = (v: number): string => Math.round(v * 100) + "%";

    // Only one modal open at a time — close any other popup before opening one so
    // they can never stack (an Esc / backdrop click would otherwise dismiss several
    // at once, and controls behind a popup could open a second over it).
    const closeAllModals = (): void => {
      ["rulesModal", "autoModal", "historyModal", "soundModal"].forEach((id) => { $(id).hidden = true; });
    };

    // Helper that opens the sound modal pre-filled with current volumes — shared
    // by the in-game button and the splash-screen button.
    const openSoundModal = (): void => {
      closeAllModals();
      ($("musicVol") as HTMLInputElement).value = String(Math.round(musicVolume * 100));
      ($("sfxVol") as HTMLInputElement).value = String(Math.round(sfxVolume * 100));
      $("musicVolVal").textContent = fmtPct(musicVolume);
      $("sfxVolVal").textContent = fmtPct(sfxVolume);
      $("soundModal").hidden = false;
    };

    // Keeps the splash speaker icon in sync whenever the music volume changes.
    const splashMusicBtn = document.getElementById("splashBtnMusic");
    const syncSplashMusicIcon = (): void => {
      if (splashMusicBtn) splashMusicBtn.classList.toggle("is-muted", musicVolume <= 0);
    };
    if (splashMusicBtn) {
      splashMusicBtn.addEventListener("click", openSoundModal, { signal });
    }

    $("btnSound").addEventListener("click", openSoundModal, { signal });
    $("musicVol").addEventListener("input", (e) => {
      musicVolume = (+(e.target as HTMLInputElement).value) / 100;
      $("musicVolVal").textContent = fmtPct(musicVolume);
      $("btnSound").classList.toggle("muted", musicVolume === 0);
      if (bgMusic) bgMusic.volume = musicVolume;
      if (musicVolume > 0) startMusic(); else if (bgMusic) bgMusic.pause();
      syncSplashMusicIcon();
    }, { signal });
    let lastSfxBlip = 0;
    $("sfxVol").addEventListener("input", (e) => {
      sfxVolume = (+(e.target as HTMLInputElement).value) / 100;
      $("sfxVolVal").textContent = fmtPct(sfxVolume);
      // sample blip so the level is audible — throttled so dragging the slider
      // doesn't spawn a burst of overlapping oscillators
      const now = performance.now();
      if (now - lastSfxBlip > 120) { lastSfxBlip = now; beep(620, 0.08, "triangle", 0.06); }
    }, { signal });
    $("soundClose").addEventListener("click", () => { $("soundModal").hidden = true; }, { signal });
    $("soundModal").addEventListener("click", (e) => { if (e.target === $("soundModal")) $("soundModal").hidden = true; }, { signal });
    $("btnHistory").addEventListener("click", () => { closeAllModals(); renderHistory(); $("historyModal").hidden = false; }, { signal });
    $("historyClose").addEventListener("click", () => { $("historyModal").hidden = true; }, { signal });
    $("historyModal").addEventListener("click", (e) => { if (e.target === $("historyModal")) $("historyModal").hidden = true; }, { signal });

    // Esc closes whichever modal is open
    const onEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ["historyModal", "rulesModal", "autoModal", "soundModal"].forEach((id) => { if (!$(id).hidden) $(id).hidden = true; });
    };
    document.addEventListener("keydown", onEscKey, { signal });

    // rules modal
    $("btnRules").addEventListener("click", () => { closeAllModals(); $("rulesModal").hidden = false; }, { signal });
    $("rulesClose").addEventListener("click", () => { $("rulesModal").hidden = true; }, { signal });
    $("rulesModal").addEventListener("click", (e) => { if (e.target === $("rulesModal")) $("rulesModal").hidden = true; }, { signal });

    // autospin modal
    $("autoClose").addEventListener("click", () => { $("autoModal").hidden = true; }, { signal });
    $("autoCancel").addEventListener("click", () => { $("autoModal").hidden = true; }, { signal });
    $("autoStart").addEventListener("click", () => {
      $("autoModal").hidden = true;
      // Don't commit to auto-spin if the player can't afford a spin — otherwise
      // the AUTO/SPIN buttons get stuck in the "auto active" state with nothing
      // running (doSpin would bail on the insufficient-balance check).
      if (!engine.canSpin()) { flashInsufficient(); return; }
      if (autoSelected === "inf") { autoInfinite = true; autoRemaining = 0; }
      else { autoInfinite = false; autoRemaining = autoSelected; }
      btnAuto.classList.add("on");
      updateAutoBtn(); refreshSpinBtn();
      if (!spinning) doSpin();
    }, { signal });
  }

  function stopAuto(): void { autoRemaining = 0; autoInfinite = false; btnAuto.classList.remove("on"); updateAutoBtn(); refreshSpinBtn(); }

  // ---- autospin count picker ------------------------------------------------
  function buildAutoGrid(): void {
    const grid = $("autoGrid");
    const opts: Array<number | "∞"> = [10, 25, 50, 100, 250, 500, 1000, "∞"];
    grid.innerHTML = "";
    opts.forEach((o) => {
      const b = document.createElement("button");
      b.textContent = String(o);
      b.addEventListener("click", () => {
        grid.querySelectorAll("button").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
        autoSelected = o === "∞" ? "inf" : o;
        setAutoDisplay();
      }, { signal });
      grid.appendChild(b);
    });
    grid.firstElementChild?.classList.add("sel");
    autoSelected = 10;
    setAutoDisplay();
  }

  // big readout in the auto-spin modal mirrors the chosen count
  function setAutoDisplay(): void {
    const d = $("autoCountDisplay");
    d.textContent = autoSelected === "inf" ? "∞" : String(autoSelected);
  }

  // the AUTO button shows the live remaining count while spinning (click = stop)
  function updateAutoBtn(): void {
    const txt = btnAuto.querySelector(".btn-text");
    if (!txt) return;
    txt.textContent = autoInfinite ? "∞" : autoRemaining > 0 ? String(autoRemaining) : "AUTO";
    btnAuto.title = autoInfinite || autoRemaining > 0 ? "Stop auto spin" : "Auto spin";
  }

  // =============================================================================
  // Rules modal content
  // =============================================================================
  function buildRules(): void {
    const tabsEl = $("rulesTabs"), bodyEl = $("rulesBody");
    const pages = GTRules;
    tabsEl.innerHTML = "";
    pages.forEach((p, i) => {
      const b = document.createElement("button");
      b.textContent = p.tab;
      b.addEventListener("click", () => showRulePage(i), { signal });
      tabsEl.appendChild(b);
    });
    function showRulePage(i: number): void {
      Array.from(tabsEl.children).forEach((c, k) => c.classList.toggle("active", k === i));
      bodyEl.innerHTML = `<h2>${pages[i].title}</h2>` + pages[i].html;
      // hydrate dynamic symbol demos
      const wr = bodyEl.querySelector("#wildSymRow");
      if (wr) { [1, 2, 3].forEach((n) => wr.appendChild(demoCell(S.buildWild(n)))); }
      const fr = bodyEl.querySelector("#frameSymRow");
      if (fr) {
        const d = demoCell(S.get("ZEUS").svgHTML);
        d.appendChild(frameWrap());
        fr.appendChild(d);
      }
      const pg = bodyEl.querySelector("#paytableGrid");
      if (pg) buildPaytable(pg as HTMLElement);
    }
    showRulePage(0);
  }

  function demoCell(svgHTML: string): HTMLDivElement {
    const d = document.createElement("div"); d.className = "demo";
    d.innerHTML = svgHTML; return d;
  }
  function frameWrap(): Element { const w = document.createElement("div"); w.innerHTML = S.buildFrameOverlay(); return w.firstElementChild!; }

  function buildPaytable(grid: HTMLElement): void {
    grid.innerHTML = "";
    S.paytableOrder.forEach((id, idx) => {
      const def = S.get(id);
      const card = document.createElement("div");
      card.className = "pt-card" + (idx === 0 ? " top" : "");
      const pays = [6, 5, 4, 3].map((k) => `<div>${k} &times; <b>${def.pay[k]}</b></div>`).join("");
      card.innerHTML = `<div class="pt-icon">${def.svgHTML}</div><div class="pt-pays">${pays}</div>`;
      grid.appendChild(card);
    });
  }

  // Run the boot sequence now that every declaration above is initialised, then
  // hand back a cleanup that detaches the document-level key listeners.
  init();
  return () => {
    ac.abort();   // detaches every listener registered with `signal`
    // Release the audio context and drop the global debug hooks so a remount
    // (Fast Refresh) doesn't leave stale closures pointing at detached DOM.
    if (actx) { actx.close().catch(() => { /* ignore */ }); actx = null; }
    if (bgMusic) { bgMusic.pause(); bgMusic = null; }
    delete window.GT;
  };
}

export default boot;
