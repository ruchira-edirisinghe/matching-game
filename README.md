# Aether Dynasty — 46,656 Ways slot

A from-scratch browser slot built to a classic expanding-ways spec, rebranded
with a **futuristic-meets-historical** identity ("Neon Antiquity"): an ancient
temple lit by torches, wrapped in a glowing holographic / stargate aesthetic.
Built with **Next.js** (App Router). Board symbols are painted PNGs
(`public/assets/match-assets/`); the torches, ornate frames and the rotating
astrolabe rune-ring are still generated as **dynamic SVG** at runtime.

### Look & type system
- **Fonts:** `Orbitron` (futuristic readouts — brand, ways counter, HUD numbers,
  feature titles), `Marcellus SC` (ancient Roman-inscription labels & tabs),
  `Spectral` (classic serif body copy).
- **Futuristic layer:** a slow counter-rotating astrolabe **rune-ring** behind
  the board (ancient glyphs + tech ticks), a neon grid + scanline backdrop,
  cyan-neon board edge, holographic WAYS panel, and neon-ringed controls.

## Run it

This is a [Next.js](https://nextjs.org) (App Router) app. Install once, then start
the dev server:

```
npm install
npm run dev        # http://localhost:3000
```

For a production build:

```
npm run build
npm run start
```

Controls: **Spin** (or Spacebar) · **Bet ±** · **Turbo** (tap = turbo, tap
again = super turbo) · **Auto** (pick a count) · **Sound** · **History** · the
**ⓘ** button opens the full rules / paytable.

## Mechanics (from the instruction screens)

- **6 reels, ways pays.** Wins pay left→right from reel 1 on adjacent reels,
  3+ symbols to win. Ways = product of each reel's active height.
- **Cascades.** Winning symbols are eliminated, new symbols drop from the top,
  and wins keep resolving until none remain.
- **Expanding board.** Each winning cascade unlocks an extra row on a
  participating reel, growing the ways toward the maximum **46,656** (6⁶).
- **Golden Frame** (reels 2–5 only) → after being eliminated it transforms into
  a **Wild**.
- **Wild.** Substitutes every symbol; never lands naturally. Carries a counter
  `N` — while `N ≥ 2` it survives wins and decrements; at `1` it disappears.
- **Free Game.** Reaching 46,656 ways triggers **6 free games** with a rising
  multiplier, neighbour "blast" eliminations, extra games, and the one-shot
  **Golden Treasure** (converts the board to one symbol for a big bounded prize).
- **Payout rules.** Max payout Rs 10,000,000 / 10,000×; bet Rs 1–1,000.

## Project layout

| File | Purpose |
|------|---------|
| `src/app/layout.js` | Root layout: metadata, viewport, fonts, favicons |
| `src/app/page.js` | Route that renders the game |
| `src/app/globals.css` | Temple theme, layout, all animations |
| `src/components/Game.js` | Client component: renders the markup (HUD, modals, overlay) once and boots the controller in `useEffect` |
| `src/game/symbols.js` | Symbol library: painted-PNG board symbols, wild/frame overlays, decorative SVG (torch, rune-ring…) + registry & paytable |
| `src/game/engine.js` | Pure game logic: ways evaluation, cascades, expansion, wilds, free game, payout cap |
| `src/game/rules.js` | Rules/paytable content (mirrors the instruction screens) |
| `src/game/controller.js` | Rendering, spin/cascade animation, controls, sound, modals (exports `boot()`) |
| `public/assets/` | Painted PNGs, GIFs, button art, favicons (served from the site root) |

The game logic is unchanged from the original vanilla build — the IIFE `window`
globals were converted to ES modules, the markup became a React client
component, and `main.js`'s `DOMContentLoaded` boot became `boot()`, called from
`useEffect`. The component has no React state, so it renders once and the
controller drives all updates imperatively (by element id) exactly as before.

## Notes

The engine was validated over 300k simulated spins: free game triggers ~1 in
640 spins, the multiplier/free-game loop always terminates, and the published
payout cap (10,000× bet) is enforced. The reel weights give a demo RTP of ~76%
against the on-screen paytable — tune `weight`/`pay` in `js/symbols.js` to taste.

Open with `?autospin=1`, `?rules=<n>`, or `?free=1` to jump straight to a state
(handy for debugging / screenshots).
