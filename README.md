# Deepest

A browser-based 2D side-scrolling survival platformer (poison-gas chase → cave boss → bat nest)
with player accounts stored in a **Turso** (libSQL) database.

## Layout

- `Deepest/` — the static front-end game (`index.html`, `main.js`, `assets/`, `favicon.png`)
- `functions/` — Cloudflare Pages Functions that talk to Turso over its HTTP API
  - `api/health.js` — backend probe
  - `api/user/[name].js` — returns a user's salt/iterations
  - `api/register.js` — create an account
  - `api/login.js` — verify credentials (constant-time compare)
- `server.js` — optional local Node/Express backend (same API) for local development
- `wrangler.toml` — Cloudflare Pages config (build output = `Deepest`)
- `package.json` — local backend dependencies

## How accounts work

The front-end calls `/api/*` (same origin). On startup it probes `/api/health`:
- **Backend present** (local Node server, or Cloudflare Pages Functions) → accounts are stored
  in **Turso** (passwords hashed in the browser with PBKDF2; plaintext never leaves the browser).
- **No backend** (e.g. opened as a `file://`, or a static host without Functions) → it
  automatically falls back to **`localStorage`** browser accounts so the game stays playable.

## Run locally (Node backend + Turso)

```bash
npm install
# create a .env (already git-ignored) with:
#   TURSO_URL=libsql://<your-db>.turso.io
#   TURSO_TOKEN=<your-token>
#   PORT=3000
npm start
# open http://localhost:3000
```

`server.js` creates the `users` table automatically on first request.

## Deploy to Cloudflare Pages (front-end + Turso backend)

Cloudflare Pages hosts both the static site and the `functions/` backend, so the live site
uses **Turso** for accounts (no separate server needed).

1. In Cloudflare Pages, **Create a project** and connect the GitHub repo
   `deepest-test`.
2. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`Deepest`**
   - (Functions are picked up automatically from `/functions`.)
3. In **Settings → Environment variables**, add (for both Production and Preview):
   - `TURSO_URL` = `libsql://***.turso.io`
   - `TURSO_TOKEN` = `<your-turso-token>`
4. Deploy. The site goes live at `https://<project>.pages.dev` and accounts are stored in Turso.

> The `functions/` backend uses Turso's `/v2/pipeline` HTTP API (libSQL wire protocol), so it
> runs directly on Cloudflare's edge with no Node server.

## Notes

- `.env` (contains the Turso token) is git-ignored and is **never** committed.
- `server.js` is only needed for local development; production uses the Cloudflare Function.
