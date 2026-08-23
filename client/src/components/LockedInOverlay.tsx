import type { ReactNode } from 'react';
import './LockedInOverlay.css';

interface LockedInOverlayProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function LockedInOverlay({ title, subtitle, children }: LockedInOverlayProps) {
  return (
    <div className="locked-in-overlay">
      <div className="locked-in-card panel">
        <h2>{title}</h2>
        {subtitle && <p className="locked-in-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
