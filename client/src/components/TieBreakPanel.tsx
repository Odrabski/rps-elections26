import { TIE_BREAK_SECONDS } from 'shared';
import type { ClientPieceView, ClientTieBreakView, RPSHand, Team } from 'shared';
import { CountdownRing } from './CountdownRing';
import { resolveFightVisual, soldierHandAsset, soldierIdkAsset } from '../data/characterAssets';
import './TieBreakPanel.css';
import './PieceView.css';

interface TieBreakPanelProps {
  tieBreak: ClientTieBreakView;
  pieces: ClientPieceView[];
  team: Team;
  seed: string;
  onPick: (hand: RPSHand) => void;
}

const HAND_OPTIONS: Array<{ hand: RPSHand; label: string; emoji: string }> = [
  { hand: 'rock', label: 'אבן', emoji: '🪨' },
  { hand: 'paper', label: 'נייר', emoji: '📄' },
  { hand: 'scissors', label: 'מספריים', emoji: '✂️' },
];

export function TieBreakPanel({ tieBreak, pieces, team, seed, onPick }: TieBreakPanelProps) {
  const attacker = pieces.find((p) => p.id === tieBreak.attackerId);
  const defender = pieces.find((p) => p.id === tieBreak.defenderId);
  const picked = tieBreak.yourPick !== null;
  const pickedLabel = HAND_OPTIONS.find((o) => o.hand === tieBreak.yourPick)?.label;

  // Your own soldier always renders on the left, matching the same convention as the collision
  // cinematic — regardless of which of the two was the original attacker/defender.
  const viewerIsAttacker = attacker?.team === team;
  const mine = viewerIsAttacker ? attacker : defender;
  const opponent = viewerIsAttacker ? defender : attacker;

  // Each piece's own persistent head — real identity, unaffected by the tie itself.
  const mineVisual = mine && resolveFightVisual(mine, seed);
  const opponentVisual = opponent && resolveFightVisual(opponent, seed);

  // Your own body reflects your actual pick once you've made one; the opponent's stays a mystery
  // shrug the whole time you're looking at this panel — the server never tells this client what
  // the opponent picked until the tie itself resolves, so there is nothing to reveal here.
  const mineBody = mine && (tieBreak.yourPick ? soldierHandAsset(mine.team, tieBreak.yourPick) : soldierIdkAsset(mine.team));
  const opponentBody = opponent && soldierIdkAsset(opponent.team);

  return (
    <div className="tiebreak-overlay">
      <div className="tiebreak-card panel">
        <h2 className="tiebreak-title">תיקו, בחרו נשק לקרב חוזר</h2>
        {/* round=1 marks the original tie (its own reveal already happened before this picker
            ever appears) — the picker itself is always for the *next* pick attempt, so it reads
            one higher: round 1's picker is attempt #2, the first actual rematch. */}
        <p className="tiebreak-subheader">קרב מספר {tieBreak.round + 1}</p>

        {/* Both of these keep their (fixed, CSS-reserved) slot whether or not there's anything to
            put in it — the portraits can be missing entirely and the ring unmounts itself when the
            countdown runs out, either of which would otherwise resize the whole card mid-pick.
            DOM order [opponent, vs, mine]: the page is RTL, where the first flex child lands on
            the right — so this order is what actually puts your own soldier on the left. */}
        <div className="tiebreak-portraits">
          {mineBody && mineVisual && opponentBody && opponentVisual && (
            <>
              <TieFighter bodyAsset={opponentBody} headAsset={opponentVisual.headAsset} headId={opponentVisual.headId} />
              <span className="tiebreak-vs">VS</span>
              <TieFighter bodyAsset={mineBody} headAsset={mineVisual.headAsset} headId={mineVisual.headId} />
            </>
          )}
        </div>

        <div className="tiebreak-timer">
          <CountdownRing deadline={tieBreak.deadline} totalSeconds={TIE_BREAK_SECONDS} color="var(--gold)" size={56} />
        </div>

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
          {!picked
            ? 'בחרו יד לקרב ההכרעה'
            : tieBreak.opponentPicked
              ? 'פותרים...'
              : `נעלת ${pickedLabel}, ממתין ליריב`}
        </p>
      </div>
    </div>
  );
}

function TieFighter({ bodyAsset, headAsset, headId }: { bodyAsset: string; headAsset: string; headId: string }) {
  return (
    <div className="piece-view tiebreak-fighter">
      <img src={bodyAsset} alt="" className="piece-portrait" draggable={false} />
      <img src={headAsset} alt="" className={`piece-mask piece-mask-${headId}`} draggable={false} />
    </div>
  );
}
