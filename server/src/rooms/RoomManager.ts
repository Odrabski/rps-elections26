import { Room } from './Room.js';
import { generateRoomCode } from '../util/idgen.js';

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }
}
