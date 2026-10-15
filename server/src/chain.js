import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, robinhood } from "./config.js";

export const pub = createPublicClient({ chain: robinhood, transport: http(env.RPC_URL, { retryCount: 3 }) });

export const keeperAccount = /^0x[0-9a-fA-F]{64}$/.test(env.KEEPER_KEY.trim())
  ? privateKeyToAccount(env.KEEPER_KEY.trim())
  : /^[0-9a-fA-F]{64}$/.test(env.KEEPER_KEY.trim())
    ? privateKeyToAccount("0x" + env.KEEPER_KEY.trim())
    : null;

export const keeperWallet = keeperAccount
  ? createWalletClient({ account: keeperAccount, chain: robinhood, transport: http(env.RPC_URL) })
  : null;

export const erc20Abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

export const vaultAbi = parseAbi([
  "event FeeReceived(address indexed from, uint256 amount)",
  "event EpochPaid(uint256 indexed epoch, uint256 total, uint256 winners, bytes32 reportHash)",
  "event Airdrop(uint256 indexed epoch, address indexed winner, uint256 amount, uint256 rank)",
  "event AirdropFailed(uint256 indexed epoch, address indexed winner, uint256 amount)",
  "function thook() view returns (address)",
  "function genesis() view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function epochStart(uint256) view returns (uint256)",
  "function epochEnd(uint256) view returns (uint256)",
  "function epochPaid(uint256) view returns (bool)",
  "function pot() view returns (uint256)",
  "function totalReceived() view returns (uint256)",
  "function totalPaid() view returns (uint256)",
  "function keeper() view returns (address)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function paused() view returns (bool)",
  "function minHold() view returns (uint256)",
  "function maxWinners() view returns (uint16)",
  "function maxPayoutBps() view returns (uint16)",
  "function payEpoch(uint256 epoch, address[] winners, uint256[] amounts, bytes32 reportHash)",
]);

export const seederAbi = parseAbi([
  "function hook() view returns (address)",
  "function token() view returns (address)",
  "function seeded() view returns (bool)",
  "function poolId() view returns (bytes32)",
  "function startFdvEth() view returns (uint256)",
]);

export const hookAbi = parseAbi([
  "event FeeTaken(uint256 ethAmount, bool isBuy)",
  "function token() view returns (address)",
  "function vault() view returns (address)",
  "function initializer() view returns (address)",
  "function FEE_BPS() view returns (uint128)",
]);

/** EIP-7702 delegated EOAs carry 0xef0100… code but are still wallets. */
export function isWalletCode(code) {
  return !code || code === "0x" || /^0xef0100/i.test(code);
}

/**
 * The prize threshold. The vault's on-chain minHold is the single source of
 * truth once it exists (set at launch, changeable by the Safe); before launch
 * the MIN_HOLD_THOOK default is shown. Cached 60 s.
 */
let minHoldCache = { at: 0, v: null, vault: null };
export async function minHoldWei(vault, fallback) {
  if (!vault) return fallback;
  if (minHoldCache.vault === vault && Date.now() - minHoldCache.at < 60_000) return minHoldCache.v;
  try {
    const v = await pub.readContract({ address: vault, abi: vaultAbi, functionName: "minHold" });
    minHoldCache = { at: Date.now(), v, vault };
    return v;
  } catch {
    return minHoldCache.vault === vault && minHoldCache.v != null ? minHoldCache.v : fallback;
  }
}
