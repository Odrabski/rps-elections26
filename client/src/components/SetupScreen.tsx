import { useEffect, useState } from 'react';
import { SETUP_SECONDS, ZONE_ROWS } from 'shared';
import type { ClientGameView, Position, Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { gameSeed } from '../data/characterAssets';
import { CountdownRing } from './CountdownRing';
import { ExitButton } from './ExitButton';
import { ScoreHeader } from './ScoreHeader';
import { LockedInOverlay } from './LockedInOverlay';
import { BoardGrid } from './BoardGrid';
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
    if (window.confirm('לצאת מהמשחק? המשחק יימשך בלעדיכם.')) onExit();
  };

  /** A tile can take the next designation only if it's your own piece and still unassigned. */
  const isDesignatable = (actual: Position): boolean => {
    if (isReady || step === 'ready') return false;
    if (actual.row < zoneStart || actual.row > zoneEnd) return false;
    const occupant = ownPieces.find((p) => p.position.row === actual.row && p.position.col === actual.col);
    return occupant?.kind === 'unassigned';
  };

  const handleTileClick = (actual: Position) => {
    if (step === 'ready' || !isDesignatable(actual)) return;
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
          isClickable={isDesignatable}
          isLegalTarget={isDesignatable}
          onTileClick={handleTileClick}
          pulsePosition={pulsePosition}
        />

        {!isReady && step !== 'ready' && (
          <div className="setup-onboard-banner" style={{ borderColor: theme.border, color: theme.text }}>
            {step === 'king' && '👑 בחרו מלך'}
            {step === 'trap' && '🪤 בחרו מלכודת'}
          </div>
        )}

        {!isReady && step === 'ready' && (
          <div className="setup-onboard-buttons">
            <button type="button" className="btn-primary setup-btn-onboard setup-btn-onboard-start" onClick={onReady}>
              להתחיל לשחק
            </button>
            <button type="button" className="btn-secondary setup-btn-onboard setup-btn-onboard-shuffle" onClick={onShuffle}>
              ערבוב כלי נשק
            </button>
          </div>
        )}
      </div>

      {/* Same height as GameBoard's .turn-pill — an invisible stand-in, in the same slot the pill
          occupies there, so this screen's flex flow has the exact same total height and ordering.
          That's what makes the board and score-header land at the exact same y on both screens
          once each gets the same extra translateY (see SetupScreen.css). */}
      <div className="setup-turn-pill-spacer" aria-hidden="true" />

      {isReady && (
        <LockedInOverlay subtitle="עכשיו, מחכים לצד השני...">
          {!view.readiness[opponent] && (
            <CountdownRing deadline={view.setupDeadline} totalSeconds={SETUP_SECONDS} color={theme.solid} size={56} />
          )}
          <p className="locked-in-hint">
            {view.readiness[opponent] ? 'שני הצדדים מוכנים, המשחק מתחיל...' : 'ברגע שהצד השני מסיים להתארגן נתחיל'}
          </p>
        </LockedInOverlay>
      )}
    </div>
  );
}
