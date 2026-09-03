/**
 * The server replies with short English slugs (`room-not-found`, `already-picked`, …). They're
 * fine as a protocol, but they were being rendered straight to the player in an otherwise
 * all-Hebrew UI. Anything unrecognised falls back to a generic message rather than leaking the
 * slug itself.
 *
 * Only slugs that can arrive while the player is on the home screen are listed. `errorMessage` is
 * passed to HomeScreen alone, and App renders that only when there is no room — so an error raised
 * mid-game is received, translated, and dropped. Ten in-game slugs were being translated here for
 * nobody; if an error surface is ever added to the game screens, they want bringing back.
 */
const MESSAGES: Record<string, string> = {
  'room-not-found': 'המשחק לא נמצא — ייתכן שהסתיים',
  'room-full': 'המשחק כבר מלא',
  'invalid-token': 'לא הצלחנו לחבר אתכם חזרה למשחק',
  'invalid-room-code': 'קוד משחק לא תקין',
  'server-error': 'שגיאת שרת — נסו שוב',
};

export function errorText(slug: string): string {
  return MESSAGES[slug] ?? 'משהו השתבש — נסו שוב';
}
