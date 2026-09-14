import { json, turso, firstRows, ensureTable, normalizeName, t, constantTimeEqual } from '../_lib.js';

// Verify the caller is an authenticated admin. Parses + validates the body so
// the caller also receives the parsed `body` back on success.
// Every mutating action requires the caller's password hash (derived client
// side) to match the stored account AND is_admin = 1.
async function requireAdmin(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return { error: json({ error: 'Invalid request body.' }, 400) }; }
  const caller = normalizeName(body.caller);
  const hash = body.hash;
  if (!caller || !hash) return { error: json({ error: 'Unauthorized.' }, 401) };
  await ensureTable(context);
  const res = await turso(context, [{ q: 'SELECT hash, is_admin FROM users WHERE name = ?', params: [t(caller)] }]);
  const rows = firstRows(res);
  if (!rows.length) return { error: json({ error: 'Unauthorized.' }, 401) };
  const stored = rows[0][0].value;
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(stored);
  if (!constantTimeEqual(a, b)) return { error: json({ error: 'Unauthorized.' }, 401) };
  if (!rows[0][1] || Number(rows[0][1].value) !== 1) return { error: json({ error: 'Admin only.' }, 403) };
  return { body };
}

// GET /api/admin?caller=&hash= — return whether the caller is an admin.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const caller = normalizeName(url.searchParams.get('caller'));
  const hash = url.searchParams.get('hash');
  if (!caller || !hash) return json({ isAdmin: false });
  await ensureTable(context);
  const res = await turso(context, [{ q: 'SELECT hash, is_admin FROM users WHERE name = ?', params: [t(caller)] }]);
  const rows = firstRows(res);
  if (!rows.length) return json({ isAdmin: false });
  const stored = rows[0][0].value;
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(stored);
  if (!constantTimeEqual(a, b)) return json({ isAdmin: false });
  return json({ isAdmin: !!(rows[0][1] && Number(rows[0][1].value)) });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;
  const { action, target } = auth.body;
  const key = normalizeName(target);

  if (action === 'list') {
    const res = await turso(context, [{
      q: 'SELECT name, display_name, is_admin, created_at FROM users ORDER BY created_at ASC'
    }]);
    const users = firstRows(res).map((r) => ({
      name: r[0].value,
      displayName: r[1].value,
      isAdmin: !!(r[2] && Number(r[2].value)),
      createdAt: r[3] && Number(r[3].value)
    }));
    return json({ users });
  }

  // 除 list 外，删除/重置/设管理员都需要明确的目标用户。
  if (!key) return json({ error: 'Missing target.' }, 400);



  if (action === 'delete') {
    // remove the account and its cloud progress together
    await turso(context, [
      { q: 'DELETE FROM users WHERE name = ?', params: [t(key)] },
      { q: 'DELETE FROM progress WHERE name = ?', params: [t(key)] }
    ]);
    return json({ ok: true });
  }

  if (action === 'reset') {
    const { salt, hash, iterations } = auth.body;
    if (!salt || !hash) return json({ error: 'Missing fields.' }, 400);
    await turso(context, [{
      q: 'UPDATE users SET salt = ?, hash = ?, iterations = ? WHERE name = ?',
      params: [t(salt), t(hash), t(iterations || 100000, 'integer'), t(key)]
    }]);
    return json({ ok: true });
  }

  if (action === 'setAdmin') {
    const value = auth.body.value ? 1 : 0;
    await turso(context, [{
      q: 'UPDATE users SET is_admin = ? WHERE name = ?',
      params: [t(value, 'integer'), t(key)]
    }]);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, 400);
}
