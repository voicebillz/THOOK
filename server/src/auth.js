// Admin auth. The owner wallet (ADMIN_WALLET) signs a session message bound to
// the site domain — a signature phished on another site is useless here.
//   x-admin-message:   "THOOK admin\ndomain: thook.vip\naction: session\nts: <unix ms>"  (\n escaped)
//   x-admin-signature: 0x…
// Works for EOAs and smart wallets (ERC-1271/6492 via viem verifyMessage).
import { pub } from "./chain.js";
import { env } from "./config.js";

const SESSION_MS = 4 * 3600_000;
const fails = new Map(); // ip -> { n, until }
const verified = new Map(); // signature -> expiry (skip re-verifying on every call)

function allowedDomain(d) {
  const base = env.ADMIN_DOMAIN.toLowerCase();
  const extra = (process.env.ADMIN_DOMAINS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return d === base || d === `www.${base}` || extra.includes(d);
}

function tooMany(ip) {
  const f = fails.get(ip);
  return f && f.n >= 10 && f.until > Date.now();
}
function fail(ip) {
  const f = fails.get(ip) && fails.get(ip).until > Date.now() ? fails.get(ip) : { n: 0, until: Date.now() + 15 * 60_000 };
  f.n++; fails.set(ip, f);
}

export async function checkAdmin(req) {
  const ip = req.ip || "?";
  if (tooMany(ip)) return { ok: false, code: 429, error: "too many failed attempts — wait 15 minutes" };
  if (!env.ADMIN_WALLET) return { ok: false, code: 503, error: "ADMIN_WALLET not set on the server" };
  const message = String(req.get("x-admin-message") || "").replace(/\\n/g, "\n");
  const signature = String(req.get("x-admin-signature") || "");
  const m = /^THOOK admin\ndomain: ([a-z0-9.-]+(?::\d+)?)\naction: session\nts: (\d+)$/.exec(message);
  if (!m || !/^0x[0-9a-fA-F]+$/.test(signature)) return { ok: false, code: 401, error: "sign in first" };
  if (!allowedDomain(m[1])) { fail(ip); return { ok: false, code: 401, error: "signature was made for another site" }; }
  const age = Date.now() - Number(m[2]);
  if (age < -60_000 || age > SESSION_MS) return { ok: false, code: 401, error: "session expired — sign in again" };
  const cached = verified.get(signature);
  if (!cached || cached.message !== message) {
    const ok = await pub.verifyMessage({ address: env.ADMIN_WALLET, message, signature }).catch(() => false);
    if (!ok) { fail(ip); return { ok: false, code: 403, error: "not the admin wallet" }; }
    verified.set(signature, { message, exp: Number(m[2]) + SESSION_MS });
    for (const [k, v] of verified) if (v.exp < Date.now()) verified.delete(k);
  }
  return { ok: true };
}

export function requireAdmin() {
  return async (req, res, next) => {
    try {
      const r = await checkAdmin(req);
      if (!r.ok) return res.status(r.code).json({ error: r.error });
      next();
    } catch (err) {
      res.status(401).json({ error: String(err?.message || err) });
    }
  };
}
