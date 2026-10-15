// Copies ABI + bytecode of the deployable contracts into the website so the
// admin portal can deploy them from the admin's own wallet.
//   npx hardhat compile && node scripts/export-artifacts.js
const fs = require("fs");
const path = require("path");
const names = ["ThookToken", "ThookFeeVault", "ThookSeeder", "ThookFeeHook", "HookDeployer"];
const out = {};
for (const n of names) {
  const a = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "contracts", `${n}.sol`, `${n}.json`), "utf8"));
  out[n] = { abi: a.abi, bytecode: a.bytecode };
}
const dest = path.join(__dirname, "..", "web", "src", "abi", "contracts.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log("wrote", dest);
