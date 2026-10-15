// Daily portfolio snapshots per epoch. Epoch boundaries come from the vault
// (genesis + 7 days), so off-chain and on-chain agree. Snapshot file:
// snap/e{epoch}-d{day}.json — day 0 of epoch N+1 is the END of epoch N.
import { pub, vaultAbi, minHoldWei } from "./chain.js";
import { env, readJson, writeJson, deployment, WETH } from "./config.js";
import { holdersAbove, syncHolders } from "./holders.js";
import { portfolioOf, decimalsOf } from "./portfolio.js";
import { pricesUsd } from "./prices.js";
import { systemAddresses } from "./system.js";

export const DAY = 86_400;

export async function epochClock() {
  const d = deployment();
  if (!d.vault) return null;
  const genesis = Number(await pub.readContract({ address: d.vault, abi: vaultAbi, functionName: "genesis" }));
  const now = Math.floor(Date.now() / 1000);
  const epoch = Math.floor((now - genesis) / (7 * DAY));
  const day = Math.floor((now - genesis - epoch * 7 * DAY) / DAY);
  return { genesis, now, epoch, day, epochStart: genesis + epoch * 7 * DAY, epochEnd: genesis + (epoch + 1) * 7 * DAY };
}

export function snapName(epoch, day) {
  return `snap/e${epoch}-d${day}.json`;
}

export function loadSnap(epoch, day) {
  return readJson(snapName(epoch, day), null);
}

let running = null;

/** Take today's snapshot if it doesn't exist yet. */
export async function takeSnapshot({ force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const clock = await epochClock();
    if (!clock) return null;
    if (!force && loadSnap(clock.epoch, clock.day)) return null;
    const d = deployment();
    await syncHolders();
    const sys = systemAddresses();
    const holders = holdersAbove(await minHoldWei(d.vault, env.MIN_HOLD)).filter(([a]) => !sys.has(a.toLowerCase()));
    const wallets = {};
    const assets = new Set([WETH.toLowerCase(), d.token.toLowerCase()]);
    for (const [addr] of holders) {
      try {
        const p = await portfolioOf(addr, [d.token]);
        wallets[addr.toLowerCase()] = p;
        Object.keys(p.tokens).forEach((t) => assets.add(t));
      } catch (err) {
        console.warn("[snapshot]", addr, err.message);
      }
    }
    const list = [...assets];
    const prices = await pricesUsd(list);
    const decimals = await decimalsOf(list);
    const snap = {
      epoch: clock.epoch,
      day: clock.day,
      takenAt: Date.now(),
      block: (await pub.getBlockNumber()).toString(),
      ethUsd: prices[WETH.toLowerCase()] ?? null,
      prices,
      decimals,
      wallets,
    };
    writeJson(snapName(clock.epoch, clock.day), snap);
    console.log(`[snapshot] e${clock.epoch} d${clock.day}: ${Object.keys(wallets).length} wallets, ${list.length} assets`);
    return snap;
  })().finally(() => { running = null; });
  return running;
}
