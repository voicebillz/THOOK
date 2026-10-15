// Incremental THOOK holder index built from Transfer logs over plain RPC.
// State lives in DATA_DIR/holders.json: { cursor, balances: {addr: wei} }.
import { getAddress } from "viem";
import { pub, erc20Abi } from "./chain.js";
import { readJson, writeJson, deployment } from "./config.js";

const transferEvent = erc20Abi.find((x) => x.type === "event" && x.name === "Transfer");
let chunk = 20_000n;
let running = null;

export function holderState() {
  return readJson("holders.json", { cursor: null, balances: {} });
}

export async function syncHolders() {
  if (running) return running;
  running = (async () => {
    const d = deployment();
    if (!d.token || d.deployBlock == null) return holderState();
    const st = holderState();
    if (st.token && st.token !== d.token) { st.cursor = null; st.balances = {}; }
    st.token = d.token;
    let from = st.cursor != null ? BigInt(st.cursor) + 1n : BigInt(d.deployBlock);
    const head = await pub.getBlockNumber();
    let n = 0;
    while (from <= head) {
      const to = from + chunk - 1n > head ? head : from + chunk - 1n;
      let logs;
      try {
        logs = await pub.getLogs({ address: d.token, event: transferEvent, fromBlock: from, toBlock: to });
      } catch (err) {
        if (chunk > 500n) { chunk /= 2n; continue; }
        throw err;
      }
      for (const l of logs) {
        const { from: a, to: b, value } = l.args;
        if (a !== "0x0000000000000000000000000000000000000000") {
          const k = a.toLowerCase();
          st.balances[k] = (BigInt(st.balances[k] || 0) - value).toString();
          if (st.balances[k] === "0") delete st.balances[k];
        }
        const k = b.toLowerCase();
        st.balances[k] = (BigInt(st.balances[k] || 0) + value).toString();
      }
      st.cursor = to.toString();
      from = to + 1n;
      if (chunk < 200_000n) chunk += chunk / 4n;
      if (++n % 25 === 0) writeJson("holders.json", st);
    }
    st.syncedAt = Date.now();
    writeJson("holders.json", st);
    return st;
  })().finally(() => { running = null; });
  return running;
}

/** Holders at/above `min` (wei), largest first. */
export function holdersAbove(min = 1n) {
  const st = holderState();
  return Object.entries(st.balances)
    .map(([a, b]) => [getAddress(a), BigInt(b)])
    .filter(([, b]) => b >= min)
    .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
}

export function holderCount() {
  return Object.values(holderState().balances).filter((b) => BigInt(b) > 0n).length;
}
