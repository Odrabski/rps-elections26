import { Room } from './Room.js';
import { generateRoomCode } from '../util/idgen.js';

/** How long an empty room is kept alive so a refresh or a dropped connection can still rejoin it
 * with its token. Comfortably longer than a page reload, far shorter than a whole session. */
const ABANDONED_GRACE_MS = 2 * 60 * 1000;
/** How often abandoned rooms are swept up. */
const SWEEP_INTERVAL_MS = 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** When each currently-empty room became empty. Rooms with anyone attached aren't in here. */
  private emptySince = new Map<string, number>();

  constructor() {
    // Rooms used to live for the lifetime of the process — every game ever started stayed in
    // memory, along with its state and socket references, and any room whose players walked away
    // kept its timers running (an abandoned setup timer even starts a game that then plays itself
    // out move by move). Nothing ever removed them, so this sweep is what makes the server
    // survivable over days rather than hours.
    const sweep = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Don't hold the process open just for the sweeper.
    sweep.unref?.();
  }

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

  get size(): number {
    return this.rooms.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (!room.isAbandoned) {
        this.emptySince.delete(code);
        continue;
      }
      const since = this.emptySince.get(code);
      if (since === undefined) {
        this.emptySince.set(code, now);
      } else if (now - since >= ABANDONED_GRACE_MS) {
        room.destroy();
        this.rooms.delete(code);
        this.emptySince.delete(code);
      }
    }
  }
}
