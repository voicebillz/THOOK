import { useEffect, useState } from "react";
import { Reveal } from "../components/Reveal";
import { useConfig } from "../lib/api";
import { explorer, short } from "../lib/format";
import { buyUrl, dexscreener, gecko, X_URL } from "../lib/links";

const SECTIONS = [
  ["overview", "Overview"],
  ["tax", "The 4% tax"],
  ["prize", "The weekly prize"],
  ["tokenomics", "Tokenomics"],
  ["contracts", "Contracts"],
  ["security", "Security"],
  ["faq", "FAQ"],
  ["links", "Links"],
] as const;

export default function Docs() {
  const { data: cfg } = useConfig();
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const addr = (label: string, a?: string | null, note?: string) => (
    <div className="dc-addr" key={label}>
      <span className="dc-addr-l">{label}</span>
      {a ? <a className="mono" href={explorer("address", a)} target="_blank" rel="noreferrer">{a}</a> : <span className="sk" style={{ width: "40ch" }} />}
      {note && <span className="dc-addr-n">{note}</span>}
    </div>
  );
  const minHold = cfg?.minHoldThook != null ? cfg.minHoldThook.toLocaleString("en-US") : "10,000";

  return (
    <div className="page">
      <div className="wrap docs">
        <aside className="dc-toc">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Docs</div>
          <nav aria-label="Docs sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={active === id ? "on" : ""}
                onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", `#${id}`); }}>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="dc-body">
          <Reveal><div className="eyebrow">Docs</div></Reveal>
          <Reveal delay={0.05}><h1 className="page-title">How $THOOK works.</h1></Reveal>
          <Reveal delay={0.1}><p className="page-intro">Everything about the tax, the weekly prize and the contracts, in one place.</p></Reveal>

          <section id="overview">
            <h2>Overview</h2>
            <p><b>$THOOK (Tax Hook)</b> is a token on Robinhood Chain that trades in a Uniswap v4 pool. Every buy and sell pays a <b>4% tax in ETH</b>. Each week, the whole pot goes to the holder whose <b>entire portfolio lost the most</b>, and it is airdropped in ETH with nothing to claim.</p>
            <div className="dc-cards">
              <div><b>4%</b><span>tax on every buy & sell, paid in ETH</span></div>
              <div><b>7 days</b><span>between airdrops</span></div>
              <div><b>100%</b><span>of liquidity locked forever</span></div>
            </div>
          </section>

          <section id="tax">
            <h2>The 4% tax</h2>
            <p>The tax is collected by a <b>Uniswap v4 hook</b>, a small contract the pool calls on every swap. The token itself has no tax code.</p>
            <ul>
              <li><b>Always in ETH, never in THOOK.</b> On a buy the hook takes 4% of the ETH you pay. On a sell it takes 4% of the ETH you receive. The hook never sells THOOK, so the tax creates no sell pressure.</li>
              <li><b>Straight to the vault.</b> The ETH moves into the fee vault in the same transaction as the trade. Nobody has to claim or forward it.</li>
              <li><b>Fixed forever.</b> The rate is a constant in an ownerless contract and can never be raised or lowered.</li>
              <li><b>No extra pool fee.</b> The pool's own LP fee is 0%, so 4% is the full cost of a trade.</li>
            </ul>
            <p className="dc-note">Some token scanners read only the token contract and show "0% tax". The real 4% lives in the pool hook.</p>
          </section>

          <section id="prize">
            <h2>The weekly prize</h2>
            <p>Every 7 days (the week rolls over each <b>Thursday at 18:27 UTC</b>), the pot is airdropped in ETH to the biggest loser.</p>
            <h3>Who qualifies</h3>
            <ul>
              <li>You hold at least <b>{minHold} THOOK</b> in every daily check of the week, and still hold it at payout.</li>
              <li>Pools, routers, exchanges, the team wallets and the protocol contracts can never win.</li>
            </ul>
            <h3>How the loss is measured</h3>
            <p>Your <b>whole Robinhood Chain portfolio</b> counts: ETH and every token with a market price, not just THOOK.</p>
            <div className="dc-formula">loss = Σ<sub>assets</sub> held × (price at week start − price at week end)</div>
            <ul>
              <li><b>held</b> is the <i>lowest</i> balance seen in the daily snapshots. Selling, sending tokens away or buying late never creates a "loss", so the prize can't be gamed by moving funds.</li>
              <li>Gains offset losses. The biggest net USD loss wins.</li>
            </ul>
            <h3>Claude audits every payout</h3>
            <p>After the ranking, a Claude AI agent reviews the top candidates and removes non-human or abusive wallets, such as pools, exchanges or farming setups. It always gives a written reason. It can't pick a winner itself or change the order.</p>
            <h3>Transparent by design</h3>
            <p>The full report for each week is published, and its fingerprint (hash) is stored on-chain with the payout. Winners appear on the <a href="/stats">Statistics</a> page.</p>
          </section>

          <section id="tokenomics">
            <h2>Tokenomics</h2>
            <table className="ptable dc-table">
              <tbody>
                <tr><td>Name / ticker</td><td><b>Tax Hook · $THOOK</b></td></tr>
                <tr><td>Chain</td><td>Robinhood Chain (4663)</td></tr>
                <tr><td>Total supply</td><td>1,000,000,000, fixed with no mint</td></tr>
                <tr><td>Team / dev allocation</td><td>0%: the deployer holds 0 THOOK</td></tr>
                <tr><td>Liquidity</td><td>100% of supply in the Uniswap v4 pool, locked forever</td></tr>
                <tr><td>Launch price</td><td>3 ETH fully diluted value, no presale</td></tr>
                <tr><td>Tax</td><td>4% buy · 4% sell, in ETH, all to the weekly pot</td></tr>
              </tbody>
            </table>
          </section>

          <section id="contracts">
            <h2>Contracts</h2>
            <p>All contracts are verified and open source (Sourcify + Blockscout).</p>
            <div className="dc-addrs">
              {addr("Token ($THOOK)", cfg?.token)}
              {addr("Fee hook (4%)", cfg?.hook, "immutable · no owner")}
              {addr("Fee vault (pot)", cfg?.vault, "owned by the Safe")}
              {addr("LP lock (seeder)", cfg?.seeder, "no withdraw function")}
              {addr("Safe (vault owner)", cfg?.safe)}
              {addr("Keeper (payouts)", cfg?.keeper, "can only pay the weekly prize")}
              {addr("Uniswap v4 PoolManager", cfg?.poolManager)}
            </div>
            {cfg?.poolId && <p className="dc-note">Pool ID <span className="mono">{cfg.poolId}</span></p>}
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li><b>Token:</b> plain ERC-20 with no owner, mint, blacklist, pause, proxy or tax code. Ownership is renounced by design: the contract has none.</li>
              <li><b>Hook:</b> no owner and no setters. Only the launch seeder could ever create a pool with it.</li>
              <li><b>Liquidity:</b> held by the seeder contract, which has no function to remove it. Nobody can pull it.</li>
              <li><b>Vault:</b> owned by a Safe multisig, which can withdraw, pause or replace the keeper.</li>
              <li><b>Keeper:</b> can only pay the weekly prize, and the contract limits it on-chain to once per finished week, only to THOOK holders, with a cap on recipients and amount.</li>
              <li><b>Status:</b> internally reviewed and tested on a mainnet fork, not externally audited.</li>
            </ul>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            {[
              ["Do I need to claim anything?", "No. The winner receives ETH directly in their wallet."],
              ["Which wallet counts?", "The wallet that holds your THOOK. Only that wallet's Robinhood Chain portfolio is measured."],
              ["Can I win with a smart wallet?", "Yes. Personal smart wallets and EIP-7702 wallets count. Pools, exchanges and protocol contracts don't."],
              ["What if nobody qualifies?", "The pot rolls over to the next week."],
              ["Can the tax ever change?", "No. It's a constant in an ownerless contract."],
              ["Is the liquidity really locked?", "Yes. The contract that holds it has no code path to remove it, and you can read the verified source on the explorer."],
              ["Why does a scanner show 0% tax?", "The tax is taken in ETH by the pool hook, not by the token, so token-only scanners can't see it. It's 4% each way."],
            ].map(([q, a]) => (
              <details key={q} className="dc-faq"><summary>{q}</summary><p>{a}</p></details>
            ))}
          </section>

          <section id="links">
            <h2>Links</h2>
            <div className="links" style={{ marginTop: 0 }}>
              <a className="btn btn-lime" href={buyUrl(cfg?.token)} target="_blank" rel="noreferrer">Buy $THOOK</a>
              <a className="btn" href={X_URL} target="_blank" rel="noreferrer">X · @usetaxtech</a>
              {cfg?.token && <a className="btn" href={dexscreener(cfg.token)} target="_blank" rel="noreferrer">Dexscreener</a>}
              {cfg?.token && <a className="btn" href={gecko(cfg.token)} target="_blank" rel="noreferrer">GeckoTerminal</a>}
              {cfg?.token && <a className="btn" href={explorer("token", cfg.token)} target="_blank" rel="noreferrer">Explorer</a>}
            </div>
            <p className="dc-note" style={{ marginTop: 18 }}>Contract: <span className="mono">{cfg?.token ? short(cfg.token) : "…"}</span> · Docs updated October 2026.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
