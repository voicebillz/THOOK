// THOOK server (Railway): public API for the website, admin API for the
// portal, and the keeper loop (holder index → daily snapshots → weekly
// Claude-audited "top loser" airdrop from ThookFeeVault).
import express from "express";
import { formatEther, getAddress, isAddress } from "viem";
import { env, deployment, saveDeployment, readJson, POOL_MANAGER } from "./config.js";
import { initStore, flushStore, storeKind, keys, deleteKey } from "./store.js";
import { pub, keeperAccount, vaultAbi, seederAbi, hookAbi } from "./chain.js";
import { requireAdmin } from "./auth.js";
import { syncHolders, holderState } from "./holders.js";
import { takeSnapshot, epochClock } from "./snapshots.js";
import { settleEpoch, buildReport, weekSnaps } from "./payout.js";
import { getStats, getToken, listReports } from "./stats.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", env.CORS_ORIGIN);
  res.set("Access-Control-Allow-Headers", "content-type, x-admin-message, x-admin-signature");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error(req.path, err);
  res.status(500).json({ error: String(err?.shortMessage || err?.message || err) });
});

const runs = { lastTick: null, lastSnapshot: null, lastSettle: null, lastError: null };

// ------------------------------------------------------------------ public
app.get("/health", (_req, res) => res.json({ ok: true, store: storeKind() }));

app.get("/api/config", (_req, res) => {
  const d = deployment();
  res.json({
    chainId: 4663,
    poolManager: POOL_MANAGER,
    admin: env.ADMIN_WALLET || null,
    keeper: keeperAccount?.address || null,
    minHoldThook: Number(env.MIN_HOLD / 10n ** 18n),
    ...d,
  });
});

app.get("/api/stats", wrap(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=10");
  res.json(await getStats());
}));

app.get("/api/token", wrap(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=30");
  res.json(await getToken());
}));

app.get("/api/epochs", wrap(async (_req, res) => res.json(listReports())));

app.get("/api/reports/:epoch", (req, res) => {
  const r = readJson(`reports/epoch-${Number(req.params.epoch)}.json`, null);
  if (!r) return res.status(404).json({ error: "no report" });
  res.json(r);
});

// ------------------------------------------------------------------- admin
app.get("/api/admin/status", requireAdmin("session"), wrap(async (_req, res) => {
  const d = deployment();
  const out = { store: storeKind(), deployment: d, runs, keeper: keeperAccount?.address || null, keeperEnabled: env.KEEPER_ENABLED };
  if (keeperAccount) out.keeperBalanceEth = Number(formatEther(await pub.getBalance({ address: keeperAccount.address })));
  if (d.vault) {
    const r = (fn) => pub.readContract({ address: d.vault, abi: vaultAbi, functionName: fn }).catch(() => null);
    const [owner, pendingOwner, keeper, paused, minHold, maxWinners, maxPayoutBps] = await Promise.all(
      ["owner", "pendingOwner", "keeper", "paused", "minHold", "maxWinners", "maxPayoutBps"].map(r)
    );
    out.vault = { owner, pendingOwner, keeper, paused, minHold: minHold?.toString(), maxWinners, maxPayoutBps };
  }
  out.clock = await epochClock().catch(() => null);
  if (out.clock) out.week = { snapshots: weekSnaps(out.clock.epoch).snaps.length };
  const hs = holderState();
  out.holders = { indexed: Object.keys(hs.balances).length, cursor: hs.cursor, syncedAt: hs.syncedAt || null };
  res.json(out);
}));

