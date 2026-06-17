/* =============================================================================
   Golden Temple — Dynamic SVG art library
   Every symbol and decorative element is generated as SVG markup at runtime.
   No external image assets are used anywhere in the game.
   ============================================================================= */
(function (global) {
  'use strict';

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
     GEMS
     Two cuts are used to echo the reference paytable:
       brilliantGem  -> pointed round/teardrop cut (RED top symbol, GOLD)
       tableGem      -> rectangular emerald cut      (PURPLE, GREEN, BLUE)
     --------------------------------------------------------------------------- */

  function brilliantGem(c) {
    const gT = uid('gt'), gC = uid('gc'), gP = uid('gp'), gl = uid('gl');
    return svg(`
      <defs>
        <radialGradient id="${gT}" cx="42%" cy="34%" r="75%">
          ${stops([[0, c.hi], [0.45, c.main], [1, c.dark]])}
        </radialGradient>
        <linearGradient id="${gC}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, c.hi], [1, c.main]])}
        </linearGradient>
        <linearGradient id="${gP}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, c.main], [1, c.dark]])}
        </linearGradient>
        <radialGradient id="${gl}" cx="50%" cy="50%" r="50%">
          ${stops([[0, '#ffffff', 0.95], [1, '#ffffff', 0]])}
        </radialGradient>
      </defs>
      <g filter="url(#softGlow)">
        <!-- girdle outline -->
        <polygon points="30,28 70,28 84,46 50,88 16,46" fill="${c.dark}"/>
        <!-- crown facets -->
        <polygon points="30,28 70,28 62,46 38,46" fill="url(#${gC})"/>
        <polygon points="30,28 16,46 38,46" fill="${c.main}"/>
        <polygon points="70,28 84,46 62,46" fill="${c.hi}"/>
        <!-- pavilion facets -->
        <polygon points="38,46 50,46 50,88" fill="url(#${gP})"/>
        <polygon points="50,46 62,46 50,88" fill="${c.dark}"/>
        <polygon points="16,46 38,46 50,88" fill="${c.main}"/>
        <polygon points="62,46 84,46 50,88" fill="${c.hi}"/>
        <!-- table sparkle -->
        <polygon points="40,32 60,32 56,42 44,42" fill="url(#${gT})"/>
        <ellipse cx="44" cy="36" rx="9" ry="4" fill="url(#${gl})" opacity=".85"/>
        <circle cx="68" cy="40" r="2.4" fill="#fff" opacity=".9"/>
      </g>`);
  }

  function tableGem(c) {
    const gMain = uid('tm'), gBev = uid('tb'), gl = uid('tl');
    return svg(`
      <defs>
        <linearGradient id="${gMain}" x1="0" y1="0" x2="0.4" y2="1">
          ${stops([[0, c.hi], [0.5, c.main], [1, c.dark]])}
        </linearGradient>
        <linearGradient id="${gBev}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, c.hi], [1, c.dark]])}
        </linearGradient>
        <radialGradient id="${gl}" cx="50%" cy="40%" r="60%">
          ${stops([[0, '#ffffff', 0.9], [1, '#ffffff', 0]])}
        </radialGradient>
      </defs>
      <g filter="url(#softGlow)">
        <rect x="18" y="26" width="64" height="48" rx="7" fill="${c.dark}"/>
        <!-- bevel frame -->
        <polygon points="18,26 82,26 72,36 28,36" fill="url(#${gBev})"/>
        <polygon points="82,26 82,74 72,64 72,36" fill="${c.main}"/>
        <polygon points="18,26 18,74 28,64 28,36" fill="${c.hi}"/>
        <polygon points="18,74 82,74 72,64 28,64" fill="${c.dark}"/>
        <!-- table -->
        <rect x="28" y="36" width="44" height="28" rx="3" fill="url(#${gMain})"/>
        <!-- step facets -->
        <rect x="33" y="40" width="34" height="20" rx="2" fill="none" stroke="${c.hi}" stroke-opacity=".5" stroke-width="1.2"/>
        <ellipse cx="44" cy="44" rx="11" ry="5" fill="url(#${gl})"/>
        <circle cx="64" cy="58" r="2" fill="#fff" opacity=".85"/>
      </g>`);
  }

  // Blue "cluster" gem (paytable blue shows little stones) — distinct look.
  function clusterGem(c) {
    const g = uid('cg'), gl = uid('cl');
    const stone = (x, y, r) => `
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})" stroke="${c.dark}" stroke-width="1"/>
      <circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.4}" fill="#ffffff" opacity=".6"/>`;
    return svg(`
      <defs>
        <radialGradient id="${g}" cx="38%" cy="34%" r="75%">
          ${stops([[0, c.hi], [0.5, c.main], [1, c.dark]])}
        </radialGradient>
        <radialGradient id="${gl}" cx="50%" cy="50%" r="50%">
          ${stops([[0, '#fff', .8], [1, '#fff', 0]])}
        </radialGradient>
      </defs>
      <g filter="url(#softGlow)">
        ${stone(36, 40, 14)}
        ${stone(64, 38, 12)}
        ${stone(50, 62, 15)}
        ${stone(70, 64, 9)}
      </g>`);
  }

  /* ---------------------------------------------------------------------------
     SCROLL (parchment)
     --------------------------------------------------------------------------- */
  function scroll() {
    const g = uid('sc'), gr = uid('sr');
    return svg(`
      <defs>
        <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#f7e9c4'], [0.5, '#e8cf95'], [1, '#caa96b']])}
        </linearGradient>
        <linearGradient id="${gr}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#caa15a'], [1, '#8a6326']])}
        </linearGradient>
      </defs>
      <g filter="url(#softGlow)">
        <rect x="26" y="30" width="48" height="40" rx="3" fill="url(#${g})" stroke="#8a6326" stroke-width="1.4"/>
        <line x1="34" y1="40" x2="66" y2="40" stroke="#9c7636" stroke-width="2" stroke-linecap="round"/>
        <line x1="34" y1="48" x2="66" y2="48" stroke="#9c7636" stroke-width="2" stroke-linecap="round"/>
        <line x1="34" y1="56" x2="58" y2="56" stroke="#9c7636" stroke-width="2" stroke-linecap="round"/>
        <!-- rolled top & bottom -->
        <rect x="20" y="24" width="60" height="12" rx="6" fill="url(#${gr})" stroke="#5e3f12" stroke-width="1.4"/>
        <rect x="20" y="64" width="60" height="12" rx="6" fill="url(#${gr})" stroke="#5e3f12" stroke-width="1.4"/>
        <circle cx="24" cy="30" r="3.2" fill="#3f2a0c"/>
        <circle cx="24" cy="70" r="3.2" fill="#3f2a0c"/>
      </g>`);
  }

  /* ---------------------------------------------------------------------------
     LETTER tiles (A / K / Q) — stone carved, gem-tinted
     --------------------------------------------------------------------------- */
  function letter(ch, c) {
    const gFill = uid('lf'), gGold = uid('lg');
    return svg(`
      <defs>
        <linearGradient id="${gGold}" x1="0" y1="0" x2="0" y2="1">
          ${stops([[0, '#fff2b0'], [0.5, '#f4c64a'], [1, '#a9741b']])}
        </linearGradient>
        <radialGradient id="${gFill}" cx="50%" cy="38%" r="70%">
          ${stops([[0, c.hi], [0.6, c.main], [1, c.dark]])}
        </radialGradient>
      </defs>
      <g filter="url(#softGlow)">
        <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
          font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="62"
          stroke="#5a3c10" stroke-width="6" paint-order="stroke">${ch}</text>
        <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
          font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="62"
          stroke="url(#${gGold})" stroke-width="3.2" fill="url(#${gFill})" paint-order="stroke">${ch}</text>
      </g>`);
  }

  /* ---------------------------------------------------------------------------
     WILD — radiant gold medallion. `n` shows the elimination counter badge.
     --------------------------------------------------------------------------- */
  function wild(n) {
    const gMed = uid('wm'), gRay = uid('wr');
    const rays = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * 30, y1 = 50 + Math.sin(a) * 30;
      const x2 = 50 + Math.cos(a) * 46, y2 = 50 + Math.sin(a) * 46;
      rays.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="url(#${gRay})" stroke-width="3.4" stroke-linecap="round"/>`);
    }
    const badge = (n && n >= 2) ? `
      <g>
        <circle cx="76" cy="76" r="15" fill="#7a1414" stroke="#ffd86a" stroke-width="2.5"/>
        <text x="76" y="77" text-anchor="middle" dominant-baseline="central"
          font-family="Georgia,serif" font-weight="700" font-size="18" fill="#ffe9a8">${n}</text>
      </g>` : '';
    return svg(`
      <defs>
        <radialGradient id="${gMed}" cx="50%" cy="40%" r="62%">
          ${stops([[0, '#fff6cf'], [0.45, '#f6c64b'], [1, '#9c6a16']])}
        </radialGradient>
        <linearGradient id="${gRay}" x1="0" y1="0" x2="1" y2="1">
          ${stops([[0, '#ffe48a'], [1, '#c8881f']])}
        </linearGradient>
      </defs>
      <g filter="url(#softGlow)">
        ${rays.join('')}
        <circle cx="50" cy="50" r="31" fill="url(#${gMed})" stroke="#7a4d12" stroke-width="2"/>
        <circle cx="50" cy="50" r="25" fill="none" stroke="#fff3c2" stroke-width="1.4" opacity=".7"/>
        <text x="50" y="51" text-anchor="middle" dominant-baseline="central"
          font-family="Georgia,serif" font-weight="800" font-size="17" letter-spacing="0.5"
          fill="#5a3208">WILD</text>
        ${badge}
      </g>`);
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

  /* ---------------------------------------------------------------------------
     SYMBOL REGISTRY
     id, label, paytable (per single occurrence at bet = 3), rng weight, builder
     --------------------------------------------------------------------------- */
  const palette = {
    red:    { hi: '#ff8a6a', main: '#e21f24', dark: '#7c0d10' },
    purple: { hi: '#d9a8ff', main: '#8b3ff0', dark: '#3d1670' },
    gold:   { hi: '#ffe79a', main: '#f4a623', dark: '#9c5d0d' },
    green:  { hi: '#aef0a0', main: '#36b53a', dark: '#155d1a' },
    blue:   { hi: '#a9d8ff', main: '#2f7fe0', dark: '#123e7a' },
  };

  const DEFS = [
    { id: 'RED',    kind: 'high', pay: { 3: 0.9, 4: 1.5, 5: 2.0, 6: 3.0 },  weight: 4,  build: () => brilliantGem(palette.red) },
    { id: 'PURPLE', kind: 'high', pay: { 3: 0.6, 4: 0.75, 5: 1.2, 6: 1.8 }, weight: 6,  build: () => tableGem(palette.purple) },
    { id: 'GOLD',   kind: 'high', pay: { 3: 0.45, 4: 0.75, 5: 1.05, 6: 1.5 }, weight: 7, build: () => brilliantGem(palette.gold) },
    { id: 'GREEN',  kind: 'high', pay: { 3: 0.3, 4: 0.6, 5: 0.9, 6: 1.2 },  weight: 9,  build: () => tableGem(palette.green) },
    { id: 'BLUE',   kind: 'high', pay: { 3: 0.3, 4: 0.45, 5: 0.6, 6: 0.9 }, weight: 10, build: () => clusterGem(palette.blue) },
    { id: 'SCROLL', kind: 'low',  pay: { 3: 0.3, 4: 0.45, 5: 0.6, 6: 0.75 }, weight: 12, build: () => scroll() },
    { id: 'A',      kind: 'low',  pay: { 3: 0.15, 4: 0.3, 5: 0.45, 6: 0.6 }, weight: 15, build: () => letter('A', palette.red) },
    { id: 'K',      kind: 'low',  pay: { 3: 0.15, 4: 0.3, 5: 0.45, 6: 0.6 }, weight: 15, build: () => letter('K', palette.blue) },
    { id: 'Q',      kind: 'low',  pay: { 3: 0.15, 4: 0.3, 5: 0.45, 6: 0.6 }, weight: 16, build: () => letter('Q', palette.green) },
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

  global.GTSymbols = {
    DEFS,
    REGISTRY,
    order: DEFS.map((d) => d.id),
    paytableOrder: ['RED', 'PURPLE', 'GOLD', 'GREEN', 'BLUE', 'SCROLL', 'A', 'K', 'Q'],
    get: (id) => REGISTRY[id],
    buildWild,
    buildFrameOverlay,
    art: { torch, character, pillar, frameOverlay },
    FILTER_DEFS,
  };
})(window);
