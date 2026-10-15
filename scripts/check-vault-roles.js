// Fork-only: prove the vault's roles with the REAL Safe address (impersonated).
//   npx hardhat run scripts/check-vault-roles.js --network localhost
const { ethers, network } = require("hardhat");
const API = process.env.API || "http://localhost:8096";
const ok = (b, m) => console.log(`${b ? "✓" : "✗"} ${m}`);
const reverts = async (p) => { try { await (await p).wait(); return false; } catch { return true; } };

async function main() {
  const cfg = await (await fetch(`${API}/api/config`)).json();
  const vault = await ethers.getContractAt("ThookFeeVault", cfg.vault);
  const [keeper, , , , , , , , , stranger] = await ethers.getSigners(); // signer 0 = keeper on the fork
  const safeAddr = await vault.owner();
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [safeAddr] });
  await network.provider.send("hardhat_setBalance", [safeAddr, "0x56BC75E2D63100000"]);
  const safe = await ethers.getSigner(safeAddr);
  const dest = ethers.Wallet.createRandom().address;

  // fees arrive by themselves: simulate the hook's ETH transfer
  await (await stranger.sendTransaction({ to: cfg.vault, value: ethers.parseEther("2") })).wait();
  ok((await vault.pot()) >= ethers.parseEther("2"), `fees land in the vault automatically (pot ${ethers.formatEther(await vault.pot())} ETH)`);
  ok(safeAddr.toLowerCase() === cfg.safe.toLowerCase(), `owner is the Safe ${safeAddr}`);

  for (const [fn, args] of [["withdraw", [keeper.address, 1n]], ["withdrawAll", [keeper.address]], ["ownerAirdrop", [[keeper.address], [1n]]], ["setKeeper", [keeper.address]], ["setLimits", [0n, 50, 10000]], ["setPaused", [false]], ["transferOwnership", [keeper.address]]]) {
    ok(await reverts(vault.connect(keeper)[fn](...args)), `keeper CANNOT call ${fn}`);
    ok(await reverts(vault.connect(stranger)[fn](...args)), `random wallet CANNOT call ${fn}`);
  }

  await (await vault.connect(safe).withdraw(dest, ethers.parseEther("0.5"))).wait();
  ok((await ethers.provider.getBalance(dest)) === ethers.parseEther("0.5"), `Safe withdrew 0.5 ETH to a brand-new wallet ${dest}`);
  await (await vault.connect(safe).withdrawAll(dest)).wait();
  ok((await vault.pot()) === 0n, "Safe withdrew EVERYTHING (withdrawAll)");

  await (await vault.connect(safe).setPaused(true)).wait();
  await (await vault.connect(safe).setKeeper(ethers.ZeroAddress)).wait();
  ok((await vault.keeper()) === ethers.ZeroAddress && (await vault.paused()), "Safe locked everyone out (keeper = 0x0, paused)");
  ok(await reverts(vault.connect(keeper).payEpoch(0, [], [], ethers.ZeroHash)), "old keeper can no longer pay out");
  await (await vault.connect(safe).setKeeper(keeper.address)).wait();
  await (await vault.connect(safe).setPaused(false)).wait();
  ok((await vault.keeper()) === keeper.address, "Safe restored the keeper");
}
main().catch((e) => { console.error(e); process.exit(1); });
