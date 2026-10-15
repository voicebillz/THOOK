// $THOOK launch, executed by the KEEPER key from the admin portal.
// The owner wallet only signs the admin login; it never sends a transaction.
// Each step is idempotent: it checks chain state first, and a deploy whose
// tx was sent but not yet confirmed is resumed from its stored hash.
import fs from "node:fs";
import { concat, encodeAbiParameters, encodeDeployData, formatEther, getAddress, getContractAddress, isAddress, keccak256, pad, parseEther, toHex } from "viem";
import { pub, keeperWallet, keeperAccount } from "./chain.js";
import { env, POOL_MANAGER, readJson, writeJson, deployment, saveDeployment } from "./config.js";

const ART = JSON.parse(fs.readFileSync(new URL("./abi/contracts.json", import.meta.url), "utf8"));
const KEY = "launch.json";
const HOOK_FLAGS = 0x20ccn; // BEFORE_INITIALIZE | BEFORE_SWAP | AFTER_SWAP | both RETURNS_DELTA
const MIN_GAS_ETH = 0.002;

export function launchState() {
  return readJson(KEY, { params: null, steps: {}, pending: {}, log: [] });
}
function save(st) { writeJson(KEY, st); }
function log(st, msg) { st.log.push({ at: Date.now(), msg }); if (st.log.length > 100) st.log = st.log.slice(-100); console.log("[launch]", msg); }

export const STEPS = [
  { id: "token", title: "Deploy $THOOK token", detail: "1,000,000,000 THOOK minted to the keeper" },
  { id: "vault", title: "Deploy fee vault", detail: "owner = Safe, keeper = keeper wallet" },
  { id: "seeder", title: "Deploy LP seeder (lock)", detail: "LP fee 0 · no remove-liquidity function" },
  { id: "hookDeployer", title: "Deploy hook deployer", detail: "CREATE2 helper" },
  { id: "hook", title: "Mine + deploy 4% fee hook", detail: "address encodes the v4 permission bits" },
  { id: "setHook", title: "Bind hook to seeder", detail: "seeder.setHook(hook) — one time" },
  { id: "fund", title: "Move full supply to seeder", detail: "keeper → seeder, keeper ends with 0 THOOK" },
  { id: "seed", title: "Seed locked pool — TRADING OPENS", detail: "creates the ETH/THOOK Uniswap v4 pool" },
];

let busy = null;

async function wait(st, step, hash) {
  st.pending[step] = hash; save(st);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  delete st.pending[step];
  if (r.status !== "success") { save(st); throw new Error(`${step}: transaction reverted (${hash})`); }
  return r;
}

async function deploy(st, step, name, args) {
  if (st.pending[step]) {
    const r = await pub.getTransactionReceipt({ hash: st.pending[step] }).catch(() => null);
    if (r?.status === "success" && r.contractAddress) { delete st.pending[step]; return { address: getAddress(r.contractAddress), block: Number(r.blockNumber), tx: r.transactionHash }; }
  }
  const { abi, bytecode } = ART[name];
  const hash = await keeperWallet.deployContract({ abi, bytecode, args });
  const r = await wait(st, step, hash);
  return { address: getAddress(r.contractAddress), block: Number(r.blockNumber), tx: hash };
}

async function call(st, step, address, name, fn, args) {
  if (st.pending[step]) {
    const r = await pub.getTransactionReceipt({ hash: st.pending[step] }).catch(() => null);
    if (r?.status === "success") { delete st.pending[step]; return r.transactionHash; }
  }
  const { request } = await pub.simulateContract({ account: keeperAccount, address, abi: ART[name].abi, functionName: fn, args });
  const hash = await keeperWallet.writeContract(request);
  await wait(st, step, hash);
  return hash;
}

const read = (address, name, fn, args = []) => pub.readContract({ address, abi: ART[name].abi, functionName: fn, args });

function mineSalt(deployer, initCode) {
  const initHash = keccak256(initCode);
  const prefix = concat(["0xff", deployer]);
  for (let i = 0; i < 5_000_000; i++) {
    const salt = pad(toHex(i), { size: 32 });
    const addr = `0x${keccak256(concat([prefix, salt, initHash])).slice(26)}`;
    if ((BigInt(addr) & 0x3fffn) === HOOK_FLAGS) return { salt, address: getAddress(addr) };
  }
  throw new Error("no hook salt found");
}

/** Pre-launch checks shown in the portal. */
export async function preflight() {
  const st = launchState();
  const checks = [];
  const chainId = await pub.getChainId().catch(() => null);
  checks.push({ ok: chainId === 4663, label: "RPC is Robinhood Chain (4663)", value: String(chainId) });
  checks.push({ ok: !!keeperAccount, label: "KEEPER_KEY set on Railway", value: keeperAccount?.address || "missing" });
  let bal = 0;
  if (keeperAccount) bal = Number(formatEther(await pub.getBalance({ address: keeperAccount.address })));
  checks.push({ ok: bal >= MIN_GAS_ETH, label: `Keeper has ≥ ${MIN_GAS_ETH} ETH for gas`, value: `${bal.toFixed(5)} ETH` });
  checks.push({ ok: isAddress(env.SAFE_ADDRESS), label: "Safe (vault owner)", value: env.SAFE_ADDRESS || "missing" });
  if (isAddress(env.SAFE_ADDRESS)) {
    const code = await pub.getCode({ address: env.SAFE_ADDRESS }).catch(() => null);
    checks.push({ ok: !!code && code !== "0x", label: "Safe is deployed on Robinhood Chain", value: code && code !== "0x" ? "yes" : "no contract at that address" });
  }
  const pmCode = await pub.getCode({ address: POOL_MANAGER }).catch(() => null);
  checks.push({ ok: !!pmCode && pmCode !== "0x", label: "Uniswap v4 PoolManager live", value: POOL_MANAGER });
  checks.push({ ok: !!env.ADMIN_WALLET, label: "ADMIN_WALLET (portal login)", value: env.ADMIN_WALLET || "missing" });
  return { checks, ready: checks.every((c) => c.ok), state: st, steps: STEPS };
}

