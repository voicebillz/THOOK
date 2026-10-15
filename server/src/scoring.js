// Weekly "top loser" scoring — pure functions, unit-tested in test/.
//
// RULE (published on the site + in every report):
//   For every asset in a wallet (ETH + all priced ERC-20s, THOOK included):
//     held   = the LOWEST balance seen across all daily snapshots of the week
//     loss   = held × (price at week start − price at week end)
//   Portfolio loss = Σ loss over all assets (gains offset losses).
//   Only what you HELD all week counts: selling, sending away or buying later
//   never creates a loss, so the prize can't be farmed by moving funds.
//   Eligible = holds ≥ MIN_HOLD THOOK in EVERY snapshot of the week.

const toUnits = (raw, dec) => Number(BigInt(raw)) / 10 ** dec;

/**
 * @param snaps  ordered snapshots: [start, ...daily, end]
 * @param opts   { minHold: bigint, token: addrLower, exclude: Set<addrLower>, rankBy: "usd"|"pct" }
 * @returns ranked [{ address, lossUsd, lossPct, startValueUsd, endValueUsd, assets[] }]
 */
export function scoreEpoch(snaps, { minHold, token, exclude = new Set(), rankBy = "usd" }) {
  if (snaps.length < 2) return [];
  const start = snaps[0];
  const end = snaps[snaps.length - 1];
  const tokenL = token.toLowerCase();

  const wallets = Object.keys(start.wallets).filter((w) => {
    if (exclude.has(w)) return false;
    return snaps.every((s) => s.wallets[w] && BigInt(s.wallets[w].tokens[tokenL] || 0) >= minHold);
  });

  const out = [];
  for (const w of wallets) {
    const assets = new Set(["eth", ...Object.keys(start.wallets[w].tokens)]);
    const rows = [];
    let lossUsd = 0;
    let startValueUsd = 0;
    let endValueUsd = 0;
    for (const a of assets) {
      const isEth = a === "eth";
      const dec = isEth ? 18 : start.decimals?.[a] ?? 18;
      const p0 = isEth ? start.ethUsd : start.prices[a];
      const p1 = isEth ? end.ethUsd : end.prices[a];
      const bal = (s) => BigInt(isEth ? s.wallets[w].eth : s.wallets[w].tokens[a] || 0);
      let held = bal(start);
      for (const s of snaps) { const b = bal(s); if (b < held) held = b; }
      if (p0 != null) startValueUsd += toUnits(bal(start).toString(), dec) * p0;
      if (p1 != null) endValueUsd += toUnits(bal(end).toString(), dec) * p1;
      if (held === 0n || p0 == null || p1 == null) continue; // unpriced on either side → ignored
      const units = toUnits(held.toString(), dec);
      const l = units * (p0 - p1);
      lossUsd += l;
      rows.push({ asset: a, held: units, priceStart: p0, priceEnd: p1, lossUsd: l });
    }
    rows.sort((x, y) => y.lossUsd - x.lossUsd);
    out.push({
      address: w,
      lossUsd,
      lossPct: startValueUsd > 0 ? (lossUsd / startValueUsd) * 100 : 0,
      startValueUsd,
      endValueUsd,
      assets: rows,
    });
  }
  const key = rankBy === "pct" ? "lossPct" : "lossUsd";
  return out.filter((r) => r.lossUsd > 0).sort((a, b) => b[key] - a[key]);
}

/** Split `pot` (wei) over N winners: 1 → 100%; else 50/25/… halving, remainder to #1. */
export function splitPot(pot, n) {
  if (n <= 0) return [];
  if (n === 1) return [pot];
  const shares = [];
  let left = pot;
  for (let i = 0; i < n; i++) {
    const s = i === n - 1 ? left : left / 2n;
    shares.push(s);
    left -= s;
  }
  return shares;
}
