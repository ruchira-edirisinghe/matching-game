/* =============================================================================
   Aether Dynasty — symbol art library
   The board symbols use the painted PNG assets in public/assets/match-assets/
   (Greek gods + card suits + wild chalice), wrapped in a 0 0 100 100 SVG so
   they reuse the same sizing / glow pipeline as the generated decorative art.
   Decorative elements (torches, rune-ring, etc.) are still generated as SVG.

   Ported to an ES module: the original IIFE attached `window.GTSymbols`; this
   module exports the same object so the engine / controller can import it.
   ============================================================================= */

// ---- small helpers ---------------------------------------------------------
let _uid = 0;
const uid = (p) => `${p}${(_uid++).toString(36)}`;

// Wrap raw inner SVG into a full <svg> with a 0 0 100 100 viewBox.
function svg(inner, extra) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" ${extra || ''}>${inner}</svg>`;
}

// A reusable radial/linear gradient stop string.
function stops(list) {
  return list.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] != null ? ` stop-opacity="${s[2]}"` : ''}/>`).join('');
}

/* ---------------------------------------------------------------------------
   IMAGE SYMBOLS
   Each board symbol is a painted PNG (public/assets/match-assets/) placed inside
   the standard 100x100 viewBox so existing CSS (.cell .sym svg, .pt-icon svg, …)
   scales it exactly like the old vector symbols. preserveAspectRatio="meet"
   keeps the artwork undistorted regardless of the cell's aspect ratio.
   Paths are root-absolute (/assets/…) so they resolve from Next's public dir
   regardless of the current route.
   --------------------------------------------------------------------------- */
const ASSET_DIR = '/assets/match-assets/';
function imgSym(file) {
  const href = encodeURI(ASSET_DIR + file);
  return svg(`<image href="${href}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`);
}

/* ---------------------------------------------------------------------------
   WILD — painted golden chalice. `n` shows the elimination counter badge.
   --------------------------------------------------------------------------- */
function wild(n) {
  const href = encodeURI(ASSET_DIR + 'wildcard.png');
  const badge = (n && n >= 2) ? `
    <g filter="url(#softGlow)">
      <circle cx="77" cy="77" r="16" fill="#7a1414" stroke="#ffd86a" stroke-width="3"/>
      <text x="77" y="78" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia,serif" font-weight="700" font-size="20" fill="#ffe9a8">${n}</text>
    </g>` : '';
  return svg(`
    <image href="${href}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>
    ${badge}`);
}

/* ---------------------------------------------------------------------------
   GOLDEN FRAME — ornate border overlay (drawn around a wrapped symbol).
   --------------------------------------------------------------------------- */
function frameOverlay() {
  const g = uid('fr');
  return `
    <svg viewBox="0 0 100 100" class="frame-overlay" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
          ${stops([[0, '#fff0a8'], [0.5, '#e3a92e'], [1, '#9a6512']])}
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#${g})" stroke-width="4">
        <rect x="6" y="10" width="88" height="80" rx="6"/>
      </g>
      <g fill="url(#${g})">
        <!-- corner flourishes -->
        <path d="M6,18 q-4,-10 8,-10 q-10,2 -8,10z"/>
        <path d="M94,18 q4,-10 -8,-10 q10,2 8,10z"/>
        <path d="M6,82 q-4,10 8,10 q-10,-2 -8,-10z"/>
        <path d="M94,82 q4,10 -8,10 q10,-2 8,-10z"/>
        <!-- side cusps (the pinched middles from the reference) -->
        <path d="M6,42 q-9,8 0,16 q-5,-8 0,-16z"/>
        <path d="M94,42 q9,8 0,16 q5,-8 0,-16z"/>
        <circle cx="50" cy="9" r="2.6"/>
        <circle cx="50" cy="91" r="2.6"/>
      </g>
    </svg>`;
}

/* ---------------------------------------------------------------------------
   DECORATIVE ART (background, torches, character)
   --------------------------------------------------------------------------- */

