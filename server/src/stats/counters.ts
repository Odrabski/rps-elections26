/**
 * Counts of what has happened on *this* server process.
 *
 * Deliberately in memory and deliberately not the whole story. Fly gives this app no volume, and a
 * deploy replaces the machine, so anything counted here is lost on the next release — which is why
 * the long view lives in Clarity (see client/src/utils/analytics.ts) and this only ever claims to
 * cover "since the server started".
 *
 * What it is good for is precisely what Clarity is bad at: exact, live, server-side truth. Clarity
 * samples, needs its script to load past an ad blocker, and reports nothing about who is connected
 * *right now*. The socket count here is exact and costs nothing.
 */
import type { Team } from 'shared';

export interface LiveSnapshot {
  /** Open WebSockets — a rough proxy for people with the game in front of them. */
  sockets: number;
  rooms: number;
  roomsByPhase: Record<string, number>;
  botRooms: number;
  /** Seats currently held by a connected human, per bloc. */
  playersByTeam: Record<Team, number>;
}

export interface Counters {
  startedAt: number;
  roomsCreated: number;
  gamesStarted: number;
  gamesFinished: number;
  botGames: number;
  humanGames: number;
  winsByTeam: Record<Team, number>;
  picksByTeam: Record<Team, number>;
  endReasons: Record<string, number>;
  /** Finished game durations in seconds, for a median. Capped so a long-lived process cannot grow
   *  this without bound. */
  durations: number[];
}

const MAX_DURATIONS = 500;

const counters: Counters = {
  startedAt: Date.now(),
  roomsCreated: 0,
  gamesStarted: 0,
  gamesFinished: 0,
  botGames: 0,
  humanGames: 0,
  winsByTeam: { red: 0, blue: 0 },
  picksByTeam: { red: 0, blue: 0 },
  endReasons: {},
  durations: [],
};

export function recordRoomCreated(team: Team): void {
  counters.roomsCreated++;
  counters.picksByTeam[team]++;
}

export function recordGameStarted(vsBot: boolean): void {
  counters.gamesStarted++;
  if (vsBot) counters.botGames++;
  else counters.humanGames++;
}

export function recordGameEnded(winner: Team | null, reason: string, seconds: number): void {
  counters.gamesFinished++;
  if (winner) counters.winsByTeam[winner]++;
  counters.endReasons[reason] = (counters.endReasons[reason] ?? 0) + 1;
  if (seconds > 0) {
    counters.durations.push(Math.round(seconds));
    // Drop the oldest rather than stop recording: a server up for a week should describe this
    // week, not the first hour after it booted.
    if (counters.durations.length > MAX_DURATIONS) counters.durations.shift();
  }
}

export function readCounters(): Counters {
  return counters;
}

export function medianDuration(): number | null {
  if (counters.durations.length === 0) return null;
  const sorted = [...counters.durations].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
