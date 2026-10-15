// Key → JSON document store. Uses Railway Postgres when DATABASE_URL is set
// (table thook_kv), otherwise JSON files in DATA_DIR (local dev).
// Reads are synchronous from an in-memory cache loaded at startup; writes go
// to the cache immediately and are persisted in order per key.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const cache = new Map();
const chains = new Map(); // key -> promise (keeps writes ordered per key)
let pool = null;

const replacer = (_, v) => (typeof v === "bigint" ? v.toString() : v);

export const storeKind = () => (pool ? "postgres" : "files");

export async function initStore() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[store] files in ${DATA_DIR} (set DATABASE_URL to use Postgres)`);
    return;
  }
  // Railway's internal URL (*.railway.internal) is plain TCP; the public proxy wants TLS.
  const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === "false" ? false : { rejectUnauthorized: false };
  pool = new pg.Pool({ connectionString: url, ssl, max: 5 });
  await pool.query(`CREATE TABLE IF NOT EXISTS thook_kv (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query("SELECT key, value FROM thook_kv");
  for (const r of rows) cache.set(r.key, r.value);
  console.log(`[store] postgres: ${rows.length} documents loaded`);
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

export function readJson(name, fallback) {
  if (cache.has(name)) return structuredClone(cache.get(name));
  if (!pool) {
    try {
      const v = JSON.parse(fs.readFileSync(filePath(name), "utf8"));
      cache.set(name, v);
      return structuredClone(v);
    } catch { /* missing */ }
  }
  return fallback;
}

export function writeJson(name, value) {
  const json = JSON.stringify(value, replacer);
  const doc = JSON.parse(json);
  cache.set(name, doc);
  if (!pool) {
    const file = filePath(name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", json);
    fs.renameSync(file + ".tmp", file);
    return;
  }
  enqueue(name, () => pool.query(
    "INSERT INTO thook_kv (key, value, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [name, json],
  ));
}

function enqueue(name, op) {
  const prev = chains.get(name) || Promise.resolve();
  const next = prev.then(op).catch((err) => console.error(`[store] ${name}:`, err.message));
  chains.set(name, next);
  next.finally(() => { if (chains.get(name) === next) chains.delete(name); });
}

export function deleteKey(name) {
  cache.delete(name);
  if (!pool) { try { fs.unlinkSync(filePath(name)); } catch { /* gone */ } return; }
  enqueue(name, () => pool.query("DELETE FROM thook_kv WHERE key = $1", [name]));
}

export function keys(prefix = "") {
  if (pool) return [...cache.keys()].filter((k) => k.startsWith(prefix));
  const dir = path.dirname(filePath(prefix + "x"));
  try {
    return fs.readdirSync(dir).map((f) => path.posix.join(path.dirname(prefix + "x"), f)).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}

/** Wait for queued writes (graceful shutdown). */
export async function flushStore() {
  await Promise.all([...chains.values()]);
  if (pool) { await pool.end(); pool = null; }
  cache.clear();
}
