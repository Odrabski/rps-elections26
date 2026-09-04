# Analytics

Two halves, on purpose, because they answer different questions.

| | Where | Answers | Survives a deploy |
|---|---|---|---|
| **Clarity** | Microsoft, free, no volume cap | Where people come from, how many return, where they hesitate, session replay | Yes |
| **`/stats`** | This server, in memory | Who is connected *right now*, exact counts since the server started | No |

The split is not a compromise, it is the point. Clarity cannot tell you who is connected this second, and it only sees browsers where its script actually loaded — an ad blocker, a dead network, a locked-down phone and that session is invisible. The server sees every socket, exactly, for free. But the server has no disk (Fly gives this machine none) and a deploy replaces the machine, so nothing it counts survives a release.

Neither is switched on until you do the two things below. Both default to off, and the app runs perfectly well with no analytics at all.

---

## 1. Clarity — the long view

1. Sign in at [clarity.microsoft.com](https://clarity.microsoft.com) and create a project for `rps-politika.fly.dev`.
2. Copy the **project id** (the short string in `clarity.ms/tag/<id>`).
3. Paste it into `fly.toml`:

   ```toml
   [build]
     [build.args]
       VITE_CLARITY_ID = "abcd1234"
   ```

4. `flyctl deploy`.

It goes in `fly.toml` rather than a secret because Vite inlines `VITE_*` variables **at build time**, and a Fly secret only exists at runtime — long after the client bundle was built. It is not secret either way: the browser fetches `clarity.ms/tag/<id>`, so anyone with devtools can read it.

### What gets sent

From `client/src/utils/analytics.ts`. Nothing personal — there is no login, no name, no email. Country is resolved by Clarity from the request IP on its side.

**Events** (things that happened):

- `team_picked`, `game_started`, `game_ended`

**Tags** (facts about the session — these are what the dashboard filters and segments by):

- `team` — `coalition` / `opposition`
- `mode` — `bot` / `human`
- `result` — `won` / `lost`
- `end_reason` — `king-captured` / `no-moves-left` / `resigned`
- `length` — `under_2m` / `2_5m` / `over_5m`

So "how many people picked the coalition" is a **tag** filter, not an event count — and because it is a tag, every other number can be sliced by it: win rate by bloc, game length by bloc, and so on.

Session replay is on by default. Clarity masks text content, and this game has none worth masking beyond a four-character room code.

---

## 2. `/stats` — the live view

```sh
flyctl secrets set STATS_PASSWORD='<something long>'
```

Then open `https://rps-politika.fly.dev/stats` — the browser will ask for a username and password. The username defaults to `omri`; override it with `STATS_USER` if you like.

**With `STATS_PASSWORD` unset the route does not exist at all** — it 404s like any unknown path. That is deliberate. A page that is only protected *if* an environment variable happens to be set is one forgotten secret away from being public, so the safe state is off, not open.

The page shows:

- **Now** — open sockets, rooms, and which bloc each connected player is on
- **Rooms by phase** — waiting / placing / playing / finished
- **Which bloc people choose** — and the split
- **Games** — started, finished, bot vs. human, median length
- **Who wins** — and how games end

It refreshes itself every 10 seconds. Everything under "since the server started" resets on the next deploy; that is what Clarity is for.

To run it locally:

```sh
STATS_PASSWORD=test npm run dev     # then http://localhost:8787/stats
```
