import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotDifficulty, ClientGameView, ClientMessage, Position, RPSHand, ServerMessage, Team } from 'shared';
import { clearSession, loadSession, saveSession } from '../utils/rejoin';
import { errorText } from '../data/errorMessages';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

function socketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Local dev runs the server on its own fixed port (see server/src/index.ts). A deployed build
  // has the same process serving both the page and the socket — `location.host` (not
  // `hostname`) already carries whatever port that actually is (or none, for 80/443).
  if (import.meta.env.DEV) return `${protocol}://${window.location.hostname}:8787`;
  return `${protocol}://${window.location.host}`;
}

/** Backoff between reconnect attempts. Starts fast (a phone waking up is usually back instantly)
 * and tops out well inside the server's 2-minute grace period for an empty room. */
const RECONNECT_DELAYS_MS = [400, 800, 1600, 3000, 5000, 8000];

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const rejoinAttempted = useRef(false);
  /** Set once the player deliberately leaves, so a close we caused ourselves isn't treated as a
   * drop worth reconnecting from. */
  const leftRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [view, setView] = useState<ClientGameView | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vsBot, setVsBot] = useState(false);

  // Declared as a ref so ensureSocket's close handler can call it without the two callbacks
  // having to depend on each other.
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const scheduleReconnect = useCallback(() => scheduleReconnectRef.current(), []);

  const ensureSocket = useCallback((): WebSocket => {
    const existing = socketRef.current;
    if (existing && existing.readyState <= WebSocket.OPEN) return existing;

    const socket = new WebSocket(socketUrl());
    socketRef.current = socket;
    setStatus('connecting');

    socket.addEventListener('open', () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
    });
    socket.addEventListener('close', () => {
      setOpponentConnected(false);
      // A dropped socket used to be the end of the game: the next send() quietly opened a fresh
      // socket that the server had never seated, so every move came back 'not-in-room' and no
      // state ever arrived again — with nothing on screen to say so.
      if (leftRef.current || !loadSession()) {
        setStatus('disconnected');
        return;
      }
      setStatus('reconnecting');
      scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      // 'error' is always followed by 'close', which is where the reconnect is driven from.
      socket.close();
    });
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      switch (msg.type) {
        case 'room-created':
        case 'room-joined':
          setRoomCode(msg.roomCode);
          setTeam(msg.team);
          setErrorMessage(null);
          saveSession({ roomCode: msg.roomCode, token: msg.token, team: msg.team });
          break;
        case 'state':
          setView(msg.view);
          break;
        case 'opponent-connected':
          setOpponentConnected(true);
          break;
        case 'opponent-disconnected':
          setOpponentConnected(false);
          break;
        case 'error':
          // Rooms only live in the server's memory, so every deploy invalidates them. Without
          // dropping the saved session here, a returning player skips the splash (App.tsx reads
          // it), fails to rejoin, and is stranded on the home screen with no way back.
          if (msg.message === 'room-not-found' || msg.message === 'invalid-token') {
            // The room is genuinely gone — stop trying to reclaim a seat that no longer exists.
            clearSession();
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
            setStatus('disconnected');
          }
          setErrorMessage(errorText(msg.message));
          break;
      }
    });

    return socket;
  }, []);

  scheduleReconnectRef.current = () => {
    if (reconnectTimer.current) return;
    const session = loadSession();
    if (!session || leftRef.current) return;

    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt.current += 1;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      const current = loadSession();
      if (!current || leftRef.current) return;
      socketRef.current = null; // force a brand-new socket rather than reusing the dead one
      const socket = ensureSocket();
      const claim: ClientMessage = { type: 'rejoin', roomCode: current.roomCode, token: current.token };
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(claim));
      else socket.addEventListener('open', () => socket.send(JSON.stringify(claim)), { once: true });
    }, delay);
  };

  const sendWhenOpen = useCallback((socket: WebSocket, msg: ClientMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      socket.addEventListener('open', () => socket.send(JSON.stringify(msg)), { once: true });
    }
  }, []);

  const send = useCallback(
    (msg: ClientMessage) => sendWhenOpen(ensureSocket(), msg),
    [ensureSocket, sendWhenOpen]
  );

  const createRoom = useCallback(
    (team: Team, botDifficulty?: BotDifficulty) => {
      // Set synchronously, before the server round-trip, so the UI can render bot-appropriate
      // copy (skip the "share this code" lobby screen) immediately rather than waiting on a
      // confirmation that's only ever an instant away anyway.
      setVsBot(!!botDifficulty);
      leftRef.current = false;
      send({ type: 'create-room', team, ...(botDifficulty ? { vsBot: true, botDifficulty } : {}) });
    },
    [send]
  );
  const joinRoom = useCallback(
    (code: string) => {
      leftRef.current = false;
      send({ type: 'join-room', roomCode: code.toUpperCase() });
    },
    [send]
  );
  const placeSpecial = useCallback(
    (piece: 'king' | 'trap', position: Position) => send({ type: 'place-special', piece, position }),
    [send]
  );
  const shuffleHands = useCallback(() => send({ type: 'shuffle-hands' }), [send]);
  const ready = useCallback(() => send({ type: 'ready' }), [send]);
  const move = useCallback((pieceId: string, to: Position) => send({ type: 'move', pieceId, to }), [send]);
  const tiePick = useCallback((hand: RPSHand) => send({ type: 'tie-pick', hand }), [send]);
  const rematch = useCallback(() => send({ type: 'rematch' }), [send]);
  /** Concedes the game before leaving, so the opponent gets a result instead of a stalled board. */
  const resign = useCallback(() => send({ type: 'resign' }), [send]);

  const leave = useCallback(() => {
    leftRef.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    clearSession();
    socketRef.current?.close();
    socketRef.current = null;
    setRoomCode(null);
    setTeam(null);
    setView(null);
    setOpponentConnected(false);
    setStatus('idle');
    setVsBot(false);
  }, []);

  // Attempt to resume a previous session (e.g. after a page refresh) exactly once.
  useEffect(() => {
    if (rejoinAttempted.current) return;
    rejoinAttempted.current = true;

    const session = loadSession();
    if (!session) return;
    sendWhenOpen(ensureSocket(), { type: 'rejoin', roomCode: session.roomCode, token: session.token });
  }, [ensureSocket, sendWhenOpen]);

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    };
  }, []);

  return {
    status,
    roomCode,
    team,
    view,
    opponentConnected,
    errorMessage,
    vsBot,
    createRoom,
    joinRoom,
    placeSpecial,
    shuffleHands,
    ready,
    move,
    tiePick,
    rematch,
    resign,
    leave,
  };
}
