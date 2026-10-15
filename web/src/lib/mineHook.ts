// Browser version of scripts/lib/mineHook.js: find a CREATE2 salt whose
// resulting address' low 14 bits are the hook's permission flags (0x20CC).
import { concat, getAddress, keccak256, pad, toHex, type Hex } from "viem";

export const HOOK_FLAGS = 0x20cc;

export async function mineHookSalt(deployer: string, initCode: Hex, onProgress?: (n: number) => void) {
  const initCodeHash = keccak256(initCode);
  const prefix = concat(["0xff", getAddress(deployer)]);
  for (let i = 0; i < 5_000_000; i++) {
    const salt = pad(toHex(i), { size: 32 });
    const addr = `0x${keccak256(concat([prefix, salt, initCodeHash])).slice(26)}` as Hex;
    if ((Number(BigInt(addr) & 0x3fffn)) === HOOK_FLAGS) return { salt, address: getAddress(addr) };
    if (i % 4000 === 0) {
      onProgress?.(i);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  throw new Error("no salt found");
}
