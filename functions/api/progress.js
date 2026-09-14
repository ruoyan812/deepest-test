import { json, turso, firstRows, ensureTable, normalizeName, t, constantTimeEqual } from '../_lib.js';

async function storedHash(context, key) {
  const res = await turso(context, [{ q: 'SELECT hash FROM users WHERE name = ?', params: [t(key)] }]);
  const rows = firstRows(res);
  return rows.length ? rows[0][0].value : null;
}

// GET /api/progress?name=...  -> return the saved progress JSON (or null)
export async function onRequestGet(context) {
  const key = normalizeName(new URL(context.request.url).searchParams.get('name'));
  if (!key) return json({ progress: null });
  await ensureTable(context);
  const res = await turso(context, [{ q: 'SELECT progress FROM users WHERE name = ?', params: [t(key)] }]);
  const rows = firstRows(res);
  if (!rows.length || !rows[0][0] || !rows[0][0].value) return json({ progress: null });
  let prog = null;
  try { prog = JSON.parse(rows[0][0].value); } catch (e) { prog = null; }
  return json({ progress: prog });
}

// POST /api/progress  { name, hash, progress }  -> authenticate, then upsert progress
export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const { name, hash, progress } = body || {};
  if (!name || !hash) return json({ error: 'Missing fields.' }, 400);

  const key = normalizeName(name);
  await ensureTable(context);
  const stored = await storedHash(context, key);
  if (!stored) return json({ error: 'Name not found.' }, 404);
  if (!constantTimeEqual(new TextEncoder().encode(hash), new TextEncoder().encode(stored))) {
    return json({ error: 'Auth failed.' }, 401);
  }

  const prog = JSON.stringify(progress || {});
  await turso(context, [{ q: 'UPDATE users SET progress = ? WHERE name = ?', params: [t(prog), t(key)] }]);
  return json({ ok: true });
}