// The portal posts the addresses it just deployed; the server checks they are
// wired together on-chain before saving.
app.post("/api/admin/config", requireAdmin("session"), wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of ["token", "vault", "seeder", "hook", "hookDeployer", "safe"]) {
    if (b[k] != null && b[k] !== "" && !isAddress(b[k])) return res.status(400).json({ error: `bad ${k}` });
  }
  const next = { ...deployment(), ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== "" && v != null)) };
  const problems = [];
  if (next.vault && next.token) {
    const t = await pub.readContract({ address: next.vault, abi: vaultAbi, functionName: "thook" }).catch(() => null);
    if (!t || getAddress(t) !== getAddress(next.token)) problems.push("vault.thook() != token");
  }
  if (next.hook) {
    const [t, v, i] = await Promise.all(["token", "vault", "initializer"].map((fn) =>
      pub.readContract({ address: next.hook, abi: hookAbi, functionName: fn }).catch(() => null)));
    if (next.token && (!t || getAddress(t) !== getAddress(next.token))) problems.push("hook.token() != token");
    if (next.vault && (!v || getAddress(v) !== getAddress(next.vault))) problems.push("hook.vault() != vault");
    if (next.seeder && (!i || getAddress(i) !== getAddress(next.seeder))) problems.push("hook.initializer() != seeder");
  }
  if (next.seeder && !b.poolId) {
    const seeded = await pub.readContract({ address: next.seeder, abi: seederAbi, functionName: "seeded" }).catch(() => false);
    if (seeded) b.poolId = await pub.readContract({ address: next.seeder, abi: seederAbi, functionName: "poolId" });
  }
  if (problems.length) return res.status(400).json({ error: problems.join("; ") });
  res.json(saveDeployment(b));
  syncHolders().catch(() => {});
}));

app.post("/api/admin/run", requireAdmin("session"), wrap(async (req, res) => {
  const task = String(req.body?.task || "");
  const clock = await epochClock();
  if (task === "sync") return res.json(await syncHolders().then((s) => ({ indexed: Object.keys(s.balances).length })));
  if (task === "snapshot") return res.json({ ok: true, snap: !!(await takeSnapshot({ force: !!req.body?.force })) });
  if (task === "preview") {
    const epoch = Number(req.body?.epoch ?? (clock ? clock.epoch - 1 : 0));
    return res.json(await buildReport(epoch));
  }
  if (task === "settle") {
    const epoch = Number(req.body?.epoch ?? (clock ? clock.epoch - 1 : 0));
    return res.json(await settleEpoch(epoch, { dryRun: !!req.body?.dryRun }));
  }
  res.status(400).json({ error: "unknown task" });
}));

// ------------------------------------------------------------------ keeper
async function tick() {
  runs.lastTick = Date.now();
  const d = deployment();
  if (!d.vault || !d.token) return;
  await syncHolders();
  const clock = await epochClock();
  const snap = await takeSnapshot();
  if (snap) runs.lastSnapshot = Date.now();
  // Snapshots are only needed until their week is settled: keep the last 3 weeks.
  if (clock) for (const k of keys("snap/")) {
    const m = /^snap\/e(\d+)-d\d+\.json$/.exec(k);
    if (m && Number(m[1]) < clock.epoch - 3) deleteKey(k);
  }
  // Settle every ended, unpaid epoch that has its end snapshot.
  if (env.KEEPER_ENABLED && clock && clock.epoch > 0) {
    for (let e = Math.max(0, clock.epoch - 4); e < clock.epoch; e++) {
      const paid = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: "epochPaid", args: [BigInt(e)] });
      if (paid || !weekSnaps(e).hasEnd) continue;
      runs.lastSettle = { epoch: e, at: Date.now(), result: await settleEpoch(e) };
    }
  }
}

async function loop() {
  try {
    await tick();
    runs.lastError = null;
  } catch (err) {
    runs.lastError = { at: Date.now(), message: String(err?.shortMessage || err?.message || err) };
    console.error("[keeper]", err);
  }
  setTimeout(loop, 10 * 60_000);
}

await initStore();
app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`THOOK server on :${env.PORT} — store ${storeKind()} · admin ${env.ADMIN_WALLET || "(unset)"} · keeper ${keeperAccount?.address || "(unset)"} · payouts ${env.KEEPER_ENABLED ? "ON" : "OFF"}`);
  setTimeout(loop, 5_000);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { flushStore().finally(() => process.exit(0)); });
}
