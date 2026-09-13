import { json, turso, firstRows, ensureTable, normalizeName, t, constantTimeEqual } from '../_lib.js';

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }
  const { name, hash } = body || {};
  if (!name || !hash) return json({ ok: false, error: 'Missing fields.' }, 400);

  const key = normalizeName(name);
  await ensureTable(context);

  const res = await turso(context, [{
    q: 'SELECT hash FROM users WHERE name = ?',
    params: [t(key)]
  }]);
  const rows = firstRows(res);
  if (!rows.length) return json({ ok: false, error: 'Name not found.' }, 404);

  const stored = rows[0][0].value;
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(stored);
  if (!constantTimeEqual(a, b)) return json({ ok: false, error: 'Password incorrect.' }, 401);

  return json({ ok: true });
}
