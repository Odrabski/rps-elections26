import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms/RoomManager.js';
import { handleConnection } from './ws/connection.js';

const PORT = Number(process.env.PORT) || 8787;

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });
const rooms = new RoomManager();

wss.on('connection', (socket) => handleConnection(socket, rooms));

httpServer.listen(PORT, () => {
  console.log(`RPS Politika server listening on ws://localhost:${PORT}`);
});
