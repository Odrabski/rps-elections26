/**
 * The server replies with short English slugs (`room-not-found`, `already-picked`, …). They're
 * fine as a protocol, but they were being rendered straight to the player in an otherwise
 * all-Hebrew UI. Anything unrecognised falls back to a generic message rather than leaking the
 * slug itself.
 *
 * Both surfaces are covered: the home screen's own message, and the board, which shows these in the
 * turn pill (see GameBoard's notice effect). In-game slugs used to be translated for nobody — App
 * passed `errorMessage` to HomeScreen alone — so a rejected move or a stale tie-break pick left the
 * player looking at a control that simply did not respond.
 *
 * Most in-game slugs are unreachable through the UI, which only ever offers legal targets; the ones
 * listed are the ones a race can actually produce. Anything else falls back to the generic line.
 */
const MESSAGES: Record<string, string> = {
  'room-not-found': 'המשחק לא נמצא — ייתכן שהסתיים',
  'room-full': 'המשחק כבר מלא',
  'invalid-token': 'לא הצלחנו לחבר אתכם חזרה למשחק',
  'invalid-room-code': 'קוד משחק לא תקין',
  'server-error': 'שגיאת שרת — נסו שוב',

  // In-game. Reachable when the server and the board briefly disagree — a tap that lands just
  // after a fight starts, or just after a tie-break round rolls over.
  'not-your-turn': 'לא התור שלכם',
  resolving: 'רגע, הקרב עוד מתנהל',
  'immobile-piece': 'הכלי הזה לא יכול לזוז',
  'stale-round': 'הסיבוב כבר התחלף — בחרו שוב',
  'already-picked': 'כבר בחרתם לסיבוב הזה',
};

export function errorText(slug: string): string {
  return MESSAGES[slug] ?? 'משהו השתבש — נסו שוב';
}
