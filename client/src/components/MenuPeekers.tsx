import { useEffect, useState } from 'react';
import type { Team } from 'shared';
import { HIDDEN_BODY_ASSET, HIDDEN_HEAD_POOL } from 'shared';
import './MenuPeekers.css';

/** How long one of them is on screen, in and out included. */
const VISIBLE_MS = 2000;
const FIRST_DELAY_MS = 3500;
const GAP_MIN_MS = 7000;
const GAP_MAX_MS = 14000;

/**
 * Where one arrives from — all three rise out of the window's lower edge, at a corner or in the
 * middle.
 *
 * Horizontal entries from the left and right edges were tried and dropped. A whole figure needs a
 * steep tilt to read as leaning round a vertical edge, and at that angle it stops looking like a
 * lean and starts looking like someone lying down in the middle of the menu. The corner risers
 * below already arrive from the left and right; they just do it from the floor, where a modest
 * tilt is enough.
 */
type Side = 'bottom-left' | 'bottom-right' | 'bottom';

const SIDES: Side[] = ['bottom-left', 'bottom-right', 'bottom'];

interface Peeker {
  /** Remounts the element for each appearance, so the animation restarts rather than being skipped
   *  on the ones where the side and character happen to repeat. */
  key: number;
  head: string;
  team: Team;
  side: Side;
  /** Where along the edge they arrive: down the screen for the sides, across it for the bottom. */
  along: number;
}

function randomPeeker(key: number): Peeker {
  const team: Team = Math.random() < 0.5 ? 'blue' : 'red';
  const pool = HIDDEN_HEAD_POOL[team];
  const side = SIDES[Math.floor(Math.random() * SIDES.length)];
  return {
    key,
    head: pool[Math.floor(Math.random() * pool.length)],
    team,
    side,
    // Only the middle arrival needs placing: the corner ones hug their corner. Kept off the very
    // ends, where the copyright line sits.
    along: 22 + Math.random() * 46,
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
      style={peeker.side === 'bottom' ? { left: `${peeker.along}%` } : undefined}
      aria-hidden="true"
    >
      {/* The rise lives on its own element so the tilt can stay on the parent: a keyframe that
          sets `transform` replaces the whole value, and would drop the rotation on frame one. */}
      <div className="menu-peeker-rise">
        <div className="piece-view menu-peeker-figure">
          <img src={`/assets/pieces/${HIDDEN_BODY_ASSET[peeker.team]}`} alt="" className="piece-portrait" />
          <img src={`/assets/pieces/${peeker.head}`} alt="" className={`piece-mask piece-mask-${headId}`} />
        </div>
      </div>
    </div>
  );
}

const LOGO_VISIBLE_MS = 2200;
const LOGO_FIRST_MS = 6000;
const LOGO_GAP_MS = 10000;

/**
 * One more, rising from behind the logo so only a head clears its top edge.
 *
 * Nothing is clipped here either: this renders *under* the logo in the stacking order, so the logo
 * art itself hides everything below its own top edge. It has to live inside .home-card-wrap, which
 * is what the logo is positioned against.
 */
export function LogoPeeker() {
  const [peeker, setPeeker] = useState<Peeker | null>(null);

  useEffect(() => {
    let n = 0;
    let hide: ReturnType<typeof setTimeout>;
    const tick = () => {
      const team: Team = Math.random() < 0.5 ? 'blue' : 'red';
      const pool = HIDDEN_HEAD_POOL[team];
      setPeeker({
        key: ++n,
        head: pool[Math.floor(Math.random() * pool.length)],
        team,
        side: 'bottom',
        // Across the middle of the logo, skipping dead centre where the crown sits. Kept well off
        // the ends: out near the edges a head has no logo behind it to rise from.
        along: Math.random() < 0.5 ? 32 + Math.random() * 12 : 56 + Math.random() * 12,
      });
      hide = setTimeout(() => setPeeker(null), LOGO_VISIBLE_MS);
    };
    const first = setTimeout(tick, LOGO_FIRST_MS);
    const every = setInterval(tick, LOGO_GAP_MS);
    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearInterval(every);
    };
  }, []);

  if (!peeker) return null;
  const headId = peeker.head.replace(/\.\w+$/, '');

  return (
    <div className="logo-peeker" style={{ left: `${peeker.along}%` }} aria-hidden="true">
      <div key={peeker.key} className="logo-peeker-rise">
        <div className="piece-view menu-peeker-figure">
          <img src={`/assets/pieces/${HIDDEN_BODY_ASSET[peeker.team]}`} alt="" className="piece-portrait" />
          <img src={`/assets/pieces/${peeker.head}`} alt="" className={`piece-mask piece-mask-${headId}`} />
        </div>
      </div>
    </div>
  );
}
