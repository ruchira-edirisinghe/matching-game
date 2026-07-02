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
   ============================================================================= */

import { GTSymbols } from "@/lib/symbols";
import type {
  Board,
  Cascade,
  Cell,
  CellMark,
  Engine,
  EngineOptions,
  EngineState,
  Heights,
  SpinResult,
  SymbolId,
  WinInfo,
} from "@/lib/types";

const S = GTSymbols;
const DEFS = S.DEFS;
const WEIGHTS: number[] = DEFS.map((d) => d.weight);
const IDS: SymbolId[] = DEFS.map((d) => d.id);

const COLS = 6;
const MAX_ROWS = 6;
const BASE_H = 4;                 // active rows per reel at the start of a spin
const MAX_WAYS = Math.pow(6, 6);  // 46,656
const FRAME_COLS = [1, 2, 3, 4];  // golden frame only on reels 2..5 (0-indexed)

const MAX_MULT = 3;               // free-game multiplier ceiling
const FREE_CAP = 24;              // hard ceiling on total free games in a session
const EXTRA_FREE_CHANCE = 0.08;   // chance a frame→wild during free awards +1 game
const ABS_MAX_PAYOUT = 10000000;  // Rs 10,000,000
const MAX_WIN_MULT = 10000;       // 10,000x max payout multiplier

const BET_LEVELS = [1, 2, 3, 5, 8, 10, 20, 30, 50, 80, 100, 200, 300, 500, 800, 1000];

// ---- rng -------------------------------------------------------------------
// The active source is swappable: by default Math.random, but `setSeed` points
// it at a deterministic sin-based PRNG seeded from the blockchain RNG service so
// each spin's outcome is provably fair (same PRNG family as the horse game).
let _activeRng: () => number = Math.random;
const rnd = (): number => _activeRng();
const randInt = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));

