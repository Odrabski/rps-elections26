import type { RPSHand, Team } from './types.js';
import { SOLDIER_COUNT } from './constants.js';

/**
 * King and Trap are shown from behind — a crowned figure per team, and a single neutral wooden
 * decoy for Trap (a trap isn't a real person, so it's team-agnostic).
 */
export const KING_ASSET: Record<Team, string> = {
  blue: 'co_sol_back_king.png',
  red: 'op_sol_back_king.png',
};

export const KING_NAME: Record<Team, string> = {
  blue: 'בנימין נתניהו',
  red: 'גדי איזנקוט',
};

export const TRAP_ASSET = 'trap_back.png';

/**
 * A soldier's weapon is only revealed to the *opponent* once it's actually been in a 1:1
 * fight — not just from moving. This is the front-facing family: used to show an opponent's
 * soldier once their weapon is known (see SOLDIER_BACK_ASSET for how your own soldiers render).
 */
export const SOLDIER_HAND_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'sol_co_rock.png',
    paper: 'sol_co_paper.png',
    scissors: 'sol_co_scrissors.png',
  },
  red: {
    rock: 'sol_op_rock.png',
    paper: 'sol_op_paper.png',
    scissors: 'sol_op_scissors.png',
  },
};

/**
 * Your own soldiers stand with their backs to you — you already know your own army's weapons
 * from the start, so these render immediately (no reveal needed). See SOLDIER_BACK_EXPOSED_ASSET
 * for the variant shown once that soldier has actually fought.
 */
export const SOLDIER_BACK_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'co_sol_back_rock.png',
    paper: 'co_sol_back_paper.png',
    scissors: 'co_sol_back_scissors.png',
  },
  red: {
    rock: 'op_sol_back_rock.png',
    paper: 'op_sol_back_paper.png',
    scissors: 'op_sol_back_scissors.png',
  },
};

/** Same as SOLDIER_BACK_ASSET, but for a piece of yours that has fought — the opponent now knows its weapon too. */
export const SOLDIER_BACK_EXPOSED_ASSET: Record<Team, Record<RPSHand, string>> = {
  blue: {
    rock: 'co_sol_back_rock_x.png',
    paper: 'co_sol_back_paper_x.png',
    scissors: 'co_sol_back_scissors_x.png',
  },
  red: {
    rock: 'op_sol_back_rock_x.png',
    paper: 'op_sol_back_paper_x.png',
    scissors: 'op_sol_back_scissors_x.png',
  },
};

/** The headless decoy body for any opponent piece not yet revealed to this viewer. */
export const HIDDEN_BODY_ASSET: Record<Team, string> = {
  blue: 'sol_co_main.png',
  red: 'sol_op_main.png',
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
    'co_aryederi.png',
    'co_smotrich.png',
    'co_miriregev.png',
    'co_goldknopf.png',
    'co_bibi.png',
    'co_saar.png',
    'co_rottman.png',
    'co_bengvir.png',
    'co_taly.png',
    'co_katz.png',
    'co_gafni.png',
    'co_levin.png',
    'co_strook.png',
    'co_karii.png',
  ],
  red: [
    'op_bennet.png',
    'op_lapid.png',
    'op_yairgolan.png',
    'op_liberman.png',
    'op_lazimi.png',
    'op_gadi.png',
    'op_yoaz.png',
    'op_bennygantz.png',
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
