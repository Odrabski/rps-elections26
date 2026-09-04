/**
 * The /stats page.
 *
 * Server-rendered, no client bundle, no dependencies — it is an operator's page, not part of the
 * game, and it should stay readable even when the app itself is broken.
 *
 * It shows what this process knows exactly: who is connected right now, and what has happened
 * since it started. Everything historical — sessions, countries, returning players, replays —
 * lives in Clarity, which is linked at the bottom rather than proxied through here.
 */
import type { LiveSnapshot } from './counters.js';
import { medianDuration, readCounters } from './counters.js';

const TEAM_LABEL: Record<string, string> = { blue: 'הקואליציה', red: 'האופוזיציה' };

const PHASE_LABEL: Record<string, string> = {
  lobby: 'ממתינים',
  setup: 'בהצבה',
  playing: 'במשחק',
  gameover: 'הסתיים',
};

const REASON_LABEL: Record<string, string> = {
  'king-captured': 'המלך נתפס',
  'no-moves-left': 'נגמרו המהלכים',
  resigned: 'פרישה',
  unknown: 'לא ידוע',
};

const escape = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function duration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} שע׳ ${m % 60} דק׳`;
  return `${Math.floor(h / 24)} ימים ${h % 24} שע׳`;
}

/** A labelled number. `hint` carries the share of a total where one is meaningful. */
function stat(label: string, value: string | number, hint = ''): string {
  return `<div class="stat"><span class="stat-label">${escape(label)}</span>
    <span class="stat-value">${escape(String(value))}</span>
    ${hint ? `<span class="stat-hint">${escape(hint)}</span>` : ''}</div>`;
}

function share(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '—';
}

/** Rows of `label: count`, sorted by count, for the open-ended breakdowns. */
function breakdown(entries: Record<string, number>, labels: Record<string, string>): string {
  const rows = Object.entries(entries).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return '<p class="empty">עוד לא קרה כלום.</p>';
  const total = rows.reduce((n, [, v]) => n + v, 0);
  return `<table>${rows
    .map(
      ([k, v]) =>
        `<tr><td>${escape(labels[k] ?? k)}</td><td class="num">${v}</td><td class="num dim">${share(v, total)}</td></tr>`,
    )
    .join('')}</table>`;
}

export function renderStatsPage(live: LiveSnapshot, clarityId: string | undefined): string {
  const c = readCounters();
  const uptime = Date.now() - c.startedAt;
  const median = medianDuration();
  const picksTotal = c.picksByTeam.red + c.picksByTeam.blue;
  const winsTotal = c.winsByTeam.red + c.winsByTeam.blue;

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>אבניהו — סטטיסטיקה</title>
<style>
  :root { color-scheme: dark; --gold:#d4af37; --panel:#18241a; --border:#2b3d2d; --dim:#8fa38f }
  * { box-sizing: border-box }
  body { margin:0; padding:22px; background:#101810; color:#dfe8df;
         font:15px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif }
  h1 { font-size:20px; margin:0 0 2px } h2 { font-size:15px; color:var(--gold); margin:0 0 10px }
  .sub { color:var(--dim); margin:0 0 20px; font-size:13px }
  .grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); max-width:1100px }
  section { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px 16px }
  .stat { display:flex; align-items:baseline; gap:8px; padding:4px 0 }
  .stat + .stat { border-top:1px solid #223022 }
  .stat-label { color:var(--dim); flex:1 }
  .stat-value { font-size:19px; font-weight:700; font-variant-numeric:tabular-nums }
  .stat-hint { color:var(--dim); font-size:12px; font-variant-numeric:tabular-nums }
  table { width:100%; border-collapse:collapse } td { padding:4px 0; border-top:1px solid #223022 }
  tr:first-child td { border-top:0 }
  .num { text-align:end; font-variant-numeric:tabular-nums; font-weight:700; width:4em }
  .dim { color:var(--dim); font-weight:400 }
  .empty { color:var(--dim); margin:0 }
  a { color:var(--gold) } footer { color:var(--dim); font-size:12px; margin-top:22px; max-width:1100px }
  .live { display:inline-block; width:8px; height:8px; border-radius:50%; background:#7bd88f; margin-inline-end:6px }
</style></head><body>
<h1><span class="live"></span>אבניהו — סטטיסטיקה</h1>
<p class="sub">מתעדכן כל 10 שניות. המספרים החיים מדויקים; המצטברים נמדדים מאז שהשרת עלה — ${escape(duration(uptime))}.</p>

<div class="grid">
  <section>
    <h2>עכשיו</h2>
    ${stat('מחוברים', live.sockets)}
    ${stat('חדרים פתוחים', live.rooms, `${live.botRooms} מול הבוט`)}
    ${stat(TEAM_LABEL.blue, live.playersByTeam.blue)}
    ${stat(TEAM_LABEL.red, live.playersByTeam.red)}
  </section>

  <section>
    <h2>חדרים לפי שלב</h2>
    ${breakdown(live.roomsByPhase, PHASE_LABEL)}
  </section>

  <section>
    <h2>באיזה גוש בוחרים</h2>
    ${stat(TEAM_LABEL.blue, c.picksByTeam.blue, share(c.picksByTeam.blue, picksTotal))}
    ${stat(TEAM_LABEL.red, c.picksByTeam.red, share(c.picksByTeam.red, picksTotal))}
    ${stat('סה״כ חדרים שנפתחו', c.roomsCreated)}
  </section>

  <section>
    <h2>משחקים</h2>
    ${stat('התחילו', c.gamesStarted)}
    ${stat('הסתיימו', c.gamesFinished, share(c.gamesFinished, c.gamesStarted))}
    ${stat('מול הבוט', c.botGames, share(c.botGames, c.gamesStarted))}
    ${stat('מול חבר', c.humanGames, share(c.humanGames, c.gamesStarted))}
    ${stat('אורך חציוני', median === null ? '—' : `${Math.floor(median / 60)}:${String(median % 60).padStart(2, '0')}`)}
  </section>

  <section>
    <h2>מי מנצח</h2>
    ${stat(TEAM_LABEL.blue, c.winsByTeam.blue, share(c.winsByTeam.blue, winsTotal))}
    ${stat(TEAM_LABEL.red, c.winsByTeam.red, share(c.winsByTeam.red, winsTotal))}
  </section>

  <section>
    <h2>איך נגמר</h2>
    ${breakdown(c.endReasons, REASON_LABEL)}
  </section>
</div>

<footer>
  <p>מאיפה מגיעים, כמה חוזרים, והקלטות מסך — ${
    clarityId
      ? `<a href="https://clarity.microsoft.com/projects/view/${escape(clarityId)}/dashboard" target="_blank" rel="noreferrer">בלוח של Clarity</a>.`
      : 'ב-Clarity, ברגע ש-VITE_CLARITY_ID מוגדר.'
  }</p>
  <p>המספרים המצטברים כאן נמחקים בכל דיפלוי — למכונה הזו אין דיסק. מה שצריך לשרוד, נמדד ב-Clarity.</p>
</footer>
<script>setTimeout(() => location.reload(), 10000);</script>
</body></html>`;
}
