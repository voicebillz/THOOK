// USD prices for Robinhood Chain tokens from GeckoTerminal (free API,
// ~30 req/min — calls are spaced and cached).
import { env, WETH } from "./config.js";

const cache = new Map(); // addr -> { at, usd }
const TTL = 5 * 60_000;
let lastCall = 0;

async function gecko(path) {
  const wait = lastCall + 2_200 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const r = await fetch(`${env.GECKO_API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 429) { await new Promise((res) => setTimeout(res, 20_000)); return gecko(path); }
  if (!r.ok) throw new Error(`gecko ${r.status} ${path}`);
  return r.json();
}

/** { addrLower: usd } for every address GeckoTerminal can price. */
export async function pricesUsd(addrs) {
  const want = [...new Set(addrs.map((a) => a.toLowerCase()))];
  const out = {};
  const miss = [];
  for (const a of want) {
    const c = cache.get(a);
    if (c && Date.now() - c.at < TTL) { if (c.usd != null) out[a] = c.usd; } else miss.push(a);
  }
  for (let i = 0; i < miss.length; i += 30) {
    const part = miss.slice(i, i + 30);
    try {
      const j = await gecko(`/simple/networks/robinhood/token_price/${part.join(",")}`);
      const p = j?.data?.attributes?.token_prices || {};
      for (const a of part) {
        const v = p[a] != null ? Number(p[a]) : null;
        const usd = Number.isFinite(v) && v > 0 ? v : null;
        cache.set(a, { at: Date.now(), usd });
        if (usd != null) out[a] = usd;
      }
    } catch (err) {
      console.warn("[prices]", err.message);
    }
  }
  return out;
}

export async function ethUsd() {
  const p = await pricesUsd([WETH]);
  return p[WETH.toLowerCase()] ?? null;
}

/** GeckoTerminal token card (price, mcap, volume, image, top pools). */
export async function tokenInfo(addr) {
  const j = await gecko(`/networks/robinhood/tokens/${addr.toLowerCase()}?include=top_pools`);
  const a = j?.data?.attributes || {};
  const pool = (j?.included || []).find((x) => x.type === "pool")?.attributes || {};
  return {
    priceUsd: a.price_usd != null ? Number(a.price_usd) : null,
    fdvUsd: a.fdv_usd != null ? Number(a.fdv_usd) : null,
    mcapUsd: a.market_cap_usd != null ? Number(a.market_cap_usd) : null,
    volume24hUsd: a.volume_usd?.h24 != null ? Number(a.volume_usd.h24) : null,
    liquidityUsd: a.total_reserve_in_usd != null ? Number(a.total_reserve_in_usd) : null,
    change24h: pool.price_change_percentage?.h24 != null ? Number(pool.price_change_percentage.h24) : null,
    image: a.image_url && !/missing/.test(a.image_url) ? a.image_url : null,
  };
}

/** Base tokens of the top Robinhood pools — the fallback asset universe. */
export async function topPoolTokens(pages = 3) {
  const set = new Set();
  for (let p = 1; p <= pages; p++) {
    try {
      const j = await gecko(`/networks/robinhood/pools?page=${p}&sort=h24_volume_usd_desc`);
      for (const pool of j?.data || []) {
        for (const rel of ["base_token", "quote_token"]) {
          const id = pool?.relationships?.[rel]?.data?.id || "";
          const a = id.replace(/^robinhood_/, "");
          if (/^0x[0-9a-fA-F]{40}$/.test(a)) set.add(a.toLowerCase());
        }
      }
    } catch (err) {
      console.warn("[prices] pools", err.message);
      break;
    }
  }
  return [...set];
}
