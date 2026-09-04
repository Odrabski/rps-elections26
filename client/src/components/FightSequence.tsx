import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ClientPieceView, Team } from 'shared';
import {
  FIGHT_BEAT_MS as BEAT_MS,
  FIGHT_STANDOFF_MS as STANDOFF_MS,
  FIGHT_CLASH_MS as CLASH_MS,
  FIGHT_CLOUD_MS as CLOUD_MS,
  FIGHT_SEQUENCE_MS,
  TIE_SEQUENCE_MS,
} from 'shared';
import { resolveFightVisual, type FightVisual } from '../data/characterAssets';
import { TEAM_THEME } from '../data/theme';
import './FightSequence.css';
import './PieceView.css';

// Re-exported so GameBoard can pick the right overlay-dismiss duration per event type — a tie's
// reveal is shown for much less time than a decisive win's, since there's nothing more to read
// once you've seen "תיקו!".
export { FIGHT_SEQUENCE_MS, TIE_SEQUENCE_MS };

interface FightSequenceProps {
  attacker: ClientPieceView;
  defender: ClientPieceView;
  outcome: 'attacker-wins' | 'defender-wins' | 'tie';
  seed: string;
  viewerTeam: Team;
}

type Phase = 'intro' | 'standoff' | 'clash' | 'cloud' | 'reveal';

const COUNT_LABELS = ['3', '2', '1', 'FIGHT'];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const CONFETTI_COUNT = 22;
const CONFETTI_COLORS = ['#d4af37', '#f6e27a', '#ffffff', '#4aa3ff', '#ffd166'];

/**
 * A gentle drift of confetti behind the "YOU WIN" reveal — deliberately far lighter than the
 * game-over celebration, which is the actual payoff. Winning one fight is a good moment, not the
 * end of the story, so this is 22 slow pieces rather than a screenful.
 */
function FightConfetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: `${(100 / CONFETTI_COUNT) * i + randomBetween(-3, 3)}%`,
        width: `${randomBetween(5, 9).toFixed(0)}px`,
        height: `${randomBetween(8, 14).toFixed(0)}px`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDelay: `${randomBetween(0, 1.4).toFixed(2)}s`,
        animationDuration: `${randomBetween(2.6, 4.2).toFixed(2)}s`,
        // Each piece tumbles a different way, so the fall never reads as one sheet coming down.
        '--spin': `${randomBetween(-540, 540).toFixed(0)}deg`,
        '--drift': `${randomBetween(-30, 30).toFixed(0)}px`,
      })),
    [],
  );
  return (
    <div className="fight-confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="fight-confetti-piece" style={style as CSSProperties} />
      ))}
    </div>
  );
}

