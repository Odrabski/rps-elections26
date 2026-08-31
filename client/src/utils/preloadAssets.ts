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

/**
 * Warms the browser's image cache for the whole head/soldier sprite pool up front, before a room
 * or seed exists — so setup and combat aren't the first time any of these ever get fetched.
 * Fire-and-forget: a failed/slow load here costs nothing, since the real <img> tags fall back to
 * a normal network fetch regardless.
 */
export function preloadPieceAssets(): void {
  const files = new Set<string>();
  const teams: Team[] = ['red', 'blue'];
  const hands: RPSHand[] = ['rock', 'paper', 'scissors'];

  files.add(TRAP_ASSET);
  for (const team of teams) {
    files.add(KING_ASSET[team]);
    files.add(SOLDIER_BARE_BACK_ASSET[team]);
    files.add(HIDDEN_BODY_ASSET[team]);
    for (const head of HIDDEN_HEAD_POOL[team]) files.add(head);
    for (const hand of hands) {
      files.add(SOLDIER_HAND_ASSET[team][hand]);
      files.add(SOLDIER_BACK_ASSET[team][hand]);
      files.add(SOLDIER_BACK_EXPOSED_ASSET[team][hand]);
    }
  }

  for (const file of files) {
    const img = new Image();
    img.src = `/assets/pieces/${file}`;
  }
}
