import { useEffect, useState } from 'react';
import type { ClientPieceView, Team } from 'shared';
import {
  FIGHT_BEAT_MS as BEAT_MS,
  FIGHT_STANDOFF_MS as STANDOFF_MS,
  FIGHT_CLASH_MS as CLASH_MS,
  FIGHT_CLOUD_MS as CLOUD_MS,
  FIGHT_REVEAL_MS,
  FIGHT_SEQUENCE_MS,
  TIE_SEQUENCE_MS,
} from 'shared';
import { resolveFightVisual, type FightVisual } from '../data/characterAssets';
import { TEAM_THEME } from '../data/theme';
import { play, playClip, prefetchClip } from '../utils/sfx';
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

/**
 * How long after the reveal the winner's name is called.
 *
 * The trumpet is 1.75s and starts decaying around 0.95s in, so the voice enters at 1.15s — over
 * the ringing tail rather than after silence, which is how a herald actually sounds. The longest
 * name call is 2.19s, putting the pair at about 3.34s: inside the 3.6s the reveal holds
 * (FIGHT_REVEAL_MS), with ~260ms spare. Re-record a name much longer than that and this needs to
 * come down, or FIGHT_REVEAL_MS up.
 */
const WIN_CALL_DELAY_MS = 1150;

export function FightSequence({ attacker, defender, outcome, seed, viewerTeam }: FightSequenceProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    // The reveal is ~6s away; fetching both now means the announcement is decoded and ready.
    prefetchClip(`win.${resolveFightVisual(attacker, seed).headId}`);
    prefetchClip(`win.${resolveFightVisual(defender, seed).headId}`);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 3; i++)
      timers.push(
        setTimeout(() => {
          setBeat(i);
          // The last beat is COUNT_LABELS[3] — "FIGHT" — so the announcer lands with the word.
          if (i === 3) play('fight.start');
        }, BEAT_MS * i),
      );
    timers.push(setTimeout(() => setPhase('standoff'), BEAT_MS * 4));
    timers.push(setTimeout(() => setPhase('clash'), BEAT_MS * 4 + STANDOFF_MS));
    const cloudAt = BEAT_MS * 4 + STANDOFF_MS + CLASH_MS;
    timers.push(setTimeout(() => setPhase('cloud'), cloudAt));
    // A scuffle, not one hit: punches land right through the cloud beat, at gaps random enough
    // that no two fights sound alike. Scheduled from the top level so they sit in `timers` and
    // stop with everything else if the fight unmounts — a punch arriving over the reveal would
    // read as someone else's audio. The samples run 0.31-0.62s, so at these gaps they overlap,
    // which is what makes it a brawl rather than a metronome.
    // The cutoff is short of CLOUD_MS on purpose: these samples run up to 0.65s, so a punch
    // started at the very end of the beat is still ringing well into the reveal and lands on top
    // of the flourish. Stopping ~200ms early lets the last blow finish inside the cloud.
    for (let at = 0; at < CLOUD_MS - 200; at += 185 + Math.random() * 115) {
      timers.push(setTimeout(() => play('fight.punch'), cloudAt + at));
    }
    const revealAt = BEAT_MS * 4 + STANDOFF_MS + CLASH_MS + CLOUD_MS;
    timers.push(
      setTimeout(() => {
        setPhase('reveal');
        // Sounded here, with the words appearing. GameBoard used to play it when the whole
        // sequence ended instead — fine for an abstract sting, but a voice saying "you win"
        // arriving 3.6s after YOU WIN is on screen reads as someone else's audio.
        // Each side hears its own flourish, but both then hear the same name — the winner is the
        // winner whichever end of it you are on.
        if (outcome !== 'tie') {
          const winner = outcome === 'attacker-wins' ? attacker : defender;
          play(winner.team === viewerTeam ? 'fight.win-fanfare' : 'fight.lose-fanfare');
        }
      }, revealAt),
    );
    // The name lands after the flourish rather than under it — a herald plays first, *then*
    // announces. Scheduled from the top level, not nested inside the reveal's own callback, so it
    // is in `timers` and gets cleared if the fight unmounts mid-sequence.
    timers.push(
      setTimeout(() => {
        if (outcome === 'tie') return;
        const winner = outcome === 'attacker-wins' ? attacker : defender;
        // Announce who won by name — both players hear the same call, since the face on screen
        // is the same for both (the disguise head is seeded per piece, not per viewer). Falls
        // back to the old win/lose sting only if the clip somehow hasn't loaded.
        if (!playClip(`win.${resolveFightVisual(winner, seed).headId}`)) {
          play(winner.team === viewerTeam ? 'fight.win' : 'fight.lose');
        }
      }, revealAt + WIN_CALL_DELAY_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [attacker, defender, outcome, seed, viewerTeam]);

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
    const loserVisual = attackerWon ? defenderVisual : attackerVisual;
    return (
      <div className="fight-sequence">
        <div className="fight-reveal">
          {/* No "YOU WIN"/"YOU LOST" line any more. The winner's own name is announced aloud and
              printed under the figures, which says the same thing without a second heading over
              it — and each side already hears its own flourish. */}
          <div className="fight-figure-pair">
            <div className="fight-figure-winner">
              <FightFigure visual={winnerVisual} tiltHead />
            </div>
            {/* The one who lost, small and drained of colour beside the winner, fading out over
                the length of the reveal. Rendered second but placed to the winner's side in CSS,
                so it reads as being left behind rather than as a second contender. */}
            <div
              className="fight-figure-loser"
              aria-hidden="true"
              // Sized to the reveal itself rather than a fixed number, so the two can't drift
              // apart: gone just before the winner is, never lingering into the next screen.
              style={{ animationDuration: `${Math.round(FIGHT_REVEAL_MS * 0.92)}ms` }}
            >
              <FightFigure visual={loserVisual} />
            </div>
          </div>
          <div className="fight-result-text" style={{ color: winnerTheme.text }}>
            {winnerVisual.headName.toUpperCase()}
          </div>
          {/* Written out per bloc rather than composed from the team label: the labels carry a
              definite article (הקואליציה), and Hebrew's ל absorbs it — "ניצחון להקואליציה" is
              wrong where "ניצחון לקואליציה" is right. */}
          <div className="fight-result-subtext">
            {winner.team === 'blue' ? 'ניצחון לקואליציה' : 'ניצחון לאופוזיציה'}
          </div>
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
