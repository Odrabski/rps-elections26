import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotDifficulty, Team } from 'shared';
import { HIDDEN_HEAD_POOL } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { play, preload } from '../utils/sfx';
import { LogoPeeker, MenuPeekers } from './MenuPeekers';
import { Modal, HowToPlayModal } from './HowToPlayModal';
import './HomeScreen.css';

interface HomeScreenProps {
  onCreate: (team: Team, botDifficulty?: BotDifficulty) => void;
  onJoin: (code: string) => void;
  errorMessage: string | null;
}

type Step = 'menu' | 'team-pick';
type ModalKind = 'how-to-play' | 'about' | null;

// The difficulty picker is switched off for now — the bot always plays at 'hard'. Kept here (and
// in the commented-out step further down) so it can be dropped back in as-is.
// const DIFFICULTY_OPTIONS: Array<{ difficulty: BotDifficulty; label: string; emoji: string; color: string }> = [
//   { difficulty: 'easy', label: 'קל', emoji: '🙂', color: '#22c55e' },
//   { difficulty: 'medium', label: 'בינוני', emoji: '😐', color: '#f59e0b' },
//   { difficulty: 'hard', label: 'קשה', emoji: '😈', color: '#e11d48' },
// ];

// Three distinct heads per team for the fanned team-pick button (center + two tucked behind).
// These portraits don't read well as the prominent front-and-center head — they can still show
// up as one of the two tucked-behind side heads, just never as the center.
const BLOCKED_CENTER_HEADS = new Set(['op_lazimi.webp', 'op_merav.webp', 'op_keren.webp']);

function randomHeadTrio(team: Team): [string, string, string] {
  const pool = [...HIDDEN_HEAD_POOL[team]];
  const centerCandidates = pool.filter((h) => !BLOCKED_CENTER_HEADS.has(h));
  const centerPool = centerCandidates.length > 0 ? centerCandidates : pool;
  const center = centerPool[Math.floor(Math.random() * centerPool.length)];
  const remaining = pool.filter((h) => h !== center);
  const picked: string[] = [];
  while (picked.length < 2 && remaining.length > 0) {
    const i = Math.floor(Math.random() * remaining.length);
    picked.push(remaining.splice(i, 1)[0]);
  }
  return [center, picked[0] ?? center, picked[1] ?? center];
}

/** What the little figure in the About box can be wearing: either suit, all three weapons. A poke
 *  draws one at random. Note `scrissors` — the coalition scissors sprite is misspelled on disk and
 *  the opposition one is not. */
const ABOUT_BODIES = [
  'sol_co_scrissors.webp',
  'sol_co_rock.webp',
  'sol_co_paper.webp',
  'sol_op_scissors.webp',
  'sol_op_rock.webp',
  'sol_op_paper.webp',
] as const;

/** And who it is. Omri is in the pool so the figure can find its way back to him; the swap never
 *  draws whoever is already showing, so the first poke always lands on one of the politicians. */
const ABOUT_HEADS = [
  'omri.webp',
  'co_bibi.webp',
  'op_lapid.webp',
  'op_gadi.webp', // Eisenkot
  'co_bengvir.webp',
  'op_bennet.webp',
  'op_liberman.webp',
] as const;

/** Draws a new index, never the one already showing — landing on the current value would read as a
 *  control that does nothing. */
function nextRandom(current: number, length: number): number {
  const others = Array.from({ length }, (_, n) => n).filter((n) => n !== current);
  return others[Math.floor(Math.random() * others.length)];
}