// Seeded PRNG. Seeded from the SAME blockchain RNG source as the horse-racing
// game, but using mulberry32 instead of that game's sin-based generator: the
// sin PRNG is statistically weak and makes RTP drift a few % with the seed
// pattern, which would undo the paytable tuning. mulberry32 is uniform, so the
// outcome stays provably-fair (deterministic from the chain seed) AND RTP-stable.
function makeRng(seed: number): () => number {
  let a = (seed || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _wsum = WEIGHTS.reduce((a, b) => a + b, 0);
function pickSymbol(): SymbolId {
  let x = rnd() * _wsum;
  for (let i = 0; i < WEIGHTS.length; i++) { x -= WEIGHTS[i]; if (x <= 0) return IDS[i]; }
  return IDS[IDS.length - 1];
}

// ---- cell helpers ----------------------------------------------------------
function makeCell(col: number, freeMode: boolean): Cell {
  const id = pickSymbol();
  let frame = false;
  if (FRAME_COLS.indexOf(col) >= 0) {
    const fp = freeMode ? 0.06 : 0.05;
    if (rnd() < fp) frame = true;
  }
  return { id, wild: false, frame, wildN: 0, fresh: true };
}
const cloneCell = (c: Cell): Cell => ({ ...c });
const cloneBoard = (b: Board): Board => b.map((col) => col.map(cloneCell));

function waysOf(heights: Heights): number { return heights.reduce((a, h) => a * h, 1); }

interface Evaluation {
  wins: WinInfo[];
  totalWin: number;
  winSet: Set<string>;
}

// ---- evaluation: ways wins, left to right ----------------------------------
function evaluate(board: Board, bet: number, mult: number): Evaluation {
  const wins: WinInfo[] = [];
  const winSet = new Set<string>();
  for (const def of DEFS) {
    const sym = def.id;
    const colMatches: number[][] = [];
    let chain = 0;
    for (let c = 0; c < COLS; c++) {
      const rows: number[] = [];
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
      const cells: Array<[number, number]> = [];
      for (let c = 0; c < chain; c++) for (const r of colMatches[c]) { cells.push([c, r]); winSet.add(c + "," + r); }
      wins.push({ symbol: sym, count: chain, ways, amount, cells });
    }
  }
  const totalWin = wins.reduce((s, w) => s + w.amount, 0);
  return { wins, totalWin, winSet };
}

interface CascadePlan {
  removed: Array<[number, number]>;
  transformed: CellMark[];
  decremented: CellMark[];
  blast: Array<[number, number]>;
  expandCols: number[];
  newBoard: Board;
  newHeights: Heights;
}

// ---- apply eliminations + gravity + refill + expansion ---------------------
function applyCascade(board: Board, heights: Heights, winSet: Set<string>, freeMode: boolean): CascadePlan {
  const removed: Array<[number, number]> = [];      // [c,r] gone for good
  const transformed: CellMark[] = [];               // {c,r,n}  frame -> wild
  const decremented: CellMark[] = [];               // {c,r,n}  wild N--
  const blast: Array<[number, number]> = [];        // [c,r] free-game neighbour removals
  const transformMap: Record<string, number> = {};
  const decrementMap: Record<string, number> = {};
  const removedSet = new Set<string>();

  winSet.forEach((key) => {
    const [c, r] = key.split(",").map(Number);
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
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    winSet.forEach((key) => {
      const [c, r] = key.split(",").map(Number);
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr, nk = nc + "," + nr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= heights[nc]) continue;
        const cell = board[nc][nr];
        if (!cell || cell.wild || cell.frame) continue;       // don't blast wilds/frames
        if (removedSet.has(nk) || winSet.has(nk)) continue;
        if (rnd() < 0.10) { removedSet.add(nk); blast.push([nc, nr]); }   // partial blast
      }
    });
  }

  // Board expansion: ONE participating reel unlocks a row per cascade. Gradual
  // growth is what keeps reaching the 46,656-way maximum a rare, snowball event
  // instead of something that happens on almost every spin.
  const colTouched: number[] = [];
  const seen = new Set<number>();
  winSet.forEach((key) => { const c = Number(key.split(",")[0]); if (!seen.has(c) && heights[c] < MAX_ROWS) { seen.add(c); colTouched.push(c); } });

  const expandCols: number[] = [];
  if (colTouched.length) expandCols.push(colTouched[randInt(0, colTouched.length - 1)]);
  const expandSet = new Set(expandCols);

  const newHeights = heights.slice();
  const newBoard: Board = [];
  for (let c = 0; c < COLS; c++) {
    if (expandSet.has(c) && newHeights[c] < MAX_ROWS) { newHeights[c]++; }

    // survivors fall, preserving order
    const kept: Cell[] = [];
    for (let r = 0; r < heights[c]; r++) {
      const key = c + "," + r;
      if (transformMap[key] != null) kept.push({ id: "WILD", wild: true, frame: false, wildN: transformMap[key], fresh: false });
      else if (decrementMap[key] != null) kept.push({ id: "WILD", wild: true, frame: false, wildN: decrementMap[key], fresh: false });
      else if (removedSet.has(key)) continue;
      else kept.push({ ...cloneCell(board[c][r]), fresh: false });
    }
    const need = newHeights[c] - kept.length;
    const newCells: Cell[] = [];
    for (let i = 0; i < need; i++) newCells.push(makeCell(c, freeMode));
    newBoard.push(newCells.concat(kept));   // new symbols enter at the top
  }

  return { removed, transformed, decremented, blast, expandCols, newBoard, newHeights };
}

// ---- a fresh landed board at base height -----------------------------------
function freshBoard(freeMode: boolean): { board: Board; heights: Heights } {
  const heights = new Array<number>(COLS).fill(BASE_H);
  const board: Board = [];
  for (let c = 0; c < COLS; c++) {
    const col: Cell[] = [];
    for (let r = 0; r < heights[c]; r++) col.push(makeCell(c, freeMode));
    board.push(col);
  }
  return { board, heights };
}

// =============================================================================
// Engine instance
// =============================================================================
function createEngine(opts: EngineOptions = {}): Engine {
  const st: EngineState = {
    balance: opts.balance != null ? opts.balance : 50000,
    betIndex: Math.max(0, BET_LEVELS.indexOf(opts.bet || 3)),
    inFree: false,
    freeLeft: 0,
    freeTotal: 0,
    mult: 1,
    goldenTreasureUsed: false,
    lastWin: 0,
  };

  const api: Engine = {
    st,
    COLS,
    MAX_ROWS,
    MAX_WAYS,
    BET_LEVELS,
    get bet() { return BET_LEVELS[st.betIndex]; },
    get balance() { return st.balance; },
    get inFree() { return st.inFree; },
    waysOf,
    symbol: (id: SymbolId) => S.get(id),

    // Point the engine's randomness at a deterministic PRNG seeded for the next
    // spin (called by the controller with a blockchain-derived seed). Pass no
    // argument / 0 to revert to Math.random.
    setSeed(intSeed?: number): void {
      _activeRng = intSeed ? makeRng(intSeed) : Math.random;
    },

    changeBet(dir: number): number {
      st.betIndex = Math.min(BET_LEVELS.length - 1, Math.max(0, st.betIndex + dir));
      return BET_LEVELS[st.betIndex];
    },

    setBetIndex(i: number): number {
      st.betIndex = Math.min(BET_LEVELS.length - 1, Math.max(0, i));
      return BET_LEVELS[st.betIndex];
    },

    canSpin(): boolean { return st.inFree || st.balance >= api.bet; },

    // Resolve one full spin (all cascades). Handles both base and free modes.
    spin(): SpinResult {
      const bet = api.bet;
      const freeMode = st.inFree;

      if (!freeMode) {
        st.balance = Math.max(0, st.balance - bet);   // base spins cost a bet; clamp so a mis-timed call can't go negative
      } else {
        st.freeLeft--;
      }

      let { board, heights } = freshBoard(freeMode);
      const initial = { board: cloneBoard(board), heights: heights.slice(), ways: waysOf(heights) };

      const cascades: Cascade[] = [];
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
          winCells: Array.from(ev.winSet).map((k) => k.split(",").map(Number)),
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
        const choice = IDS[randInt(0, IDS.length - 1)]; // any board symbol (rules: "randomly selects a symbol")
        const fullH = new Array<number>(COLS).fill(MAX_ROWS);
        const gboard: Board = [];
        for (let c = 0; c < COLS; c++) { const col: Cell[] = []; for (let r = 0; r < MAX_ROWS; r++) col.push({ id: choice, wild: false, frame: false, wildN: 0, fresh: true }); gboard.push(col); }
        const prize = bet * spinMult * randInt(3, 8);
        cascades.push({
          wins: [{ symbol: choice, count: 6, ways: MAX_WAYS, amount: prize, cells: [] }],
          totalWin: prize,
          winCells: gboard.flatMap((col, c) => col.map((_cell, r) => [c, r])),
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
        // Apply any retrigger first so the climb check below sees the true
        // remaining count (incl. bonus games), then climb the multiplier for the
        // NEXT free spin — but only while the session actually continues, so the
        // final free spin never reports a multiplier that is never applied (the
        // win itself uses `spinMult`, captured before this, so payouts are
        // unchanged — this only fixes the displayed/returned multiplier).
        if (extraFree > 0) { st.freeLeft += extraFree; st.freeTotal += extraFree; }
        if (total > 0 && st.freeLeft > 0) st.mult = Math.min(MAX_MULT, st.mult + 1);
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
    },

    // Produce an idle (no-spin) board just for the first render.
    idleBoard(): { board: Board; heights: Heights } { return freshBoard(false); },
  };

  return api;
}

export const GTEngine = { create: createEngine, COLS, MAX_ROWS, MAX_WAYS, BASE_H, BET_LEVELS, waysOf };

export default GTEngine;
