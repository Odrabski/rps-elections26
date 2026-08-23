import { SETUP_SECONDS, ZONE_ROWS } from 'shared';
import type { ClientGameView, Position, Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { hiddenPieceAsset } from '../data/characterAssets';
import { CountdownRing } from './CountdownRing';
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

const TOTAL_ZONE_PIECES = 14;

export function SetupScreen({ view, team, onPlaceSpecial, onShuffle, onReady, onExit }: SetupScreenProps) {
  const theme = TEAM_THEME[team];
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const isReady = view.readiness[team];
  const [zoneStart, zoneEnd] = ZONE_ROWS[team];

  const ownPieces = view.pieces.filter((p) => p.team === team);
  const ownKing = ownPieces.find((p) => p.kind === 'king');
  const ownTrap = ownPieces.find((p) => p.kind === 'trap');
  const step: 'king' | 'trap' | 'ready' = !ownKing ? 'king' : !ownTrap ? 'trap' : 'ready';
  const benchCount = Math.max(0, TOTAL_ZONE_PIECES - ownPieces.length);

  const handleExit = () => {
    if (window.confirm('לצאת מהמשחק? המשחק יימשך בלעדיכם.')) onExit();
  };

  const handleTileClick = (actual: Position) => {
    if (isReady || step === 'ready') return;
    const inOwnZone = actual.row >= zoneStart && actual.row <= zoneEnd;
    if (!inOwnZone) return;
    onPlaceSpecial(step, actual);
  };

  return (
    <div className="setup-screen">
      <button type="button" className="exit-btn" onClick={handleExit} aria-label="עזוב משחק">
        🚪
      </button>

      <header className="setup-header">
        <div className="setup-team-badge" style={{ color: theme.text, background: theme.bg, borderColor: theme.border }}>
          משחק בתור {theme.label}
        </div>
        <CountdownRing deadline={view.setupDeadline} totalSeconds={SETUP_SECONDS} color={theme.solid} size={56} />
      </header>

      {step !== 'ready' && !isReady && (
        <div className="setup-step-banner" style={{ borderColor: theme.border, color: theme.text }}>
          {step === 'king' ? '👑 בחרו מלך' : '🪤 בחרו מלכודת'}
        </div>
      )}

      <BoardGrid
        team={team}
        getPieceAt={(actual) => ownPieces.find((p) => p.position.row === actual.row && p.position.col === actual.col)}
        isClickable={(actual) => !isReady && step !== 'ready' && actual.row >= zoneStart && actual.row <= zoneEnd}
        isLegalTarget={(actual) => !isReady && step !== 'ready' && actual.row >= zoneStart && actual.row <= zoneEnd}
        onTileClick={handleTileClick}
      />

      {benchCount > 0 && (
        <div className="soldier-bench" aria-hidden="true">
          {Array.from({ length: benchCount }, (_, i) => (
            <img key={i} src={hiddenPieceAsset(team)} alt="" className="soldier-bench-icon" />
          ))}
        </div>
      )}

      {step === 'ready' && !isReady && (
        <div className="setup-controls panel">
          <p className="setup-instructions">אפשר לערבב לוחמים או ללחוץ אני מוכן</p>
          <div className="setup-button-row">
            <button type="button" className="btn-secondary" onClick={onShuffle}>
              🔀 ערבב לוחמים
            </button>
            <button type="button" className="btn-primary" onClick={onReady}>
              אני מוכן
            </button>
          </div>
        </div>
      )}

      {isReady && (
        <LockedInOverlay title="נעלת את ההרכב שלך! 🔒" subtitle={`ממתינים ל${TEAM_THEME[opponent].label}...`}>
          <p className="locked-in-hint">
            {view.readiness[opponent] ? 'שני הצדדים מוכנים, המשחק מתחיל...' : 'המשחק יתחיל ברגע שהיריב יסיים'}
          </p>
        </LockedInOverlay>
      )}
    </div>
  );
}
