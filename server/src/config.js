// Runtime config: env vars (Railway) + a small JSON store on the volume.
// Contract addresses are written by the admin portal after the on-chain deploy
// (POST /api/admin/config, signed by ADMIN_WALLET) and can be pinned by env.
import { defineChain, getAddress, isAddress } from "viem";

export const env = {
  PORT: Number(process.env.PORT || 8080),
  RPC_URL: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ADMIN_WALLET: (process.env.ADMIN_WALLET || "").toLowerCase(),
  KEEPER_KEY: process.env.KEEPER_KEY || "",
  KEEPER_ENABLED: process.env.KEEPER_ENABLED === "true",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  MIN_HOLD: BigInt(process.env.MIN_HOLD_THOOK || "100000") * 10n ** 18n, // THOOK to qualify
  TOP_N: Math.max(1, Math.min(10, Number(process.env.TOP_N || 1))),     // winners per week
  PAYOUT_BPS: Math.max(1, Math.min(10000, Number(process.env.PAYOUT_BPS || 10000))), // share of pot paid
  RANK_BY: process.env.RANK_BY === "pct" ? "pct" : "usd",
  BLOCKSCOUT_API: process.env.BLOCKSCOUT_API || "https://robinhoodchain.blockscout.com/api/v2",
  GECKO_API: "https://api.geckoterminal.com/api/v2",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  EXCLUDE: (process.env.EXCLUDE || "").split(",").map((s) => s.trim().toLowerCase()).filter(isAddress),
};

export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

import { readJson, writeJson } from "./store.js";
export { readJson, writeJson };

const ADDR_KEYS = ["token", "vault", "seeder", "hook", "hookDeployer", "safe"];

/** Deployed addresses: env pins win over the store. */
export function deployment() {
  const stored = readJson("deployment.json", {});
  const out = { ...stored };
  for (const k of ADDR_KEYS) {
    const v = process.env[`THOOK_${k.toUpperCase()}`];
    if (v && isAddress(v)) out[k] = getAddress(v);
  }
  if (process.env.THOOK_DEPLOY_BLOCK) out.deployBlock = Number(process.env.THOOK_DEPLOY_BLOCK);
  return out;
}

export function saveDeployment(patch) {
  const cur = readJson("deployment.json", {});
  const next = { ...cur };
  for (const k of ADDR_KEYS) if (patch[k] && isAddress(patch[k])) next[k] = getAddress(patch[k]);
  if (patch.deployBlock != null && Number.isFinite(Number(patch.deployBlock))) next.deployBlock = Number(patch.deployBlock);
  if (patch.poolId && /^0x[0-9a-fA-F]{64}$/.test(patch.poolId)) next.poolId = patch.poolId;
  if (patch.startFdvEth) next.startFdvEth = String(patch.startFdvEth);
  next.updatedAt = Date.now();
  writeJson("deployment.json", next);
  return next;
}
