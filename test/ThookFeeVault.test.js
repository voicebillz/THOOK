const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WEEK = 7 * 24 * 3600;
const e = (n) => ethers.parseEther(String(n));

describe("ThookFeeVault", () => {
  let owner, keeper, alice, bob, carol, token, vault;

  beforeEach(async () => {
    [owner, keeper, alice, bob, carol] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("ThookToken")).deploy();
    vault = await (await ethers.getContractFactory("ThookFeeVault")).deploy(
      owner.address, keeper.address, await token.getAddress(), e(1000)
    );
    await token.transfer(alice.address, e(5000));
    await token.transfer(bob.address, e(2000));
    // fees arrive as plain ETH (that is what poolManager.take does)
    await owner.sendTransaction({ to: await vault.getAddress(), value: e(10) });
  });

  it("token: 1B supply, THOOK / Tax Hook, no owner", async () => {
    expect(await token.totalSupply()).to.equal(e(1_000_000_000));
    expect(await token.symbol()).to.equal("THOOK");
    expect(await token.name()).to.equal("Tax Hook");
    expect(token.owner).to.equal(undefined);
  });

  it("tracks received fees", async () => {
    expect(await vault.totalReceived()).to.equal(e(10));
    expect(await vault.pot()).to.equal(e(10));
  });

  it("cannot pay an epoch that has not ended", async () => {
    await expect(vault.connect(keeper).payEpoch(0, [alice.address], [e(1)], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "EpochNotEnded");
  });

  it("pays an ended epoch once, to eligible holders only", async () => {
    await time.increase(WEEK + 1);
    const before = await ethers.provider.getBalance(alice.address);
    await expect(vault.connect(keeper).payEpoch(0, [alice.address, bob.address], [e(7), e(3)], ethers.id("r")))
      .to.emit(vault, "EpochPaid").withArgs(0, e(10), 2, ethers.id("r"));
    expect((await ethers.provider.getBalance(alice.address)) - before).to.equal(e(7));
    expect(await vault.totalPaid()).to.equal(e(10));
    expect(await vault.wonTotal(bob.address)).to.equal(e(3));
    await expect(vault.connect(keeper).payEpoch(0, [alice.address], [0], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "EpochAlreadyPaid");
  });

  it("rejects non-holders, non-keepers, over-cap and too many winners", async () => {
    await time.increase(WEEK + 1);
    await expect(vault.connect(keeper).payEpoch(0, [carol.address], [e(1)], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "NotEligible");
    await expect(vault.connect(alice).payEpoch(0, [alice.address], [e(1)], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "NotKeeper");
    await expect(vault.connect(keeper).payEpoch(0, [alice.address], [e(11)], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "OverPayoutCap");
    await vault.setLimits(e(1000), 1, 5000);
    await expect(vault.connect(keeper).payEpoch(0, [alice.address, bob.address], [1, 1], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "TooManyWinners");
    await expect(vault.connect(keeper).payEpoch(0, [alice.address], [e(6)], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "OverPayoutCap");
    await vault.connect(keeper).payEpoch(0, [alice.address], [e(5)], ethers.ZeroHash);
  });

  it("a recipient that rejects ETH does not block the others", async () => {
    const rej = await (await ethers.getContractFactory("RejectEth")).deploy();
    await token.transfer(await rej.getAddress(), e(5000));
    await time.increase(WEEK + 1);
    await expect(vault.connect(keeper).payEpoch(0, [await rej.getAddress(), alice.address], [e(4), e(4)], ethers.ZeroHash))
      .to.emit(vault, "AirdropFailed");
    expect(await vault.pot()).to.equal(e(6));
    expect(await vault.totalPaid()).to.equal(e(4));
  });

  it("owner (Safe) controls: pause, keeper, rescue, 2-step ownership", async () => {
    await time.increase(WEEK + 1);
    await vault.setPaused(true);
    await expect(vault.connect(keeper).payEpoch(0, [alice.address], [1], ethers.ZeroHash))
      .to.be.revertedWithCustomError(vault, "IsPaused");
    await expect(vault.connect(keeper).setPaused(false)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    await vault.setKeeper(bob.address);
    expect(await vault.keeper()).to.equal(bob.address);
    await vault.rescueETH(carol.address, e(1));
    expect(await vault.pot()).to.equal(e(9));
    await vault.transferOwnership(carol.address);
    expect(await vault.owner()).to.equal(owner.address);
    await vault.connect(carol).acceptOwnership();
    expect(await vault.owner()).to.equal(carol.address);
  });

  it("epoch math", async () => {
    const g = await vault.genesis();
    expect(await vault.epochEnd(0)).to.equal(g + BigInt(WEEK));
    expect(await vault.currentEpoch()).to.equal(0);
    await time.increase(3 * WEEK);
    expect(await vault.currentEpoch()).to.equal(3);
  });
});
