/* =============================================================================
   Aether Dynasty — game engine (pure logic)
   ---------------------------------------------------------------------------
   Mechanics implemented from the reference instruction screens:
     • 6 reels, "ways" pays L→R from reel 1 on adjacent reels, 3+ to win
     • ways = product of each reel's active height (max 6^6 = 46,656)
     • cascading / tumble: winning symbols are eliminated, new ones drop in
     • board expansion: reels that take part in a win unlock an extra row,
       growing the number of ways toward the 46,656 maximum
     • WILD: never lands naturally — only created from an eliminated Golden
       Frame; carries a counter N (stays & decrements while N >= 2)
     • GOLDEN FRAME: only on reels 2–5; after being eliminated → WILD
     • FREE GAME: triggered when ways reach 46,656; 6 games, rising multiplier,
       neighbouring symbols also blast, and the one-shot Golden Treasure
   The engine resolves a whole spin (all cascades) up front and returns the
   list of cascades; the UI layer replays them with animation.

   Ported to an ES module: the original IIFE attached `window.GTEngine`; this
   module imports the symbol registry directly and exports the same object.
   ============================================================================= */

import { GTSymbols } from './symbols';

const S = GTSymbols;
const DEFS = S.DEFS;
const WEIGHTS = DEFS.map((d) => d.weight);
const IDS = DEFS.map((d) => d.id);

const COLS = 6;
const MAX_ROWS = 6;
const BASE_H = 4;                 // active rows per reel at the start of a spin
const MAX_WAYS = Math.pow(6, 6);  // 46,656
const FRAME_COLS = [1, 2, 3, 4];  // golden frame only on reels 2..5 (0-indexed)

const MAX_MULT = 3;               // free-game multiplier ceiling
const FREE_CAP = 24;              // hard ceiling on total free games in a session
const EXTRA_FREE_CHANCE = 0.28;   // chance a frame→wild during free awards +1 game
const ABS_MAX_PAYOUT = 10000000;  // Rs 10,000,000
const MAX_WIN_MULT = 10000;       // 10,000x max payout multiplier

const BET_LEVELS = [1, 2, 3, 5, 8, 10, 20, 30, 50, 80, 100, 200, 300, 500, 800, 1000];

// ---- rng -------------------------------------------------------------------
const rnd = () => Math.random();
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

let _wsum = WEIGHTS.reduce((a, b) => a + b, 0);
function pickSymbol() {
  let x = rnd() * _wsum;
  for (let i = 0; i < WEIGHTS.length; i++) { x -= WEIGHTS[i]; if (x <= 0) return IDS[i]; }
  return IDS[IDS.length - 1];
}

// ---- cell helpers ----------------------------------------------------------
function makeCell(col, freeMode) {
  const id = pickSymbol();
  let frame = false;
  if (FRAME_COLS.indexOf(col) >= 0) {
    const fp = freeMode ? 0.06 : 0.05;
    if (rnd() < fp) frame = true;
  }
  return { id, wild: false, frame, wildN: 0, fresh: true };
}
const cloneCell = (c) => (c ? Object.assign({}, c) : c);
const cloneBoard = (b) => b.map((col) => col.map(cloneCell));

function waysOf(heights) { return heights.reduce((a, h) => a * h, 1); }

// ---- evaluation: ways wins, left to right ----------------------------------
function evaluate(board, bet, mult) {
  const wins = [];
  const winSet = new Set();
  for (const def of DEFS) {
    const sym = def.id;
    const colMatches = [];
    let chain = 0;
    for (let c = 0; c < COLS; c++) {
      const rows = [];
      const col = board[c];
      for (let r = 0; r < col.length; r++) {
        const cell = col[r];
        if (cell && (cell.id === sym || cell.wild)) rows.push(r);
      }
      if (rows.length === 0) break;     // chain broken
      colMatches.push(rows);
      chain++;
    }
    if (chain >= 3) {
      let ways = 1;
      for (let c = 0; c < chain; c++) ways *= colMatches[c].length;
      const unit = def.pay[Math.min(chain, 6)];
      const amount = unit * ways * (bet / 3) * (mult || 1);
      const cells = [];
      for (let c = 0; c < chain; c++) for (const r of colMatches[c]) { cells.push([c, r]); winSet.add(c + ',' + r); }
      wins.push({ symbol: sym, count: chain, ways, amount, cells });
    }
  }
  const totalWin = wins.reduce((s, w) => s + w.amount, 0);
  return { wins, totalWin, winSet };
}

