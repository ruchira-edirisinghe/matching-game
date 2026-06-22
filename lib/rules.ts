/* =============================================================================
   Aether Dynasty — rules content (mirrors the reference instruction screens)
   Consumed by the controller to populate the paginated rules modal.
   ============================================================================= */

import type { RulePage } from "@/lib/types";

const PAGES: RulePage[] = [
  {
    tab: "Rules",
    title: "Game Rules",
    html: `
      <div class="quickstart">
        <div class="qs"><span class="qs-n">1</span><div><b>Set your bet</b><p>Tap &minus; / + to choose your stake, then press SPIN.</p></div></div>
        <div class="qs"><span class="qs-n">2</span><div><b>Match symbols</b><p>Land 3+ of the same symbol on adjacent reels, left&nbsp;to&nbsp;right.</p></div></div>
        <div class="qs"><span class="qs-n">3</span><div><b>Cascade &amp; grow</b><p>Wins clear away, new symbols drop in, and ways grow toward 46,656.</p></div></div>
      </div>
      <ol class="rules-list">
        <li>It is a <b>6 reel</b> video slot machine. Based on the payway setup, all winning symbols pay from
            <b>left to right</b> on adjacent reels starting from the leftmost reel, landing <b>3 or more</b> symbols to win.</li>
        <li>When a winning combination occurs, the winning symbols are eliminated and new symbols drop from the top to
            fill the board. This <b>cascade</b> continues until no more winning combinations can be landed.</li>
        <li>When symbols land a winning combination and are eliminated, the board and paylines <b>expand</b>.
            The maximum number of payways is <b class="hot">46,656 ways</b>.</li>
        <li>Only the highest win is paid on each payway.</li>
        <li>When multiple payways result in wins, all of the winnings are added together.</li>
        <li>Feature game bet amount is based on the triggered base game.</li>
        <li>Winning combinations and pays are made according to the paytable.</li>
      </ol>
      <p class="rule-note">Win pays L→R from reel 1 on adjacent reels — <span class="yes">3+ adjacent = YES</span>,
         a gap breaks the chain = <span class="no">NO</span>.</p>`,
  },
  {
    tab: "Wild",
    title: "Wild",
    html: `
      <div class="rule-sym-row" id="wildSymRow"></div>
      <ol class="rules-list">
        <li>It can substitute all symbols in the game.</li>
        <li class="hot">Wilds don't just show up. They are only converted from Golden Frame symbols into Wilds.</li>
        <li>After the Golden Frame symbol is connected and eliminated, it transforms into a Wild symbol that can be
            eliminated multiple times.</li>
        <li>The number on the Wild represents how many times it can be eliminated. If the number is 2 or more, when a
            winning combination includes the Wild, it will <b>not</b> disappear and the number decreases by 1.</li>
        <li>If the number is 1 it is not displayed; when a win includes this Wild it is eliminated and disappears.</li>
      </ol>`,
  },
  {
    tab: "Golden Frame",
    title: "Golden Frame",
    html: `
      <div class="rule-sym-row" id="frameSymRow"></div>
      <ol class="rules-list">
        <li class="hot">Appears only on the 2nd, 3rd, 4th, and 5th Reels.</li>
        <li>After elimination it will transform into a Wild Symbol.</li>
      </ol>`,
  },
  {
    tab: "Free Game",
    title: "Free Game",
    html: `
      <ol class="rules-list">
        <li>In each main game, when symbols land a winning combination and are eliminated, the symbols surrounding the
            eliminated symbols are also eliminated, expanding the board and number of payways.
            <span class="hot">When the number of payways reaches the maximum of 46,656 ways, the Free Game is triggered.</span></li>
        <li>The Free Game starts with <b>6 games</b>.</li>
        <li>Each Free Game, landing connected symbols that are eliminated pays prizes; surrounding eliminations trigger
            special effects — <b>+1 extra Free Game</b> and an <b>increasing multiplier</b>.</li>
        <li>Players can win the <b class="hot">Golden Treasure</b> if the board reaches the maximum 46,656 ways during the Free Game.</li>
        <li><b>Golden Treasure:</b> if the board reaches the maximum available payways, it randomly selects a symbol and
            converts all symbols to the same one, then pays out continuously.</li>
        <li>The Golden Treasure can only be triggered once per Free Game session.</li>
        <li>When the number of games reaches 0, the Free Game ends and total winnings are settled.</li>
      </ol>`,
  },
  {
    tab: "Paytable",
    title: "Paytable",
    html: `
      <p class="rule-note">Pays shown are <b>per way</b> at <b>bet = 3</b>. Your actual win scales with your bet and the
         number of ways the symbol lands on adjacent reels.</p>
      <div class="paytable-grid" id="paytableGrid"></div>`,
  },
  {
    tab: "Payout",
    title: "Payout Information",
    html: `
      <ol class="rules-list">
        <li>A game round is immediately ended when the maximum payout multiplier is reached, and all winnings are paid out.</li>
        <li>Maximum Payout: <b>Rs 10,000,000</b></li>
        <li>Maximum Payout Multiplier: <b>10,000x</b></li>
        <li>Minimum bet: <b>Rs 1</b></li>
        <li>Maximum bet: <b>Rs 1,000</b></li>
        <li>The game's Maximum Payout Multiplier is guaranteed to be won within 100,000,000 rounds of play.</li>
      </ol>
      <h3 class="rule-h3">Game Interruption Mechanism</h3>
      <p class="rule-note">Malfunctions void all pays and plays. If a malfunction occurs during a game, the system will
         automatically complete the game and award the player. If a disconnection occurs after receiving the player's bet
         and the player can no longer influence the outcome, the bet result remains valid.</p>`,
  },
];

export const GTRules: RulePage[] = PAGES;

export default GTRules;
