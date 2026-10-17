import { db } from "../db/index.js";

const upsert = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const select = db.prepare(`SELECT value FROM settings WHERE key = ?`);

export function getSetting(key, fallback = null) {
  const row = select.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function setSetting(key, value) {
  upsert.run(key, JSON.stringify(value));
}