// ---- apply eliminations + gravity + refill + expansion ---------------------
function applyCascade(board, heights, winSet, freeMode) {
  const removed = [];      // [c,r] gone for good
  const transformed = [];  // {c,r,n}  frame -> wild
  const decremented = [];  // {c,r,n}  wild N--
  const blast = [];        // [c,r] free-game neighbour removals
  const transformMap = {};
  const decrementMap = {};
  const removedSet = new Set();

  winSet.forEach((key) => {
    const [c, r] = key.split(',').map(Number);
    const cell = board[c][r];
    if (!cell) return;
    if (cell.frame) {
      const n = randInt(1, 3);
      transformMap[key] = n;
      transformed.push({ c, r, n });
    } else if (cell.wild) {
      if (cell.wildN >= 2) { decrementMap[key] = cell.wildN - 1; decremented.push({ c, r, n: cell.wildN - 1 }); }
      else { removedSet.add(key); removed.push([c, r]); }
    } else {
      removedSet.add(key); removed.push([c, r]);
    }
  });

  // free-game blast: orthogonal neighbours of winning cells are also cleared
  if (freeMode) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    winSet.forEach((key) => {
      const [c, r] = key.split(',').map(Number);
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr, nk = nc + ',' + nr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= heights[nc]) continue;
        const cell = board[nc][nr];
        if (!cell || cell.wild || cell.frame) continue;       // don't blast wilds/frames
        if (removedSet.has(nk) || winSet.has(nk)) continue;
        if (rnd() < 0.45) { removedSet.add(nk); blast.push([nc, nr]); }   // partial blast
      }
    });
  }

  // Board expansion: ONE participating reel unlocks a row per cascade. Gradual
  // growth is what keeps reaching the 46,656-way maximum a rare, snowball event
  // instead of something that happens on almost every spin.
  const colTouched = [];
  const seen = new Set();
  winSet.forEach((key) => { const c = Number(key.split(',')[0]); if (!seen.has(c) && heights[c] < MAX_ROWS) { seen.add(c); colTouched.push(c); } });

  const expandCols = [];
  if (colTouched.length) expandCols.push(colTouched[randInt(0, colTouched.length - 1)]);
  const expandSet = new Set(expandCols);

  const newHeights = heights.slice();
  const newBoard = [];
  for (let c = 0; c < COLS; c++) {
    if (expandSet.has(c) && newHeights[c] < MAX_ROWS) { newHeights[c]++; }

    // survivors fall, preserving order
    const kept = [];
    for (let r = 0; r < heights[c]; r++) {
      const key = c + ',' + r;
      if (transformMap[key] != null) kept.push({ id: 'WILD', wild: true, frame: false, wildN: transformMap[key], fresh: false });
      else if (decrementMap[key] != null) kept.push({ id: 'WILD', wild: true, frame: false, wildN: decrementMap[key], fresh: false });
      else if (removedSet.has(key)) continue;
      else kept.push(Object.assign(cloneCell(board[c][r]), { fresh: false }));
    }
    const need = newHeights[c] - kept.length;
    const newCells = [];
    for (let i = 0; i < need; i++) newCells.push(makeCell(c, freeMode));
    newBoard.push(newCells.concat(kept));   // new symbols enter at the top
  }

  return { removed, transformed, decremented, blast, expandCols, newBoard, newHeights };
}

// ---- a fresh landed board at base height -----------------------------------
function freshBoard(freeMode) {
  const heights = new Array(COLS).fill(BASE_H);
  const board = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < heights[c]; r++) col.push(makeCell(c, freeMode));
    board.push(col);
  }
  return { board, heights };
}

