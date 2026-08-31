import { useMemo, useState, type ReactNode } from 'react';
import type { BotDifficulty, Team } from 'shared';
import { HIDDEN_HEAD_POOL } from 'shared';
import { TEAM_THEME } from '../data/theme';
import './HomeScreen.css';

interface HomeScreenProps {
  onCreate: (team: Team, botDifficulty?: BotDifficulty) => void;
  onJoin: (code: string) => void;
  errorMessage: string | null;
}

type Step = 'menu' | 'team-pick' | 'difficulty-pick';
type ModalKind = 'how-to-play' | 'about' | null;

const DIFFICULTY_OPTIONS: Array<{ difficulty: BotDifficulty; label: string; emoji: string; color: string }> = [
  { difficulty: 'easy', label: 'קל', emoji: '🙂', color: '#22c55e' },
  { difficulty: 'medium', label: 'בינוני', emoji: '😐', color: '#f59e0b' },
  { difficulty: 'hard', label: 'קשה', emoji: '😈', color: '#e11d48' },
];

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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="home-modal-overlay" onClick={onClose}>
      <div className="home-modal panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="gradient-heading home-modal-title">{title}</h2>
        <div className="home-modal-body">{children}</div>
        <button type="button" className="btn-secondary home-modal-close" onClick={onClose}>
          סגור
        </button>
      </div>
    </div>
  );
}

export function HomeScreen({ onCreate, onJoin, errorMessage }: HomeScreenProps) {
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('menu');
  const [vsBotFlow, setVsBotFlow] = useState(false);
  const [chosenTeam, setChosenTeam] = useState<Team | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  // Rolled once when the picker step opens, not re-rolled on every render.
  const heads = useMemo<Record<Team, [string, string, string]>>(
    () => ({ blue: randomHeadTrio('blue'), red: randomHeadTrio('red') }),
    [step],
  );

  const startTeamPick = (vsBot: boolean) => {
    setVsBotFlow(vsBot);
    setChosenTeam(null);
    setStep('team-pick');
  };

  const chooseTeam = (team: Team) => {
    if (chosenTeam) return;
    setChosenTeam(team);
    // Brief pause so the head's grayscale-to-color transition is actually visible before
    // navigating on.
    setTimeout(() => {
      if (vsBotFlow) setStep('difficulty-pick');
      else onCreate(team);
    }, 400);
  };

  const chooseDifficulty = (difficulty: BotDifficulty) => {
    if (!chosenTeam) return;
    onCreate(chosenTeam, difficulty);
  };

  if (step === 'difficulty-pick') {
    return (
      <div className="home-screen">
        <div className="home-panel panel">
          <h1 className="gradient-heading home-title">באיזו רמת קושי לשחק?</h1>
          <div className="team-pick-row">
            {DIFFICULTY_OPTIONS.map(({ difficulty, label, emoji, color }) => (
              <button
                key={difficulty}
                type="button"
                className="team-pick-btn difficulty-btn"
                style={{ background: `${color}26`, borderColor: `${color}80` }}
                onClick={() => chooseDifficulty(difficulty)}
              >
                <span className="difficulty-emoji">{emoji}</span>
                <span className="team-pick-label" style={{ color }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary team-pick-back"
            onClick={() => {
              setChosenTeam(null);
              setStep('team-pick');
            }}
          >
            חזרה
          </button>
        </div>
      </div>
    );
  }

  if (step === 'team-pick') {
    return (
      <div className="home-screen">
        <div className="home-panel panel">
          <h1 className="gradient-heading home-title">באיזה צד תרצו לשחק?</h1>
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
          <button type="button" className="btn-secondary team-pick-back" onClick={() => setStep('menu')}>
            חזרה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <div className="home-card-wrap">
        <img src="/assets/logo.webp" alt="אבניהו - מהדורת בחירות 2026" className="home-logo" />
        <div className="home-panel panel">
          <button type="button" className="btn-primary home-create-btn" onClick={() => startTeamPick(false)}>
          יצירת משחק חדש
        </button>

        <button type="button" className="btn-secondary home-vs-bot-btn" onClick={() => startTeamPick(true)}>
          משחק מול המחשב
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
            className="home-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="קוד משחק"
            maxLength={4}
            autoCapitalize="characters"
          />
          <button type="submit" className="btn-secondary" disabled={!code.trim()}>
            הצטרף
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

      {modal === 'how-to-play' && (
        <Modal title="איך משחקים?" onClose={() => setModal(null)}>
          <p>
            לכל שחקן 14 כלים: מלך אחד, מלכודת אחת, ו-12 חיילים חמושים באבן, נייר או מספריים — מוסתרים
            מהיריב עד שהם נכנסים לקרב.
          </p>
          <p>הזיזו חייל למשבצת סמוכה כדי לתקוף. אבן-נייר-מספריים קלאסי מכריע מי שורד ומי יורד מהלוח.</p>
          <p>נצחו על ידי תפיסת המלך של היריב, או השאירו אותו בלי אף מהלך חוקי.</p>
        </Modal>
      )}

      {modal === 'about' && (
        <Modal title="אודות" onClose={() => setModal(null)}>
          <p>
            אבניהו - מהדורת בחירות 2026 הוא משחק אסטרטגיה סאטירי בהשראת הפוליטיקה הישראלית, המשלב
            אבן-נייר-מספריים קלאסי עם טקטיקה על לוח.
          </p>
          <p>קואליציה מול אופוזיציה — מי ינצח בבחירות?</p>
        </Modal>
      )}
    </div>
  );
}
