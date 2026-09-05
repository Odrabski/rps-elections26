import { useEffect, useRef, useState } from 'react';
import { SETUP_SECONDS, ZONE_ROWS } from 'shared';
import type { ClientGameView, Position, Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { gameSeed } from '../data/characterAssets';
import { CountdownRing } from './CountdownRing';
import { ExitButton } from './ExitButton';
import { ScoreHeader } from './ScoreHeader';
import { LockedInOverlay } from './LockedInOverlay';
import { BoardGrid } from './BoardGrid';
import { HowToPlayButton } from './HowToPlayButton';
import { play } from '../utils/sfx';
import './SetupScreen.css';

interface SetupScreenProps {
  view: ClientGameView;
  team: Team;
  onPlaceSpecial: (piece: 'king' | 'trap', position: Position) => void;
  onShuffle: () => void;
  onReset: () => void;
  onReady: () => void;
  onExit: () => void;
}

const PULSE_DURATION_MS = 700;

export function SetupScreen({ view, team, onPlaceSpecial, onShuffle, onReset, onReady, onExit }: SetupScreenProps) {
  const theme = TEAM_THEME[team];
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const isReady = view.readiness[team];
  const [zoneStart, zoneEnd] = ZONE_ROWS[team];
  const [pulsePosition, setPulsePosition] = useState<Position | null>(null);
  const seed = gameSeed(view);

  const ownPieces = view.pieces.filter((p) => p.team === team);
  const ownKing = ownPieces.find((p) => p.kind === 'king');
  const ownTrap = ownPieces.find((p) => p.kind === 'trap');
  const step: 'king' | 'trap' | 'ready' = !ownKing ? 'king' : !ownTrap ? 'trap' : 'ready';

  useEffect(() => {
    if (!pulsePosition) return;
    const timer = setTimeout(() => setPulsePosition(null), PULSE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pulsePosition]);

  const handleExit = () => {
    if (window.confirm('לפרוש מהחיים הפוליטיים?')) onExit();
  };

  /** A tile can take the next designation only if it's your own piece and still unassigned. */
  const isDesignatable = (actual: Position): boolean => {
    if (isReady || step === 'ready') return false;
    if (actual.row < zoneStart || actual.row > zoneEnd) return false;
    const occupant = ownPieces.find((p) => p.position.row === actual.row && p.position.col === actual.col);
    return occupant?.kind === 'unassigned';
  };

  /** A tile holding one of the other side's pieces. Not designatable, but worth a word back —
   *  a silent no-op reads as the game being broken rather than as the tap being wrong. */
  const isOpponentTile = (actual: Position): boolean =>
    view.pieces.some(
      (p) => p.team !== team && p.alive && p.position.row === actual.row && p.position.col === actual.col,
    );

  const [misclick, setMisclick] = useState(false);
  const misclickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (misclickTimer.current) clearTimeout(misclickTimer.current); }, []);

  const handleTileClick = (actual: Position) => {
    if (step === 'ready') return;

    if (!isDesignatable(actual)) {
      if (!isOpponentTile(actual)) return;
      play('setup.wrong-side');
      setMisclick(true);
      if (misclickTimer.current) clearTimeout(misclickTimer.current);
      misclickTimer.current = setTimeout(() => setMisclick(false), 2600);
      return;
    }

    setMisclick(false);
    play(step === 'king' ? 'setup.king' : 'setup.trap');
    onPlaceSpecial(step, actual);
    setPulsePosition(actual);
  };

  return (
    <div className="setup-screen">
      <ScoreHeader
        team={team}
        pieces={view.pieces}
        center={
          <CountdownRing
            deadline={view.setupDeadline}
            totalSeconds={SETUP_SECONDS}
            color={theme.solid}
            size={88}
            numberWeight={500}
            numberSize="2.4rem"
          />
        }
      />
      <ExitButton onClick={handleExit} />

      <div className="setup-board-area">
        <BoardGrid
          team={team}
          seed={seed}
          getPieceAt={(actual) => view.pieces.find((p) => p.position.row === actual.row && p.position.col === actual.col)}
          isClickable={(actual) => isDesignatable(actual) || isOpponentTile(actual)}
          isLegalTarget={isDesignatable}
          onTileClick={handleTileClick}
          pulsePosition={pulsePosition}
        />

        {!isReady && step !== 'ready' && (
          <div
            className={`setup-onboard-banner${misclick ? ' setup-onboard-banner-warn' : ''}`}
            // The team colours are dropped while correcting, so the warn class's own red isn't
            // fighting an inline style it can't override.
            style={misclick ? undefined : { borderColor: theme.border, color: theme.text }}
          >
            {misclick ? (
              '⚠️ הלו, צריך לבחור מתוך האנשים שלך כאן למטה ולא מהצד השני'
            ) : (
              <>
                {step === 'king' && '👑 בחרו את המלך'}
                {step === 'trap' && '🪤 בחרו את המלכודת'}
              </>
            )}
          </div>
        )}

        {!isReady && step === 'ready' && (
          <div className="setup-onboard-buttons">
            <button type="button" className="btn-primary setup-btn-onboard setup-btn-onboard-start" onClick={onReady}>
              {/* Stroke-only on currentColor, which on .btn-primary is the near-black #1a1a2e. */}
              <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6.2 18.5 12 9 17.8Z" />
              </svg>
              <span>להתחיל לשחק</span>
            </button>
            <button type="button" className="btn-secondary setup-btn-onboard setup-btn-onboard-shuffle"
              onClick={() => {
                play('setup.shuffle');
                onShuffle();
              }}>
              {/* Two paths crossing, with their arrowheads kept separate so a stroke join can't
                  pull the heads out of shape at this size. */}
              <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h3.6l10 12H21M3 18h3.6l2.7-3.2M14.4 9.2 16.6 6H21" />
                <path d="m18.4 3.4 2.6 2.6-2.6 2.6M18.4 15.4l2.6 2.6-2.6 2.6" />
              </svg>
              <span>ערבוב כלי נשק</span>
            </button>
            {/* Hands every piece back its blank slate, so the King and Trap can be picked again.
                No confirmation: nothing is lost that a second tap can't redo, and the whole point
                is that it's quicker than restarting. `step` reads off view.pieces, so the banner
                goes back to asking for the King on its own once the new state lands. */}
            <button type="button" className="btn-secondary setup-btn-onboard setup-btn-onboard-reset"
              onClick={() => {
                play('ui.tap');
                setMisclick(false);
                setPulsePosition(null);
                onReset();
              }}>
              {/* An arc left open at the top right, with the arrowhead closing it — the usual
                  "start over" glyph. */}
              <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.5 12a8.5 8.5 0 1 1-2.9-6.4" />
                <path d="M20.6 3.6V9h-5.4" />
              </svg>
              <span>איפוס</span>
            </button>
          </div>
        )}
      </div>

      {/* Sits in the slot the game board keeps empty, at the same size, so the board and
          score-header still land at the exact same y on both screens — it
          used to be an invisible spacer holding that space open, and now it holds something worth
          reading. `.phase-pill` lives in GameBoard.css, which is always in the bundle (App imports
          GameBoard statically), so it needs no import here. */}
      <div className="phase-pill setup-phase-pill" style={{ background: theme.solid }}>
        {/* Names the phase, and only that. The instruction for the current step is the banner's
            job (👑 בחרו את המלך / 🪤 ...) — having both say it left two elements telling you the
            same thing at once. This is the counterpart to GameBoard's "התור שלך", which also
            reports where you are rather than what to press. */}
        שלב סידור הלוח
      </div>

      <HowToPlayButton />

      {isReady && (
        <LockedInOverlay subtitle="עכשיו, מחכים לצד השני...">
          {!view.readiness[opponent] && (
            <CountdownRing deadline={view.setupDeadline} totalSeconds={SETUP_SECONDS} color={theme.solid} size={56} />
          )}
          <p className="locked-in-hint">
            {view.readiness[opponent] ? 'שני הצדדים מוכנים, המשחק מתחיל...' : 'ברגע שהצד השני יסיים להתארגן נתחיל'}
          </p>
        </LockedInOverlay>
      )}
    </div>
  );
}