// Animated torch flame — markup contains its own CSS-driven flicker via classes.
function torch() {
  const gFlame = uid('tf'), gMetal = uid('tm');
  return `
    <svg viewBox="0 0 60 160" xmlns="http://www.w3.org/2000/svg" class="torch-svg">
      <defs>
        <radialGradient id="${gFlame}" cx="50%" cy="62%" r="55%">
          ${stops([[0, '#fff7d6'], [0.4, '#ffd64a'], [0.75, '#ff7b1c'], [1, '#c01d05', 0]])}
        </radialGradient>
        <linearGradient id="${gMetal}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#6b5630'], [0.5, '#cdae6a'], [1, '#4a3a1d']])}
        </linearGradient>
      </defs>
      <!-- bracket -->
      <rect x="22" y="92" width="16" height="60" rx="4" fill="url(#${gMetal})" stroke="#2c2110" stroke-width="1.5"/>
      <path d="M14,96 h32 l-6,14 h-20 z" fill="url(#${gMetal})" stroke="#2c2110" stroke-width="1.5"/>
      <!-- flame group (animated) -->
      <g class="flame">
        <path class="flame-outer" d="M30,8 C46,40 50,58 30,92 C10,58 14,40 30,8 Z" fill="url(#${gFlame})"/>
        <path class="flame-inner" d="M30,30 C40,52 40,64 30,84 C20,64 20,52 30,30 Z" fill="#ffe9a0" opacity="0.9"/>
      </g>
      <ellipse class="torch-glow" cx="30" cy="60" rx="40" ry="48" fill="url(#${gFlame})" opacity="0.35"/>
    </svg>`;
}

// Stylised explorer character (vector illustration, not photoreal).
function character() {
  const skin = uid('ch'), hair = uid('hr'), shirt = uid('sh');
  return `
    <svg viewBox="0 0 220 360" xmlns="http://www.w3.org/2000/svg" class="char-svg">
      <defs>
        <linearGradient id="${skin}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#ffe2c2'], [1, '#e7ad81']])}
        </linearGradient>
        <linearGradient id="${hair}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#7a4a22'], [1, '#43230d']])}
        </linearGradient>
        <linearGradient id="${shirt}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#cfd6e6'], [1, '#9aa3bd']])}
        </linearGradient>
      </defs>
      <!-- torso / shirt -->
      <path d="M58,210 q52,-26 104,0 l8,150 h-120 z" fill="url(#${shirt})"/>
      <!-- belt + satchel -->
      <rect x="50" y="300" width="120" height="16" rx="6" fill="#5a3a1c"/>
      <rect x="120" y="298" width="46" height="54" rx="8" fill="#7a4a22" stroke="#3f2410" stroke-width="3"/>
      <rect x="120" y="316" width="46" height="8" fill="#3f2410"/>
      <!-- neck -->
      <rect x="96" y="150" width="28" height="46" rx="12" fill="url(#${skin})"/>
      <!-- hair back -->
      <path d="M64,120 q46,-70 92,0 q14,70 -6,110 q-10,-70 -40,-70 q-30,0 -40,70 q-20,-40 -6,-110z" fill="url(#${hair})"/>
      <!-- face -->
      <ellipse cx="110" cy="118" rx="44" ry="50" fill="url(#${skin})"/>
      <!-- eyes -->
      <ellipse cx="92" cy="116" rx="6" ry="8" fill="#fff"/>
      <ellipse cx="128" cy="116" rx="6" ry="8" fill="#fff"/>
      <circle cx="93" cy="118" r="3.4" fill="#3a2410"/>
      <circle cx="129" cy="118" r="3.4" fill="#3a2410"/>
      <path d="M82,104 q10,-7 20,-1" stroke="#5b3318" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M118,103 q10,-6 20,1" stroke="#5b3318" stroke-width="3" fill="none" stroke-linecap="round"/>
      <!-- nose + smile -->
      <path d="M110,120 l-4,14 q4,3 8,0" stroke="#c98f64" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M96,142 q14,12 28,0" stroke="#a64b3c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- hair front fringe -->
      <path d="M66,108 q4,-58 44,-64 q40,6 44,64 q-18,-30 -44,-26 q-26,-4 -44,26z" fill="url(#${hair})"/>
      <!-- camera around neck -->
      <path d="M86,196 q24,18 48,0" stroke="#2c2018" stroke-width="5" fill="none"/>
      <rect x="92" y="206" width="40" height="26" rx="5" fill="#2c2018" stroke="#000" stroke-width="1"/>
      <circle cx="112" cy="219" r="9" fill="#4a5a6a" stroke="#cdae6a" stroke-width="2"/>
      <circle cx="112" cy="219" r="4" fill="#9fd0e6"/>
      <!-- arm -->
      <path d="M150,214 q40,18 30,70 q-8,-6 -16,-4 q4,-40 -26,-44z" fill="url(#${shirt})"/>
      <circle cx="168" cy="288" r="14" fill="url(#${skin})"/>
    </svg>`;
}

