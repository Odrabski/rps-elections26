import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Team } from 'shared';
import { RoomManager } from '../rooms/RoomManager.js';
import type { Room } from '../rooms/Room.js';

const OTHER_TEAM: Record<Team, Team> = { red: 'blue', blue: 'red' };

export function handleConnection(socket: WebSocket, rooms: RoomManager): void {
  let room: Room | null = null;
  let team: Team | null = null;

  const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send({ type: 'error', message: 'invalid-json' });
    }

    if (msg.type === 'create-room') {
      room = rooms.createRoom();
      const slot = room.addPlayer(socket, msg.team);
      team = slot!.team;
      send({ type: 'room-created', roomCode: room.code, team: slot!.team, token: slot!.token });
      // Sent after room-created so the client's roomCode/team are already set by the time the
      // state broadcast that setBot's startSetupPhase triggers arrives.
      if (msg.vsBot) room.setBot(OTHER_TEAM[slot!.team], msg.botDifficulty ?? 'medium');
      return;
    }

    if (msg.type === 'join-room') {
      const target = rooms.getRoom(msg.roomCode);
      if (!target) return send({ type: 'error', message: 'room-not-found' });
      const slot = target.addPlayer(socket);
      if (!slot) return send({ type: 'error', message: 'room-full' });
      room = target;
      team = slot.team;
      send({ type: 'room-joined', roomCode: room.code, team: slot.team, token: slot.token });
      room.notifyOpponentConnected(slot.team);
      room.broadcast();
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
      send({ type: 'room-joined', roomCode: room.code, team: foundTeam, token: msg.token });
      room.notifyOpponentConnected(foundTeam);
      room.broadcast();
      return;
    }

    if (!room || !team) return send({ type: 'error', message: 'not-in-room' });
    room.handleMessage(team, msg);
  });

  socket.on('close', () => {
    if (room && team) room.detach(team);
  });
}