// =============================================================================
// Engine instance
// =============================================================================
function createEngine(opts) {
  opts = opts || {};
  const st = {
    balance: opts.balance != null ? opts.balance : 50000,
    betIndex: Math.max(0, BET_LEVELS.indexOf(opts.bet || 3)),
    inFree: false,
    freeLeft: 0,
    freeTotal: 0,
    mult: 1,
    goldenTreasureUsed: false,
    lastWin: 0,
  };

  const api = {
    st,
    COLS, MAX_ROWS, MAX_WAYS, BET_LEVELS,
    get bet() { return BET_LEVELS[st.betIndex]; },
    get balance() { return st.balance; },
    get inFree() { return st.inFree; },
    waysOf,
    symbol: (id) => S.get(id),
  };

  api.changeBet = function (dir) {
    st.betIndex = Math.min(BET_LEVELS.length - 1, Math.max(0, st.betIndex + dir));
    return BET_LEVELS[st.betIndex];
  };
  api.setBetIndex = function (i) { st.betIndex = Math.min(BET_LEVELS.length - 1, Math.max(0, i)); return BET_LEVELS[st.betIndex]; };

  api.canSpin = function () { return st.inFree || st.balance >= api.bet; };

  // Resolve one full spin (all cascades). Handles both base and free modes.
  api.spin = function () {
    const bet = api.bet;
    const freeMode = st.inFree;

    if (!freeMode) {
      st.balance -= bet;       // base spins cost a bet; free spins are free
    } else {
      st.freeLeft--;
    }

    let { board, heights } = freshBoard(freeMode);
    const initial = { board: cloneBoard(board), heights: heights.slice(), ways: waysOf(heights) };

    const cascades = [];
    let total = 0;
    let maxReached = false;
    let extraFree = 0;
    const spinMult = freeMode ? st.mult : 1;   // fixed for the whole spin

    for (let guard = 0; guard < 64; guard++) {
      const ev = evaluate(board, bet, spinMult);
      if (ev.totalWin <= 0 || ev.wins.length === 0) break;

      const plan = applyCascade(board, heights, ev.winSet, freeMode);

      // free-game extra games: gated by chance AND a hard session cap so the
      // session always terminates (consumption of 1/spin outpaces awards).
      if (freeMode && plan.transformed.length > 0 &&
          (st.freeTotal + extraFree) < FREE_CAP && rnd() < EXTRA_FREE_CHANCE) {
        extraFree += 1;
      }

      cascades.push({
        wins: ev.wins,
        totalWin: ev.totalWin,
        winCells: Array.from(ev.winSet).map((k) => k.split(',').map(Number)),
        removed: plan.removed,
        transformed: plan.transformed,
        decremented: plan.decremented,
        blast: plan.blast,
        expandCols: plan.expandCols,
        waysBefore: waysOf(heights),
        waysAfter: waysOf(plan.newHeights),
        resultBoard: cloneBoard(plan.newBoard),
        resultHeights: plan.newHeights.slice(),
        mult: spinMult,
        golden: false,
      });

      total += ev.totalWin;
      board = plan.newBoard;
      heights = plan.newHeights;
      if (waysOf(heights) >= MAX_WAYS) { maxReached = true; }
    }

    // --- Golden Treasure (free game only, once per free-game session) -------
    // Fills the board with one symbol for the show, but pays a *bounded*
    // multiplier prize (not a guaranteed max-win) so it stays a rare highlight.
    let goldenTreasure = false;
    if (freeMode && maxReached && !st.goldenTreasureUsed) {
      st.goldenTreasureUsed = true;
      goldenTreasure = true;
      const choice = IDS[randInt(0, 4)]; // one of the gem symbols
      const fullH = new Array(COLS).fill(MAX_ROWS);
      const gboard = [];
      for (let c = 0; c < COLS; c++) { const col = []; for (let r = 0; r < MAX_ROWS; r++) col.push({ id: choice, wild: false, frame: false, wildN: 0, fresh: true }); gboard.push(col); }
      const prize = bet * spinMult * randInt(15, 40);
      cascades.push({
        wins: [{ symbol: choice, count: 6, ways: MAX_WAYS, amount: prize, cells: [] }],
        totalWin: prize,
        winCells: gboard.flatMap((col, c) => col.map((_, r) => [c, r])),
        removed: [], transformed: [], decremented: [], blast: [], expandCols: [],
        waysBefore: MAX_WAYS, waysAfter: MAX_WAYS,
        resultBoard: cloneBoard(gboard), resultHeights: fullH.slice(),
        mult: spinMult, golden: true, goldenSymbol: choice,
      });
      total += prize;
    }

    // --- mode transitions ---------------------------------------------------
    let triggeredFree = false;
    if (!freeMode && maxReached) {
      triggeredFree = true;
      st.inFree = true;
      st.freeLeft = 6;
      st.freeTotal = 6;
      st.mult = 1;
      st.goldenTreasureUsed = false;
    } else if (freeMode) {
      if (total > 0) st.mult = Math.min(MAX_MULT, st.mult + 1);   // multiplier climbs each winning free spin
      if (extraFree > 0) { st.freeLeft += extraFree; st.freeTotal += extraFree; }
    }

    // enforce the published payout cap (10,000,000 / 10,000x bet)
    const cap = Math.min(ABS_MAX_PAYOUT, MAX_WIN_MULT * bet);
    if (total > cap) total = cap;

    st.balance += total;
    st.lastWin = total;

    const freeEnded = freeMode && st.freeLeft <= 0;
    if (freeEnded) { st.inFree = false; }

    return {
      initial,
      cascades,
      totalWin: total,
      triggeredFree,
      goldenTreasure,
      freeMode,
      extraFree,
      freeLeft: st.freeLeft,
      freeTotal: st.freeTotal,
      mult: st.mult,
      finalBoard: cascades.length ? cascades[cascades.length - 1].resultBoard : initial.board,
      finalHeights: cascades.length ? cascades[cascades.length - 1].resultHeights : initial.heights,
      freeEnded,
    };
  };

  // Produce an idle (no-spin) board just for the first render.
  api.idleBoard = function () { return freshBoard(false); };

  return api;
}

export const GTEngine = { create: createEngine, COLS, MAX_ROWS, MAX_WAYS, BASE_H, BET_LEVELS, waysOf };

export default GTEngine;
