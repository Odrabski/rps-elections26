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
const FIGHT_REVEAL_MS = 4100;
/** A tie has no reveal screen of its own — the weapon picker itself is the "reveal", so the
 * cinematic ends the instant the clash-cloud beat finishes. */
export const TIE_REVEAL_MS = 0;

/** Total lifetime of the cinematic for a decisive battle. */
export const FIGHT_SEQUENCE_MS = FIGHT_BUILD_UP_MS + FIGHT_REVEAL_MS;
/** Total lifetime of the cinematic for a tie (same build-up, shorter reveal). */
export const TIE_SEQUENCE_MS = FIGHT_BUILD_UP_MS + TIE_REVEAL_MS;

/** Total lifetime of a decisive battle's on-board resolution (BoardGrid: hold for the cinematic
 * above, then loser dissolves, then winner jumps into the captured tile). Must match BoardGrid's
 * own loser-dissolve/winner-jump beat constants (400ms + 500ms) — kept here too so the server can
 * hold the next turn's timer off until the "winning window" has actually finished playing. */
export const BATTLE_SEQUENCE_MS = FIGHT_SEQUENCE_MS + 900;

// The client's trap sequence (BoardGrid: warning banner → trap dissolves → attacker jumps onto
// the hole → attacker sinks and vanishes). Defined here (not just in BoardGrid.tsx) so the server
// can hold the next turn's timer off until the whole sequence has actually finished playing —
// mirroring BATTLE_SEQUENCE_MS's own reasoning for battles.
export const TRAP_WARNING_MS = 1000;
export const TRAP_DISSOLVE_MS = 400;
export const TRAP_ATTACKER_JUMP_MS = 500;
export const TRAP_ATTACKER_FALL_MS = 600;
export const TRAP_SEQUENCE_MS = TRAP_WARNING_MS + TRAP_DISSOLVE_MS + TRAP_ATTACKER_JUMP_MS + TRAP_ATTACKER_FALL_MS;

/** Row indices (inclusive) that belong to each team's placement zone. */
export const ZONE_ROWS: Record<'red' | 'blue', [number, number]> = {
  red: [0, 1],
  blue: [4, 5],
};

export const SOLDIER_COUNT = 12;
