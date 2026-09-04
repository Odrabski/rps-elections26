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

/** The "how to play" rules modal, shared by the home screen and the setup board. */
export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="איך משחקים?" onClose={onClose}>
      {/* Each bullet is deliberately one whole string rather than a bolded label plus a
          sentence: split across two elements it would become two rows in content/ui-strings.csv
          and have to be rewritten in halves. The emphasis is done in CSS instead. */}
      <h3 className="howto-heading">המטרה</h3>
      <p>להעיף את המלך של היריב מהכיסא ולנצח בבחירות.</p>

      <h3 className="howto-heading">הארסנל שלך</h3>
      <ul className="howto-list">
        <li>המלך: ממוקם על הלוח בתחילת המשחק. תגן עליו טוב-טוב, כי בלעדיו הלך עליך.</li>
        <li>מלכודת סמויה: ממוקמת מראש על הלוח. היריב דורך עליה? הפוליטיקאי שלו הולך הביתה ברגע — והמלכודת נשארת שם ומחכה לבא בתור.</li>
        <li>פוליטיקאים: הצבא שלך, חברי הגוש שלך חמושים באבן, נייר או מספריים.</li>
      </ul>

      <h3 className="howto-heading">חוקי המשחק</h3>
      <ul className="howto-list">
        <li>תנועה וקרב: צעד אחד לכל כיוון; דריכה על יריב יוזמת קרב.</li>
        <li>ערפל קרב: כל הכלים מוסתרים מהצד האחר. אף אחד לא יודע מה מסתתר מולו עד שמתנגשים חזיתית בקרב.</li>
        <li>תיקו בקרב: יש לכם רק 10 שניות לבחור נשק חדש ולשבור את השוויון.</li>
        <li>סוף המשחק: המלך שלך נתפס? נתקעת בלי שום צעד חוקי לבצע? הפסדת את הבחירות.</li>
      </ul>
    </Modal>
  );
}