export function FightSequence({ attacker, defender, outcome, seed, viewerTeam }: FightSequenceProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 3; i++) timers.push(setTimeout(() => setBeat(i), BEAT_MS * i));
    timers.push(setTimeout(() => setPhase('standoff'), BEAT_MS * 4));
    timers.push(setTimeout(() => setPhase('clash'), BEAT_MS * 4 + STANDOFF_MS));
    timers.push(setTimeout(() => setPhase('cloud'), BEAT_MS * 4 + STANDOFF_MS + CLASH_MS));
    timers.push(setTimeout(() => setPhase('reveal'), BEAT_MS * 4 + STANDOFF_MS + CLASH_MS + CLOUD_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  const attackerVisual = resolveFightVisual(attacker, seed);
  const defenderVisual = resolveFightVisual(defender, seed);

  // The viewer's own soldier always renders on the left in the standoff/clash arena, regardless
  // of whether they were the attacker or defender in this particular clash.
  const viewerIsAttacker = attacker.team === viewerTeam;
  const leftVisual = viewerIsAttacker ? attackerVisual : defenderVisual;
  const rightVisual = viewerIsAttacker ? defenderVisual : attackerVisual;

  // The intro screen puts the viewer's own soldier on the left too, but getting there needs two
  // *opposite* fixes because of how the page's RTL direction (index.html dir="rtl") affects each
  // kind of content differently:
  //  - .fight-intro-heads is a flex row of <img> elements — flex items reverse under RTL (the
  //    first item lands at the inline-start edge, which is the *right* for RTL) — so the DOM
  //    order here must be [opponent, mine] to make mine land on the left.
  //  - .fight-intro-title is plain Latin-script text (head names are never Hebrew) — a bidi run
  //    with no RTL characters in it just reads in its own literal left-to-right order regardless
  //    of the RTL container, so this one is NOT reversed — it needs [mine, opponent] instead, the
  //    exact opposite DOM order from the images, to read the same way.
  const introHeadsLeft = rightVisual;
  const introHeadsRight = leftVisual;

  if (phase === 'intro') {
    return (
      <div className="fight-sequence">
        <div className="fight-intro-title">
          {leftVisual.headName} <span className="fight-vs">VS</span> {rightVisual.headName}
        </div>
        <div className="fight-intro-heads">
          <img src={introHeadsLeft.headAsset} alt="" className="fight-intro-head" />
          <img src={introHeadsRight.headAsset} alt="" className="fight-intro-head" />
        </div>
        <div className="fight-countdown">{COUNT_LABELS[beat]}</div>
      </div>
    );
  }

  if (phase === 'reveal') {
    // A tie has no reveal screen of its own — the weapon picker (TieBreakPanel) is the "reveal"
    // instead, so GameBoard's dismiss timer (TIE_SEQUENCE_MS, effectively 0 reveal time) unmounts
    // this overlay right as the clash-cloud beat finishes, before this branch would ever paint.
    if (outcome === 'tie') return null;

    const attackerWon = outcome === 'attacker-wins';
    const winner = attackerWon ? attacker : defender;
    const winnerTheme = TEAM_THEME[winner.team as Team];
    const winnerVisual = attackerWon ? attackerVisual : defenderVisual;
    const youWon = winner.team === viewerTeam;
    return (
      <div className="fight-sequence">
        {youWon && <FightConfetti />}
        <div className="fight-reveal">
          <div className={`fight-you-result ${youWon ? 'fight-you-win' : 'fight-you-lose'}`}>
            {youWon ? 'YOU WIN' : 'YOU LOST'}
          </div>
          <div className="fight-figure-winner">
            <FightFigure visual={winnerVisual} tiltHead />
          </div>
          <div className="fight-result-text" style={{ color: winnerTheme.text }}>
            {winnerVisual.headName.toUpperCase()}
          </div>
          <div className="fight-result-subtext">ניצחון של {winnerTheme.label}</div>
        </div>
      </div>
    );
  }

  const clashing = phase === 'clash' || phase === 'cloud';
  const inCloud = phase === 'cloud';

  return (
    <div className="fight-sequence">
      <div className="fight-arena">
        <div
          className={[
            'fight-figure',
            'fight-figure-left',
            clashing ? 'fight-figure-clash-left' : '',
            inCloud ? 'fight-figure-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <FightFigure visual={leftVisual} />
        </div>

        {inCloud && <img src="/assets/pieces/cloud2.webp" alt="" className="fight-cloud" />}

        <div
          className={[
            'fight-figure',
            'fight-figure-right',
            clashing ? 'fight-figure-clash-right' : '',
            inCloud ? 'fight-figure-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <FightFigure visual={rightVisual} />
        </div>
      </div>
    </div>
  );
}

function FightFigure({ visual, tiltHead }: { visual: FightVisual; tiltHead?: boolean }) {
  return (
    <div className="piece-view">
      <img src={visual.bodyAsset} alt="" className="piece-portrait" draggable={false} />
      <img
        src={visual.headAsset}
        alt=""
        className={[
          'piece-mask',
          `piece-mask-${visual.headId}`,
          tiltHead ? 'fight-head-tilt' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        draggable={false}
      />
    </div>
  );
}
