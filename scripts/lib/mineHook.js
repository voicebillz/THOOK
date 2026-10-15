// Uniswap v4 hook-address mining. A hook's permissions are read from the low
// 14 bits of its ADDRESS, so ThookFeeHook must be CREATE2-deployed at a salt
// whose resulting address has exactly these bits:
//   BEFORE_INITIALIZE | BEFORE_SWAP | AFTER_SWAP | BEFORE_SWAP_RETURNS_DELTA |
//   AFTER_SWAP_RETURNS_DELTA = 0x20CC
// (The admin portal does the same search in the browser: web/src/lib/mineHook.ts.)
const { ethers } = require("ethers");

const THOOK_HOOK_FLAGS = (1 << 13) | (1 << 7) | (1 << 6) | (1 << 3) | (1 << 2); // 0x20CC
const FLAG_MASK = 0x3fff;

function mineHookSalt(deployer, initCode, flags = THOOK_HOOK_FLAGS, maxIter = 5_000_000) {
  const initCodeHash = ethers.keccak256(initCode);
  const prefix = ethers.concat(["0xff", ethers.getAddress(deployer)]);
  for (let i = 0; i < maxIter; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const addr = ethers.dataSlice(ethers.keccak256(ethers.concat([prefix, salt, initCodeHash])), 12);
    if ((Number(BigInt(addr) & BigInt(FLAG_MASK))) === flags) {
      return { salt, address: ethers.getAddress(addr), initCodeHash };
    }
  }
  throw new Error(`no salt found within ${maxIter} iterations`);
}

module.exports = { THOOK_HOOK_FLAGS, FLAG_MASK, mineHookSalt };
