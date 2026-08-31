import {
  HIDDEN_BODY_ASSET,
  HIDDEN_HEAD_POOL,
  KING_ASSET,
  KING_LABEL,
  SOLDIER_BACK_ASSET,
  SOLDIER_BACK_EXPOSED_ASSET,
  SOLDIER_BARE_BACK_ASSET,
  SOLDIER_HAND_ASSET,
  SOLDIER_IDK_ASSET,
  TRAP_ASSET,
} from 'shared';
import type { ClientPieceView, RPSHand, Team } from 'shared';

/** A stable per-match identifier for seeding the disguise-head shuffle — the same for every
 * client all match long (the room code never changes; the setup deadline is set once, fresh,
 * when setup begins, and is never touched again), but different from one game to the next. */
export function gameSeed(view: { roomCode: string; setupDeadline: number | null }): string {
  return `${view.roomCode}:${view.setupDeadline ?? 0}`;
}

/** An opponent's soldier once its weapon is revealed to this viewer — front-facing, team + held hand. */
export function soldierHandAsset(team: Team, hand: RPSHand): string {
  return `/assets/pieces/${SOLDIER_HAND_ASSET[team][hand]}`;
}

/** The tie weapon-picker's "no pick yet" placeholder — a shrugging, headless body per team. */
export function soldierIdkAsset(team: Team): string {
  return `/assets/pieces/${SOLDIER_IDK_ASSET[team]}`;
}

/** Your own soldier, back-facing — `exposed` once that piece has actually fought. */
function soldierBackAsset(team: Team, hand: RPSHand, exposed: boolean): string {
  const table = exposed ? SOLDIER_BACK_EXPOSED_ASSET : SOLDIER_BACK_ASSET;
  return `/assets/pieces/${table[team][hand]}`;
}

// A tiny seeded PRNG (mulberry32) so the per-game head shuffle below is reproducible from the
// same seed on every client/render, without the server needing to track or send it explicitly.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, seeded — same seed always produces the same permutation. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rand = mulberry32(hashString(seed));
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A piece's fixed slot number (0-13) — every piece id is `${team}-piece-${index}`, regardless
 * of what role it ends up designated as. */
