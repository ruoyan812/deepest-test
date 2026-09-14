import { json, turso, firstRows, ensureTable, normalizeName, t, constantTimeEqual } from '../_lib.js';

// Mirror each account's inventory/weapon/backpack/reached-scene onto the server
// so the same account keeps its gear on any device. Stored in a dedicated
// `progress` table keyed by the (normalized) player name.
async function ensureProgressTable(context) {
  await ensureTable(context); // makes sure the users table exists too
  await turso(context, [{
    q: `CREATE TABLE IF NOT EXISTS progress (
          name              TEXT PRIMARY KEY,
          inventory         TEXT NOT NULL,
          weapon_slot       TEXT,
          backpack_unlocked INTEGER NOT NULL DEFAULT 0,
          reached           TEXT NOT NULL DEFAULT 'chase',
          updated_at        INTEGER NOT NULL
        )`
  }]);
}

export async function onRequestGet(context) {
  const name = normalizeName(new URL(context.request.url).searchParams.get('name'));
  if (!name) return json({ error: 'Missing name.' }, 400);
  await ensureProgressTable(context);
  const res = await turso(context, [{
    q: 'SELECT inventory, weapon_slot, backpack_unlocked, reached FROM progress WHERE name = ?',
    params: [t(name)]
  }]);
  const rows = firstRows(res);
  if (!rows.length) return json({ progress: null });
  const r = rows[0];
  let inventory = {};
  try { inventory = JSON.parse(r[0].value || '{}'); } catch (e) { inventory = {}; }
  const rawSlot = r[1] && r[1].value;
  const weaponSlot = (rawSlot && rawSlot !== 'null' && rawSlot !== 'NULL') ? rawSlot : null;
  const backpackUnlocked = !!(r[2] && Number(r[2].value));
  const reached = (r[3] && r[3].value) ? r[3].value : 'chase';
  return json({ progress: { inventory, weaponSlot, backpackUnlocked, reached } });
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: 'Invalid request body.' }, 400); }
  const { name, hash, progress } = body || {};
  const key = normalizeName(name);
  if (!key || !progress) return json({ error: 'Missing fields.' }, 400);
  await ensureProgressTable(context);

  // If a password hash was supplied, verify it matches the stored account so a
  // random client can't overwrite someone else's gear.
  if (hash) {
    const u = await turso(context, [{ q: 'SELECT hash FROM users WHERE name = ?', params: [t(key)] }]);
    const ur = firstRows(u);
    if (ur.length) {
      const stored = ur[0][0].value;
      const a = new TextEncoder().encode(hash);
      const b = new TextEncoder().encode(stored);
      if (!constantTimeEqual(a, b)) return json({ ok: false, error: 'Unauthorized.' }, 401);
    }
  }

  const inventory = JSON.stringify(progress.inventory || {});
  const weaponSlot = progress.weaponSlot || null;
  const backpackUnlocked = progress.backpackUnlocked ? 1 : 0;
  const reached = progress.reached || 'chase';
  await turso(context, [{
    q: `INSERT INTO progress (name, inventory, weapon_slot, backpack_unlocked, reached, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          inventory = excluded.inventory,
          weapon_slot = excluded.weapon_slot,
          backpack_unlocked = excluded.backpack_unlocked,
          reached = excluded.reached,
          updated_at = excluded.updated_at`,
    params: [t(key), t(inventory), t(weaponSlot), t(backpackUnlocked, 'integer'), t(reached), t(Date.now(), 'integer')]
  }]);
  return json({ ok: true });
}
