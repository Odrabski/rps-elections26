/**
 * Product analytics: what people do, sent to Microsoft Clarity.
 *
 * Clarity is free with no volume cap, and gives heatmaps and session replay on top of the counts —
 * which for a board game is worth more than a funnel, since it shows where someone hesitates on the
 * setup screen rather than only that they left.
 *
 * Two kinds of signal are sent from here:
 *   - **events** (`clarity('event', name)`) — a thing happened: a game started, a game ended.
 *   - **tags** (`clarity('set', key, value)`) — a fact about the session: which bloc, bot or human.
 *     Tags are what the dashboard filters and segments by, so "how many picked the coalition" is a
 *     tag, not an event.
 *
 * Inert unless VITE_CLARITY_ID is set: with no id the script is never fetched and every call here
 * returns immediately. That keeps local dev and anyone's fork out of the numbers, and means the
 * game ships perfectly well with no analytics at all.
 *
 * Nothing personal is collected — there is no login, no name, no email. Country comes from Clarity
 * resolving the request IP on its side. Note that Clarity does record sessions; it masks text
 * content by default, and this game has no text worth masking beyond a four-character room code.
 */

const CLARITY_ID = import.meta.env.VITE_CLARITY_ID as string | undefined;

/** Whether the opponent is a person or the bot. */
export type GameMode = 'bot' | 'human';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

let started = false;

/**
 * Loads the Clarity tag, once.
 *
 * The queue stub is set up before the script arrives, so anything tracked during startup is held
 * and replayed rather than dropped — the same shape Clarity's own snippet uses, written out here
 * because it is three lines and a copied minified blob is not.
 */
export function initAnalytics(): void {
  if (!CLARITY_ID || started || typeof window === 'undefined') return;
  started = true;
  try {
    const stub: ClarityFn = function (...args: unknown[]) {
      (stub.q = stub.q ?? []).push(args);
    };
    window.clarity = window.clarity ?? stub;

    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    document.head.appendChild(tag);
  } catch {
    // A blocked script is the expected case for anyone running an ad blocker, not an error.
  }
}

/** Never throws and never awaits: analytics must not be able to slow down or break a move. */
function call(...args: unknown[]): void {
  if (!CLARITY_ID) return;
  try {
    window.clarity?.(...args);
  } catch {
    // A lost signal is not worth a single line of the player's experience.
  }
}

/** A thing that happened, counted in the dashboard's Events view. */
export function track(event: string): void {
  call('event', event);
}

/** A fact about this session, used to filter and segment every other number. */
export function tag(key: string, value: string): void {
  call('set', key, value);
}

/** Which bloc someone picked, and who against — the headline question. Tagged, not evented, so
 *  every later metric can be sliced by it. */
export function trackTeamPicked(team: 'red' | 'blue', mode: GameMode): void {
  tag('team', team === 'blue' ? 'coalition' : 'opposition');
  tag('mode', mode);
  track('team_picked');
}

export function trackGameStarted(mode: GameMode): void {
  tag('mode', mode);
  track('game_started');
}

/**
 * How a game ended. `reason` is the server's own vocabulary ('king-captured', 'no-moves-left',
 * 'resigned'), so the drop-off from started to finished reads without translating anything.
 */
export function trackGameEnded(opts: { won: boolean; reason: string; seconds: number }): void {
  tag('result', opts.won ? 'won' : 'lost');
  tag('end_reason', opts.reason);
  // Bucketed rather than exact: a tag with hundreds of distinct values is unusable as a filter,
  // and "was it a short game or a long one" is the actual question.
  tag('length', opts.seconds < 120 ? 'under_2m' : opts.seconds < 300 ? '2_5m' : 'over_5m');
  track('game_ended');
}
