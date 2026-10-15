// Source verification on Blockscout (Robinhood Chain explorer) through its
// Etherscan-compatible API. Screeners (GeckoTerminal, Dexscreener, GoPlus,
// Token Sniffer …) read "open source / verified" from the explorer.
import fs from "node:fs";
import { readJson, writeJson, deployment } from "./config.js";
import { launchState } from "./launch.js";

const V = JSON.parse(fs.readFileSync(new URL("./abi/verify.json", import.meta.url), "utf8"));
const API = (process.env.BLOCKSCOUT_API || "https://robinhoodchain.blockscout.com/api/v2").replace(/\/v2\/?$/, "");

async function bs(params, body) {
  const url = `${API}?${new URLSearchParams(params)}`;
  const r = await fetch(url, body
    ? { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(60_000) }
    : { signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(`Blockscout ${r.status}: ${text.slice(0, 120)}`); }
}

const SOURCIFY = "https://sourcify.dev/server";

async function sourcifyStatus(address) {
  const r = await fetch(`${SOURCIFY}/v2/contract/4663/${address}`, { signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  return j.match || null;
}

/** Sourcify (decentralised; Blockscout and others read verified sources from it). */
async function sourcifyVerify(name, address, creationTx) {
  const cur = await sourcifyStatus(address);
  if (cur) return cur;
  const c = V.contracts[name];
  const body = { stdJsonInput: c.input, compilerVersion: V.compilerVersion.replace(/^v/, ""), contractIdentifier: c.fqn };
  if (creationTx) body.creationTransactionHash = creationTx;
  const r = await fetch(`${SOURCIFY}/v2/verify/4663/${address}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const j = await r.json().catch(() => ({}));
  if (!j.verificationId) throw new Error(j.message || `sourcify ${r.status}`);
  for (let i = 0; i < 30; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    const s = await fetch(`${SOURCIFY}/v2/verify/${j.verificationId}`, { signal: AbortSignal.timeout(20_000) }).then((x) => x.json()).catch(() => ({}));
    if (s.isJobCompleted) {
      if (s.contract?.match) return s.contract.match;
      throw new Error(s.error?.message || "sourcify: no match");
    }
  }
  throw new Error("sourcify: timed out");
}

export async function isVerified(address) {
  const j = await bs({ module: "contract", action: "getsourcecode", address });
  const row = Array.isArray(j.result) ? j.result[0] : null;
  return !!(row && row.SourceCode && row.SourceCode.length > 0);
}

/** Verify every THOOK contract that isn't verified yet. */
export async function verifyAll() {
  const d = deployment();
  const s = launchState().steps;
  const targets = [
    ["ThookToken", d.token, "", s.token?.tx],
    ["ThookFeeVault", d.vault, s.vault?.args, s.vault?.tx],
    ["ThookSeeder", d.seeder, s.seeder?.args, s.seeder?.tx],
    ["HookDeployer", d.hookDeployer, "", s.hookDeployer?.tx],
    ["ThookFeeHook", d.hook, s.hook?.args, s.hook?.tx],
  ];
  const results = [];
  for (const [name, address, args, tx] of targets) {
    if (!address) { results.push({ name, status: "not deployed" }); continue; }
    const row = { name, address };
    try { row.sourcify = await sourcifyVerify(name, address, tx); } catch (err) { row.sourcify = `failed: ${err.message}`; }
    try { row.blockscout = await blockscoutVerify(name, address, args); } catch (err) { row.blockscout = `failed: ${err.message}`; }
    row.status = row.blockscout === "verified" || /match/.test(row.sourcify || "") ? "verified" : "failed";
    row.message = `blockscout: ${row.blockscout} · sourcify: ${row.sourcify}`;
    results.push(row);
  }
  writeJson("verify.json", { at: Date.now(), results });
  return results;
}

async function blockscoutVerify(name, address, args) {
  if (await isVerified(address)) return "verified";
  const c = V.contracts[name];
  const sub = await bs({ module: "contract", action: "verifysourcecode" }, {
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(c.input),
    contractaddress: address,
    contractname: c.fqn,
    compilerversion: V.compilerVersion,
    constructorArguements: (args || "").replace(/^0x/, ""),
    licenseType: "3", // MIT
  });
  if (sub.status !== "1") throw new Error(sub.result || sub.message || "rejected");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const chk = await bs({ module: "contract", action: "checkverifystatus", guid: sub.result });
    const msg = String(chk.result || "");
    if (/pass|verified/i.test(msg)) return "verified";
    if (/fail|error|unable/i.test(msg)) throw new Error(msg);
  }
  return (await isVerified(address)) ? "verified" : "pending";
}

export function lastVerify() {
  return readJson("verify.json", null);
}
