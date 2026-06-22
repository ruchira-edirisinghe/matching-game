"use client";

import { useEffect } from "react";
import { boot } from "@/lib/controller";
import { initAnalytics } from "@/lib/firebase";

/**
 * The whole game is a single imperative controller that mutates the DOM by id.
 * This component renders the original markup once (no React state → it never
 * re-renders), then boots the controller from useEffect after mount. The
 * returned cleanup detaches the document-level key listeners.
 */
export default function Game() {
  useEffect(() => {
    initAnalytics();            // browser-only Firebase Analytics (fire-and-forget)
    const cleanup = boot();
    return cleanup;
  }, []);

  return (
    <>
      <div id="filter-defs" />

      <div id="stage">
        {/* ===================== GAME SCREEN ===================== */}
        <div id="game" className="screen">

          {/* futuristic background layer */}
          <div className="bg-grid" />
          <div className="rune-ring" id="runeRing" />

          {/* top bar */}
          <header className="topbar">
            <div className="logo">
              <img src="/assets/logo.png" alt="Aether Dynasty" draggable={false} />
            </div>
            <button className="icon-btn info-btn" id="btnRules" title="How to play" aria-label="How to play">
              <span className="info-ico" />
              <span className="info-txt">How to Play</span>
            </button>
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
    </>
  );
}
