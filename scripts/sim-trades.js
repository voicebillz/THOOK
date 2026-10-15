// Fork-only: simulate real trading against a launched THOOK (hardhat node
// forked from Robinhood + server launched against it).
//   npx hardhat run scripts/sim-trades.js --network localhost
const { ethers } = require("hardhat");
const API = process.env.API || "http://localhost:8096";
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;

async function main() {
  const cfg = await (await fetch(`${API}/api/config`)).json();
  const signers = await ethers.getSigners();
  const router = await (await ethers.getContractFactory("PoolSwapTest")).deploy("0x8366a39CC670B4001A1121B8F6A443A643e40951");
  const seeder = await ethers.getContractAt("ThookSeeder", cfg.seeder);
  const k = await seeder.poolKey();
  const key = { currency0: k[0], currency1: k[1], fee: k[2], tickSpacing: k[3], hooks: k[4] };
  const token = await ethers.getContractAt("ThookToken", cfg.token);
  const st = { takeClaims: false, settleUsingBurn: false };
  const vaultBal = () => ethers.provider.getBalance(cfg.vault);
  const v0 = await vaultBal();
  for (const [i, s] of signers.slice(3, 8).entries()) {
    const eth = ethers.parseEther(String(0.5 + i));
    await router.connect(s).swap(key, { zeroForOne: true, amountSpecified: -eth, sqrtPriceLimitX96: MIN_SQRT }, st, "0x", { value: eth });
    const b = await token.balanceOf(s.address);
    await token.connect(s).approve(await router.getAddress(), ethers.MaxUint256);
    await router.connect(s).swap(key, { zeroForOne: false, amountSpecified: -(b / 3n), sqrtPriceLimitX96: MAX_SQRT }, st, "0x");
    console.log(`trader ${i + 1}: bought with ${ethers.formatEther(eth)} ETH, sold a third → holds ${Number(ethers.formatEther(await token.balanceOf(s.address))).toLocaleString()} THOOK`);
  }
  console.log("vault received", ethers.formatEther((await vaultBal()) - v0), "ETH in fees");
}
main().catch((e) => { console.error(e); process.exit(1); });
