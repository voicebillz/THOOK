// Public read models for the website: fee counter, epochs, winners, token card.
import { formatEther } from "viem";
import { pub, vaultAbi, erc20Abi, minHoldWei } from "./chain.js";
import { deployment, readJson, env, writeJson } from "./config.js";
import { holderCount } from "./holders.js";
import { ethUsd, tokenInfo } from "./prices.js";

const epochPaidEvent = vaultAbi.find((x) => x.name === "Airdrop");
const feeEvent = vaultAbi.find((x) => x.name === "FeeReceived");
let cache = { at: 0, stats: null };
let tokenCache = { at: 0, data: null };

/** Fee + airdrop history, indexed incrementally into events.json. */
async function syncEvents(d) {
  const st = readJson("events.json", { cursor: null, fees: [], airdrops: [] });
  if (st.vault !== d.vault) { st.cursor = null; st.fees = []; st.airdrops = []; st.daily = {}; st.vault = d.vault; }
  st.daily = st.daily || {};
  let from = st.cursor != null ? BigInt(st.cursor) + 1n : BigInt(d.deployBlock ?? 0);
  const headBlock = await pub.getBlock();
  const head = headBlock.number;
  const headTs = Number(headBlock.timestamp);
  const bps = (await blocksPerDay(Number(head))) / 86_400; // logs carry no timestamp here → estimate
  const tsOf = (b) => Math.round(headTs - (Number(head) - Number(b)) / bps);
  const step = 50_000n;
  while (from <= head) {
    const to = from + step - 1n > head ? head : from + step - 1n;
    const [fees, drops] = await Promise.all([
      pub.getLogs({ address: d.vault, event: feeEvent, fromBlock: from, toBlock: to }),
      pub.getLogs({ address: d.vault, event: epochPaidEvent, fromBlock: from, toBlock: to }),
    ]);
    for (const l of fees) {
      const t = tsOf(l.blockNumber);
      st.fees.push({ b: Number(l.blockNumber), t, v: l.args.amount.toString() });
      // Daily totals are kept separately so they survive trimming of the raw list.
      const day = new Date(t * 1000).toISOString().slice(0, 10);
      st.daily[day] = (BigInt(st.daily[day] || 0) + l.args.amount).toString();
    }
    for (const l of drops) st.airdrops.push({ b: Number(l.blockNumber), t: tsOf(l.blockNumber), tx: l.transactionHash, epoch: Number(l.args.epoch), winner: l.args.winner, amount: l.args.amount.toString(), rank: Number(l.args.rank) });
    st.cursor = to.toString();
    from = to + 1n;
  }
  if (st.fees.length > 20_000) st.fees = st.fees.slice(-20_000);
  writeJson("events.json", st);
  return st;
}

let bpdCache = { at: 0, v: 345_600 };
async function blocksPerDay(head) {
  if (Date.now() - bpdCache.at < 6 * 3600_000) return bpdCache.v;
  try {
    const span = 200_000;
    const [a, b] = await Promise.all([pub.getBlock({ blockNumber: BigInt(head - span) }), pub.getBlock({ blockNumber: BigInt(head) })]);
    const secs = Number(b.timestamp - a.timestamp);
    if (secs > 0) bpdCache = { at: Date.now(), v: Math.round((span / secs) * 86_400) };
  } catch { /* keep estimate */ }
  return bpdCache.v;
}

/** Hourly fee totals for the last 7 days (or since the first fee), zero-filled. */
function hourlySeries(fees) {
  if (!fees.length) return [];
  const H = 3600;
  const now = Math.floor(Date.now() / 1000 / H) * H;
  const first = Math.max(Math.floor(fees[0].t / H) * H, now - 7 * 24 * H);
  const buckets = new Map();
  for (const f of fees) {
    const h = Math.floor(f.t / H) * H;
    if (h >= first) buckets.set(h, (buckets.get(h) || 0n) + BigInt(f.v));
  }
  const out = [];
  for (let h = first; h <= now; h += H) out.push({ t: h, eth: Number(formatEther(buckets.get(h) || 0n)) });
  return out;
}

