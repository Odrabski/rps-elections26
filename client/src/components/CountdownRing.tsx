import { useCountdown } from '../hooks/useCountdown';
import './CountdownRing.css';

interface CountdownRingProps {
  deadline: number | null;
  totalSeconds: number;
  color: string;
  size?: number;
  urgentAt?: number;
}

export function CountdownRing({ deadline, totalSeconds, color, size = 64, urgentAt = 5 }: CountdownRingProps) {
  const secondsLeft = useCountdown(deadline);
  if (secondsLeft === null) return null;

  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const urgent = secondsLeft <= urgentAt;

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
      <span className="countdown-ring-number">{secondsLeft}</span>
    </div>
  );
}
