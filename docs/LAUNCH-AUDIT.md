# $THOOK launch audit (2026-10-15)

Internal review of the full launch path and of what explorers, indexers and
token screeners will see. **Not an external audit**: get an independent review
before the pot gets large.

## How the launch runs

The owner logs in at `thook.vip/admin` with `ADMIN_WALLET` (one free signature,
bound to the domain, valid 4 h). Every transaction is then sent by the **keeper
key on Railway**, so the owner wallet never signs a transaction.

| # | Step | Result |
|---|---|---|
| 1 | Deploy `ThookToken` | 1,000,000,000 THOOK minted to the keeper; no owner |
| 2 | Deploy `ThookFeeVault` | **owner = Safe `0x0FAA…1db8` from the constructor**; keeper = `0x6D58…0980` |
| 3 | Deploy `ThookSeeder` | start FDV fixed; LP fee 0; no remove-liquidity code |
| 4 | Deploy `HookDeployer` | CREATE2 helper |
| 5 | Mine + deploy `ThookFeeHook` | address ends in permission bits `0x20CC`; only the seeder may init a pool |
| 6 | `seeder.setHook` | one time, checked against the hook's own `initializer()` |
| 7 | Keeper → seeder: full supply | keeper ends with **0 THOOK** |
| 8 | `seeder.seed()` | ETH/THOOK v4 pool created, 100% of supply as locked single-sided liquidity — **trading opens** |
| 9 | Verify (automatic after 8) | Sourcify + Blockscout |

Each step is idempotent: it checks chain state first, and a sent-but-unconfirmed
transaction is resumed from its stored hash, so a click twice or a server
restart never double-deploys or double-sends.

## What was tested

- **Contracts:** 8 unit tests (vault rules, owner powers, epochs), plus a 7-test mainnet-fork test. The fork test runs the full launch against the real Uniswap v4 PoolManager and covers all four swap shapes, each paying exactly 4% in ETH.
- **Server launch, end to end on a Robinhood fork:** the API ran all 8 steps with the keeper key in about 4 s.
  - Login check: no signature → 401, wrong wallet → 403, signature made for another domain → 401.
  - A repeat of a finished step is refused.
- **Trading:** 5 traders bought and sold. The vault received 0.71 ETH, and `/api/stats` and `/api/token` updated.
- **Weekly payout:** snapshot → ranking → report with hash → `payEpoch` from the keeper. The vault paid the winner, and a second payout for the same week is refused.
- **Postgres storage:** documents survive restarts, and deletes and writes stay in order.
- **Verification payloads:** for all 5 contracts, the minimal standard-JSON input recompiles to **byte-identical** bytecode.
- **Admin UI:** login gate, Launch / Vault / Keeper panels, and the header "Admin" button, which shows only for the admin wallet.

Run the read-only checks against mainnet after launch (no keys needed):

```bash
cd server && node scripts/audit-launch.js
```

On the fork the result was 21/21 checks (plus one warning: explorer not reachable from the test box).

## Screener and indexer checklist

Reference: GoPlus already reports **GAZZ** (same seeder + hook pattern, same
PoolManager) as open source, owner `0x000…`, not mintable, no proxy, not a
honeypot, no blacklist, transfer not pausable, listed as UniswapV4. THOOK will
read the same.

| Check (GoPlus / Token Sniffer / De.Fi / QuickIntel) | THOOK |
|---|---|
| Source verified / open source | ✅ after step 9 (Sourcify + Blockscout) |
| Ownership renounced | ✅ token has **no owner at all** (screeners show `0x000…`) |
| Mint function | ✅ none, fixed supply |
| Proxy / upgradeable | ✅ none (EIP-1967 slot empty) |
| Blacklist / whitelist / pause / cooldown / max-tx | ✅ none |
| Hidden owner / take back ownership | ✅ impossible: no ownership code |
| Modifiable tax | ✅ the 4% is a `constant` in an ownerless hook |
| Creator / deployer balance | ✅ 0% after step 7 |
| Honeypot (can sell) | ✅ sells tested on the fork, all four swap directions |
| Liquidity locked | ✅ in practice: the seeder has no withdraw code (verified source proves it). ⚠️ Some scanners only recognise LP tokens in known lockers (UNCX, Team Finance) or sent to `0xdead`, and may show "unknown". |
| Top holder | ⚠️ the Uniswap v4 PoolManager holds ~100% at launch (all v4 liquidity lives in that one contract); scanners label it as the DEX. |
| Buy/sell tax shown | ⚠️ static scanners show **0%**, because the token has no tax: the 4% is taken in ETH by the pool hook. Always state "4% buy/sell tax" in announcements so nobody feels misled. |

| Indexer | Status |
|---|---|
| GeckoTerminal | ✅ `uniswap-v4-robinhood` is indexed (GAZZ pools listed); the pool appears after the first swaps |
| Dexscreener | ✅ indexes Robinhood Uniswap v4 (GAZZ pair is live) |
| GoPlus | ✅ supports chain 4663 |
| Blockscout | ✅ explorer + verification; Sourcify supports chain 4663 too |

### After launch (owner to-do)

1. Check `/admin → Launch → Explorer verification` is all green. If Blockscout says "failed" but Sourcify says `exact_match`, Blockscout will still show the code via Sourcify.
2. GeckoTerminal token info (free): website `https://thook.vip`, logo `brand/thook-logo-2000.png`, socials.
3. Dexscreener token profile (paid, optional): same assets.
4. Every announcement says: "4% buy/sell tax in ETH → weekly airdrop to the biggest portfolio loser".

## Security review notes

- **Admin portal:**
  - It is its own page and bundle (`admin.html`), marked `noindex`, refuses to run inside a frame (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), and is never cached.
  - Nothing renders until the server has verified the signature.
  - The signature is domain-bound, lasts 4 h, and the endpoint locks out an IP for 15 minutes after 10 failed attempts.
- **Keeper key:**
  - Before launch it can deploy contracts.
  - After launch the only on-chain power it has is `vault.payEpoch`, bounded to one payout per *ended* week, ≤ `maxWinners` recipients, ≤ `maxPayoutBps` of the pot, and only to wallets holding ≥ `minHold` THOOK.
  - The Safe can pause it or replace it at any time.
- **Safe:** it owns the vault from deploy and has full control (withdraw ETH or tokens, manual airdrop, limits, keeper, pause, 2-step ownership move). The portal builds a Transaction Builder batch file for it.
- **Launch sniping:** trading opens in the block of step 8, and bots can buy early. The 4% tax each way makes flipping expensive. Announce after step 8, not before.
- **Rounding dust:** the seeder keeps about 0.00000000002 THOOK after seeding (liquidity rounding margin). Harmless.
- **Still open:** an external review of `ThookFeeHook` / `ThookFeeVault` before the pot gets large.
