import type { WebSocket } from 'ws';
import type { ServerMessage, Team } from 'shared';
import { RoomManager } from '../rooms/RoomManager.js';
import type { Room } from '../rooms/Room.js';
import { validateClientMessage } from './validate.js';
import { recordRoomCreated } from '../stats/counters.js';

const OTHER_TEAM: Record<Team, Team> = { red: 'blue', blue: 'red' };

export function handleConnection(socket: WebSocket, rooms: RoomManager): void {
  let room: Room | null = null;
  let team: Team | null = null;

  const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

  socket.on('message', (raw) => {
    // Everything in here runs on behalf of one client but shares a process with every other live
    // game, so nothing below is allowed to throw: an uncaught error in a 'message' handler takes
    // down the whole server and every match on it.
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return send({ type: 'error', message: 'invalid-json' });
      }

      const result = validateClientMessage(parsed);
      if (!result.ok) return send({ type: 'error', message: result.reason });
      const msg = result.msg;

      if (msg.type === 'create-room') {
        if (room) return send({ type: 'error', message: 'already-in-room' });
        const created = rooms.createRoom();
        const slot = created.addPlayer(socket, msg.team);
        if (!slot) return send({ type: 'error', message: 'room-full' });
        // The seat actually assigned, not the one requested — `team` is optional on the wire, and
        // a preferred seat that is already taken falls back to whatever is free.
        recordRoomCreated(slot.team);
        room = created;
        team = slot.team;
        send({ type: 'room-created', roomCode: created.code, team: slot.team, token: slot.token });
        // Sent after room-created so the client's roomCode/team are already set by the time the
        // state broadcast that setBot's startSetupPhase triggers arrives.
        if (msg.vsBot) created.setBot(OTHER_TEAM[slot.team], msg.botDifficulty ?? 'medium');
        return;
      }

      if (msg.type === 'join-room') {
        // One socket holding both seats would receive both teams' views, which is the whole of
        // fog of war gone.
        if (room) return send({ type: 'error', message: 'already-in-room' });
        const target = rooms.getRoom(msg.roomCode);
        if (!target) return send({ type: 'error', message: 'room-not-found' });
        const slot = target.addPlayer(socket);
        if (!slot) return send({ type: 'error', message: 'room-full' });
        room = target;
        team = slot.team;
        send({ type: 'room-joined', roomCode: target.code, team: slot.team, token: slot.token });
        target.notifyBothConnected(slot.team);
        target.broadcast();
        return;
      }

      if (msg.type === 'rejoin') {
        const target = rooms.getRoom(msg.roomCode);
        if (!target) return send({ type: 'error', message: 'room-not-found' });
        const foundTeam = target.findTeamByToken(msg.token);
        if (!foundTeam) return send({ type: 'error', message: 'invalid-token' });
        target.reattach(foundTeam, socket);
        room = target;
        team = foundTeam;
        send({ type: 'room-joined', roomCode: target.code, team: foundTeam, token: msg.token });
        target.notifyBothConnected(foundTeam);
        target.broadcast();
        return;
      }

      if (!room || !team) return send({ type: 'error', message: 'not-in-room' });
      room.handleMessage(team, msg);
    } catch (err) {
      console.error('[ws] error handling message:', err);
      try {
        send({ type: 'error', message: 'server-error' });
      } catch {
        // The socket itself is gone; nothing left to tell the client.
      }
    }
  });

  // Without this listener a transport-level error (an ECONNRESET is enough) is an unhandled
  // 'error' event, which Node throws — again taking down every game on the process.
  socket.on('error', (err) => {
    console.error('[ws] socket error:', err);
  });

  socket.on('close', () => {
    // Pass the socket so a late close from a replaced connection can't unbind whichever socket
    // currently holds the seat.
    if (room && team) room.detach(team, socket);
  });
}
