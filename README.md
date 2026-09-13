# Deepest

A browser-based 2D side-scrolling survival platformer (poison-gas chase → cave boss → bat nest),
with local accounts and an optional Turso (libSQL) backend.

## Project layout

- `Deepest/` — the static front-end game (`index.html`, `main.js`, `assets/`, `favicon.png`)
- `server.js` — optional Node/Express backend that stores accounts in a Turso database
- `package.json` — backend dependencies

## How accounts are stored

- When served by the local Node server (`localhost` / `127.0.0.1`), the game uses the
  **Turso backend** (`server.js`) to store usernames + PBKDF2 password hashes.
- When there is no server (e.g. opened as a `file://` or hosted on **GitHub Pages**),
  it automatically **falls back to `localStorage`** browser accounts so the game stays playable.

> Passwords are always hashed in the browser with PBKDF2 (SHA-256, 100k iterations);
> the plaintext password never leaves the browser.

## Run locally (with Turso backend)

```bash
npm install
npm start          # reads TURSO_URL / TURSO_TOKEN from .env
# open http://localhost:3000
```

Create a `.env` (already git-ignored) with:

```
TURSO_URL=libsql://<your-db>.turso.io
TURSO_TOKEN=<your-token>
PORT=3000
```

The server creates the `users` table automatically on startup.

## Deploy to GitHub Pages

The game is fully static, so it can be hosted on GitHub Pages:

1. Push this repo to GitHub.
2. In the repo **Settings → Pages**, set *Source* to **GitHub Actions**.
3. On the next push to `main`, the workflow (`.github/workflows/deploy.yml`) publishes
   the `Deepest/` folder. Your game will be live at `https://<user>.github.io/<repo>/`.

On GitHub Pages the game uses **local browser accounts** (no server runs there).
If you want Turso accounts on the live site, host `server.js` on a Node host
(e.g. Render / Railway / Fly.io) and point the front-end at its URL.