function pieceSlotIndex(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/**
 * A per-piece disguise head from the team's rank-and-file pool. `seed` identifies the current
 * game (see `gameSeed` below) — the pool is shuffled once per (team, game) and each of the
 * team's 14 piece slots claims one shuffled entry, so a team whose pool is exactly 14 heads
 * (coalition) shows every single one exactly once per game; a smaller pool (opposition) cycles
 * through evenly instead of repeating unevenly the way a plain hash could.
 */
function hiddenHeadAsset(team: Team, id: string, seed: string): { asset: string; id: string } {
  const pool = seededShuffle(HIDDEN_HEAD_POOL[team], `${seed}:${team}`);
  const file = pool[pieceSlotIndex(id) % pool.length];
  return { asset: `/assets/pieces/${file}`, id: file.replace(/\.\w+$/, '') };
}

/** A piece's head portrait, regardless of ownership — used where a face is wanted even for
 * your own soldier (e.g. the tie-break popup), which otherwise never shows a face on the board. */
export function pieceHeadAsset(piece: ClientPieceView, seed: string): string {
  return hiddenHeadAsset(piece.team, piece.id, seed).asset;
}

/** Corrected display name per head portrait — keyed by the full headId (with its co_/op_
 * prefix). Falls back to the raw prefix-stripped, upper-cased filename for any id not listed
 * here, so a newly added portrait never ends up with a blank name. */
const HEAD_DISPLAY_NAME: Record<string, string> = {
  co_aryederi: 'DERI',
  co_bengvir: 'BEN-GVIR',
  co_bibi: 'BIBI',
  co_gafni: 'GAFNI',
  co_goldknopf: 'GOLDKNOPF',
  co_karii: 'KARHI',
  co_katz: 'KATZ',
  co_levin: 'LEVIN',
  co_miriregev: 'REGEV',
  co_rottman: 'ROTHMAN',
  co_saar: 'SAAR',
  co_smotrich: 'SMOTRICH',
  co_strook: 'STROOK',
  co_taly: 'GOTTLIEB',
  op_abas: 'ABBAS',
  op_bennet: 'BENNETT',
  op_bennygantz: 'GANTZ',
  op_efrat: 'RAYTEN',
  op_gadi: 'EISENKOT',
  op_gilad: 'KARIV',
  op_keren: 'TERNER',
  op_lapid: 'LAPID',
  op_lazimi: 'LAZIMI',
  op_liberman: 'LIEBERMAN',
  op_merav: 'BEN-ARI',
  op_mikilevi: 'LEVI',
  op_ronen: 'RONEN',
  op_tibi: 'TIBI',
  op_yairgolan: 'GOLAN',
  op_yoaz: 'HENDEL',
};

function headDisplayName(headId: string): string {
  return HEAD_DISPLAY_NAME[headId] ?? headId.replace(/^(co_|op_)/, '').toUpperCase();
}

export interface FightVisual {
  bodyAsset: string;
  headAsset: string;
  headId: string;
  headName: string;
}

/**
 * Both combatants in the pre-fight face-off get the full front-facing body + head reveal,
 * regardless of ownership — a deliberate exception to the normal "your own soldier never shows
 * a face" rule, since this cinematic is a one-off spectacle, not part of the board's fog of war.
 * Only ever called for 'battle' events, which are always soldier-vs-soldier (king-capture and
 * trap-trigger resolve as separate event types before a 'battle' could occur), so `hand` is
 * always set.
 */
export function resolveFightVisual(piece: ClientPieceView, seed: string): FightVisual {
  const head = hiddenHeadAsset(piece.team, piece.id, seed);
  return {
    bodyAsset: soldierHandAsset(piece.team, piece.hand as RPSHand),
    headAsset: head.asset,
    headId: head.id,
    headName: headDisplayName(head.id),
  };
}

export interface PieceVisual {
  asset: string;
  /** A head layered over `asset`'s neckline — only set for unrevealed pieces. */
  maskAsset?: string;
  /** The head portrait's filename stem (e.g. "op_lazimi") — lets CSS target per-portrait sizing. */
  maskId?: string;
  name: string;
}

/**
 * The single source of truth for how to render a piece — used by PieceView, combat/tie UI
 * alike. King (crowned, per-team) and Trap (a neutral wooden decoy) are always shown as
 * themselves. A soldier's rendering is viewer-relative: your own soldiers stand back-to-camera
 * and show their real weapon from the start (an "exposed" variant once that piece has actually
 * fought), while an opponent's soldier only shows its weapon, front-facing, once revealed by an
 * actual 1:1 fight — moving alone doesn't reveal it. Until an opponent piece is revealed to this
 * viewer, it renders as a headless decoy body wearing its real (persistent) head, so a hidden
 * King/Trap/soldier are indistinguishable from one another, but not anonymous.
 */
export function resolvePieceVisual(piece: ClientPieceView, viewerTeam: Team, seed: string): PieceVisual {
  const known = piece.kind !== undefined;
  const isMine = piece.team === viewerTeam;

  if (known && piece.kind === 'soldier' && piece.hand) {
    if (isMine) {
      return { asset: soldierBackAsset(piece.team, piece.hand, piece.revealed), name: 'חייל' };
    }
    const head = hiddenHeadAsset(piece.team, piece.id, seed);
    return {
      asset: soldierHandAsset(piece.team, piece.hand),
      maskAsset: head.asset,
      maskId: head.id,
      name: 'חייל',
    };
  }
  if (known && piece.kind === 'king') {
    return { asset: `/assets/pieces/${KING_ASSET[piece.team]}`, name: KING_LABEL };
  }
  if (known && piece.kind === 'trap') {
    return { asset: `/assets/pieces/${TRAP_ASSET}`, name: 'מלכודת' };
  }
  if (known && piece.kind === 'unassigned') {
    return { asset: `/assets/pieces/${SOLDIER_BARE_BACK_ASSET[piece.team]}`, name: '' };
  }
  const head = hiddenHeadAsset(piece.team, piece.id, seed);
  return {
    asset: `/assets/pieces/${HIDDEN_BODY_ASSET[piece.team]}`,
    maskAsset: head.asset,
    maskId: head.id,
    name: '',
  };
}
