import type { RPSHand, Team } from './types.js';
import { SOLDIER_COUNT } from './constants.js';

/**
 * King and Trap are shown from behind — a crowned figure per team, and a single neutral wooden
 * decoy for Trap (a trap isn't a real person, so it's team-agnostic).
 */
export const KING_ASSET: Record<Team, string> = {
  blue: 'co_sol_back_king.webp',
  red: 'op_sol_back_king.webp',
};

/** The King can end up being any of your 14 pieces, so it's never labeled as a fixed person. */
export const KING_LABEL = 'מלך';

export const TRAP_ASSET = 'trap_back.webp';

/** A not-yet-designated piece during setup — every one of your 14 starts out looking like this. */
export const SOLDIER_BARE_BACK_ASSET: Record<Team, string> = {
  blue: 'co_sol_back.webp',
  red: 'op_sol_back.webp',
};

/**
 * A soldier's weapon is only revealed to the *opponent* once it's actually been in a 1:1
 * fight — not just from moving. This is the front-facing family: used to show an opponent's
 * soldier once their weapon is known (see SOLDIER_BACK_ASSET for how your own soldiers render).
 */
export const SOLDIER_HAND_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'sol_co_rock.webp',
    paper: 'sol_co_paper.webp',
    scissors: 'sol_co_scrissors.webp',
  },
  red: {
    rock: 'sol_op_rock.webp',
    paper: 'sol_op_paper.webp',
    scissors: 'sol_op_scissors.webp',
  },
};

/** A shrugging "no weapon picked yet" body — shown in the tie weapon-picker before (or instead
 * of, for the opponent) revealing a pick. */
export const SOLDIER_IDK_ASSET: Record<Team, string> = {
  blue: 'sol_co_idk.webp',
  red: 'sol_op_idk.webp',
};

/**
 * Your own soldiers stand with their backs to you — you already know your own army's weapons
 * from the start, so these render immediately (no reveal needed). See SOLDIER_BACK_EXPOSED_ASSET
 * for the variant shown once that soldier has actually fought.
 */
export const SOLDIER_BACK_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'co_sol_back_rock.webp',
    paper: 'co_sol_back_paper.webp',
    scissors: 'co_sol_back_scissors.webp',
  },
  red: {
    rock: 'op_sol_back_rock.webp',
    paper: 'op_sol_back_paper.webp',
    scissors: 'op_sol_back_scissors.webp',
  },
};

/** Same as SOLDIER_BACK_ASSET, but for a piece of yours that has fought — the opponent now knows its weapon too. */
export const SOLDIER_BACK_EXPOSED_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'co_sol_back_rock_x.webp',
    paper: 'co_sol_back_paper_x.webp',
    scissors: 'co_sol_back_scissors_x.webp',
  },
  red: {
    rock: 'op_sol_back_rock_x.webp',
    paper: 'op_sol_back_paper_x.webp',
    scissors: 'op_sol_back_scissors_x.webp',
  },
};

/** The headless decoy body for any opponent piece not yet revealed to this viewer. */
export const HIDDEN_BODY_ASSET: Record<Team, string> = {
  blue: 'sol_co_main.webp',
  red: 'sol_op_main.webp',
};

/**
 * A random (but per-piece stable) head worn by an opponent piece — this is the opponent's real,
 * persistent identity, visible from turn one (there are no anonymous masks) and unaffected by
 * whether that piece's weapon has since been revealed. Drawn from each team's rank-and-file
 * portraits — includes the King's own face (co_bibi/op_gadi) as just another possible soldier
 * disguise, so spotting that face on a piece is not itself proof it's the King.
 */
export const HIDDEN_HEAD_POOL: Record<Team, string[]> = {
  blue: [
    'co_aryederi.webp',
    'co_smotrich.webp',
    'co_miriregev.webp',
    'co_goldknopf.webp',
    'co_bibi.webp',
    'co_saar.webp',
    'co_rottman.webp',
    'co_bengvir.webp',
    'co_taly.webp',
    'co_katz.webp',
    'co_gafni.webp',
    'co_levin.webp',
    'co_strook.webp',
    'co_karii.webp',
  ],
  red: [
    'op_bennet.webp',
    'op_lapid.webp',
    'op_yairgolan.webp',
    'op_liberman.webp',
    'op_lazimi.webp',
    'op_gadi.webp',
    'op_yoaz.webp',
    'op_bennygantz.webp',
    'op_keren.webp',
    'op_efrat.webp',
    'op_gilad.webp',
    'op_ronen.webp',
    'op_mikilevi.webp',
    'op_merav.webp',
  ],
};

/** Balanced 4 rock / 4 paper / 4 scissors pool, in a fixed (unshuffled) order. */
export function balancedHandPool(): RPSHand[] {
  const hands: RPSHand[] = [];
  const kinds: RPSHand[] = ['rock', 'paper', 'scissors'];
  for (const kind of kinds) {
    for (let i = 0; i < SOLDIER_COUNT / kinds.length; i++) hands.push(kind);
  }
  return hands;
}
