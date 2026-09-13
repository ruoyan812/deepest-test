import { json, turso, firstRows, ensureTable, normalizeName, t } from '../../_lib.js';

export async function onRequestGet(context) {
  const key = normalizeName(decodeURIComponent(context.params.name));
  await ensureTable(context);
  const res = await turso(context, [{
    q: 'SELECT salt, iterations FROM users WHERE name = ?',
    params: [t(key)]
  }]);
  const rows = firstRows(res);
  if (!rows.length) return json({ exists: false }, 404);
  return json({ exists: true, salt: rows[0][0].value, iterations: Number(rows[0][1].value) });
}
