import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import sirv from 'sirv';
import { RoomManager } from './rooms/RoomManager.js';
import { handleConnection } from './ws/connection.js';
import { renderStatsPage } from './stats/page.js';

const PORT = Number(process.env.PORT) || 8787;

// In production this same process also serves the client's built static files (see Dockerfile) —
// a single deployable service, same origin for both the page and its WebSocket connection. In
// local dev the client is served separately by Vite (port 5199), so this directory never exists
// and every request just falls through to the 404 handler below — harmless, since nothing hits
// this server's HTTP routes directly in dev, only its WebSocket upgrade.
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
const isProd = process.env.NODE_ENV === 'production';

/** Vite's own output is content-hashed (`index-D6N4DVeD.js`), so its URL changes whenever the file
 * does. The art under /assets/pieces is *not* — those keep stable names across art swaps, so
 * caching them immutably would leave players looking at last month's sprites for a year. */
const HASHED_FILENAME = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;

const serveStatic = sirv(clientDist, {
  single: true,
  dev: !isProd,
  // Serve the .br/.gz siblings written at build time (see client/scripts/precompress.mjs) —
  // sirv only looks for them when asked, and without this the bundle goes out raw.
  brotli: isProd,
  gzip: isProd,
  etag: true,
  setHeaders(res, pathname) {
    if (!isProd) return;
    if (HASHED_FILENAME.test(pathname)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (pathname.startsWith('/assets/')) {
      // Cached, but revalidated against the ETag — a replaced sprite shows up on the next load
      // rather than being pinned for a year.
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    } else {
      // index.html: never cache, or a deploy can't reach anyone.
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
});

/**
 * The operator's stats page (see stats/page.ts), behind HTTP basic auth.
 *
 * With STATS_PASSWORD unset the route does not exist at all — it 404s and falls through to the
 * static handler like any other unknown path. That is deliberate: a page that is only protected
 * *if* an environment variable happens to be set is one forgotten secret away from being public,
 * so the safe state is "off", not "open".
 */
const STATS_PASSWORD = process.env.STATS_PASSWORD;
const STATS_USER = process.env.STATS_USER ?? 'omri';

function authorized(header: string | undefined): boolean {
  if (!STATS_PASSWORD || !header?.startsWith('Basic ')) return false;
  const expected = Buffer.from(`${STATS_USER}:${STATS_PASSWORD}`);
  const got = Buffer.from(Buffer.from(header.slice(6), 'base64').toString('utf8'));
  // Compared in constant time, and only when the lengths already match — timingSafeEqual throws
  // on a length mismatch, which would itself leak the length.
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const httpServer = createServer((req, res) => {
  if (STATS_PASSWORD && req.url?.split('?')[0] === '/stats') {
    if (!authorized(req.headers.authorization)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="stats", charset="UTF-8"',
        'content-type': 'text/plain; charset=utf-8',
      });
      return res.end('נדרשת סיסמה');
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(renderStatsPage(rooms.liveSnapshot(wss.clients.size), process.env.VITE_CLARITY_ID));
  }

  serveStatic(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});
// The `ws` default payload cap is 100 MiB, which one client could make the process allocate
// (twice, via toString + JSON.parse) per frame. Nothing this protocol sends is remotely that big.
const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
const rooms = new RoomManager();

wss.on('connection', (socket) => handleConnection(socket, rooms));

// Explicit 0.0.0.0 — Node's own default binding is inconsistent across container base images
// (some only end up reachable on ::1/loopback), which is invisible locally but leaves the app
// unreachable from Fly's proxy in production.
// Last line of defence. Every room in this process shares one event loop, so an unhandled error
// anywhere would otherwise end every game in progress — log and keep serving instead. Individual
// message handling has its own try/catch (ws/connection.ts); this only catches what escapes that.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`RPS Politika server listening on http://0.0.0.0:${PORT}`);
});
