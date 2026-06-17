/* =============================================================================
   Golden Temple — UI controller (render + animation + controls)
   ============================================================================= */
(function () {
  'use strict';

  const S = window.GTSymbols;
  const COLS = window.GTEngine.COLS;     // 6
  const ROWS = window.GTEngine.MAX_ROWS; // 6

  const engine = window.GTEngine.create({ balance: 50000, bet: 3 });

  // ---- DOM refs --------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  let boardEl, cells = [], cascadeFx;
  let balValEl, betValEl, winValEl, waysNumEl, winPopEl;
  let btnSpin, btnAuto, btnTurbo;

  // ---- runtime state ---------------------------------------------------------
  let currentBoard = null, currentHeights = null;
  let spinning = false, skip = false;
  let turbo = 0;                 // 0 = off, 1 = turbo, 2 = super turbo
  let soundOn = true;
  let autoRemaining = 0, autoInfinite = false;
  let shownBalance = engine.balance, balanceTarget = engine.balance;
  let winThisSpin = 0;

  const speed = () => (skip ? 0.001 : (turbo === 2 ? 0.28 : turbo === 1 ? 0.5 : 1));
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms * speed())));

  // ---- formatting ------------------------------------------------------------
  const fmtMoney = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

  // =============================================================================
  // Boot
  // =============================================================================
  document.addEventListener('DOMContentLoaded', () => {
    $('filter-defs').innerHTML = S.FILTER_DEFS;

    // decorative art
    $('pillarL').innerHTML = '<img src="assets/pole.png" alt="" draggable="false" />';
    $('pillarR').innerHTML = '<img src="assets/pole.png" alt="" draggable="false" />';
    $('character').innerHTML = '<img src="assets/ezgif.gif" alt="Historian" draggable="false" />';
    $('runeRing').innerHTML = S.art.techRune();

    boardEl = $('board'); cascadeFx = $('cascadeFx');
    balValEl = $('balVal'); betValEl = $('betVal'); winValEl = $('winVal');
    waysNumEl = $('waysNum'); winPopEl = $('winPop');
    btnSpin = $('btnSpin'); btnAuto = $('btnAuto'); btnTurbo = $('btnTurbo');

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
    betValEl.textContent = engine.bet;
    winValEl.textContent = '0.00';

    // headless / debug hooks
    window.GT = { engine, doSpin, render: renderBoard, state: () => ({ b: currentBoard, h: currentHeights }) };
    if (/[?&]autospin/.test(location.search)) {
      autoInfinite = true; btnAuto.classList.add('on');
      setTimeout(doSpin, 200);
    }
    if (/[?&]rules/.test(location.search)) {
      $('rulesModal').hidden = false;
      const m = location.search.match(/rules=(\d)/); if (m) window.__showRulePage(+m[1]);
    }
    if (/[?&]free/.test(location.search)) {
      engine.st.inFree = true; engine.st.freeLeft = 6; engine.st.freeTotal = 6; engine.st.mult = 2;
      engine.st.goldenTreasureUsed = false;
      setTimeout(() => runFreeGames(engine.balance), 250);
    }
  });

  // =============================================================================
  // Board rendering
  // =============================================================================
  function buildBoardDOM() {
    boardEl.innerHTML = '';
    cells = [];
    for (let c = 0; c < COLS; c++) {
      const reel = document.createElement('div');
      reel.className = 'reel';
      const colCells = [];
      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        reel.appendChild(cell);
        colCells.push(cell);
      }
      cells.push(colCells);
      boardEl.appendChild(reel);
    }
  }

  function renderCell(el, cell, animateDrop, dropDelay) {
    el.className = 'cell';
    el.innerHTML = '';
    if (!cell) { el.classList.add('locked'); return; }
    const sym = document.createElement('div');
    sym.className = 'sym';
    sym.innerHTML = cell.wild ? S.buildWild(cell.wildN) : S.get(cell.id).svgHTML;
    el.appendChild(sym);
    if (cell.frame) {
      const f = document.createElement('div');
      f.innerHTML = S.buildFrameOverlay();
      el.appendChild(f.firstElementChild);
    }
    if (animateDrop && cell.fresh) {
      el.classList.add('drop');
      sym.style.animationDelay = (dropDelay || 0) + 's';
    }
  }

  function renderBoard(animateDrop) {
    for (let c = 0; c < COLS; c++) {
      const h = currentHeights[c];
      for (let r = 0; r < ROWS; r++) {
        const cell = r < h ? currentBoard[c][r] : null;
        renderCell(cells[c][r], cell, animateDrop, r * 0.035 + c * 0.02);
      }
    }
  }

  // =============================================================================
  // HUD helpers (animated counters)
  // =============================================================================
  function animateNumber(setter, from, to, dur) {
    const t0 = performance.now();
    const d = Math.max(60, dur * (skip ? 0.05 : 1));
    return new Promise((res) => {
      function tick(t) {
        const k = Math.min(1, (t - t0) / d);
        const e = 1 - Math.pow(1 - k, 3);
        setter(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick); else { setter(to); res(); }
      }
      requestAnimationFrame(tick);
    });
  }

  const setBalanceInstant = (n) => { shownBalance = balanceTarget = n; balValEl.textContent = fmtMoney(n); };
  function animateBalanceTo(n) {
    balanceTarget = n;
    return animateNumber((v) => { shownBalance = v; balValEl.textContent = fmtMoney(v); }, shownBalance, n, 500);
  }
  const setWaysInstant = (n) => { waysNumEl.textContent = fmtInt(n); };
  function animateWaysTo(n) { const from = parseInt(waysNumEl.textContent.replace(/,/g, ''), 10) || 0; return animateNumber((v) => { waysNumEl.textContent = fmtInt(v); }, from, n, 400); }
  function setWin(n) { winThisSpin = n; winValEl.textContent = fmtMoney(n); }

  function showWinPop(text, big) {
    winPopEl.textContent = text;
    winPopEl.style.fontSize = big ? 'clamp(28px,7vw,58px)' : 'clamp(20px,4vw,34px)';
    winPopEl.classList.remove('show'); void winPopEl.offsetWidth; winPopEl.classList.add('show');
  }

  // =============================================================================
  // Sound (tiny WebAudio blips, fully optional)
  // =============================================================================
  let actx = null;
  function beep(freq, dur, type, vol) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.value = (vol || 0.05);
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* ignore */ }
  }
  const sndSpin = () => beep(180, 0.18, 'sawtooth', 0.04);
  const sndWin = (i) => beep(440 + Math.min(i, 8) * 70, 0.16, 'triangle', 0.06);
  const sndDrop = () => beep(120, 0.08, 'square', 0.03);
  const sndBig = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.07), i * 90)); };

  // =============================================================================
  // Spin flow
  // =============================================================================
  function setSpinning(on) {
    spinning = on;
    btnSpin.classList.toggle('spinning', on);
    btnSpin.querySelector('.spin-text').textContent = on ? 'STOP' : 'SPIN';
    [$('betMinus'), $('betPlus')].forEach((b) => b.disabled = on);
  }

  async function preSpin() {
    // quick shuffle illusion on the active cells
    const frames = turbo === 2 ? 2 : turbo === 1 ? 3 : 5;
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < currentHeights[c]; r++) {
          const sym = cells[c][r].querySelector('.sym');
          if (sym) sym.innerHTML = S.get(S.order[(Math.random() * S.order.length) | 0]).svgHTML;
        }
      }
      sndSpin();
      await sleep(55);
    }
  }

  async function doSpin() {
    if (spinning) { skip = true; return; }
    if (!engine.inFree && !engine.canSpin()) { flashInsufficient(); return; }

    skip = false;
    setSpinning(true);
    setWin(0);
    const prevBal = engine.balance;

    await preSpin();

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
      setWin(runWin);
      await animateBalanceTo((result.freeMode ? prevBal : prevBal - engine.bet) + runWin);
    }

    setSpinning(false);

    // reconcile balance exactly with the engine
    await animateBalanceTo(engine.balance);

    // feature transitions
    if (result.triggeredFree) {
      await featureOverlay('FREE GAME', 'You reached 46,656 WAYS!', '6 Free Games', 1600);
      await runFreeGames(prevBal - engine.bet + runWin);
    } else if (runWin >= engine.bet * 20) {
      sndBig();
      await featureOverlay(runWin >= engine.bet * 60 ? 'MEGA WIN' : 'BIG WIN', '', 'Rs ' + fmtMoney(runWin), 1700, true);
    }

    // autospin continuation
    if (autoRemaining > 0 || autoInfinite) {
      if (!autoInfinite) autoRemaining--;
      $('btnAuto').classList.toggle('on', autoRemaining > 0 || autoInfinite);
      if ((autoRemaining > 0 || autoInfinite) && engine.canSpin()) {
        await sleep(450);
        doSpin();
      } else { stopAuto(); }
    }
  }

  async function playCascade(casc, index) {
    // 1) highlight winning cells
    casc.winCells.forEach(([c, r]) => { if (cells[c] && cells[c][r]) cells[c][r].classList.add('win'); });
    if (casc.golden) showWinPop('GOLDEN TREASURE!', true);
    else showWinPop('Rs ' + fmtMoney(casc.totalWin) + (casc.mult > 1 ? '  x' + casc.mult : ''), casc.totalWin >= engine.bet * 10);
    sndWin(index);
    spawnSparks(casc.winCells);
    await sleep(620);

    // 2) eliminate / transform / decrement
    casc.removed.forEach(([c, r]) => cells[c][r].classList.add('clear'));
    casc.blast.forEach(([c, r]) => cells[c][r].classList.add('clear'));
    casc.transformed.forEach(({ c, r, n }) => {
      const el = cells[c][r];
      el.classList.remove('win'); el.classList.add('transform');
      const sym = el.querySelector('.sym');
      if (sym) sym.innerHTML = S.buildWild(n);
      const f = el.querySelector('.frame-overlay'); if (f) f.remove();
    });
    casc.decremented.forEach(({ c, r, n }) => {
      const sym = cells[c][r].querySelector('.sym');
      if (sym) sym.innerHTML = S.buildWild(n);
      cells[c][r].classList.add('transform');
    });
    sndDrop();
    await sleep(340);

    // 3) drop the resulting board + expansion glow
    currentBoard = casc.resultBoard;
    currentHeights = casc.resultHeights;
    renderBoard(true);
    casc.expandCols.forEach((c) => {
      const r = casc.resultHeights[c] - 1;
      if (cells[c][r]) cells[c][r].classList.add('unlock');
    });
    if (casc.expandCols.length) beep(660, 0.12, 'triangle', 0.05);
    await animateWaysTo(casc.waysAfter);
    await sleep(260);
  }

  function spawnSparks(winCells) {
    if (turbo === 2) return;
    const fr = boardEl.getBoundingClientRect();
    const wr = cascadeFx.getBoundingClientRect();
    winCells.slice(0, 24).forEach(([c, r]) => {
      const el = cells[c] && cells[c][r];
      if (!el) return;
      const b = el.getBoundingClientRect();
      const s = document.createElement('div');
      s.className = 'spark';
      s.style.left = (b.left - wr.left + b.width / 2) + 'px';
      s.style.top = (b.top - wr.top + b.height / 2) + 'px';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * 60) + 'px');
      s.style.setProperty('--dy', ((Math.random() - 0.5) * 60) + 'px');
      cascadeFx.appendChild(s);
      setTimeout(() => s.remove(), 700);
    });
  }

  // ---- free games -----------------------------------------------------------
  async function runFreeGames(balAfterTrigger) {
    const banner = $('freeBanner');
    banner.hidden = false;
    let freeTotalWin = 0;

    while (engine.inFree && engine.st.freeLeft > 0) {
      $('fgLeft').textContent = engine.st.freeLeft;
      $('fgMult').textContent = engine.st.mult;
      await sleep(420);

      const res = engine.spin();
      const before = engine.balance - res.totalWin;

      currentBoard = res.initial.board; currentHeights = res.initial.heights;
      renderBoard(true); sndDrop();
      await animateWaysTo(res.initial.ways);
      await sleep(250);

      let runWin = 0;
      for (let i = 0; i < res.cascades.length; i++) {
        const casc = res.cascades[i];
        if (casc.golden) await featureOverlay('GOLDEN TREASURE', 'The whole board transforms!', '', 1300);
        await playCascade(casc, i);
        runWin += casc.totalWin;
        setWin(runWin);
        await animateBalanceTo(before + runWin);
      }
      freeTotalWin += runWin;
      $('fgLeft').textContent = res.freeLeft;
      $('fgMult').textContent = res.mult;
      if (res.extraFree > 0) showWinPop('+' + res.extraFree + ' FREE GAME', false);

      await animateBalanceTo(engine.balance);
      await sleep(300);
      if (res.freeEnded) break;
    }

    banner.hidden = true;
    await featureOverlay('FREE GAME OVER', 'Total Free Game Win', 'Rs ' + fmtMoney(freeTotalWin), 1900, true);
    setWin(freeTotalWin);
  }

  // ---- overlays -------------------------------------------------------------
  function featureOverlay(title, sub, amount, holdMs, coins) {
    const ov = $('overlay'), inner = $('overlayInner');
    inner.innerHTML =
      `<div class="ov-title">${title}</div>` +
      (sub ? `<div class="ov-sub">${sub}</div>` : '') +
      (amount ? `<div class="ov-amount">${amount}</div>` : '') +
      `<div class="ov-tap">TAP TO CONTINUE</div>`;
    ov.hidden = false;
    if (coins) rainCoins(ov);
    if (title.indexOf('WIN') >= 0 || title.indexOf('TREASURE') >= 0) sndBig();
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; ov.removeEventListener('click', finish); ov.hidden = true; ov.querySelectorAll('.ov-coin').forEach((c) => c.remove()); res(); };
      ov.addEventListener('click', finish);
      setTimeout(finish, skip ? 350 : holdMs);
    });
  }
  function rainCoins(ov) {
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('div');
      c.className = 'ov-coin';
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDuration = (1.4 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.8) + 's';
      ov.appendChild(c);
    }
  }

  function flashInsufficient() {
    showWinPop('INSUFFICIENT BALANCE', false);
    btnSpin.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220, iterations: 2 });
  }

  // =============================================================================
  // Controls
  // =============================================================================
  function wireControls() {
    btnSpin.addEventListener('click', doSpin);
    document.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); doSpin(); } });

    $('betPlus').addEventListener('click', () => { if (spinning) return; engine.changeBet(1); betValEl.textContent = engine.bet; beep(520, 0.05, 'square', 0.04); });
    $('betMinus').addEventListener('click', () => { if (spinning) return; engine.changeBet(-1); betValEl.textContent = engine.bet; beep(420, 0.05, 'square', 0.04); });

    btnTurbo.addEventListener('click', () => {
      turbo = (turbo + 1) % 3;
      btnTurbo.classList.toggle('on', turbo > 0);
      btnTurbo.classList.toggle('super', turbo === 2);
      $('turboHint').textContent = turbo === 0 ? 'Press turbo spin' : turbo === 1 ? 'Turbo ON' : 'Super Turbo ON';
    });

    btnAuto.addEventListener('click', () => {
      if (autoRemaining > 0 || autoInfinite) { stopAuto(); return; }
      $('autoModal').hidden = false;
    });

    $('btnSound').addEventListener('click', () => { soundOn = !soundOn; $('btnSound').classList.toggle('muted', !soundOn); $('btnSound').innerHTML = soundOn ? '&#128266;' : '&#128263;'; });
    $('btnHistory').addEventListener('click', () => featureOverlay('HISTORY', 'No bets recorded yet', 'Balance Rs ' + fmtMoney(engine.balance), 1400));

    // rules modal
    $('btnRules').addEventListener('click', () => { $('rulesModal').hidden = false; });
    $('rulesClose').addEventListener('click', () => { $('rulesModal').hidden = true; });
    $('rulesModal').addEventListener('click', (e) => { if (e.target === $('rulesModal')) $('rulesModal').hidden = true; });

    // autospin modal
    $('autoClose').addEventListener('click', () => { $('autoModal').hidden = true; });
    $('autoCancel').addEventListener('click', () => { $('autoModal').hidden = true; });
    $('autoStart').addEventListener('click', () => {
      $('autoModal').hidden = true;
      btnAuto.classList.add('on');
      if (!spinning) doSpin();
    });
  }

  function stopAuto() { autoRemaining = 0; autoInfinite = false; btnAuto.classList.remove('on'); }

  // ---- autospin count picker ------------------------------------------------
  function buildAutoGrid() {
    const grid = $('autoGrid');
    const opts = [10, 25, 50, 100, 250, 500, 1000, '∞'];
    grid.innerHTML = '';
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.textContent = o;
      b.addEventListener('click', () => {
        grid.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        if (o === '∞') { autoInfinite = true; autoRemaining = 0; } else { autoInfinite = false; autoRemaining = o; }
      });
      grid.appendChild(b);
    });
    grid.firstChild.classList.add('sel');
    autoRemaining = 10;
  }

  // =============================================================================
  // Rules modal content
  // =============================================================================
  function buildRules() {
    const tabsEl = $('rulesTabs'), bodyEl = $('rulesBody');
    const pages = window.GTRules;
    tabsEl.innerHTML = '';
    pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.textContent = p.tab;
      b.addEventListener('click', () => showRulePage(i));
      tabsEl.appendChild(b);
    });
    function showRulePage(i) {
      Array.from(tabsEl.children).forEach((c, k) => c.classList.toggle('active', k === i));
      bodyEl.innerHTML = `<h2>${pages[i].title}</h2>` + pages[i].html;
      // hydrate dynamic symbol demos
      const wr = bodyEl.querySelector('#wildSymRow');
      if (wr) { [1, 2, 3].forEach((n) => wr.appendChild(demoCell(S.buildWild(n)))); }
      const fr = bodyEl.querySelector('#frameSymRow');
      if (fr) {
        const d = demoCell(S.get('PURPLE').svgHTML);
        d.appendChild(frameWrap());
        fr.appendChild(d);
      }
      const pg = bodyEl.querySelector('#paytableGrid');
      if (pg) buildPaytable(pg);
    }
    window.__showRulePage = showRulePage;
    showRulePage(0);
  }

  function demoCell(svgHTML) {
    const d = document.createElement('div'); d.className = 'demo';
    d.innerHTML = svgHTML; return d;
  }
  function frameWrap() { const w = document.createElement('div'); w.innerHTML = S.buildFrameOverlay(); return w.firstElementChild; }

  function buildPaytable(grid) {
    grid.innerHTML = '';
    S.paytableOrder.forEach((id, idx) => {
      const def = S.get(id);
      const card = document.createElement('div');
      card.className = 'pt-card' + (idx === 0 ? ' top' : '');
      const pays = [6, 5, 4, 3].map((k) => `<div>${k} &times; <b>${def.pay[k]}</b></div>`).join('');
      card.innerHTML = `<div class="pt-icon">${def.svgHTML}</div><div class="pt-pays">${pays}</div>`;
      grid.appendChild(card);
    });
  }
})();