/** Run exactly one launch step. */
export async function runStep(id, params = {}) {
  if (busy) throw new Error(`launch step "${busy}" is still running`);
  if (!keeperWallet) throw new Error("KEEPER_KEY not set");
  busy = id;
  const st = launchState();
  try {
    const idx = STEPS.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("unknown step");
    const next = STEPS.findIndex((s) => !st.steps[s.id]);
    if (st.steps[id]) throw new Error(`${id} already done`);
    if (idx !== next) throw new Error(`run "${STEPS[next].id}" first`);
    const s = st.steps;
    const keeper = keeperAccount.address;

    if (id === "token") {
      const p = {
        startFdvEth: String(params.startFdvEth ?? ""),
        minHoldThook: String(params.minHoldThook ?? Number(env.MIN_HOLD / 10n ** 18n)),
        safe: env.SAFE_ADDRESS,
      };
      if (!(Number(p.startFdvEth) >= 0.1)) throw new Error("start FDV must be ≥ 0.1 ETH");
      if (!(Number(p.minHoldThook) >= 0)) throw new Error("bad min hold");
      if (!isAddress(p.safe)) throw new Error("SAFE_ADDRESS not set");
      st.params = p;
      const r = await deploy(st, id, "ThookToken", []);
      s.token = r;
      saveDeployment({ token: r.address, deployBlock: r.block, safe: p.safe });
    } else if (id === "vault") {
      const args = [getAddress(st.params.safe), keeper, s.token.address, parseEther(st.params.minHoldThook)];
      const r = await deploy(st, id, "ThookFeeVault", args);
      s.vault = { ...r, args: encodeAbiParameters(ART.ThookFeeVault.abi.find((x) => x.type === "constructor").inputs, args) };
      saveDeployment({ vault: r.address });
    } else if (id === "seeder") {
      const args = [POOL_MANAGER, s.token.address, parseEther(st.params.startFdvEth)];
      const r = await deploy(st, id, "ThookSeeder", args);
      s.seeder = { ...r, args: encodeAbiParameters(ART.ThookSeeder.abi.find((x) => x.type === "constructor").inputs, args) };
      saveDeployment({ seeder: r.address, startFdvEth: st.params.startFdvEth });
    } else if (id === "hookDeployer") {
      const r = await deploy(st, id, "HookDeployer", []);
      s.hookDeployer = r;
      saveDeployment({ hookDeployer: r.address });
    } else if (id === "hook") {
      const args = [POOL_MANAGER, s.token.address, s.vault.address, s.seeder.address];
      const initCode = encodeDeployData({ abi: ART.ThookFeeHook.abi, bytecode: ART.ThookFeeHook.bytecode, args });
      const { salt, address } = mineSalt(s.hookDeployer.address, initCode);
      log(st, `mined hook salt ${salt} → ${address}`);
      let code = await pub.getCode({ address });
      let tx = null;
      if (!code || code === "0x") {
        tx = await call(st, id, s.hookDeployer.address, "HookDeployer", "deploy", [salt, initCode]);
        code = await pub.getCode({ address });
      }
      if (!code || code === "0x") throw new Error("hook not found at the mined address");
      s.hook = { address, tx, salt, args: encodeAbiParameters(ART.ThookFeeHook.abi.find((x) => x.type === "constructor").inputs, args) };
      saveDeployment({ hook: address });
    } else if (id === "setHook") {
      const cur = await read(s.seeder.address, "ThookSeeder", "hook");
      const tx = getAddress(cur) === s.hook.address ? null : await call(st, id, s.seeder.address, "ThookSeeder", "setHook", [s.hook.address]);
      s.setHook = { tx };
    } else if (id === "fund") {
      const bal = await read(s.token.address, "ThookToken", "balanceOf", [keeper]);
      const tx = bal > 0n ? await call(st, id, s.token.address, "ThookToken", "transfer", [s.seeder.address, bal]) : null;
      const inSeeder = await read(s.token.address, "ThookToken", "balanceOf", [s.seeder.address]);
      if (inSeeder !== 10n ** 27n) throw new Error(`seeder holds ${inSeeder}, expected the full supply`);
      s.fund = { tx };
    } else if (id === "seed") {
      const seeded = await read(s.seeder.address, "ThookSeeder", "seeded");
      const tx = seeded ? null : await call(st, id, s.seeder.address, "ThookSeeder", "seed", []);
      const poolId = await read(s.seeder.address, "ThookSeeder", "poolId");
      s.seed = { tx, poolId, at: Date.now() };
      saveDeployment({ poolId });
    }
    log(st, `step ${id} done`);
    save(st);
    return { ok: true, step: id, state: st };
  } catch (err) {
    log(st, `step ${id} failed: ${err?.shortMessage || err?.message || err}`);
    save(st);
    throw err;
  } finally {
    busy = null;
  }
}