// Temple pillar (repeated on the side frame).
function pillar() {
  const g = uid('pl');
  return `
    <svg viewBox="0 0 90 600" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" class="pillar-svg">
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">
          ${stops([[0, '#3a2f22'], [0.2, '#8a7350'], [0.5, '#c9b489'], [0.8, '#7a6443'], [1, '#2e2418']])}
        </linearGradient>
      </defs>
      <rect x="6" y="0" width="78" height="600" fill="url(#${g})"/>
      <rect x="0" y="0" width="90" height="40" fill="#6b5634"/>
      <rect x="0" y="560" width="90" height="40" fill="#6b5634"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="14" y="${50 + i * 44}" width="62" height="6" fill="#2e2418" opacity=".5"/>`).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<text x="45" y="${90 + i * 80}" text-anchor="middle" font-size="30" fill="#2e2418" opacity=".55" font-family="serif">𓂀</text>`).join('')}
    </svg>`;
}

// Astrolabe / stargate rune-ring — the "ancient-meets-futuristic" centerpiece
// that glows and slowly rotates behind the reel board.
function techRune() {
  const glow = uid('rg');
  const glyphs = ['𓂀', '𓆣', '𓋹', '𓊽', '𓁹', '𓃭', '𓏏', '𓇯', '◈', '⟁', '✶', '⌖', '◇', '⬡', '✦', '⟐'];
  let glyphRing = '';
  for (let i = 0; i < glyphs.length; i++) {
    const a = (i / glyphs.length) * 360;
    glyphRing += `<text x="200" y="74" text-anchor="middle" font-size="20" fill="#ffd86a" transform="rotate(${a} 200 200)" opacity=".9" font-family="serif">${glyphs[i]}</text>`;
  }
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 360, long = i % 5 === 0;
    ticks += `<line x1="200" y1="22" x2="200" y2="${long ? 36 : 28}" stroke="#43e8ff" stroke-width="${long ? 2 : 1}" transform="rotate(${a} 200 200)" opacity=".7"/>`;
  }
  let circ = '';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 360; circ += `<path d="M200,104 l0,18 m-11,0 l22,0" stroke="#7af9ff" stroke-width="1.4" fill="none" transform="rotate(${a} 200 200)" opacity=".6"/>`; }
  return `
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" class="rune-svg">
      <defs>
        <radialGradient id="${glow}" cx="50%" cy="50%" r="50%">
          ${stops([[0, '#43e8ff', 0], [0.78, '#43e8ff', 0], [0.93, '#43e8ff', 0.22], [1, '#43e8ff', 0]])}
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="198" fill="url(#${glow})"/>
      <g class="rr-outer" fill="none">
        <circle cx="200" cy="200" r="190" stroke="#c9962f" stroke-width="2" opacity=".85"/>
        <circle cx="200" cy="200" r="178" stroke="#43e8ff" stroke-width="1" stroke-dasharray="2 6" opacity=".6"/>
        ${ticks}
      </g>
      <g class="rr-mid" fill="none">
        <circle cx="200" cy="200" r="158" stroke="#ffd86a" stroke-width="1" opacity=".5"/>
        <circle cx="200" cy="200" r="146" stroke="#ffd86a" stroke-width="1" opacity=".5"/>
        ${glyphRing}
      </g>
      <g class="rr-inner" fill="none">
        <circle cx="200" cy="200" r="118" stroke="#43e8ff" stroke-width="1.5" opacity=".55"/>
        <circle cx="200" cy="200" r="118" stroke="#43e8ff" stroke-width="6" stroke-dasharray="30 30" opacity=".28"/>
        ${circ}
        <polygon points="200,118 252,200 200,282 148,200" stroke="#ffd86a" stroke-width="1" opacity=".45"/>
        <polygon points="200,140 236,200 200,260 164,200" stroke="#7af9ff" stroke-width="1" opacity=".4"/>
      </g>
    </svg>`;
}

