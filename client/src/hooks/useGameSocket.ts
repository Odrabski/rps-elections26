import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientGameView, ClientMessage, Position, RPSHand, ServerMessage, Team } from 'shared';
import { clearSession, loadSession, saveSession } from '../utils/rejoin';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

function socketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:8787`;
}

export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const rejoinAttempted = useRef(false);

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [view, setView] = useState<ClientGameView | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ensureSocket = useCallback((): WebSocket => {
    const existing = socketRef.current;
    if (existing && existing.readyState <= WebSocket.OPEN) return existing;

    const socket = new WebSocket(socketUrl());
    socketRef.current = socket;
    setStatus('connecting');

    socket.addEventListener('open', () => setStatus('connected'));
    socket.addEventListener('close', () => {
      setStatus('disconnected');
      setOpponentConnected(false);
    });
    socket.addEventListener('error', () => setStatus('error'));
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
          setErrorMessage(msg.message);
          break;
      }
    });

    return socket;
  }, []);

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

  const createRoom = useCallback(() => send({ type: 'create-room' }), [send]);
  const joinRoom = useCallback(
    (code: string) => send({ type: 'join-room', roomCode: code.toUpperCase() }),
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

  const leave = useCallback(() => {
    clearSession();
    socketRef.current?.close();
    socketRef.current = null;
    setRoomCode(null);
    setTeam(null);
    setView(null);
    setOpponentConnected(false);
    setStatus('idle');
  }, []);

  // Attempt to resume a previous session (e.g. after a page refresh) exactly once.
  useEffect(() => {
    if (rejoinAttempted.current) return;
    rejoinAttempted.current = true;

    const session = loadSession();
    if (!session) return;
    sendWhenOpen(ensureSocket(), { type: 'rejoin', roomCode: session.roomCode, token: session.token });
  }, [ensureSocket, sendWhenOpen]);

  return {
    status,
    roomCode,
    team,
    view,
    opponentConnected,
    errorMessage,
    createRoom,
    joinRoom,
    placeSpecial,
    shuffleHands,
    ready,
    move,
    tiePick,
    rematch,
    leave,
  };
}
