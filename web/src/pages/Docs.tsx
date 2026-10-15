import { useEffect, useState } from "react";
import { Reveal } from "../components/Reveal";
import { useConfig } from "../lib/api";
import { explorer, short } from "../lib/format";
import { buyUrl, dexscreener, gecko, X_URL } from "../lib/links";
import { BrandLink } from "../components/BrandLink";
import { FlowDiagram, WeekTimeline, MinBalanceChart, SupplyRing, ContractMap, CheckList } from "../components/DocsVisuals";
import { HookVisual, LoserVisual } from "../components/HowItWorks";

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
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) { setActive(SECTIONS[SECTIONS.length - 1][0]); return; }
      let cur: string = SECTIONS[0][0];
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) cur = id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
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
          <Reveal delay={0.1}><p className="page-intro">The tax, the weekly prize and the contracts, explained simply.</p></Reveal>

          <section id="overview">
            <h2>Overview</h2>
            <p><b>$THOOK</b> is a token on Robinhood Chain. Every trade pays a <b>4% tax in ETH</b>. Once a week, all of it goes to the holder whose <b>whole portfolio lost the most</b>.</p>
            <FlowDiagram />
            <div className="dc-cards">
              <div><b>4%</b><span>tax on every buy & sell</span></div>
              <div><b>7 days</b><span>between airdrops</span></div>
              <div><b>0 clicks</b><span>the winner just receives ETH</span></div>
            </div>
          </section>

          <section id="tax">
            <h2>The 4% tax</h2>
            <div className="dc-split">
              <ul className="dc-points">
                <li><b>Paid in ETH, never in THOOK.</b> The tax never sells your token.</li>
                <li><b>Instant.</b> It lands in the fee vault in the same transaction as the trade.</li>
                <li><b>Fixed forever.</b> Nobody can raise or lower it.</li>
                <li><b>No extra pool fee.</b> 4% is the full cost of a trade.</li>
              </ul>
              <div className="dc-vis"><HookVisual /></div>
            </div>
            <p className="dc-note">Some scanners only read the token contract and show "0% tax". The real 4% is collected by the pool's hook.</p>
          </section>

          <section id="prize">
            <h2>The weekly prize</h2>
            <p>A new week starts every <b>Thursday at 18:27 UTC</b>. Your portfolio is checked once a day, and at the end of the week the pot is paid out.</p>
            <WeekTimeline />
            <h3>1 · Qualify</h3>
            <p>Hold at least <b>{minHold} THOOK</b> in every daily check, and still hold it at payout.</p>
            <h3>2 · Your whole portfolio counts</h3>
            <p>ETH and every priced token in your Robinhood Chain wallet, not just THOOK. What counts is the <b>lowest</b> amount you held during the week, so selling and buying back can't create a fake loss.</p>
            <MinBalanceChart />
            <div className="dc-formula">loss = held × (price at week start − price at week end), summed over all assets</div>
            <h3>3 · Biggest loss wins</h3>
            <div className="dc-split">
              <div>
                <p>The holder with the largest USD loss gets the whole pot in ETH. Gains offset losses.</p>
                <p>A <b>Claude AI agent</b> then checks the top candidates and removes pools, exchanges and farming setups, always with a written reason. It can't choose the winner.</p>
                <p>Every week's report is public, and its fingerprint is stored on-chain with the payout. See winners on <a href="/stats">Statistics</a>.</p>
              </div>
              <div className="dc-vis"><LoserVisual /></div>
            </div>
          </section>

          <section id="tokenomics">
            <h2>Tokenomics</h2>
            <div className="dc-split">
              <SupplyRing />
              <table className="ptable dc-table">
                <tbody>
                  <tr><td>Ticker</td><td><b>$THOOK</b> · Tax Hook</td></tr>
                  <tr><td>Supply</td><td>1,000,000,000 · fixed</td></tr>
                  <tr><td>Team</td><td>0%</td></tr>
                  <tr><td>Liquidity</td><td>100%, locked forever</td></tr>
                  <tr><td>Launch</td><td>3 ETH FDV · fair launch</td></tr>
                  <tr><td>Tax</td><td>4% buy · 4% sell</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="contracts">
            <h2>Contracts</h2>
            <p>How the pieces connect. Everything is verified and open source.</p>
            <ContractMap />
            <div className="dc-addrs">
              {addr("Token ($THOOK)", cfg?.token)}
              {addr("Fee hook (4%)", cfg?.hook, "immutable · no owner")}
              {addr("Fee vault (pot)", cfg?.vault, "owned by the Safe")}
              {addr("LP lock", cfg?.seeder, "no withdraw function")}
              {addr("Safe", cfg?.safe)}
              {addr("Keeper", cfg?.keeper, "weekly payout only")}
              {addr("Uniswap v4 PoolManager", cfg?.poolManager)}
            </div>
            {cfg?.poolId && <p className="dc-note">Pool ID <span className="mono">{cfg.poolId}</span></p>}
          </section>

          <section id="security">
            <h2>Security</h2>
            <CheckList items={[
              ["Ownerless token", "No owner, mint, blacklist, pause or proxy: ownership is renounced by design."],
              ["Immutable tax", "The 4% hook has no owner and no settings."],
              ["Locked liquidity", "The LP lock contract has no way to remove liquidity."],
              ["Safe-owned vault", "Only the Safe multisig can withdraw, pause or change the keeper."],
              ["Limited keeper", "It can only pay the weekly prize, capped on-chain."],
              ["Open source", "All contracts are verified on the explorer."],
            ]} />
            <p className="dc-note">Internally reviewed and tested on a mainnet fork. Not externally audited.</p>
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
              <BrandLink brand="uniswap" href={buyUrl(cfg?.token)} primary>Buy $THOOK</BrandLink>
              <BrandLink brand="x" href={X_URL}>@usetaxtech</BrandLink>
              {cfg?.token && <BrandLink brand="dexscreener" href={dexscreener(cfg.token)}>Dexscreener</BrandLink>}
              {cfg?.token && <BrandLink brand="geckoterminal" href={gecko(cfg.token)}>GeckoTerminal</BrandLink>}
              {cfg?.token && <BrandLink brand="explorer" href={explorer("token", cfg.token)}>Explorer</BrandLink>}
            </div>
            <p className="dc-note" style={{ marginTop: 18 }}>Contract: <span className="mono">{cfg?.token ? short(cfg.token) : "…"}</span> · Docs updated October 2026.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
