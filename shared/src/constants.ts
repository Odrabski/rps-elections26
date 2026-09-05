export const BOARD_ROWS = 6;
export const BOARD_COLS = 7;

export const SETUP_SECONDS = 60;
export const TURN_SECONDS = 20;
export const TIE_BREAK_SECONDS = 10;

// The client's collision cinematic (FightSequence: intro countdown → standoff → clash → cloud →
// reveal) shares its build-up between a decisive battle and a tie, differing only in how long the
// reveal itself is shown. Defined here (not just in FightSequence.tsx) so the server can delay
// the tie-break picker and the next turn's timer by the same amounts.
export const FIGHT_BEAT_MS = 500;
export const FIGHT_STANDOFF_MS = 1500;
export const FIGHT_CLASH_MS = 450;
export const FIGHT_CLOUD_MS = 750;
const FIGHT_BUILD_UP_MS = FIGHT_BEAT_MS * 4 + FIGHT_STANDOFF_MS + FIGHT_CLASH_MS + FIGHT_CLOUD_MS;
/** How long the winner is held on screen after the cloud clears. Exported because the
 * client sizes the loser's dissolve to it — see .fight-figure-loser. */
export const FIGHT_REVEAL_MS = 3600;
/** A tie has no reveal screen of its own — the weapon picker itself is the "reveal", so the
 * cinematic ends the instant the clash-cloud beat finishes. */
export const TIE_REVEAL_MS = 0;

/** Total lifetime of the cinematic for a decisive battle. */
export const FIGHT_SEQUENCE_MS = FIGHT_BUILD_UP_MS + FIGHT_REVEAL_MS;
/** Total lifetime of the cinematic for a tie (same build-up, shorter reveal). */
export const TIE_SEQUENCE_MS = FIGHT_BUILD_UP_MS + TIE_REVEAL_MS;

// The on-board clash beats that bracket the cinematic above: the attacker jumps onto the target
// tile, the cloud sits there alone for a moment, then (once the cinematic is over) it dissolves
// away to reveal the winner. These live here rather than in BoardGrid.tsx because the server has
// to hold the board locked for exactly as long as the client is still animating.
export const CLASH_JUMP_MS = 500;
/** How long the cloud sits alone on the board — no cinematic yet — so it reads as its own beat. */
export const CLASH_CLOUD_PREVIEW_MS = 1000;
/** How long after a fresh clash starts before its cinematic appears. */
export const CLASH_REVEAL_DELAY_MS = CLASH_JUMP_MS + CLASH_CLOUD_PREVIEW_MS;
/** The cloud's dissolve-to-winner, after the cinematic has finished. */
export const CLASH_DISSOLVE_MS = 400;

/**
 * Total lifetime of a decisive battle, from the move landing to the board being settled again:
 * the jump + cloud preview, then the full cinematic, then the cloud dissolving to the winner.
 * The server holds moves and the next turn's timer for exactly this long.
 *
 * Derived rather than hand-tuned: this was previously `FIGHT_SEQUENCE_MS + 900`, describing beats
 * that no longer existed, which left the server unlocking the board a full second before the
 * client had finished animating — long enough to click into the tail of someone else's fight.
 */
export const BATTLE_SEQUENCE_MS = CLASH_REVEAL_DELAY_MS + FIGHT_SEQUENCE_MS + CLASH_DISSOLVE_MS;

/**
 * How long the board is held after a king is taken, before the result screen replaces it.
 *
 * A king capture has no fight to play out — no cloud, no reveal — but it still has a move, and the
 * game used to end in the same broadcast that made it, so the winning soldier never appeared to go
 * anywhere at all. This is its jump, plus a beat to see it standing where the king was — long
 * enough now for the 1.32s fanfare on the capture to finish before the result screen replaces the
 * board, rather than being played over by the victory sting.
 */
export const KING_CAPTURE_SEQUENCE_MS = CLASH_JUMP_MS + 900;

// The client's trap sequence (BoardGrid: the attacker steps onto the tile while the trap dissolves
// under it and the pit opens → the attacker sinks in → the trap climbs back out). Defined here (not
// just in BoardGrid.tsx) so the server can hold the next turn's timer off until the whole sequence
// has actually finished playing — mirroring BATTLE_SEQUENCE_MS's own reasoning for battles.
//
// The trap's own fade is .piece-dissolving (0.4s in BoardGrid.css), which now runs inside the jump
// below rather than before it, so it needs no constant of its own here.
export const TRAP_ATTACKER_JUMP_MS = 500;
export const TRAP_ATTACKER_FALL_MS = 600;
/** How long the "you fell in a trap" banner stays up once the soldier has actually sunk into the
 *  hole. The banner used to open the sequence, announcing the trap before anything had happened;
 *  it now reports it afterwards, which needs its own beat at the end to be readable. */
export const TRAP_BANNER_MS = 1200;
/** The trap survives being sprung, so the hole has to close again: the figure rises back into its
 *  tile, wearing the same disguise it wore before, ready to be triggered again.
 *
 *  Carved out of TRAP_BANNER_MS rather than added after it, which keeps TRAP_SEQUENCE_MS — and so
 *  the server's board lock — exactly as long as it was. There is room: by the time the banner is
 *  up the hole has already been on screen for 1100ms, so it has long since read as empty. */
export const TRAP_RETURN_MS = 700;

/**
 * The whole trap beat, and what the server locks the board for.
 *
 * It used to open with a 1000ms hold on the untouched trap and a 400ms dissolve before the attacker
 * moved at all — so the first thing that happened after the tap was nothing, twice over. The
 * attacker now steps onto the tile immediately and the trap dissolves under it in the same beat,
 * taking 1400ms off the front: 3700ms down to 2300ms.
 */
export const TRAP_SEQUENCE_MS = TRAP_ATTACKER_JUMP_MS + TRAP_ATTACKER_FALL_MS + TRAP_BANNER_MS;

/** Row indices (inclusive) that belong to each team's placement zone. */
export const ZONE_ROWS: Record<'red' | 'blue', [number, number]> = {
  red: [0, 1],
  blue: [4, 5],
};

export const SOLDIER_COUNT = 12;
