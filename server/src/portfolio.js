// Whole-portfolio snapshots on Robinhood Chain: native ETH + every ERC-20 the
// wallet holds (Blockscout), with a multicall fallback over a known-token
// universe when Blockscout is unreachable.
import { getAddress } from "viem";
import { pub, erc20Abi } from "./chain.js";
import { env } from "./config.js";
import { topPoolTokens } from "./prices.js";

let universe = { at: 0, tokens: [] };
const decimalsCache = new Map();

async function blockscoutBalances(addr) {
  const r = await fetch(`${env.BLOCKSCOUT_API}/addresses/${addr}/token-balances`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`blockscout ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("blockscout: unexpected body");
  const tokens = {};
  for (const row of rows) {
    const t = row.token || {};
    if (t.type && t.type !== "ERC-20") continue;
    const a = (t.address_hash || t.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a) || !row.value || row.value === "0") continue;
    const dec = Number(t.decimals ?? 18);
    decimalsCache.set(a, dec);
    tokens[a] = row.value;
  }
  return tokens;
}

async function multicallBalances(addr, extra) {
  if (Date.now() - universe.at > 6 * 3600_000) universe = { at: Date.now(), tokens: await topPoolTokens() };
  const list = [...new Set([...universe.tokens, ...extra.map((x) => x.toLowerCase())])];
  const res = await pub.multicall({
    contracts: list.map((t) => ({ address: getAddress(t), abi: erc20Abi, functionName: "balanceOf", args: [addr] })),
    allowFailure: true,
  });
  const tokens = {};
  res.forEach((r, i) => { if (r.status === "success" && r.result > 0n) tokens[list[i]] = r.result.toString(); });
  return tokens;
}

export async function decimalsOf(addrs) {
  const need = addrs.filter((a) => !decimalsCache.has(a));
  if (need.length) {
    const res = await pub.multicall({
      contracts: need.map((t) => ({ address: getAddress(t), abi: erc20Abi, functionName: "decimals" })),
      allowFailure: true,
    });
    res.forEach((r, i) => decimalsCache.set(need[i], r.status === "success" ? Number(r.result) : 18));
  }
  return Object.fromEntries(addrs.map((a) => [a, decimalsCache.get(a) ?? 18]));
}

/** { eth: wei, tokens: { addrLower: raw } , source } */
export async function portfolioOf(addr, mustInclude = []) {
  const eth = (await pub.getBalance({ address: addr })).toString();
  let tokens;
  let source = "blockscout";
  try {
    tokens = await blockscoutBalances(addr);
  } catch {
    source = "multicall";
    tokens = await multicallBalances(addr, mustInclude);
  }
  // Always read the must-include tokens on-chain (THOOK itself) so a stale
  // explorer index can never misreport the qualifying balance.
  if (mustInclude.length) {
    const res = await pub.multicall({
      contracts: mustInclude.map((t) => ({ address: getAddress(t), abi: erc20Abi, functionName: "balanceOf", args: [addr] })),
      allowFailure: true,
    });
    res.forEach((r, i) => {
      const k = mustInclude[i].toLowerCase();
      if (r.status === "success") { if (r.result > 0n) tokens[k] = r.result.toString(); else delete tokens[k]; }
    });
  }
  return { eth, tokens, source };
}
