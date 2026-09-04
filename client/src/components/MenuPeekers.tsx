import { useEffect, useState } from 'react';
import type { Team } from 'shared';
import { HIDDEN_BODY_ASSET, HIDDEN_HEAD_POOL } from 'shared';
import './MenuPeekers.css';

/** How long one of them is on screen, in and out included. */
const VISIBLE_MS = 2000;
const FIRST_DELAY_MS = 3500;
const GAP_MIN_MS = 7000;
const GAP_MAX_MS = 14000;

interface Peeker {
  /** Remounts the element for each appearance, so the animation restarts rather than being skipped
   *  on the ones where the side and character happen to repeat. */
  key: number;
  head: string;
  team: Team;
  side: 'left' | 'right';
  /** Where down the screen they lean in, kept clear of the logo at the top. */
  top: number;
}

function randomPeeker(key: number): Peeker {
  const team: Team = Math.random() < 0.5 ? 'blue' : 'red';
  const pool = HIDDEN_HEAD_POOL[team];
  return {
    key,
    head: pool[Math.floor(Math.random() * pool.length)],
    team,
    side: Math.random() < 0.5 ? 'left' : 'right',
    top: 38 + Math.random() * 34,
  };
}

/**
 * Someone leans in from the edge of the menu every so often, for two seconds, and goes again.
 *
 * The head is layered on the headless body with the board's own .piece-mask classes, so every
 * per-portrait nudge already tuned in PieceView.css — the widths, the shifts, Gafni's rotation —
 * applies here too rather than being redone.
 */
export function MenuPeekers() {
  const [peeker, setPeeker] = useState<Peeker | null>(null);

  useEffect(() => {
    let n = 0;
    let hide: ReturnType<typeof setTimeout>;
    let next: ReturnType<typeof setTimeout>;

    const appear = () => {
      setPeeker(randomPeeker(++n));
      hide = setTimeout(() => setPeeker(null), VISIBLE_MS);
      next = setTimeout(appear, VISIBLE_MS + GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS));
    };

    const first = setTimeout(appear, FIRST_DELAY_MS);
    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearTimeout(next);
    };
  }, []);

  if (!peeker) return null;
  const headId = peeker.head.replace(/\.\w+$/, '');

  return (
    <div
      key={peeker.key}
      className={`menu-peeker menu-peeker-${peeker.side}`}
      style={{ top: `${peeker.top}%` }}
      aria-hidden="true"
    >
      <div className="piece-view menu-peeker-figure">
        <img src={`/assets/pieces/${HIDDEN_BODY_ASSET[peeker.team]}`} alt="" className="piece-portrait" />
        <img src={`/assets/pieces/${peeker.head}`} alt="" className={`piece-mask piece-mask-${headId}`} />
      </div>
    </div>
  );
}
