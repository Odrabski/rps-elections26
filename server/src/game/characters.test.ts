import { describe, expect, it } from 'vitest';
import { SOLDIER_COUNT, balancedHandPool } from 'shared';

describe('balancedHandPool', () => {
  it('is a balanced 4 rock / 4 paper / 4 scissors pool', () => {
    const pool = balancedHandPool();
    expect(pool).toHaveLength(SOLDIER_COUNT);
    expect(pool.filter((h) => h === 'rock')).toHaveLength(4);
    expect(pool.filter((h) => h === 'paper')).toHaveLength(4);
    expect(pool.filter((h) => h === 'scissors')).toHaveLength(4);
  });
});
