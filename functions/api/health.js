import { json } from '../../_lib.js';

// Lightweight probe so the front-end can detect whether a backend is present.
export function onRequestGet() {
  return json({ ok: true });
}
