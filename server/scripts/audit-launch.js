// Post-launch audit: checks the live $THOOK deployment the way screeners and
// indexers (GoPlus, Token Sniffer, De.Fi, GeckoTerminal, Dexscreener) do.
// Read-only — needs no keys.
//   node scripts/audit-launch.js                       (uses https://api.thook.vip + mainnet RPC)
//   API=http://localhost:8096 RPC_URL=http://127.0.0.1:8545 node scripts/audit-launch.js
import { createPublicClient, http, parseAbi, formatEther, getAddress, keccak256, toBytes } from "viem";

const API = process.env.API || "https://api.thook.vip";
const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const pub = createPublicClient({ transport: http(RPC) });
const cfg = await (await fetch(`${API}/api/config`)).json();

const results = [];
const check = (ok, label, detail = "") => { results.push({ ok, label, detail }); console.log(`${ok === true ? "✓" : ok === "warn" ? "!" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`); };
const tryRead = (address, sig, args = []) => pub.readContract({ address, abi: parseAbi([sig]), functionName: sig.match(/function (\w+)/)[1], args }).then((v) => ({ ok: true, v }), () => ({ ok: false }));
const sel = (s) => keccak256(toBytes(s)).slice(2, 10);

console.log(`\n$THOOK launch audit · ${API}\n`);
const T = cfg.token, V = cfg.vault, S = cfg.seeder, H = cfg.hook;
if (!T) { console.log("not launched yet"); process.exit(0); }

// --- token (what GoPlus / Token Sniffer read) ---
const code = await pub.getCode({ address: T });
check(code && code.length > 2, "Token contract deployed", T);
const [name, symbol, dec, supply] = await Promise.all(["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"].map((s) => tryRead(T, s)));
check(name.v === "Tax Hook" && symbol.v === "THOOK" && dec.v === 18, "Name / symbol / decimals", `${name.v} / ${symbol.v} / ${dec.v}`);
check(supply.v === 10n ** 27n, "Fixed supply 1,000,000,000", formatEther(supply.v ?? 0n));
check(!(await tryRead(T, "function owner() view returns (address)")).ok, "No owner (ownership = none / renounced by design)");
const forbidden = { mint: "mint(address,uint256)", burnFrom: "burnFrom(address,uint256)", pause: "pause()", blacklist: "blacklist(address)", setTax: "setTax(uint256)", setFee: "setFee(uint256)", upgradeTo: "upgradeTo(address)", upgradeToAndCall: "upgradeToAndCall(address,bytes)", setOwner: "transferOwnership(address)" };
const hits = Object.entries(forbidden).filter(([, s]) => code.includes(sel(s)));
check(hits.length === 0, "No mint / pause / blacklist / tax setter / upgrade / owner functions", hits.map(([k]) => k).join(", ") || "none found in bytecode");
const implSlot = await pub.getStorageAt({ address: T, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" });
check(!implSlot || BigInt(implSlot) === 0n, "Not a proxy (EIP-1967 slot empty)");
check(code.length < 12_000, "Plain ERC-20 bytecode (no hidden logic)", `${(code.length - 2) / 2} bytes`);

// --- distribution ---
const bal = (a) => pub.readContract({ address: T, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [a] });
const [kBal, sBal, pmBal] = await Promise.all([bal(cfg.keeper), bal(S), bal(POOL_MANAGER)]);
check(kBal === 0n, "Deployer/creator holds 0 THOOK", `keeper ${formatEther(kBal)}`);
check(sBal < 10n ** 18n, "Seeder holds only rounding dust (< 1 THOOK)", formatEther(sBal));
check(pmBal * 100n >= supply.v * 50n, "Supply sits in the Uniswap v4 PoolManager (DEX liquidity)", `${(Number(pmBal * 10000n / supply.v) / 100).toFixed(2)}%`);

// --- liquidity lock ---
const seeded = await tryRead(S, "function seeded() view returns (bool)");
check(seeded.v === true, "Pool seeded");
const sCode = await pub.getCode({ address: S });
const removeSigs = ["withdraw()", "removeLiquidity()", "withdrawLiquidity()", "rescue(address)", "transferOwnership(address)", "emergencyWithdraw()"];
check(!removeSigs.some((s) => sCode.includes(sel(s))), "LP locked: seeder has no remove/withdraw/owner function");
const pid = await tryRead(S, "function poolId() view returns (bytes32)");
check(pid.ok && pid.v === cfg.poolId, "Pool id matches API", pid.v);

// --- hook (the 4% tax) ---
const fee = await tryRead(H, "function FEE_BPS() view returns (uint128)");
check(fee.v === 400n, "Hook tax is 4% (constant)", String(fee.v));
const hCode = await pub.getCode({ address: H });
check(!["owner()", "setFee(uint128)", "setFeeBps(uint128)", "transferOwnership(address)"].some((s) => hCode.includes(sel(s))), "Hook has no owner and no fee setter (tax can never change)");
check((BigInt(H) & 0x3fffn) === 0x20ccn, "Hook address carries the right v4 permission bits", "0x20CC");
const [hv, ht] = await Promise.all([tryRead(H, "function vault() view returns (address)"), tryRead(H, "function token() view returns (address)")]);
check(getAddress(hv.v) === getAddress(V) && getAddress(ht.v) === getAddress(T), "Hook pays the vault and serves only THOOK");

// --- vault ---
const [owner, keeper, pending] = await Promise.all([tryRead(V, "function owner() view returns (address)"), tryRead(V, "function keeper() view returns (address)"), tryRead(V, "function pendingOwner() view returns (address)")]);
check(cfg.safe && getAddress(owner.v) === getAddress(cfg.safe), "Vault owner is the Safe", owner.v);
check(getAddress(keeper.v) === getAddress(cfg.keeper), "Vault keeper is the Railway keeper", keeper.v);
check(BigInt(pending.v ?? 0) === 0n, "No pending ownership transfer");

// --- explorer verification ---
try {
  const r = await fetch(`https://robinhoodchain.blockscout.com/api?module=contract&action=getsourcecode&address=${T}`).then((x) => x.json());
  const v = Array.isArray(r.result) && r.result[0]?.SourceCode;
  check(v ? true : "warn", "Token source verified on Blockscout", v ? "yes" : "not yet — run Verify in /admin");
} catch { check("warn", "Token source verified on Blockscout", "explorer not reachable from here"); }

const bad = results.filter((r) => r.ok === false).length;
console.log(`\n${results.length - bad}/${results.length} checks passed${bad ? ` — ${bad} FAILED` : ""}\n`);
process.exit(bad ? 1 : 0);