/** Daily fee totals from launch (or the first fee) to today, zero-filled. */
function dailySeries(daily) {
  const days = Object.keys(daily).sort();
  if (!days.length) return [];
  const out = [];
  const end = new Date().toISOString().slice(0, 10);
  for (let t = Date.parse(days[0]); ; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, eth: Number(formatEther(BigInt(daily[day] || 0))) });
    if (day >= end || out.length > 400) break;
  }
  return out;
}

export async function getStats() {
  if (cache.stats && Date.now() - cache.at < 15_000) return cache.stats;
  const d = deployment();
  if (!d.vault) return { live: false };
  const read = (fn, args) => pub.readContract({ address: d.vault, abi: vaultAbi, functionName: fn, args });
  const [pot, totalReceived, totalPaid, epoch, genesis, usd, ev] = await Promise.all([
    read("pot"), read("totalReceived"), read("totalPaid"), read("currentEpoch"), read("genesis"),
    ethUsd().catch(() => null), syncEvents(d).catch(() => readJson("events.json", { fees: [], airdrops: [] })),
  ]);
  const epochEnd = Number(genesis) + (Number(epoch) + 1) * 7 * 86400;
  // fee rate over the last ~24h worth of fee events (for the live counter tick)
  const now = Number(await pub.getBlockNumber());
  const bpd = await blocksPerDay(now);
  const recent = ev.fees.filter((f) => f.b > now - bpd);
  const fees24hWei = recent.reduce((a, f) => a + BigInt(f.v), 0n);
  const stats = {
    live: true,
    ethUsd: usd,
    potEth: Number(formatEther(pot)),
    totalFeesEth: Number(formatEther(totalReceived)),
    totalDistributedEth: Number(formatEther(totalPaid)),
    fees24hEth: Number(formatEther(fees24hWei)),
    epoch: Number(epoch),
    epochEnd,
    holders: holderCount(),
    daily: dailySeries(ev.daily || {}),
    hourly: hourlySeries(ev.fees || []),
    winners: [...ev.airdrops].reverse().slice(0, 20).map((a) => ({ ...a, amountEth: Number(formatEther(BigInt(a.amount))) })),
    updatedAt: Date.now(),
  };
  cache = { at: Date.now(), stats };
  return stats;
}

export async function getToken() {
  const d = deployment();
  // Cache is keyed to the deployment, so new addresses (e.g. right after launch) show immediately.
  if (tokenCache.data && tokenCache.key === d.updatedAt && Date.now() - tokenCache.at < 60_000) return tokenCache.data;
  if (!d.token) return { live: false };
  const [supply, market] = await Promise.all([
    pub.readContract({ address: d.token, abi: erc20Abi, functionName: "totalSupply" }),
    tokenInfo(d.token).catch(() => ({})),
  ]);
  const data = {
    live: true,
    name: "Tax Hook",
    symbol: "THOOK",
    chain: "Robinhood Chain",
    chainId: 4663,
    address: d.token,
    vault: d.vault || null,
    hook: d.hook || null,
    seeder: d.seeder || null,
    safe: d.safe || null,
    poolId: d.poolId || null,
    supply: Number(formatEther(supply)),
    taxBps: 400,
    holders: holderCount(),
    minHoldThook: Number((await minHoldWei(d.vault, env.MIN_HOLD)) / 10n ** 18n),
    ...market,
    updatedAt: Date.now(),
  };
  tokenCache = { at: Date.now(), key: d.updatedAt, data };
  return data;
}

export function listReports() {
  const out = [];
  for (let e = 0; e < 10_000; e++) {
    const r = readJson(`reports/epoch-${e}.json`, null);
    if (!r) { if (e > 2 && !readJson(`reports/epoch-${e + 1}.json`, null)) break; continue; }
    out.push({ epoch: r.epoch, winners: r.paidWinners || r.winners, txHash: r.txHash || null, summary: r.agent?.summary || null, hash: r.hash || null });
  }
  return out.reverse();
}

export { writeJson };
