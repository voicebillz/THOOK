// Exports the deployable contracts for the server (launch + Blockscout
// verification) and the website (ABIs for the admin vault panel).
//   npx hardhat clean && npx hardhat compile && node scripts/export-artifacts.js
// verify.json holds, per contract, a MINIMAL standard-JSON input (only the
// sources it imports) — the metadata hash only covers those, so Blockscout
// reproduces the exact bytecode.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const names = ["ThookToken", "ThookFeeVault", "ThookSeeder", "ThookFeeHook", "HookDeployer"];

const biDir = path.join(root, "artifacts", "build-info");
const infos = fs.readdirSync(biDir).map((f) => JSON.parse(fs.readFileSync(path.join(biDir, f), "utf8")));

const out = {};
const verify = { compilerVersion: null, contracts: {} };
for (const n of names) {
  const src = `contracts/${n}.sol`;
  const art = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", `${n}.sol`, `${n}.json`), "utf8"));
  out[n] = { abi: art.abi, bytecode: art.bytecode };
  const bi = infos.find((b) => b.output.contracts?.[src]?.[n]);
  if (!bi) throw new Error(`no build-info for ${n} — run hardhat clean && compile`);
  verify.compilerVersion = `v${bi.solcLongVersion}`;
  // dependency closure from the metadata's own source list
  const meta = JSON.parse(bi.output.contracts[src][n].metadata);
  const sources = {};
  for (const s of Object.keys(meta.sources)) sources[s] = { content: bi.input.sources[s].content };
  verify.contracts[n] = {
    fqn: `${src}:${n}`,
    input: {
      language: "Solidity",
      sources,
      settings: { optimizer: bi.input.settings.optimizer, evmVersion: bi.input.settings.evmVersion, viaIR: !!bi.input.settings.viaIR,
        outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } } },
    },
  };
}
for (const dest of [path.join(root, "web", "src", "abi"), path.join(root, "server", "src", "abi")]) {
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "contracts.json"), JSON.stringify(out));
}
fs.writeFileSync(path.join(root, "server", "src", "abi", "verify.json"), JSON.stringify(verify));
console.log("exported", names.join(", "), verify.compilerVersion);
