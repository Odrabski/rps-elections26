import type { CSSProperties } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import './CountdownRing.css';

interface CountdownRingProps {
  deadline: number | null;
  totalSeconds: number;
  color: string;
  size?: number;
  urgentAt?: number;
  /** Lets a larger ring (e.g. GameBoard's own, doubled in size) use a lighter digit weight than
   * the default — a heavy weight that reads fine small looks clunky blown up. */
  numberWeight?: number;
  /** Overrides the digit's font-size — otherwise it just inherits whatever size is ambient where
   * the ring is rendered, which doesn't automatically scale with a bigger `size`. */
  numberSize?: string;
  /** Shown (with the ring held at a full, resting arc) instead of unmounting entirely whenever
   * `deadline` is null — e.g. GameBoard passes "FIGHT!" so the ring stays visible instead of
   * disappearing for the whole battle/trap/tie-break cinematic while there's no active countdown. */
  fallbackLabel?: string;
}

export function CountdownRing({
  deadline,
  totalSeconds,
  color,
  size = 64,
  urgentAt = 5,
  numberWeight,
  numberSize,
  fallbackLabel,
}: CountdownRingProps) {
  const secondsLeft = useCountdown(deadline);
  if (secondsLeft === null && !fallbackLabel) return null;

  const fighting = secondsLeft === null;
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const fraction = fighting ? 1 : Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const urgent = !fighting && secondsLeft <= urgentAt;
  const numberStyle: CSSProperties = { fontFamily: 'var(--sans)' };
  if (numberWeight) numberStyle.fontWeight = numberWeight;
  if (numberSize) numberStyle.fontSize = fighting ? `calc(${numberSize} * 0.42)` : numberSize;

  return (
    <div className={`countdown-ring${urgent ? ' countdown-ring-urgent' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="countdown-ring-track" cx={size / 2} cy={size / 2} r={radius} />
        <circle
          className="countdown-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={urgent ? 'var(--danger)' : color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="countdown-ring-number" style={numberStyle}>
        {fighting ? fallbackLabel : secondsLeft}
      </span>
    </div>
  );
}
