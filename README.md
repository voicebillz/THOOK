# $THOOK — Tax Hook

Website: **https://thook.vip** · Chain: **Robinhood Chain (4663)** · Supply **1,000,000,000** · Tax **4% in ETH**

Every swap in the ETH/THOOK Uniswap v4 pool pays a 4% tax in ETH (buys and sells). The hook sends it straight to a
Safe-owned fee vault. Once every 7 days a keeper on Railway, audited by a Claude agent, airdrops the pot to the
holder whose **whole portfolio** lost the most that week.

```
contracts/   Solidity (Hardhat) — token, 4% v4 hook, locked-LP seeder, fee vault
server/      Railway service — public API, admin API, keeper + Claude prize agent
web/         thook.vip — Vite/React, WalletConnect (Reown), /admin portal
brand/       logo (SVG + 2000×2000 PNG)
```

## Contracts

| Contract | What it does | Admin powers |
|---|---|---|
| `ThookToken` | Plain ERC-20 "Tax Hook" / THOOK, 1B minted once to the deployer | none (no owner) |
| `ThookFeeHook` | Uniswap v4 hook: flat 4% (constant) of the ETH side of every swap → vault. Only the seeder can create a pool with it, only ETH/THOOK | none (immutable) |
| `ThookSeeder` | Puts 100% of supply in as single-sided liquidity from a start FDV. LP fee 0 (so the only tax is the 4%). Has **no** remove-liquidity function → LP locked forever | none after `seed()` |
| `ThookFeeVault` | Holds the ETH. Weekly `payEpoch` by the keeper (bounded on-chain) | **Owner = Safe**: `withdraw`, `withdrawAll`, `withdrawToken`, `ownerAirdrop`, `setKeeper`, `setLimits`, `setPaused`, 2-step ownership |
| `HookDeployer` | CREATE2 helper to place the hook at an address with the right v4 permission bits | none |

Keeper limits enforced on-chain: one payout per *ended* 7-day epoch, ≤ `maxWinners` recipients, ≤ `maxPayoutBps` of
the balance, every recipient must hold ≥ `minHold` THOOK. The Safe can pause, swap the keeper, or withdraw at any time.

```bash
npm install
npx hardhat test test/*.test.js                 # vault/token unit tests
FORK=1 npx hardhat test test/fork/*.test.js     # full launch + all 4 swap types on a Robinhood mainnet fork
node scripts/export-artifacts.js                # after any contract change: refresh web/src/abi/contracts.json
```

> Not externally audited. The hook is a straight port of gazz.fun's fork-tested GazzFeeHook (fee at 4%, no
> community router, initializer lock added). An external review before large volume is recommended.

## The weekly prize (rules)

1. **Eligible:** holds ≥ `MIN_HOLD_THOOK` THOOK in every daily snapshot of the week (and at payout).
2. **Portfolio loss:** for ETH and every priced ERC-20 in the wallet, `held × (price at week start − price at week end)`,
   where *held* is the lowest balance seen across the week's daily snapshots. Gains offset losses. Selling, sending
   away or buying later never creates a "loss", so the prize can't be farmed by moving funds.
3. **Winner:** biggest USD loss (`RANK_BY=usd`, or `pct`). `TOP_N` winners (default 1 = winner takes all; >1 splits 50/25/…).
4. **Claude audit:** Claude (`claude-opus-5-5`) reviews the top 15 and may only *disqualify* non-human/abusive
   addresses (pools, routers, exchanges, manipulated tokens) with a written reason. It can never add or reorder.
   It also writes the public summary + an X announcement.
5. The full report is public at `GET /api/reports/:epoch`; `keccak256(JSON of the report without hash/txHash/status/paidWinners)`
   is stored on-chain in `EpochPaid.reportHash`.

Prices: GeckoTerminal (Robinhood network). Balances: Blockscout API, with an on-chain multicall fallback.

## Launch runbook

1. **Reown (WalletConnect):** create a project at cloud.reown.com, add `thook.vip` to the allowed domains.
2. **Railway** (service root = `server/`):
   - Add the **Postgres** plugin; on the THOOK service add `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
   - Variables (see `server/.env.example`): `ADMIN_WALLET` (your wallet), `KEEPER_KEY` (new hot wallet, fund ~0.01 ETH
     for gas), `ANTHROPIC_API_KEY`, `CORS_ORIGIN=https://thook.vip`, `KEEPER_ENABLED=false`.
3. **Vercel** (root = `web/`): `VITE_API_URL=<railway url>`, `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_SITE_URL=https://thook.vip`.
   Point `thook.vip` at Vercel.
4. Open **thook.vip/admin**, connect the owner wallet (`ADMIN_WALLET`), sign in (free signature), check Pre-flight, then run the 8 launch steps — every transaction is sent by the keeper key on Railway; the vault is owned by the Safe from deploy. See `docs/LAUNCH-AUDIT.md`.
   (token → vault → seeder → hook deployer → mine+deploy hook → bind → fund → **seed = trading opens** → save).
   Pick the start FDV (launch price) before step 1.
5. **Safe:** create a Safe on Robinhood Chain at app.safe.global, then in /admin → *Hand over to Safe* →
   `transferOwnership(safe)`; in the Safe, call `acceptOwnership()` on the vault (data `0x79ba5097`). After this,
   vault actions in /admin show the Safe calldata to execute in the Safe app.
6. Let the keeper snapshot for a week, check **Preview** in /admin, then set `KEEPER_ENABLED=true` on Railway.

Owner keys never touch the server: every deploy/owner step is signed in your own wallet. The only server key is the
keeper, which can do nothing but the bounded weekly `payEpoch`.

## API (server)

`GET /api/stats` · `GET /api/token` · `GET /api/epochs` · `GET /api/reports/:epoch` · `GET /api/config` ·
admin (signed by `ADMIN_WALLET`): `GET /api/admin/status`, `POST /api/admin/config`, `POST /api/admin/run`
(`sync` | `snapshot` | `preview` | `settle`).
