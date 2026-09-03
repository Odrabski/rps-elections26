import { useEffect, useMemo, useRef } from 'react';
import type { Team } from 'shared';
import { HIDDEN_HEAD_POOL } from 'shared';
import { TEAM_THEME } from '../data/theme';
import './GameOverEffects.css';

const CONFETTI_COUNT = 46;
const FIREWORK_BURSTS = 5;
const FIREWORK_PARTICLES = 16;
const EMBER_COUNT = 28;
/** Two overlapping rows — a bigger, dimmer one behind a sharper one — so the rubble reads as a
 * heap with depth rather than a flat row of pebbles along the edge. */
const ROCKS_PER_ROW = 16;
const EMBER_COLORS = ['#ff8a2b', '#ffc247', '#ff5722', '#ffdf7e'];

interface RockStyle extends React.CSSProperties {
  left: string;
  width: string;
  height: string;
  clipPath: string;
  transform: string;
  background: string;
}

/** Warm greys, so the pile sits in the scene's light rather than reading as flat slate. */
const ROCK_TONES: Array<[string, string, string]> = [
  ['#a8998a', '#6f645a', '#332e29'],
  ['#94867a', '#5e554d', '#2b2724'],
  ['#b3a596', '#7d7166', '#3b3630'],
  ['#877b70', '#564f48', '#242120'],
];

/**
 * A rock silhouette: points walked around a circle at jittered radii and cut out with clip-path.
 * Rounded corners were the obvious way to do this and made grey clouds — a boulder needs flat
 * faces meeting at angles, and only a polygon gives that.
 */
function rockPolygon(): string {
  const points = Math.floor(randomBetween(7, 10));
  const coords: string[] = [];
  for (let i = 0; i < points; i++) {
    // Uneven angular steps as well as uneven radii, or the facets come out suspiciously regular.
    const angle = (i / points) * Math.PI * 2 + randomBetween(-0.18, 0.18);
    const radius = randomBetween(0.68, 1);
    coords.push(
      `${(50 + Math.cos(angle) * radius * 50).toFixed(1)}% ${(50 + Math.sin(angle) * radius * 50).toFixed(1)}%`,
    );
  }
  return `polygon(${coords.join(', ')})`;
}

/**
 * Four heaps of boulders: a bigger, dimmer row behind a sharper one, piled along the bottom edge
 * and again mirrored down from the top.
 *
 * Each stone is lit from the upper left and rotated a little, and they sit partly below the edge
 * they're piled against and overlap each other heavily — that overlap is what makes a heap out of
 * what would otherwise be a row of pebbles.
 */
function makeRockRows(): Array<{ edge: 'bottom' | 'top'; row: 'back' | 'front'; rocks: RockStyle[] }> {
  const rows: Array<{ edge: 'bottom' | 'top'; row: 'back' | 'front'; rocks: RockStyle[] }> = [];
  for (const edge of ['bottom', 'top'] as const) {
    for (const row of ['back', 'front'] as const) {
      const big = row === 'back';
      rows.push({
        edge,
        row,
        rocks: Array.from({ length: ROCKS_PER_ROW }, (_, i) => {
          const [light, mid, dark] = ROCK_TONES[Math.floor(Math.random() * ROCK_TONES.length)];
          // A few boulders per row run much larger than the rest, so the heap has a silhouette
          // instead of a uniform crust.
          const scale = Math.random() < 0.28 ? randomBetween(1.35, 1.85) : randomBetween(0.72, 1.1);
          return {
            left: `${(100 / ROCKS_PER_ROW) * i + randomBetween(-6, 6)}%`,
            width: `${(randomBetween(big ? 84 : 62, big ? 128 : 96) * scale).toFixed(0)}px`,
            height: `${(randomBetween(big ? 62 : 46, big ? 96 : 74) * scale).toFixed(0)}px`,
            clipPath: rockPolygon(),
            transform: `translateY(${randomBetween(14, 46).toFixed(0)}%) rotate(${randomBetween(-28, 28).toFixed(1)}deg)`,
            background: `radial-gradient(ellipse 74% 72% at 32% 24%, ${light} 0%, ${mid} 42%, ${dark} 100%)`,
          };
        }),
      });
    }
  }
  return rows;
}

