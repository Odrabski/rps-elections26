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
import { HowToPlayModal } from './HowToPlayModal';
import { play } from '../utils/sfx';
import './SetupScreen.css';

interface SetupScreenProps {
  view: ClientGameView;
  team: Team;
  onPlaceSpecial: (piece: 'king' | 'trap', position: Position) => void;
  onShuffle: () => void;
  onReady: () => void;
  onExit: () => void;
}

const PULSE_DURATION_MS = 700;

export function SetupScreen({ view, team, onPlaceSpecial, onShuffle, onReady, onExit }: SetupScreenProps) {
  const theme = TEAM_THEME[team];
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const isReady = view.readiness[team];
  const [zoneStart, zoneEnd] = ZONE_ROWS[team];
  const [pulsePosition, setPulsePosition] = useState<Position | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
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
                {step === 'king' && '👑 איפה נחביא את המלך?'}
                {step === 'trap' && '🪤 ואיפה תהיה המלכודת?'}
              </>
            )}
          </div>
        )}

        {!isReady && step === 'ready' && (
          <div className="setup-onboard-buttons">
            <button type="button" className="btn-primary setup-btn-onboard setup-btn-onboard-start" onClick={onReady}>
              להתחיל לשחק
            </button>
            <button type="button" className="btn-secondary setup-btn-onboard setup-btn-onboard-shuffle"
              onClick={() => {
                play('setup.shuffle');
                onShuffle();
              }}>
              ערבוב כלי נשק
            </button>
          </div>
        )}
      </div>

      {/* The setup screen's answer to GameBoard's "התור שלך" pill: same class, same slot, same
          size, so the board and score-header still land at the exact same y on both screens — it
          used to be an invisible spacer holding that space open, and now it holds something worth
          reading. `.turn-pill` lives in GameBoard.css, which is always in the bundle (App imports
          GameBoard statically), so it needs no import here. */}
      <div className="turn-pill setup-turn-pill" style={{ background: theme.solid }}>
        שלב סידור הלוח
      </div>

      <button type="button" className="setup-howto-link" onClick={() => setShowHowTo(true)}>
        <span className="setup-howto-mark" aria-hidden="true">?</span>
        איך משחקים?
      </button>

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

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
