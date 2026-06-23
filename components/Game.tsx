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
      {/* looping background music (started on first user gesture, 50% volume) */}
      <audio id="bgMusic" src="/assets/Music.mp3" loop preload="auto" aria-hidden="true" />

      <div id="filter-defs" />

      <div id="stage">
        {/* ===================== GAME SCREEN ===================== */}
        <div id="game" className="screen">

          {/* hardware-decoded background (was background.gif) */}
          <video className="screen-bg" src="/assets/background.mp4" autoPlay muted loop playsInline aria-hidden="true" />

          {/* futuristic background layer */}
          <div className="bg-grid" />
          <div className="rune-ring" id="runeRing" />

          {/* top bar */}
          <header className="topbar">
            <div className="logo">
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
              <span className="ways-num" id="waysNum">4,096</span>
              <span className="ways-label">WAYS</span>
            </div>
            <div className="win-pop" id="winPop" />
          </main>

          {/* bottom HUD */}
          <footer className="hud">
            <div className="meter balance">
              <div className="meter-top"><span className="lvl">LV.0</span> Balance</div>
              <div className="meter-val">Rs <span id="balVal">50,000.00</span></div>
            </div>

            <div className="bet-block">
              <button className="round-btn small" id="betMinus" aria-label="Decrease bet">&minus;</button>
              <div className="bet-info">
                <div className="bet-label">Bet</div>
                <div className="bet-val">Rs <span id="betVal">3</span></div>
              </div>
              <button className="round-btn small" id="betPlus" aria-label="Increase bet">+</button>
            </div>

            <div className="meter win">
              <div className="meter-top">WIN</div>
              <div className="meter-val win-amount">Rs <span id="winVal">0.00</span></div>
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
              <button className="icon-btn" id="btnSound" title="Sound on/off" aria-label="Sound">&#128266;</button>
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

      {/* ===================== FEATURE OVERLAY ===================== */}
      <div className="overlay" id="overlay" hidden>
        <div className="overlay-inner" id="overlayInner" />
      </div>

      {/* ===================== START / SPLASH SCREEN ===================== */}
      <div className="start-screen" id="startScreen">
        {/* the intro plays once, then crossfades to the looping startscreen2 */}
        <video className="start-bg show" id="startBg1" src="/assets/start_screen.mp4" muted playsInline preload="auto" aria-hidden="true" />
        <video className="start-bg" id="startBg2" src="/assets/startscreen2.mp4" muted loop playsInline preload="auto" aria-hidden="true" />
        <div className="start-inner">
          <img className="start-logo" src="/assets/logo.png" alt="Aether Dynasty" draggable={false} />
          <button className="start-btn loading" id="btnStart" type="button" disabled aria-busy="true">
            <span className="start-btn-txt">Loading&hellip;</span>
          </button>
        </div>
      </div>

      {/* ============ START → GAME TRANSITION (portal sting) ============ */}
      <div className="transition-fx" id="transition" hidden>
        <video className="transition-vid" id="transitionVid" src="/assets/transition.mp4"
          muted playsInline preload="auto" aria-hidden="true" />
      </div>

      {/* white flash that masks each hard cut (splash→transition, transition→game) */}
      <div className="flash" id="flash" aria-hidden="true" />
    </>
  );
}