export function HomeScreen({ onCreate, onJoin, errorMessage }: HomeScreenProps) {
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('menu');
  const [vsBotFlow, setVsBotFlow] = useState(false);
  const [chosenTeam, setChosenTeam] = useState<Team | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  /**
   * Keeps the room-code field above the on-screen keyboard.
   *
   * This screen is `position: fixed` with `overflow: hidden` and deliberately never scrolls (see
   * HomeScreen.css), so the browser's usual "scroll the focused field into view" has nothing to
   * scroll and the keyboard simply covers the field. `--app-vh` already shrinks to the visual
   * viewport when the keyboard opens, which re-centres the card — but the card is taller than what
   * is left, so its lower half, the join form included, is clipped away.
   *
   * So measure it: while the field has focus, lift the card by however far its bottom falls past
   * the visible area. Zero when it already fits, which is every desktop and most landscape phones.
   */
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const reposition = () => {
      const input = codeInputRef.current;
      const card = input?.closest<HTMLElement>('.home-card-wrap');
      if (!input || !card || document.activeElement !== input) {
        setKeyboardLift(0);
        return;
      }
      // Measure where the field *rests*, not where it currently is: any lift already applied is
      // subtracted back out first. Without that the sum is self-defeating — lift the card, and the
      // next measurement sees a field that now fits, decides no lift is needed, and drops it again.
      // Read from the live matrix rather than from state so it is right mid-transition too.
      const lifted = new DOMMatrixReadOnly(getComputedStyle(card).transform).m42;
      // offsetTop matters on iOS: the visual viewport can be pushed down the layout viewport, and
      // a fixed element is positioned against the layout one.
      const visibleBottom = viewport.height + viewport.offsetTop;
      const overshoot = input.getBoundingClientRect().bottom - lifted + 16 - visibleBottom;
      setKeyboardLift(overshoot > 0 ? Math.round(overshoot) : 0);
    };

    // The keyboard animates in, and the resize fires before it has finished — so measure again a
    // beat later rather than against a viewport that is still moving.
    const settle = () => {
      reposition();
      return setTimeout(reposition, 250);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = settle();
    };

    // Both viewports, because browsers disagree about which one a keyboard resizes: iOS shrinks the
    // visual viewport only, while Android's default resizes the layout one — and only the latter
    // fires a window resize.
    viewport.addEventListener('resize', onChange);
    viewport.addEventListener('scroll', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('focusin', onChange);
    window.addEventListener('focusout', onChange);
    return () => {
      if (timer) clearTimeout(timer);
      viewport.removeEventListener('resize', onChange);
      viewport.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('focusin', onChange);
      window.removeEventListener('focusout', onChange);
    };
  }, []);

  /** Which body the About figure is wearing, and whose head is on it. Purely a toy: the body and
   *  the head swap independently, each from its own tap. */
  const [figureIndex, setFigureIndex] = useState(0);
  const [headIndex, setHeadIndex] = useState(0);
  // Rolled once when the picker step opens, not re-rolled on every render.
  const heads = useMemo<Record<Team, [string, string, string]>>(
    () => ({ blue: randomHeadTrio('blue'), red: randomHeadTrio('red') }),
    [step],
  );

  const startTeamPick = (vsBot: boolean) => {
    // First real interaction — the gesture a browser needs before it will start an AudioContext,
    // and the first point at which pulling ~124KB of clips is worth doing.
    play('ui.tap');
    preload();
    setVsBotFlow(vsBot);
    setChosenTeam(null);
    setStep('team-pick');
  };

  const chooseTeam = (team: Team) => {
    if (chosenTeam) return;
    play('team.pick');
    setChosenTeam(team);
    // Brief pause so the head's grayscale-to-color transition is actually visible before
    // navigating on.
    setTimeout(() => {
      // No difficulty step while the picker is switched off — a bot game is always 'hard'.
      onCreate(team, vsBotFlow ? 'hard' : undefined);
    }, 400);
  };

  // const chooseDifficulty = (difficulty: BotDifficulty) => {
  //   if (!chosenTeam) return;
  //   onCreate(chosenTeam, difficulty);
  // };

  /* Difficulty picker, switched off for now (see DIFFICULTY_OPTIONS above):
  // if (step === 'difficulty-pick') {
  //   return (
  //     <div className="home-screen">
  //       <div className="home-panel panel">
  //         <h1 className="gradient-heading home-title">באיזו רמת קושי לשחק?</h1>
  //         <div className="team-pick-row">
  //           {DIFFICULTY_OPTIONS.map(({ difficulty, label, emoji, color }) => (
  //             <button
  //               key={difficulty}
  //               type="button"
  //               className="team-pick-btn difficulty-btn"
  //               style={{ background: `${color}26`, borderColor: `${color}80` }}
  //               onClick={() => chooseDifficulty(difficulty)}
  //             >
  //               <span className="difficulty-emoji">{emoji}</span>
  //               <span className="team-pick-label" style={{ color }}>
  //                 {label}
  //               </span>
  //             </button>
  //           ))}
  //         </div>
  //         <button
  //           type="button"
  //           className="btn-secondary team-pick-back"
  //           onClick={() => {
  //             setChosenTeam(null);
  //             setStep('team-pick');
  //           }}
  //         >
  //           חזרה
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }
  */

  if (step === 'team-pick') {
    return (
      <div className="home-screen">
        {/* Same wrapper the menu step uses. .home-panel is width:100%, so without it this panel
            stretched to the whole viewport on desktop instead of matching the menu it opened from. */}
        <div className="home-card-wrap">
          <div className="home-panel panel">
            <h1 className="gradient-heading home-title">באיזה גוש אתם?</h1>
            <div className="team-pick-row">
              {(['blue', 'red'] as Team[]).map((team) => {
                const theme = TEAM_THEME[team];
                return (
                  <button
                    key={team}
                    type="button"
                    className="team-pick-btn"
                    style={{ background: theme.bg, borderColor: theme.border }}
                    onClick={() => chooseTeam(team)}
                    disabled={chosenTeam !== null}
                  >
                    <span className={`team-pick-fan ${chosenTeam === team ? '' : 'team-pick-head-gray'}`}>
                      <img src={`/assets/pieces/${heads[team][1]}`} alt="" className="team-pick-head team-pick-head-side team-pick-head-left" />
                      <img src={`/assets/pieces/${heads[team][2]}`} alt="" className="team-pick-head team-pick-head-side team-pick-head-right" />
                      <img src={`/assets/pieces/${heads[team][0]}`} alt="" className="team-pick-head team-pick-head-center" />
                    </span>
                    <span className="team-pick-label" style={{ color: theme.text }}>
                      {theme.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-secondary team-pick-back btn-with-icon"
              onClick={() => setStep('menu')}
            >
              <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.2 11.2 12 4l8.8 7.2" />
                <path d="M5.6 9.8V20h12.8V9.8" />
                <path d="M9.8 20v-5.2h4.4V20" />
              </svg>
              <span>לך הביתה</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <MenuPeekers />
      <div
        className="home-card-wrap"
        style={keyboardLift ? { transform: `translateY(-${keyboardLift}px)` } : undefined}
      >
        <LogoPeeker />
        <img src="/assets/logo.webp" alt="אבניהו - מהדורת בחירות 2026" className="home-logo" />
        <div className="home-panel panel">
          <button type="button" className="btn-primary home-vs-bot-btn" onClick={() => startTeamPick(true)}>
            <span>משחק מול בוט</span>
            {/* Stroke-only and inheriting currentColor, so it sits in the button's own ink rather
                than as a coloured emoji whose look is up to whichever font the device happens to
                have. Last in the DOM, which in this RTL layout puts it after the words. */}
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="8" width="16" height="12" rx="3" />
              <path d="M12 8V4.5" />
              <circle cx="12" cy="3" r="1.4" />
              <path d="M9 13.2v1.6M15 13.2v1.6" />
              <path d="M1.8 12.5v3M22.2 12.5v3" />
            </svg>
          </button>

        <button type="button" className="btn-primary home-create-btn" onClick={() => startTeamPick(false)}>
          משחק מול חבר
        </button>

        <div className="home-divider">
          <span>או</span>
        </div>

        <form
          className="home-join-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onJoin(code.trim());
          }}
        >
          <input
            ref={codeInputRef}
            className="home-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="קוד משחק"
            maxLength={4}
            autoCapitalize="characters"
          />
          <button type="submit" className="btn-secondary" disabled={!code.trim()}>
            הצטרפות
          </button>
        </form>

        {errorMessage && <p className="home-error">{errorMessage}</p>}

        <div className="home-footer-links">
          <button type="button" className="home-footer-link" onClick={() => setModal('how-to-play')}>
            איך משחקים?
          </button>
          <span className="home-footer-dot">•</span>
          <button type="button" className="home-footer-link" onClick={() => setModal('about')}>
            אודות
          </button>
        </div>
        </div>

        <p className="home-copyright">כל הזכויות שמורות לעמרי דרבסקי ©</p>
      </div>

      {modal === 'how-to-play' && <HowToPlayModal onClose={() => setModal(null)} />}

      {modal === 'about' && (
        <Modal
          title="אודות"
          onClose={() => setModal(null)}
          footer={
            <>
              {/* Two hit areas rather than one button around both, because a button cannot contain
                  another one — the head sits on top of the body, so a tap lands on whichever of the
                  two it is actually over. */}
              <div className="about-figure">
                <button
                  type="button"
                  className="about-figure-hit about-figure-body-hit"
                  onClick={() => setFigureIndex((i) => nextRandom(i, ABOUT_BODIES.length))}
                  aria-label="החליפו נשק"
                >
                  <img src={`/assets/pieces/${ABOUT_BODIES[figureIndex]}`} alt="" className="about-figure-body" />
                </button>
                <button
                  type="button"
                  className="about-figure-hit about-figure-head-hit"
                  onClick={() => setHeadIndex((i) => nextRandom(i, ABOUT_HEADS.length))}
                  aria-label="החליפו דמות"
                >
                  <img src={`/assets/pieces/${ABOUT_HEADS[headIndex]}`} alt="" className="about-figure-head" />
                </button>
              </div>
              <p className="about-caption">המשחק נוצר על ידי עמרי דרבסקי</p>
            </>
          }
        >
          <div className="about-body">
            <p>נמאס מסבבי בחירות אינסופיים בלי הכרעה?</p>
            <p>
              אבניהו - מהדורת בחירות 2026 הוא משחק אסטרטגיה סאטירי בהשראת הפוליטיקה הישראלית, המשלב אבן-נייר-מספריים קלאסי עם טקטיקה על לוח, כדי שנוכל להכריע אחת ולתמיד מי ייקח את הבחירות – הקואליציה או האופוזיציה.
            </p>
            <p className="about-tagline">יחד נכסח!</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
