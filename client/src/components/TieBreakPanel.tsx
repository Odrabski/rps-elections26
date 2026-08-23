import { TIE_BREAK_SECONDS } from 'shared';
import type { ClientPieceView, ClientTieBreakView, RPSHand } from 'shared';
import { CountdownRing } from './CountdownRing';
import { pieceHeadAsset } from '../data/characterAssets';
import './TieBreakPanel.css';

interface TieBreakPanelProps {
  tieBreak: ClientTieBreakView;
  pieces: ClientPieceView[];
  onPick: (hand: RPSHand) => void;
}

const HAND_OPTIONS: Array<{ hand: RPSHand; label: string; emoji: string }> = [
  { hand: 'rock', label: 'אבן', emoji: '🪨' },
  { hand: 'paper', label: 'נייר', emoji: '📄' },
  { hand: 'scissors', label: 'מספריים', emoji: '✂️' },
];

export function TieBreakPanel({ tieBreak, pieces, onPick }: TieBreakPanelProps) {
  const attacker = pieces.find((p) => p.id === tieBreak.attackerId);
  const defender = pieces.find((p) => p.id === tieBreak.defenderId);
  const picked = tieBreak.yourPick !== null;

  return (
    <div className="tiebreak-overlay">
      <div className="tiebreak-card panel">
        <h2 className="tiebreak-title">תיקו! בחרו נשק</h2>

        {attacker && defender && (
          <div className="tiebreak-portraits">
            <img src={pieceHeadAsset(attacker)} alt="" />
            <span className="tiebreak-vs">מול</span>
            <img src={pieceHeadAsset(defender)} alt="" />
          </div>
        )}

        <CountdownRing deadline={tieBreak.deadline} totalSeconds={TIE_BREAK_SECONDS} color="var(--gold)" size={56} />

        <div className="tiebreak-hand-row">
          {HAND_OPTIONS.map(({ hand, label, emoji }) => (
            <button
              key={hand}
              type="button"
              className={`tiebreak-hand-btn${tieBreak.yourPick === hand ? ' tiebreak-hand-selected' : ''}`}
              onClick={() => onPick(hand)}
              disabled={picked}
            >
              <span className="tiebreak-hand-emoji">{emoji}</span>
              {label}
            </button>
          ))}
        </div>

        <p className="tiebreak-status">
          {!picked ? 'בחרו יד לקרב ההכרעה' : tieBreak.opponentPicked ? 'פותרים...' : 'ממתינים ליריב לבחור...'}
        </p>
      </div>
    </div>
  );
}
