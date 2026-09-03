/**
 * The server replies with short English slugs (`room-not-found`, `already-picked`, …). They're
 * fine as a protocol, but they were being rendered straight to the player in an otherwise
 * all-Hebrew UI. Anything unrecognised falls back to a generic message rather than leaking the
 * slug itself.
 */
const MESSAGES: Record<string, string> = {
  'room-not-found': 'המשחק לא נמצא — ייתכן שהסתיים',
  'room-full': 'המשחק כבר מלא',
  'invalid-token': 'לא הצלחנו לחבר אתכם חזרה למשחק',
  'not-in-room': 'אתם לא מחוברים למשחק',
  'already-in-room': 'אתם כבר בתוך משחק',
  'invalid-room-code': 'קוד משחק לא תקין',
  'invalid-json': 'שגיאת תקשורת עם השרת',
  'server-error': 'שגיאת שרת — נסו שוב',
  'wrong-phase': 'אי אפשר לעשות את זה בשלב הזה',
  'not-your-turn': 'זה לא התור שלכם',
  'resolving': 'רגע, הקרב עוד מתרחש',
  'tie-break-in-progress': 'יש קרב הכרעה פעיל',
  'already-picked': 'כבר בחרתם',
  'no-tie-break': 'אין כרגע קרב הכרעה',
  'not-game-over': 'המשחק עוד לא הסתיים',
};

export function errorText(slug: string): string {
  return MESSAGES[slug] ?? 'משהו השתבש — נסו שוב';
}
