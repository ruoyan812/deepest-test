// Shared helpers for Cloudflare Pages Functions (Turso over the HTTP API).
//
// The Turso /v2/pipeline endpoint uses the libSQL wire protocol:
//   body = { requests: [ { type: "execute", stmt: { sql, args } }, { type: "close" } ] }
// Each arg is { type: "text"|"integer", value: "<string>" } (value is always a string).
// Each returned cell is { type, value } — read cell.value.

export function normalizeName(n) {
  return (n || '').trim().toLowerCase();
}

// Build a typed pipeline argument. `value` is always serialized to a string.
export function t(v, type = 'text') {
  return { type, value: String(v) };
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Run one or more SQL statements through Turso's HTTP pipeline.
// `statements` is an array of { q: string, params?: t(...)[] }.
export function turso(context, statements) {
  const url = (context.env.TURSO_URL || '').replace(/^libsql:/, 'https:');
  const token = context.env.TURSO_TOKEN || '';
  const requests = statements.map((s) => ({
    type: 'execute',
    stmt: { sql: s.q, args: s.params || [] }
  }));
  requests.push({ type: 'close' });
  return fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  })
    .then((r) => r.json())
    .catch((e) => {
      console.error('turso error', e);
      return { results: [] };
    });
}

// Pull the row array out of a pipeline response. Each cell is { type, value }.
export function firstRows(resp) {
  try {
    const r = resp.results && resp.results[0];
    return (r && r.response && r.response.result && r.response.result.rows) || [];
  } catch {
    return [];
  }
}

export async function ensureTable(context) {
  await turso(context, [{
    q: `CREATE TABLE IF NOT EXISTS users (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          salt         TEXT NOT NULL,
          hash         TEXT NOT NULL,
          iterations   INTEGER NOT NULL,
          created_at   INTEGER NOT NULL
        )`
  }]);
  // Add the progress column for existing deployments (ALTER fails silently if
  // the column already exists).
  try {
    await turso(context, [{ q: 'ALTER TABLE users ADD COLUMN progress TEXT' }]);
  } catch (e) { /* column already present */ }
  // Add the is_admin flag for existing deployments (ALTER fails silently if
  // the column already exists).
  try {
    await turso(context, [{ q: 'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0' }]);
  } catch (e) { /* column already present */ }
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
