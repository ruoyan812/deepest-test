import { json, turso, firstRows, ensureTable, normalizeName, t } from '../_lib.js';

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const { name, salt, hash, iterations } = body || {};
  if (!name || !salt || !hash) return json({ error: 'Missing fields.' }, 400);

  const key = normalizeName(name);
  await ensureTable(context);

  const existing = await turso(context, [{
    q: 'SELECT name FROM users WHERE name = ?',
    params: [t(key)]
  }]);
  if (firstRows(existing).length) {
    return json({ error: 'That name is already taken — please choose another name.' }, 409);
  }

  const id = crypto.randomUUID();
  await turso(context, [{
    q: 'INSERT INTO users (id, name, display_name, salt, hash, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [t(id), t(key), t(name), t(salt), t(hash), t(iterations || 100000, 'integer'), t(Date.now(), 'integer')]
  }]);
  return json({ ok: true });
}
