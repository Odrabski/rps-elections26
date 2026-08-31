import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import sirv from 'sirv';
import { RoomManager } from './rooms/RoomManager.js';
import { handleConnection } from './ws/connection.js';

const PORT = Number(process.env.PORT) || 8787;

// In production this same process also serves the client's built static files (see Dockerfile) —
// a single deployable service, same origin for both the page and its WebSocket connection. In
// local dev the client is served separately by Vite (port 5199), so this directory never exists
// and every request just falls through to the 404 handler below — harmless, since nothing hits
// this server's HTTP routes directly in dev, only its WebSocket upgrade.
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
const serveStatic = sirv(clientDist, { single: true, dev: process.env.NODE_ENV !== 'production' });

const httpServer = createServer((req, res) => {
  serveStatic(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});
const wss = new WebSocketServer({ server: httpServer });
const rooms = new RoomManager();

wss.on('connection', (socket) => handleConnection(socket, rooms));

// Explicit 0.0.0.0 — Node's own default binding is inconsistent across container base images
// (some only end up reachable on ::1/loopback), which is invisible locally but leaves the app
// unreachable from Fly's proxy in production.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`RPS Politika server listening on http://0.0.0.0:${PORT}`);
});
