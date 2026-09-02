import { useEffect, useMemo, useRef } from 'react';
import type { Team } from 'shared';
import { HIDDEN_HEAD_POOL } from 'shared';
import { TEAM_THEME } from '../data/theme';
import './WinCelebration.css';

const HEAD_COUNT = 10;
const CONFETTI_COUNT = 46;
const FIREWORK_BURSTS = 5;
const FIREWORK_PARTICLES = 16;

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

function makeFloaters(team: Team): Floater[] {
  const pool = HIDDEN_HEAD_POOL[team];
  const width = window.innerWidth;
  const height = window.innerHeight;

  return Array.from({ length: HEAD_COUNT }, () => {
    const size = randomBetween(48, 124);
    return {
      asset: `/assets/pieces/${pool[Math.floor(Math.random() * pool.length)]}`,
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
 * Full-screen victory party for the winning side: their politicians' heads bounce around the
 * viewport like a DVD screensaver while confetti rains and fireworks burst behind everything.
 * Purely decorative — `pointer-events: none` throughout, so the rematch buttons underneath stay
 * clickable.
 */
export function WinCelebration({ winner }: { winner: Team }) {
  const floaters = useMemo(() => makeFloaters(winner), [winner]);
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
    <div className="celebration" aria-hidden="true">
      {Array.from({ length: FIREWORK_BURSTS }, (_, burst) => (
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

      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
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
