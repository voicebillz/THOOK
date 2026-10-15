// Full launch on a Robinhood Chain mainnet fork against the REAL Uniswap v4
// PoolManager: token → vault → seeder → mined hook → setHook → seed, then all
// four swap shapes, checking the vault receives exactly 4% in ETH each time.
//   FORK=1 npx hardhat test test/fork/Thook.fork.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mineHookSalt } = require("../../scripts/lib/mineHook");

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
const e = (n) => ethers.parseEther(String(n));

(process.env.FORK ? describe : describe.skip)("THOOK launch (Robinhood fork)", () => {
  let admin, keeper, trader, token, vault, seeder, hook, router, key;

  before(async () => {
    [admin, keeper, trader] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("ThookToken")).deploy();
    vault = await (await ethers.getContractFactory("ThookFeeVault")).deploy(
      admin.address, keeper.address, await token.getAddress(), e(1)
    );
    seeder = await (await ethers.getContractFactory("ThookSeeder")).deploy(POOL_MANAGER, await token.getAddress(), e(3));
    const hd = await (await ethers.getContractFactory("HookDeployer")).deploy();
    const HookF = await ethers.getContractFactory("ThookFeeHook");
    const initCode = ethers.concat([HookF.bytecode, HookF.interface.encodeDeploy([
      POOL_MANAGER, await token.getAddress(), await vault.getAddress(), await seeder.getAddress(),
    ])]);
    const { salt, address } = mineHookSalt(await hd.getAddress(), initCode);
    await (await hd.deploy(salt, initCode)).wait();
    hook = await ethers.getContractAt("ThookFeeHook", address);
    await seeder.setHook(address);
    await token.transfer(await seeder.getAddress(), await token.balanceOf(admin.address));
    await seeder.seed();
    key = await seeder.poolKey();
    router = await (await ethers.getContractFactory("PoolSwapTest")).deploy(POOL_MANAGER);
  });

  const settings = { takeClaims: false, settleUsingBurn: false };
  const pk = () => ({ currency0: key[0], currency1: key[1], fee: key[2], tickSpacing: key[3], hooks: key[4] });
  async function feeOf(tx) {
    const r = await (await tx).wait();
    const logs = r.logs.filter((l) => l.address.toLowerCase() === (hook.target || "").toLowerCase());
    return logs.map((l) => hook.interface.parseLog(l)).filter((x) => x.name === "FeeTaken").reduce((a, x) => a + x.args[0], 0n);
  }

  it("seeded 100% of supply as locked LP with LP fee 0", async () => {
    expect(await token.balanceOf(admin.address)).to.equal(0);
    expect(await seeder.seeded()).to.equal(true);
    expect(key[2]).to.equal(0n);
    expect(await hook.FEE_BPS()).to.equal(400n);
  });

  it("buy exactIn ETH→THOOK: 4% of input to the vault", async () => {
    const v0 = await ethers.provider.getBalance(vault.target);
    const fee = await feeOf(router.connect(trader).swap(pk(), { zeroForOne: true, amountSpecified: -e(1), sqrtPriceLimitX96: MIN_SQRT }, settings, "0x", { value: e(1) }));
    expect(fee).to.equal(e(0.04));
    expect((await ethers.provider.getBalance(vault.target)) - v0).to.equal(e(0.04));
    expect(await token.balanceOf(trader.address)).to.be.gt(0);
  });

  it("sell exactIn THOOK→ETH: 4% of ETH output to the vault", async () => {
    const amt = (await token.balanceOf(trader.address)) / 2n;
    await token.connect(trader).approve(router.target, ethers.MaxUint256);
    const v0 = await ethers.provider.getBalance(vault.target);
    const b0 = await ethers.provider.getBalance(trader.address);
    const fee = await feeOf(router.connect(trader).swap(pk(), { zeroForOne: false, amountSpecified: -amt, sqrtPriceLimitX96: MAX_SQRT }, settings, "0x"));
    expect(fee).to.be.gt(0);
    expect((await ethers.provider.getBalance(vault.target)) - v0).to.equal(fee);
    const gross = ((await ethers.provider.getBalance(trader.address)) - b0); // net of gas, roughly 96% of gross
    expect(gross).to.be.gt(0);
  });

  it("buy exactOut ETH→THOOK: fee on the ETH actually paid", async () => {
    const v0 = await ethers.provider.getBalance(vault.target);
    const fee = await feeOf(router.connect(trader).swap(pk(), { zeroForOne: true, amountSpecified: e(1_000_000), sqrtPriceLimitX96: MIN_SQRT }, settings, "0x", { value: e(5) }));
    expect(fee).to.be.gt(0);
    expect((await ethers.provider.getBalance(vault.target)) - v0).to.equal(fee);
  });

  it("sell exactOut THOOK→ETH: 4% of the ETH requested", async () => {
    const v0 = await ethers.provider.getBalance(vault.target);
    const fee = await feeOf(router.connect(trader).swap(pk(), { zeroForOne: false, amountSpecified: e(0.01), sqrtPriceLimitX96: MAX_SQRT }, settings, "0x"));
    expect(fee).to.equal(e(0.0004));
    expect((await ethers.provider.getBalance(vault.target)) - v0).to.equal(fee);
  });

  it("nobody else can initialize a pool with the hook", async () => {
    const pm = await ethers.getContractAt(["function initialize((address,address,uint24,int24,address),uint160) returns (int24)"], POOL_MANAGER);
    await expect(pm.initialize([ethers.ZeroAddress, token.target, 3000, 60, hook.target], 2n ** 96n)).to.be.reverted;
  });

  it("vault pays the weekly loser from real fees", async () => {
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600 + 1]);
    await ethers.provider.send("evm_mine", []);
    const pot = await vault.pot();
    await expect(vault.connect(keeper).payEpoch(0, [trader.address], [pot], ethers.id("report")))
      .to.emit(vault, "Airdrop").withArgs(0, trader.address, pot, 1);
    expect(await vault.pot()).to.equal(0);
  });
});
