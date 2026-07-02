"use client";

import { useEffect } from "react";
import { boot } from "@/lib/controller";

/**
 * The whole game is a single imperative controller that mutates the DOM by id.
 * This component renders the original markup once (no React state → it never
 * re-renders), then boots the controller from useEffect after mount. The
 * returned cleanup detaches the document-level key listeners.
 */
export default function Game() {
  useEffect(() => {
    const cleanup = boot();
    return cleanup;
  }, []);

  return (
    <>
      {/* looping background music (35% by default; starts on first interaction) */}
      <audio id="bgMusic" src="/assets/Music.mp3" loop autoPlay preload="auto" aria-hidden="true" />

      <div id="filter-defs" />

      <div id="stage">
        {/* ===================== GAME SCREEN ===================== */}
        <div id="game" className="screen">

          {/* hardware-decoded background (was background.gif). NOT autoPlay: the
              controller starts it only when the game screen is shown, so it never
              decodes behind the splash (one background video at a time = less
              mobile-webview jank). */}
          <video className="screen-bg" src="/assets/background.mp4" muted loop playsInline preload="auto" aria-hidden="true" />

          {/* futuristic background layer */}
          <div className="bg-grid" />
          <div className="rune-ring" id="runeRing" />

          {/* top bar */}
          <header className="topbar">
            <div className="logo">
              {/* CSS-clamp-sized decorative logo — next/image's intrinsic sizing doesn't fit */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo.png" alt="Aether Dynasty" draggable={false} />
            </div>
            <div className="topbar-left">
              <button className="icon-btn back-btn" id="btnHome" title="Back to home" aria-label="Back to home screen">
                <svg className="back-ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="back-txt">Home</span>
              </button>
              {/* Player profile chip — avatar + name (populated imperatively by the
                  controller via #playerAvatar / #playerName so React never re-renders
                  over it; mirrors how the HUD readouts are managed). The name hides
                  on narrow phones (avatar-only) so it never crowds the centre logo. */}
              <div className="player-chip">
                <div className="pc-avatar" id="playerAvatar" aria-hidden="true" />
                <div className="pc-name" id="playerName" />
              </div>
            </div>
            <div className="topbar-right">
              <button className="icon-btn info-btn" id="btnRules" title="How to play" aria-label="How to play">
                <span className="info-ico" />
                <span className="info-txt">How to Play</span>
              </button>
            </div>
          </header>

          {/* free game banner */}
          <div className="free-banner" id="freeBanner" hidden>
            <span className="fg-label">FREE GAME</span>
            <span className="fg-count"><b id="fgLeft">0</b> LEFT</span>
            <span className="fg-mult">x<b id="fgMult">1</b></span>
          </div>

          {/* reels */}
          <main className="board-wrap">
            <div className="board-frame">
              <div className="board" id="board" />
              <div className="cascade-fx" id="cascadeFx" />
            </div>
            <div className="ways-bar">
              <span className="ways-num" id="waysNum" />
              <span className="ways-label">WAYS</span>
            </div>
            <div className="win-pop" id="winPop" />
          </main>

          {/* bottom HUD */}
          <footer className="hud">
            <div className="meter balance">
              <div className="meter-top"><span className="lvl">LV.0</span> Balance</div>
              <div className="meter-val">Rs <span id="balVal" /></div>
            </div>

            <div className="bet-block">
              <button className="round-btn small" id="betMinus" aria-label="Decrease bet">&minus;</button>
              <div className="bet-info">
                <div className="bet-label">Bet</div>
                <div className="bet-val">Rs <span id="betVal" /></div>
              </div>
              <button className="round-btn small" id="betPlus" aria-label="Increase bet">+</button>
            </div>

            <div className="meter win">
              <div className="meter-top">WIN</div>
              <div className="meter-val win-amount">Rs <span id="winVal" /></div>
            </div>

            <div className="controls">
              <button className="round-btn turbo" id="btnTurbo" title="Turbo spin" aria-label="Turbo spin"><span className="btn-text">TURBO</span></button>
              <button className="round-btn auto" id="btnAuto" title="Auto spin" aria-label="Auto spin"><span className="btn-text">AUTO</span></button>
              <button className="round-btn spin" id="btnSpin" title="Spin" aria-label="Spin">
                <span className="spin-frame" />
                <span className="spin-center">
                  <span className="spin-stop">STOP</span>
                </span>
              </button>
            </div>

            <div className="util">
              <button className="icon-btn" id="btnSound" title="Sound settings" aria-label="Sound settings">&#128266;</button>
              <button className="icon-btn" id="btnHistory" title="History" aria-label="History">&#128220;</button>
            </div>
          </footer>

          <div className="turbo-hint" id="turboHint">Press turbo spin</div>
        </div>
      </div>

      {/* ===================== RULES MODAL ===================== */}
      <div className="modal" id="rulesModal" hidden>
        <div className="modal-card">
          <button className="modal-close" id="rulesClose" aria-label="Close">&times;</button>
          <div className="rules-tabs" id="rulesTabs" />
          <div className="rules-body" id="rulesBody" />
        </div>
      </div>

      {/* ===================== AUTOSPIN MODAL ===================== */}
      <div className="modal" id="autoModal" hidden>
        <div className="modal-card small-card">
          <button className="modal-close" id="autoClose" aria-label="Close">&times;</button>
          <h2 className="modal-title">Auto Spin</h2>
          <p className="modal-sub">Choose how many spins to play automatically</p>
          <div className="auto-readout">
            <span className="auto-readout-num" id="autoCountDisplay">10</span>
            <span className="auto-readout-lbl">spins</span>
          </div>
          <div className="auto-grid" id="autoGrid" />
          <div className="auto-actions">
            <button className="wide-btn ghost" id="autoCancel">Cancel</button>
            <button className="wide-btn gold" id="autoStart">Start</button>
          </div>
        </div>
      </div>

      {/* ===================== HISTORY MODAL ===================== */}
      <div className="modal" id="historyModal" hidden>
        <div className="modal-card">
          <button className="modal-close" id="historyClose" aria-label="Close">&times;</button>
          <h2 className="modal-title">Transaction<br className="hist-break" /> History</h2>
          <div className="history-head">
            <span>Time</span><span>Bet</span><span>Win</span><span>Balance</span>
          </div>
          <div className="history-list" id="historyList" />
        </div>
      </div>

      {/* ===================== SOUND SETTINGS MODAL ===================== */}
      <div className="modal" id="soundModal" hidden>
        <div className="modal-card small-card">
          <button className="modal-close" id="soundClose" aria-label="Close">&times;</button>
          <h2 className="modal-title">Sound</h2>
          <div className="sound-settings">
            <div className="sound-row">
              <span className="sound-label">Music</span>
              <input className="sound-slider" type="range" id="musicVol" min="0" max="100" step="1" defaultValue={35} aria-label="Music volume" />
              <span className="sound-val" id="musicVolVal">35%</span>
            </div>
            <div className="sound-row">
              <span className="sound-label">Effects</span>
              <input className="sound-slider" type="range" id="sfxVol" min="0" max="100" step="1" defaultValue={100} aria-label="Game effects volume" />
              <span className="sound-val" id="sfxVolVal">100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== FEATURE OVERLAY ===================== */}
      <div className="overlay" id="overlay" hidden>
        <div className="overlay-inner" id="overlayInner" />
      </div>

      {/* ===================== START / SPLASH SCREEN ===================== */}
      <div className="start-screen" id="startScreen">
        {/* the intro plays once, then swaps instantly to the looping startscreen2 */}
        <video className="start-bg show" id="startBg1" src="/assets/start_screen.mp4" muted playsInline preload="auto" aria-hidden="true" />
        <video className="start-bg" id="startBg2" src="/assets/startscreen2.mp4" muted loop playsInline preload="auto" aria-hidden="true" />

        <div className="start-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="start-logo" src="/assets/logo.png" alt="Aether Dynasty" draggable={false} />
          {/* The asset preload + progress now lives on the boot loading screen
              (#adLoading below). START is revealed by the controller once the
              loading screen has finished and this home screen is being revealed. */}
          <button className="start-btn" id="btnStart" type="button" hidden>
            <span className="start-btn-txt">START GAME</span>
          </button>
        </div>
      </div>

      {/* ====== START → GAME TRANSITION (fades in over splash, out to game) ====== */}
      <div className="transition-fx" id="transition" hidden>
        <video className="transition-vid" id="transitionVid" src="/assets/transition.mp4"
          muted playsInline preload="auto" aria-hidden="true" />
      </div>

      {/* ── Home-screen nav bar — back · music toggle · player chip ──
          Rendered at the TOP LEVEL (not inside #startScreen) and stacked above
          both the splash and the portal transition (z 120), so it stays visible
          on the home screen AND through the start→game transition. The controller
          hides #splashTopbar once the game is revealed and re-shows it on Home. */}
      <div className="splash-topbar" id="splashTopbar">
        {/* LEFT: spacer (standalone build has no host to exit to — the in-game
            Home button returns to this splash; there's no platform back button) */}
        <div />

        {/* RIGHT: music toggle + player chip */}
        <div className="splash-topbar-right">
          <button className="splash-music-btn" id="splashBtnMusic" aria-label="Toggle music">
            {/* speaker-on icon (default visible) */}
            <svg className="ico-sound-on" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <path d="M19.07 4.93a10 10 0 010 14.14"/>
              <path d="M15.54 8.46a5 5 0 010 7.07"/>
            </svg>
            {/* speaker-off icon (shown when muted) */}
            <svg className="ico-sound-off" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          </button>
          <div className="splash-player-chip">
            <div className="splash-pc-avatar" id="splashPlayerAvatar" aria-hidden="true" />
            <div className="splash-pc-name" id="splashPlayerName">Player</div>
          </div>
        </div>
      </div>

      {/* ===================== BOOT LOADING SCREEN =====================
          Full-bleed "summoning the pantheon" sequence shown over everything on
          first mount while the game assets preload. The controller (runLoadingScreen)
          cycles the status text, drives #adLoadFill / #adLoadPct from real preload
          progress, holds for up to 8s, then fade-zooms this away to reveal the
          home screen. Styled to the game's gold + neon-cyan + plasma palette. */}
      <div className="ad-loading" id="adLoading" role="progressbar"
        aria-label="Loading Aether Dynasty" aria-valuemin={0} aria-valuemax={100}>
        {/* animated aether backdrop: neon grid + nebula + rising gold motes */}
        <div className="adl-bg" aria-hidden="true">
          <div className="adl-nebula" />
          <div className="adl-grid" />
          <div className="adl-motes">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className="adl-mote"
                style={{
                  left: `${(i * 8.3 + 4) % 100}%`,
                  width: `${3 + (i % 3)}px`,
                  height: `${3 + (i % 3)}px`,
                  animationDuration: `${6 + (i % 5) * 1.4}s`,
                  animationDelay: `${(i % 6) * 0.9}s`,
                }}
              />
            ))}
          </div>
          <div className="adl-vignette" />
        </div>

        <div className="adl-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="adl-logo" src="/assets/logo.png" alt="Aether Dynasty" draggable={false} />

          {/* spinning rune loader with a glowing aether core */}
          <div className="adl-ring" aria-hidden="true">
            <svg className="r-1" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="96" stroke="#43e8ff" strokeWidth="1" strokeDasharray="2 12" opacity="0.55" />
            </svg>
            <svg className="r-2" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="84" stroke="#f4c64a" strokeWidth="2.5" strokeDasharray="64 46" strokeLinecap="round" opacity="0.92" />
            </svg>
            <svg className="r-3" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="70" stroke="#a64bff" strokeWidth="1.5" strokeDasharray="4 18" opacity="0.75" />
            </svg>
            <div className="adl-core" />
          </div>

          <div className="adl-status" id="adLoadStatus">AWAKENING THE AETHER&hellip;</div>

          <div className="adl-bar-wrap">
            <div className="adl-bar"><div className="adl-fill" id="adLoadFill" /></div>
            <div className="adl-bar-info">
              <span>&#47;&#47; AETHER</span>
              <span className="adl-pct" id="adLoadPct">0%</span>
              <span>SYNC &#47;&#47;</span>
            </div>
          </div>

          <div className="adl-grid-info" aria-hidden="true">
            <div className="cell"><div className="k">Realm</div><div className="v">Olympus</div></div>
            <div className="cell"><div className="k">Ways</div><div className="v">46,656</div></div>
            <div className="cell"><div className="k">RNG</div><div className="v">Chain</div></div>
            <div className="cell"><div className="k">Link</div><div className="v">Stable</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
