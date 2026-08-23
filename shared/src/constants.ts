export const BOARD_ROWS = 6;
export const BOARD_COLS = 7;

export const SETUP_SECONDS = 60;
export const TURN_SECONDS = 20;
export const TIE_BREAK_SECONDS = 15;

/** Row indices (inclusive) that belong to each team's placement zone. */
export const ZONE_ROWS: Record<'red' | 'blue', [number, number]> = {
  red: [0, 1],
  blue: [4, 5],
};

export const SOLDIER_COUNT = 12;