/* ---------------------------------------------------------------------------
   SYMBOL REGISTRY
   id, label, paytable (per single occurrence at bet = 3), rng weight, builder.
   Three Greek gods are the premium (high) symbols; the four card suits are
   the lower-paying symbols. Pays descend from Zeus down to the Club.
   --------------------------------------------------------------------------- */
const DEFS = [
  { id: 'ZEUS',      kind: 'high', pay: { 3: 0.9,  4: 1.5,  5: 2.0,  6: 3.0 }, weight: 5,  build: () => imgSym('zeus.png') },      // Zeus
  { id: 'ATHENA',    kind: 'high', pay: { 3: 0.6,  4: 0.9,  5: 1.4,  6: 2.0 }, weight: 6,  build: () => imgSym('athena.png') },    // Athena
  { id: 'APHRODITE', kind: 'high', pay: { 3: 0.45, 4: 0.75, 5: 1.05, 6: 1.5 }, weight: 7,  build: () => imgSym('aphrodite.png') }, // Aphrodite
  { id: 'HEART',     kind: 'low',  pay: { 3: 0.3,  4: 0.6,  5: 0.9,  6: 1.2 }, weight: 9,  build: () => imgSym('heart.png') },     // red heart
  { id: 'SPADE',     kind: 'low',  pay: { 3: 0.25, 4: 0.45, 5: 0.7,  6: 1.0 }, weight: 10, build: () => imgSym('spade.png') },     // purple spade
  { id: 'DIAMOND',   kind: 'low',  pay: { 3: 0.2,  4: 0.4,  5: 0.6,  6: 0.9 }, weight: 11, build: () => imgSym('diamond.png') },   // green diamond
  { id: 'CLUB',      kind: 'low',  pay: { 3: 0.15, 4: 0.3,  5: 0.45, 6: 0.6 }, weight: 12, build: () => imgSym('club.png') },      // blue club
];

// Pre-render each symbol's SVG once (they are static) and index by id.
const REGISTRY = {};
DEFS.forEach((d) => { REGISTRY[d.id] = Object.assign({}, d, { svgHTML: d.build() }); });

// Specials are rendered on demand (wild number / frame overlay vary).
function buildWild(n) { return wild(n); }
function buildFrameOverlay() { return frameOverlay(); }

// Shared SVG filter defs injected once into the document.
const FILTER_DEFS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.45"/>
      </filter>
    </defs>
  </svg>`;

export const GTSymbols = {
  DEFS,
  REGISTRY,
  order: DEFS.map((d) => d.id),
  paytableOrder: ['ZEUS', 'ATHENA', 'APHRODITE', 'HEART', 'SPADE', 'DIAMOND', 'CLUB'],
  get: (id) => REGISTRY[id],
  buildWild,
  buildFrameOverlay,
  art: { torch, character, pillar, frameOverlay, techRune },
  FILTER_DEFS,
};

export default GTSymbols;
