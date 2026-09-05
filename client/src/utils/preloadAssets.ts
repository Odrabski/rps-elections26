import {
  HIDDEN_BODY_ASSET,
  HIDDEN_HEAD_POOL,
  KING_ASSET,
  SOLDIER_BACK_ASSET,
  SOLDIER_BACK_EXPOSED_ASSET,
  SOLDIER_BARE_BACK_ASSET,
  SOLDIER_HAND_ASSET,
  TRAP_ASSET,
} from 'shared';
import type { RPSHand, Team } from 'shared';

let preloaded = false;

/**
 * Warms the browser's image cache for the sprites a match will actually need, so setup and combat
 * aren't the first time any of them get fetched. Fire-and-forget: a failed or slow load here costs
 * nothing, since the real <img> tags fall back to a normal network fetch regardless.
 *
 * Called once a game is actually starting — not on app start. It used to run from a bare mount
 * effect, so every visitor who opened the home screen and left had already pulled the entire
 * sprite pool, competing with the splash, background and fonts for the first paint.
 *
 * `viewerTeam` narrows it further: the back/exposed sprites are only ever shown for your own side,
 * so the opponent's are pure waste. Heads come from both pools — either side's disguise can show
 * up on either board.
 */
export function preloadPieceAssets(viewerTeam?: Team): void {
  if (preloaded) return;
  preloaded = true;

  const files = new Set<string>();
  const teams: Team[] = ['red', 'blue'];
  const hands: RPSHand[] = ['rock', 'paper', 'scissors'];

  files.add(TRAP_ASSET);
  // The clash cloud and the trap's hole are not pieces, so nothing above reaches them — and the
  // cloud in particular was being fetched for the first time during the fight it appears in.
  files.add('cloud2.webp');
  files.add('hole.webp');
  for (const team of teams) {
    files.add(KING_ASSET[team]);
    files.add(HIDDEN_BODY_ASSET[team]);
    for (const head of HIDDEN_HEAD_POOL[team]) files.add(head);
    // Front-facing hand sprites appear for whichever side gets revealed, so both are needed.
    for (const hand of hands) files.add(SOLDIER_HAND_ASSET[team][hand]);

    if (viewerTeam && team !== viewerTeam) continue;
    files.add(SOLDIER_BARE_BACK_ASSET[team]);
    for (const hand of hands) {
      files.add(SOLDIER_BACK_ASSET[team][hand]);
      files.add(SOLDIER_BACK_EXPOSED_ASSET[team][hand]);
    }
  }

  for (const file of files) {
    const img = new Image();
    img.src = `/assets/pieces/${file}`;
  }
}
