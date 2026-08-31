import type { Team } from 'shared';

// Usable by either team's pieces, on top of their own team-specific bank below.
const GENERAL_TEASES = ['אין לי אבן אחרת!'];

const COALITION_TEASES = [
  'אבניהו - עושים שלום בטוח',
  'אל תתנו להם אבנים!',
  'פרס יחלק את מספריים',
  'תנו לאבן לכסח',
  'רק אבן!',
  'אבן חזקה - ישראל חזקה',
  'ישראל חזקה עם מספריים',
  'ימין חזק, אבן חזקה',
  'המספריים הם חלק מגוש השמאל',
  'נייר! חזק מול כל השמאל',
  'צריך לגזור את חווארה',
  'אין מספריים, אין פיגועים',
  'נ ני ניי נייר מאומן',
  'אבנים? מספריים? יהודים! אחים! לוחמים!',
  'השמאל שכח מה זה להיות נייר',
  'אבן זה כאן',
];

const OPPOSITION_TEASES = [
  'אתה גזור, אתה אשם',
  'תפסיקו לגזור עלינו קופונים',
  'דור שלם דורש נייר',
  'אבנים נמאסתם!',
  'רק לא אבן',
  'חייבים ממשלה עם אבן',
  'לא שמאל. לא ימין. נייר!',
  'נייר, אתה חסר',
  'ביחד נגזור!',
  'שמאל חלש? נייר חלש!',
  'עוטפים את המדינה בנייר',
];

// blue = coalition, red = opposition (matches TEAM_THEME throughout the app).
const TEASES_BY_TEAM: Record<Team, string[]> = {
  blue: [...COALITION_TEASES, ...GENERAL_TEASES],
  red: [...OPPOSITION_TEASES, ...GENERAL_TEASES],
};

export function randomTease(team: Team): string {
  const pool = TEASES_BY_TEAM[team];
  return pool[Math.floor(Math.random() * pool.length)];
}
