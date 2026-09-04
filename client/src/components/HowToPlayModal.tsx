import type { ReactNode } from 'react';
// The modal frame and the how-to-play/about copy all live on the same set of classes, which are
// defined in HomeScreen.css. Import it here too so this modal is styled wherever it's mounted
// (the home screen and, now, the setup board), not only while the home screen is on screen.
import './HomeScreen.css';

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered outside the card itself, pinned to the bottom of the screen — for a caption that
   * shouldn't count as part of the modal's own frame. */
  footer?: ReactNode;
}) {
  return (
    <div className="home-modal-overlay" onClick={onClose}>
      <div className="home-modal panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="home-modal-x" onClick={onClose} aria-label="סגור">
          ×
        </button>
        <h2 className="gradient-heading home-modal-title">{title}</h2>
        <div className="home-modal-body">{children}</div>
      </div>
      {footer && (
        <div className="home-modal-footer" onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * The rock/paper/scissors cycle, drawn as a triangle so that it reads as a loop rather than as a
 * list of three facts to memorise.
 *
 * One inline SVG rather than HTML chips plus a separate arrow layer: the arrows have to start and
 * end on the circles' edges, and keeping the nodes and the curves in one coordinate space is what
 * makes that hold at every width instead of drifting apart as the modal resizes.
 *
 * The emoji match the ones the tie-break panel already offers when you pick a hand, so this is the
 * same vocabulary a player meets in play, not a second one invented for the rules screen.
 */
function BeatsCycle() {
  // Circle centres, and the arrows between them. Each arrow runs from the edge of one circle to
  // the edge of the next and bows outward, away from the triangle's centre.
  const nodes = [
    { emoji: '📄', label: 'נייר', cx: 140, cy: 40 },
    { emoji: '🪨', label: 'אבן', cx: 222, cy: 134 },
    { emoji: '✂️', label: 'מספריים', cx: 58, cy: 134 },
  ];
  // paper → rock → scissors → paper, matching BEATS in server/src/game/combat.ts.
  const arrows = [
    'M161.7 64.9 Q199.7 79.8 200.3 109.1',
    'M189 134 Q140 157 91 134',
    'M79.7 109.1 Q80.3 79.8 118.3 64.9',
  ];

  return (
    <svg
      className="howto-cycle"
      viewBox="0 0 280 175"
      role="img"
      aria-label="נייר מנצח אבן, אבן מנצחת מספריים, ומספריים מנצחים נייר"
    >
      <defs>
        <marker id="howto-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--gold)" />
        </marker>
      </defs>
      {arrows.map((d) => (
        <path key={d} d={d} className="howto-cycle-arrow" markerEnd="url(#howto-arrow)" />
      ))}
      {nodes.map(({ emoji, label, cx, cy }) => (
        <g key={label}>
          <circle cx={cx} cy={cy} r="28" className="howto-cycle-node" />
          <text x={cx} y={cy - 3} className="howto-cycle-emoji">
            {emoji}
          </text>
          <text x={cx} y={cy + 15} className="howto-cycle-label">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * One line of the arsenal list: an icon, the role in gold, then what it does.
 *
 * The description stays a single unbroken string so it remains one row in content/ui-strings.csv
 * and can be rewritten as a whole sentence. Only the role label is split out, and those are one
 * word each — a fair trade for being able to emphasise them, which CSS cannot do to part of a
 * text node.
 *
 * 👑 and 🪤 are the icons the setup screen already uses when it asks where to hide each one, so a
 * player meets the same two symbols here as on the board.
 */
function ArsenalItem({ icon, role, children }: { icon: string; role: string; children: ReactNode }) {
  return (
    <li className="howto-item">
      <span className="howto-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <b className="howto-role">{role}</b> {children}
      </span>
    </li>
  );
}

/** The "how to play" rules modal, shared by the home screen and the setup board. */
export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="איך משחקים?" onClose={onClose}>
      {/* Each bullet is deliberately one whole string rather than a bolded label plus a
          sentence: split across two elements it would become two rows in content/ui-strings.csv
          and have to be rewritten in halves. The emphasis is done in CSS instead. */}
      <h3 className="howto-heading">המטרה</h3>
      <p>למצוא את המלך של הצד השני, להעיף אותו מהשלטון ולנצח בבחירות.</p>

      <h3 className="howto-heading">הארסנל שלך</h3>
      <ul className="howto-list">
        <ArsenalItem icon="👑" role="המלך:">
          ממוקם על הלוח בתחילת המשחק. תגן עליו טוב-טוב, כי בלעדיו הלך עליך.
        </ArsenalItem>
        <ArsenalItem icon="🪤" role="מלכודת:">
          מקמו אותה על הלוח בתחילת המשחק. היריב דורך עליה? הפוליטיקאי שלו הולך הביתה ברגע.
        </ArsenalItem>
        <ArsenalItem icon="👔" role="פוליטיקאים:">
          הצבא שלך, חברי הגוש שלך חמושים באבן, נייר או מספריים.
        </ArsenalItem>
      </ul>

      <h3 className="howto-heading">חוקי המשחק</h3>
      <ul className="howto-list">
        <li>תנועה וקרב: צעד אחד לכל כיוון; דריכה על יריב יוזמת קרב. לא ניתן להזיז את המלך והמלכודת.</li>
        <li>ערפל קרב: כל הכלים מוסתרים מהצד האחר. אף אחד לא יודע מה מסתתר מולו עד שמתנגשים חזיתית בקרב.</li>
        <li>תיקו בקרב: יש לכם רק 10 שניות לבחור נשק חדש ולשבור את השוויון.</li>
        <li>סוף המשחק: המלך שלך נתפס? נתקעת בלי שום צעד חוקי לבצע? הפסדת את הבחירות.</li>
      </ul>

      <h3 className="howto-heading">מי מנצח את מי</h3>
      <BeatsCycle />
      <p className="howto-cycle-caption">נייר מנצח אבן מנצח מספריים מנצח נייר.</p>
    </Modal>
  );
}
