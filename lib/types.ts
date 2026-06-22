// Shared domain types for the Aether Dynasty slot.

export type SymbolId =
  | "ZEUS"
  | "ATHENA"
  | "APHRODITE"
  | "HEART"
  | "SPADE"
  | "DIAMOND"
  | "CLUB";

export type SymbolKind = "high" | "low";

/** Pay per single occurrence, keyed by chain length (3..6). */
export type PayTable = Record<number, number>;

export interface SymbolDef {
  id: SymbolId;
  kind: SymbolKind;
  pay: PayTable;
  weight: number;
  build: () => string;
}

/** A symbol definition with its pre-rendered SVG markup. */
export interface RegistryEntry extends SymbolDef {
  svgHTML: string;
}

/** A single board cell. `id` is "WILD" for wild cells. */
export interface Cell {
  id: SymbolId | "WILD";
  wild: boolean;
  frame: boolean;
  wildN: number;
  fresh: boolean;
}

/** Board is column-major: board[col][row]. */
export type Board = Cell[][];
export type Heights = number[];

export interface WinInfo {
  symbol: SymbolId | "WILD";
  count: number;
  ways: number;
  amount: number;
  cells: Array<[number, number]>;
}

/** A {col, row, counter} record used for wild transforms / decrements. */
export interface CellMark {
  c: number;
  r: number;
  n: number;
}

export interface Cascade {
  wins: WinInfo[];
  totalWin: number;
  /** Each entry is a [col, row] pair. */
  winCells: number[][];
  removed: Array<[number, number]>;
  transformed: CellMark[];
  decremented: CellMark[];
  blast: Array<[number, number]>;
  expandCols: number[];
  waysBefore: number;
  waysAfter: number;
  resultBoard: Board;
  resultHeights: Heights;
  mult: number;
  golden: boolean;
  goldenSymbol?: SymbolId;
}

export interface InitialDrop {
  board: Board;
  heights: Heights;
  ways: number;
}

export interface SpinResult {
  initial: InitialDrop;
  cascades: Cascade[];
  totalWin: number;
  triggeredFree: boolean;
  goldenTreasure: boolean;
  freeMode: boolean;
  extraFree: number;
  freeLeft: number;
  freeTotal: number;
  mult: number;
  finalBoard: Board;
  finalHeights: Heights;
  freeEnded: boolean;
}

export interface EngineState {
  balance: number;
  betIndex: number;
  inFree: boolean;
  freeLeft: number;
  freeTotal: number;
  mult: number;
  goldenTreasureUsed: boolean;
  lastWin: number;
}

export interface EngineOptions {
  balance?: number;
  bet?: number;
}

export interface Engine {
  st: EngineState;
  COLS: number;
  MAX_ROWS: number;
  MAX_WAYS: number;
  BET_LEVELS: number[];
  readonly bet: number;
  readonly balance: number;
  readonly inFree: boolean;
  waysOf: (heights: Heights) => number;
  symbol: (id: SymbolId) => RegistryEntry;
  changeBet: (dir: number) => number;
  setBetIndex: (i: number) => number;
  setSeed: (intSeed?: number) => void;
  canSpin: () => boolean;
  spin: () => SpinResult;
  idleBoard: () => { board: Board; heights: Heights };
}

/** A page in the rules / paytable modal. */
export interface RulePage {
  tab: string;
  title: string;
  html: string;
}