/** One DVD-screensaver-style head: drifts in a straight line, spins, and reverses off each edge. */
interface Floater {
  asset: string;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * One floater per head in the winning team's pool — the whole bloc turns up, each face exactly
 * once. This used to draw ten at random with replacement, which both left some of the winners out
 * and doubled others up.
 */
function makeFloaters(team: Team): Floater[] {
  const pool = HIDDEN_HEAD_POOL[team];
  const width = window.innerWidth;
  const height = window.innerHeight;

  return pool.map((head) => {
    const size = randomBetween(48, 124);
    return {
      asset: `/assets/pieces/${head}`,
      size,
      x: randomBetween(0, Math.max(0, width - size)),
      y: randomBetween(0, Math.max(0, height - size)),
      // Deliberately never axis-aligned, so they actually traverse the screen rather than
      // ping-ponging along a single edge.
      vx: randomBetween(0.9, 2.4) * (Math.random() < 0.5 ? -1 : 1),
      vy: randomBetween(0.9, 2.4) * (Math.random() < 0.5 ? -1 : 1),
      rot: randomBetween(0, 360),
      vr: randomBetween(0.7, 3.2) * (Math.random() < 0.5 ? -1 : 1),
    };
  });
}

/**
 * The full-screen scene behind the game-over panel. The winning side's politicians bounce around
 * the viewport like a DVD screensaver either way; what changes is everything else — a win throws
 * confetti and fireworks, a loss sets the place on fire. Purely decorative: `pointer-events: none`
 * throughout, so the rematch buttons underneath stay clickable.
 */
export function GameOverEffects({ winner, won }: { winner: Team; won: boolean }) {
  const floaters = useMemo(() => makeFloaters(winner), [winner]);
  // Built once — rolled inline in the render, every re-render would reshuffle the whole heap.
  const rockRows = useMemo(() => (won ? [] : makeRockRows()), [won]);
  const nodesRef = useRef<(HTMLImageElement | null)[]>([]);
  const theme = TEAM_THEME[winner];

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      // Normalized to 60fps-equivalent frames and clamped, so a dropped frame (or a tab that was
      // backgrounded for a while) nudges the heads along instead of teleporting them off-screen.
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;

      const width = window.innerWidth;
      const height = window.innerHeight;

      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;

        const maxX = Math.max(0, width - f.size);
        const maxY = Math.max(0, height - f.size);
        if (f.x <= 0) {
          f.x = 0;
          f.vx = Math.abs(f.vx);
        } else if (f.x >= maxX) {
          f.x = maxX;
          f.vx = -Math.abs(f.vx);
        }
        if (f.y <= 0) {
          f.y = 0;
          f.vy = Math.abs(f.vy);
        } else if (f.y >= maxY) {
          f.y = maxY;
          f.vy = -Math.abs(f.vy);
        }

        const node = nodesRef.current[i];
        if (node) node.style.transform = `translate3d(${f.x}px, ${f.y}px, 0) rotate(${f.rot}deg)`;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [floaters]);

  const confettiColors = [theme.solid, theme.border, '#d4af37', '#ffffff', '#f59e0b'];

  return (
    <div className={`celebration${won ? '' : ' celebration-lose'}`} aria-hidden="true">
      {won &&
        Array.from({ length: FIREWORK_BURSTS }, (_, burst) => (
        <div
          key={`burst-${burst}`}
          className="celebration-firework"
          style={{
            // Kept up in the "sky", clear of the result panel that sits in the middle of the
            // screen — bursts behind it are just invisible work.
            left: `${randomBetween(14, 86)}%`,
            top: `${randomBetween(8, 30)}%`,
            animationDelay: `${burst * 0.9}s`,
          }}
        >
          {Array.from({ length: FIREWORK_PARTICLES }, (_, particle) => (
            <span
              key={particle}
              className="celebration-spark"
              style={
                {
                  '--spark-angle': `${(360 / FIREWORK_PARTICLES) * particle}deg`,
                  '--spark-distance': `${randomBetween(70, 165)}px`,
                  // `color` drives the CSS glow (box-shadow: currentColor) as well as the dot.
                  color: confettiColors[particle % confettiColors.length],
                  background: 'currentColor',
                  animationDelay: `${burst * 0.9}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}

      {won &&
        Array.from({ length: CONFETTI_COUNT }, (_, i) => (
          <span
            key={`confetti-${i}`}
            className="celebration-confetti"
            style={{
              left: `${randomBetween(0, 100)}%`,
              background: confettiColors[i % confettiColors.length],
              animationDelay: `${randomBetween(0, 3.5)}s`,
              animationDuration: `${randomBetween(2.6, 5.2)}s`,
              width: `${randomBetween(5, 11)}px`,
              height: `${randomBetween(9, 18)}px`,
            }}
          />
        ))}

      {!won &&
        Array.from({ length: EMBER_COUNT }, (_, i) => {
          const size = randomBetween(4, 9);
          return (
            <span
              key={`ember-${i}`}
              className="celebration-ember"
              style={
                {
                  left: `${randomBetween(0, 100)}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  // Drives both the dot and its glow (box-shadow: currentColor), same trick the
                  // firework sparks use.
                  color: EMBER_COLORS[i % EMBER_COLORS.length],
                  background: 'currentColor',
                  // Without a sideways term they rise in dead-straight columns.
                  '--ember-drift': `${randomBetween(-40, 40)}px`,
                  animationDelay: `${randomBetween(0, 4)}s`,
                  animationDuration: `${randomBetween(3.4, 6.5)}s`,
                } as React.CSSProperties
              }
            />
          );
        })}

      {!won &&
        rockRows.map(({ edge, row, rocks }) => (
          <div
            key={`${edge}-${row}`}
            className={`celebration-rubble celebration-rubble-${edge} celebration-rubble-${row}`}
          >
            {rocks.map((rock, i) => (
              <span key={i} className="celebration-rock" style={rock} />
            ))}
          </div>
        ))}

      {floaters.map((f, i) => (
        <img
          key={`head-${i}`}
          ref={(node) => {
            nodesRef.current[i] = node;
          }}
          src={f.asset}
          alt=""
          className="celebration-head"
          style={{
            width: `${f.size}px`,
            height: `${f.size}px`,
            transform: `translate3d(${f.x}px, ${f.y}px, 0) rotate(${f.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
