import { useState } from 'react';
import { HowToPlayModal } from './HowToPlayModal';
import './HowToPlayButton.css';

interface HowToPlayButtonProps {
  /**
   * Drops the words and keeps the circled "?".
   *
   * During setup there is room to spell it out, and a first-time player is exactly the person who
   * needs to be told the rules exist. Once the board is live the same button would be a label
   * sitting over the game for the whole match, so it shrinks to the mark — still there, no longer
   * talking.
   */
  compact?: boolean;
}

/** The bottom-left way into the rules, mirroring ExitButton on the opposite corner. */
export function HowToPlayButton({ compact = false }: HowToPlayButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`howto-link${compact ? ' howto-link-compact' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="איך משחקים?"
      >
        <span className="howto-mark" aria-hidden="true">
          ?
        </span>
        {!compact && 'איך משחקים?'}
      </button>

      {open && <HowToPlayModal onClose={() => setOpen(false)} />}
    </>
  );
}
