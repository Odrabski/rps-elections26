import type { Team } from 'shared';

const STORAGE_KEY = 'rps-politika-session';

export interface StoredSession {
  roomCode: string;
  token: string;
  team: Team;
}

// sessionStorage, not localStorage: it's scoped to this one tab, so a page refresh rejoins
// the same game, but opening a second tab doesn't silently hijack the first tab's session
// (localStorage is shared across all tabs of the same origin and did exactly that).
export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures (private browsing, quota, etc.) — rejoin just won't work.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
