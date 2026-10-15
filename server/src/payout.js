// Settle an ended epoch: score → Claude audit → report → payEpoch on-chain.
import { formatEther, keccak256, toBytes, getAddress } from "viem";
import { pub, keeperWallet, keeperAccount, vaultAbi, isWalletCode, minHoldWei } from "./chain.js";
import { env, readJson, writeJson, deployment } from "./config.js";
import { loadSnap } from "./snapshots.js";
import { scoreEpoch, splitPot } from "./scoring.js";
import { reviewCandidates } from "./agent.js";
import { systemAddresses } from "./system.js";
import { tokenInfo } from "./prices.js";

const CANDIDATES = 15;

export function weekSnaps(epoch) {
  const snaps = [];
  for (let d = 0; d < 7; d++) { const s = loadSnap(epoch, d); if (s) snaps.push(s); }
  const end = loadSnap(epoch + 1, 0);
  if (end) snaps.push(end);
  return { snaps, hasEnd: !!end };
}

async function walletFacts(addr) {
  const [code, nonce] = await Promise.all([
    pub.getCode({ address: addr }).catch(() => undefined),
    pub.getTransactionCount({ address: addr }).catch(() => null),
  ]);
  return { isContract: !isWalletCode(code), eip7702: /^0xef0100/i.test(code || ""), txCount: nonce };
}

/** Build the report for an ended epoch (no on-chain writes). */
export async function buildReport(epoch) {
  const d = deployment();
  const { snaps, hasEnd } = weekSnaps(epoch);
  if (!hasEnd || snaps.length < 2) throw new Error(`epoch ${epoch}: missing snapshots (have ${snaps.length}, end=${hasEnd})`);
  const minHold = await minHoldWei(d.vault, env.MIN_HOLD);
  const ranked = scoreEpoch(snaps, { minHold, token: d.token, exclude: systemAddresses(), rankBy: env.RANK_BY });
  const top = ranked.slice(0, CANDIDATES);
  const end = snaps[snaps.length - 1];
  for (const c of top) {
    c.address = getAddress(c.address);
    c.facts = await walletFacts(c.address);
    for (const a of c.assets.slice(0, 3)) {
      if (a.asset === "eth") continue;
      try { a.liquidityUsd = (await tokenInfo(a.asset)).liquidityUsd; } catch { /* unknown */ }
    }
  }
  const pot = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: "pot" });
  const toPay = (pot * BigInt(env.PAYOUT_BPS)) / 10_000n;
  const review = top.length
    ? await reviewCandidates({ epoch, candidates: top, potEth: Number(formatEther(toPay)), ethUsd: end.ethUsd, topN: env.TOP_N })
    : { ok: true, disqualified: [], summary: "No eligible losers this week — the pot rolls over.", announcement: "" };
  const dq = new Set(review.disqualified.map((x) => x.address.toLowerCase()));
  const winners = top.filter((c) => !dq.has(c.address.toLowerCase())).slice(0, env.TOP_N);
  const amounts = splitPot(toPay, winners.length);
  const report = {
    epoch,
    rules: { rankBy: env.RANK_BY, minHoldThook: (minHold / 10n ** 18n).toString(), topN: env.TOP_N, payoutBps: env.PAYOUT_BPS },
    window: { start: snaps[0].takenAt, end: end.takenAt, snapshots: snaps.length },
    potWei: toPay.toString(),
    ethUsd: end.ethUsd,
    ranking: top,
    agent: { ok: review.ok, model: review.model || null, error: review.error || null, disqualified: review.disqualified, summary: review.summary || null, announcement: review.announcement || null },
    winners: winners.map((w, i) => ({ rank: i + 1, address: w.address, lossUsd: w.lossUsd, amountWei: amounts[i].toString() })),
    builtAt: Date.now(),
  };
  return report;
}

/** keccak256 of the report JSON without its settlement fields (verifiable by anyone). */
export function reportHash(report) {
  const { hash, txHash, status, paidWinners, ...body } = report;
  return keccak256(toBytes(JSON.stringify(body)));
}

/** Score, audit, publish and pay the epoch. Idempotent per epoch. */
export async function settleEpoch(epoch, { dryRun = false } = {}) {
  const d = deployment();
  if (!d.vault) throw new Error("vault not configured");
  const paid = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: "epochPaid", args: [BigInt(epoch)] });
  if (paid) return { epoch, status: "already-paid" };
  let report = readJson(`reports/epoch-${epoch}.json`, null);
  if (!report || !report.txHash) report = await buildReport(epoch);
  const hash = reportHash(report);
  report.hash = hash;
  writeJson(`reports/epoch-${epoch}.json`, report);
  if (dryRun) return { epoch, status: "dry-run", report };
  if (!keeperWallet) throw new Error("KEEPER_KEY not set");

  // Re-check THOOK balances right before sending: a winner that sold since the
  // last snapshot would make the vault revert NotEligible for everyone.
  const minHold = await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: "minHold" });
  const live = [];
  for (const w of report.winners) {
    const bal = await pub.readContract({ address: d.token, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [w.address] });
    if (bal >= minHold) live.push(w);
  }
  const winners = live.map((w) => w.address);
  const amounts = winners.length ? splitPot(BigInt(report.potWei), winners.length) : [];
  const { request } = await pub.simulateContract({
    account: keeperAccount,
    address: d.vault,
    abi: vaultAbi,
    functionName: "payEpoch",
    args: [BigInt(epoch), winners, amounts, hash],
  });
  const tx = await keeperWallet.writeContract(request);
  const rcpt = await pub.waitForTransactionReceipt({ hash: tx });
  report.txHash = tx;
  report.status = rcpt.status;
  report.paidWinners = winners.map((a, i) => ({ address: a, amountWei: amounts[i].toString() }));
  writeJson(`reports/epoch-${epoch}.json`, report);
  console.log(`[payout] epoch ${epoch} → ${winners.length} winner(s), tx ${tx}`);
  return { epoch, status: rcpt.status, tx };
}
