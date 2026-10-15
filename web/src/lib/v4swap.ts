// Direct trading against the $THOOK Uniswap v4 pool through Robinhood Chain's
// Universal Router (same router + encoding gazz.fun uses for its v4 pools).
// The router on Robinhood is a FORK whose ExactInputParams carries an extra
// minHopPriceX36 field — the classic Uniswap layout reverts there.
// Buy = one execute() with ETH value. Sell = ERC20 approve → Permit2 approve
// (one time each) → execute().
import { encodeAbiParameters, maxUint256, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

export const UNIVERSAL_ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904" as Address;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// THOOK pool: native ETH / THOOK, LP fee 0, tick spacing 60, ThookFeeHook.
export const POOL = { fee: 0, tickSpacing: 60 };

const UR_ABI = [{
  type: "function", name: "execute", stateMutability: "payable",
  inputs: [{ name: "commands", type: "bytes" }, { name: "inputs", type: "bytes[]" }, { name: "deadline", type: "uint256" }],
  outputs: [],
}] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const PERMIT2_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [{ name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint160" }, { type: "uint48" }], outputs: [] },
] as const;

const PATH_PARAMS = [{
  type: "tuple",
  components: [
    { name: "currencyIn", type: "address" },
    { name: "path", type: "tuple[]", components: [
      { name: "intermediateCurrency", type: "address" }, { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }, { name: "hookData", type: "bytes" },
    ] },
    { name: "minHopPriceX36", type: "uint256[]" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
  ],
}] as const;

// V4_SWAP actions: SWAP_EXACT_IN (0x07) + SETTLE_ALL (0x0c) + TAKE_ALL (0x0f)
export function encodeSwap(currencyIn: Address, currencyOut: Address, amountIn: bigint, minOut: bigint, hook: Address): Hex {
  const swap = encodeAbiParameters(PATH_PARAMS as any, [{
    currencyIn,
    path: [{ intermediateCurrency: currencyOut, fee: POOL.fee, tickSpacing: POOL.tickSpacing, hooks: hook, hookData: "0x" }],
    minHopPriceX36: [],
    amountIn,
    amountOutMinimum: minOut,
  }]);
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minOut]);
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], ["0x070c0f", [swap, settle, take]]);
}

async function execute(wallet: WalletClient, pub: PublicClient, account: Address, input: Hex, value: bigint) {
  const hash = await wallet.writeContract({
    account, chain: wallet.chain ?? null, address: UNIVERSAL_ROUTER, abi: UR_ABI, functionName: "execute",
    args: ["0x10", [input], BigInt(Math.floor(Date.now() / 1000) + 600)], value,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`swap reverted (${hash})`);
  return r;
}

/** Buy THOOK with native ETH. */
export function buyThook(wallet: WalletClient, pub: PublicClient, account: Address, token: Address, hook: Address, ethIn: bigint, minOut = 1n) {
  return execute(wallet, pub, account, encodeSwap(ZERO, token, ethIn, minOut, hook), ethIn);
}

/** Sell THOOK for native ETH (approvals first when needed). */
export async function sellThook(
  wallet: WalletClient, pub: PublicClient, account: Address, token: Address, hook: Address, tokensIn: bigint,
  onStep?: (s: string) => void, minOut = 1n,
) {
  const chain = wallet.chain ?? null;
  const a = (await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [account, PERMIT2] })) as bigint;
  if (a < tokensIn) {
    onStep?.("Approve THOOK for Permit2 (1/3)…");
    const h = await wallet.writeContract({ account, chain, address: token, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  const [amt, exp] = (await pub.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [account, token, UNIVERSAL_ROUTER] })) as readonly [bigint, number, number];
  if (amt < tokensIn || exp <= Math.floor(Date.now() / 1000)) {
    onStep?.("Approve the router via Permit2 (2/3)…");
    const h = await wallet.writeContract({ account, chain, address: PERMIT2, abi: PERMIT2_ABI, functionName: "approve", args: [token, UNIVERSAL_ROUTER, (1n << 160n) - 1n, Number((1n << 48n) - 1n)] });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  onStep?.("Selling (3/3)…");
  return execute(wallet, pub, account, encodeSwap(token, ZERO, tokensIn, minOut, hook), 0n);
}
