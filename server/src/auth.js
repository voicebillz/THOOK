// Admin auth: the admin wallet (ADMIN_WALLET on Railway) signs a short
// message in the browser; works for EOAs and smart wallets (ERC-1271/6492).
//   x-admin-message: "THOOK admin\naction: <action>\nts: <unix ms>"
//   x-admin-signature: 0x…
import { pub } from "./chain.js";
import { env } from "./config.js";

const used = new Map(); // signature -> expiry (replay guard)

export function requireAdmin(action) {
  return async (req, res, next) => {
    try {
      if (!env.ADMIN_WALLET) return res.status(503).json({ error: "ADMIN_WALLET not set on the server" });
      const message = String(req.get("x-admin-message") || "").replace(/\\n/g, "\n");
      const signature = String(req.get("x-admin-signature") || "");
      const m = /^THOOK admin\naction: ([a-z-]+)\nts: (\d+)$/.exec(message);
      if (!m || !/^0x[0-9a-fA-F]+$/.test(signature)) return res.status(401).json({ error: "missing admin signature" });
      if (m[1] !== action && m[1] !== "session") return res.status(401).json({ error: "wrong action" });
      const age = Date.now() - Number(m[2]);
      // "session" signatures last 12h so the portal doesn't prompt on every click.
      const maxAge = m[1] === "session" ? 12 * 3600_000 : 10 * 60_000;
      if (age < -60_000 || age > maxAge) return res.status(401).json({ error: "signature expired — sign in again" });
      if (m[1] !== "session" && used.has(signature)) return res.status(401).json({ error: "signature already used" });
      const ok = await pub.verifyMessage({ address: env.ADMIN_WALLET, message, signature });
      if (!ok) return res.status(403).json({ error: "not the admin wallet" });
      if (m[1] !== "session") used.set(signature, Date.now() + maxAge);
      for (const [k, exp] of used) if (exp < Date.now()) used.delete(k);
      next();
    } catch (err) {
      res.status(401).json({ error: String(err?.message || err) });
    }
  };
}
