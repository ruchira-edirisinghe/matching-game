/* =============================================================================
   Aether Dynasty — UI controller (render + animation + controls)
   ---------------------------------------------------------------------------
   Ported from the original `main.js` IIFE. Instead of booting on
   `DOMContentLoaded`, the work is exposed as `boot()`, which a client React
   component calls from `useEffect` once the markup is mounted. `boot()` returns
   a cleanup function that detaches the document-level key listeners (so Fast
   Refresh / unmount don't stack duplicate handlers).
   ============================================================================= */

import { GTSymbols } from "@/lib/symbols";
import { GTEngine } from "@/lib/engine";
import { GTRules } from "@/lib/rules";
import { fetchBlockchainSeed, deriveSpinSeed, type BlockchainSeedResult } from "@/lib/blockchainRng";
import { loadTransactions, saveTransaction } from "@/lib/transactions";
import type { Board, Cascade, Cell, Engine, Heights, SymbolId } from "@/lib/types";

declare global {
  interface Window {
    GT?: {
      engine: Engine;
      doSpin: () => void;
      render: (animateDrop?: boolean, breakFill?: boolean) => void;
      state: () => { b: Board; h: Heights };
      seedInfo: () => BlockchainSeedResult | null;
    };
    __showRulePage?: (i: number) => void;
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

  const engine = GTEngine.create({ balance: 50000, bet: 3 });

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

  // =============================================================================
  // Boot (runs once the React markup is mounted)
  // =============================================================================
  function init(): void {
    $("filter-defs").innerHTML = S.FILTER_DEFS;

    // Warm the cascade break-frame GIF so it's cached before the first break
    // animation (replaces the <link rel=preload> the browser flagged as unused).
    if (typeof Image !== "undefined") { new Image().src = "/assets/cell-break.gif"; }

    // Videos: force-mute (React doesn't reliably reflect the `muted` attribute)
    // so autoplay is allowed. The in-game background loops immediately; the splash
    // runs its intro→loop sequence (setupSplashBg); the transition is preloaded only.
    document.querySelectorAll<HTMLVideoElement>("video.start-bg, video.screen-bg, #transitionVid")
      .forEach((v) => { v.muted = true; });
    document.querySelectorAll<HTMLVideoElement>("video.screen-bg")
      .forEach((v) => { v.play().catch(() => { /* autoplay may defer; harmless */ }); });
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

    // headless / debug hooks
    window.GT = { engine, doSpin, render: renderBoard, state: () => ({ b: currentBoard, h: currentHeights }), seedInfo: () => seedAudit };

    // Provably-fair seeding: fetch the first blockchain seed and clear the
    // splash's "Loading…" state once it lands — or after a short cap, so a slow
    // or failed fetch never strands the player on the splash. (This is the
    // initial equivalent of refreshSeed(true); later spins use the throttled
    // background refresh in seedNextSpin.) The first board is already on screen.
    const readyCap = setTimeout(markReady, 1600);
    const revealStart = () => { if (signal.aborted) return; clearTimeout(readyCap); markReady(); };
    seedFetching = true; lastSeedFetch = Date.now();
    fetchBlockchainSeed(signal)
      .then((r) => { if (!signal.aborted) seedAudit = r; })
      .catch(() => { /* per-spin fallback covers a missing seed */ })
      .finally(() => { seedFetching = false; revealStart(); });

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
    // Deep links that auto-launch a flow shouldn't sit behind the splash screen.
    if (/[?&](autospin|free|rules)/.test(location.search)) $("startScreen").hidden = true;
    if (/[?&]autospin/.test(location.search)) {
      autoInfinite = true; btnAuto.classList.add("on"); updateAutoBtn(); refreshSpinBtn();
      setTimeout(doSpin, 200);
    }
    if (/[?&]rules/.test(location.search)) {
      $("rulesModal").hidden = false;
      const m = location.search.match(/rules=(\d)/); if (m) window.__showRulePage?.(+m[1]);
    }
    if (/[?&]free/.test(location.search)) {
      engine.st.inFree = true; engine.st.freeLeft = 6; engine.st.freeTotal = 6; engine.st.mult = 2;
      engine.st.goldenTreasureUsed = false;
      setTimeout(() => { setSpinning(true); runFreeGames().then(() => setSpinning(false)); }, 250);
    }
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
    if (sfxVolume <= 0) return;
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
  const sndBig = (): void => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, "triangle", 0.07), i * 90)); };

  // Background music: looping mp3 at the current music volume (default 35%, set
  // in the Sound popup). Browsers block audio autoplay until a user gesture, so
  // init() also kicks this off on the first interaction with the start screen.
  function startMusic(): void {
    if (!bgMusic || musicVolume <= 0) return;
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

  // A quick flash that masks a hard cut. `atPeak` runs while the screen is fully
  // covered (the flash's bright peak), so the scene swap underneath is unseen.
  function flash(atPeak?: () => void): void {
    const fl = document.getElementById("flash");
    if (!fl) { atPeak?.(); return; }
    fl.classList.remove("go");
    void fl.offsetWidth;                  // restart the animation if it's mid-flight
    fl.classList.add("go");
    if (atPeak) setTimeout(atPeak, 250);  // during the held peak (≈25% of the 1s flash)
    setTimeout(() => fl.classList.remove("go"), 1050);
  }

  // Swap the START button out of its "Loading…" state once the game is ready.
  function markReady(): void {
    if (gameReady) return;
    gameReady = true;
    const btn = document.getElementById("btnStart") as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = false;
    btn.setAttribute("aria-busy", "false");
    btn.classList.remove("loading");
    const t = btn.querySelector(".start-btn-txt");
    if (t) t.textContent = "START GAME";
  }

  // Reveal the game on Start. Ignored until the game is ready, and fires exactly
  // once (Start click, Space, and Enter all funnel through here). The sequence:
  // a YELLOW flash bursts → under its peak the transition video starts and plays
  // IN FULL → a second flash → the game (race) screen. The flash is the visible
  // first beat; the swap underneath it is unseen.
  function dismissStart(): void {
    if (!gameReady || splashGone) return;
    splashGone = true;
    beep(660, 0.12, "triangle", 0.05);   // confirm blip; also primes the AudioContext on this gesture

    const ss = document.getElementById("startScreen");
    const tr = document.getElementById("transition");
    const vid = document.getElementById("transitionVid") as HTMLVideoElement | null;
    const game = document.getElementById("game");

    // Fallback: if the transition layer isn't present, just hide the splash.
    if (!tr || !vid || !game) { if (ss) ss.hidden = true; return; }

    let finished = false;
    // FLASH 2 — when the clip ends (or the safety net fires), a flash bursts and
    // under its peak the transition cuts to the game (race) screen. Detaches its
    // own listener so the Home → Start round-trip re-arms without stacking.
    const finish = (): void => {
      if (finished) return;
      finished = true;
      vid.removeEventListener("ended", finish);
      flash(() => {
        tr.hidden = true;                // cut under the flash peak → reveals the game
        try { vid.pause(); vid.currentTime = 0; } catch { /* ignore */ }
      });
    };
    vid.addEventListener("ended", finish, { signal });

    // FLASH 1 — show the yellow flash first; under its peak, start the transition
    // video (splash hidden, transition shown and played from frame 0).
    flash(() => {
      if (ss) ss.hidden = true;
      tr.hidden = false;
      vid.muted = true;
      try { vid.currentTime = 0; } catch { /* metadata may not be ready; harmless */ }
      const p = vid.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* blocked → safety net covers it */ });
    });

    // safety net: if 'ended' never fires (decode stall / blocked play), force-finish
    const durMs = (vid.duration && isFinite(vid.duration) ? vid.duration : 8.5) * 1000 + 1800;
    setTimeout(finish, durMs);
  }

  // Back-to-home button: bring the splash back over the running game and re-arm
  // START. The game keeps its state underneath; pressing START plays the portal
  // transition again and reveals it.
  function goHome(): void {
    const ss = document.getElementById("startScreen");
    if (!ss) return;
    stopAuto();                           // don't leave auto-spin running behind the splash
    const tr = document.getElementById("transition");
    if (tr) tr.hidden = true;
    ss.classList.remove("hide");
    ss.hidden = false;
    splashGone = false;                   // re-arm START (click / Space / Enter)
    // resume whichever splash clip is currently shown — the startscreen2 loop if
    // the intro already finished, otherwise the intro itself
    const intro = document.getElementById("startBg1") as HTMLVideoElement | null;
    const loop = document.getElementById("startBg2") as HTMLVideoElement | null;
    if (loop && loop.classList.contains("show")) { loop.muted = true; loop.play().catch(() => { /* defer */ }); }
    else if (intro) { intro.muted = true; intro.play().catch(() => { /* defer */ }); }
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

    seedNextSpin();              // re-seed the engine from the blockchain seed
    const result = engine.spin();

    // deduct bet visually (base game only)
    if (!result.freeMode) setBalanceInstant(prevBal - engine.bet);

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
    recordHistory("spin", engine.bet, runWin, engine.balance);

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
      if ((autoRemaining > 0 || autoInfinite) && engine.canSpin()) {
        await sleep(450);
        if (autoRemaining > 0 || autoInfinite) doSpin();   // user may have stopped during the gap
      } else { stopAuto(); }
    }
  }

  async function playCascade(casc: Cascade, index: number): Promise<void> {
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
      ov.addEventListener("click", finish);
      setTimeout(finish, skip ? 350 : holdMs);
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
      $("autoModal").hidden = false;
    }, { signal });

    // sound button → open the volume popup (Music + Effects sliders)
    const fmtPct = (v: number): string => Math.round(v * 100) + "%";
    $("btnSound").addEventListener("click", () => {
      ($("musicVol") as HTMLInputElement).value = String(Math.round(musicVolume * 100));
      ($("sfxVol") as HTMLInputElement).value = String(Math.round(sfxVolume * 100));
      $("musicVolVal").textContent = fmtPct(musicVolume);
      $("sfxVolVal").textContent = fmtPct(sfxVolume);
      $("soundModal").hidden = false;
    }, { signal });
    $("musicVol").addEventListener("input", (e) => {
      musicVolume = (+(e.target as HTMLInputElement).value) / 100;
      $("musicVolVal").textContent = fmtPct(musicVolume);
      $("btnSound").classList.toggle("muted", musicVolume === 0);
      if (bgMusic) bgMusic.volume = musicVolume;
      if (musicVolume > 0) startMusic(); else if (bgMusic) bgMusic.pause();
    }, { signal });
    $("sfxVol").addEventListener("input", (e) => {
      sfxVolume = (+(e.target as HTMLInputElement).value) / 100;
      $("sfxVolVal").textContent = fmtPct(sfxVolume);
      beep(620, 0.08, "triangle", 0.06);   // sample blip so the level is audible
    }, { signal });
    $("soundClose").addEventListener("click", () => { $("soundModal").hidden = true; }, { signal });
    $("soundModal").addEventListener("click", (e) => { if (e.target === $("soundModal")) $("soundModal").hidden = true; }, { signal });
    $("btnHistory").addEventListener("click", () => { renderHistory(); $("historyModal").hidden = false; }, { signal });
    $("historyClose").addEventListener("click", () => { $("historyModal").hidden = true; }, { signal });
    $("historyModal").addEventListener("click", (e) => { if (e.target === $("historyModal")) $("historyModal").hidden = true; }, { signal });

    // Esc closes whichever modal is open
    const onEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ["historyModal", "rulesModal", "autoModal", "soundModal"].forEach((id) => { if (!$(id).hidden) $(id).hidden = true; });
    };
    document.addEventListener("keydown", onEscKey, { signal });

    // rules modal
    $("btnRules").addEventListener("click", () => { $("rulesModal").hidden = false; }, { signal });
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
      });
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
      b.addEventListener("click", () => showRulePage(i));
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
    window.__showRulePage = showRulePage;
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
    delete window.__showRulePage;
  };
}

export default boot;
