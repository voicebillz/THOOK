import { useState } from "react";
import { LogoTile } from "../components/Logo";
import { Reveal } from "../components/Reveal";
import { Sk } from "../components/Skeleton";
import { useToken } from "../lib/api";
import { explorer, fmtNum, fmtUsd, short } from "../lib/format";
import { buyUrl, dexscreener, gecko } from "../lib/links";

export default function Token() {
  const { data: t, isError } = useToken();
  const [copied, setCopied] = useState(false);
  const live = t?.live;
  const copy = async () => {
    if (!t?.address) return;
    try { await navigator.clipboard.writeText(t.address); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* ignore */ }
  };

  return (
    <div className="page">
      <div className="wrap">
        <Reveal>
          <div className="token-head">
            <div className="tile"><LogoTile build /></div>
            <div>
              <div className="eyebrow">Tax Hook</div>
              <h1 className="page-title" style={{ margin: "4px 0 0" }}>$THOOK</h1>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.08}><p className="page-intro">A 1B-supply token on Robinhood Chain whose 4% swap tax is paid back, in ETH, to the week's biggest loser.</p></Reveal>

        {isError && !t && <div className="note note-danger" style={{ marginBottom: 16 }}>Can't reach the THOOK server right now — retrying.</div>}
        <Reveal delay={0.12}>
          <div className="ca">
            <span className="eyebrow">CA</span>
            <code>{t ? (live ? t.address : "Launching soon") : <Sk w="42ch" />}</code>
            {live && <button className="btn btn-sm" onClick={copy} aria-label="Copy contract address">{copied ? "Copied" : "Copy"}</button>}
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="grid grid-4">
            <Cell k="Price" v={t ? (live ? fmtUsd(t.priceUsd) : "—") : null} sub={t ? (t.change24h != null ? `${t.change24h > 0 ? "+" : ""}${t.change24h.toFixed(2)}% 24h` : "24h —") : null} up={t?.change24h} />
            <Cell k="Market cap" v={t ? fmtUsd(t.fdvUsd ?? t.mcapUsd, true) : null} sub={t ? "fully diluted" : null} />
            <Cell k="Liquidity" v={t ? fmtUsd(t.liquidityUsd, true) : null} sub={t ? "locked forever" : null} />
            <Cell k="Volume 24h" v={t ? fmtUsd(t.volume24hUsd, true) : null} sub={t ? `${fmtNum(t.holders)} holders` : null} />
          </div>
        </Reveal>

        <h2 className="section-title">Token</h2>
        <Reveal>
          <div className="grid grid-3">
            <Cell k="Supply" v="1,000,000,000" sub="fixed · no mint" />
            <Cell k="Tax" v="4%" sub="every buy & sell · in ETH" />
            <Cell k="Chain" v="Robinhood" sub="Uniswap v4 · LP locked" />
          </div>
        </Reveal>

        <h2 className="section-title">The weekly prize</h2>
        <Reveal>
          <div className="rules">
            <div className="rule"><span className="n">01</span><span><b>Hold at least {t ? fmtNum(t.minHoldThook) : "…"} THOOK</b> the whole week to qualify.</span></div>
            <div className="rule"><span className="n">02</span><span><b>Your whole portfolio counts</b> — ETH and every priced token you held all week, not just THOOK.</span></div>
            <div className="rule"><span className="n">03</span><span><b>Biggest USD loss wins the pot</b>, airdropped in ETH every 7 days; Claude audits the ranking and the report is public.</span></div>
          </div>
        </Reveal>

        {live && (
          <Reveal>
            <div className="links">
              <a className="btn btn-lime" href={buyUrl(t!.address)} target="_blank" rel="noreferrer">Buy $THOOK</a>
              <a className="btn" href={gecko(t!.address)} target="_blank" rel="noreferrer">GeckoTerminal</a>
              <a className="btn" href={dexscreener(t!.address)} target="_blank" rel="noreferrer">Dexscreener</a>
              <a className="btn" href={explorer("token", t!.address)} target="_blank" rel="noreferrer">Explorer</a>
            </div>
            <dl className="kv" style={{ marginTop: 28 }}>
              {t!.vault && <><dt>Fee vault</dt><dd><a href={explorer("address", t!.vault)} target="_blank" rel="noreferrer">{short(t!.vault)}</a></dd></>}
              {t!.hook && <><dt>Fee hook</dt><dd><a href={explorer("address", t!.hook)} target="_blank" rel="noreferrer">{short(t!.hook)}</a></dd></>}
              {t!.seeder && <><dt>LP lock</dt><dd><a href={explorer("address", t!.seeder)} target="_blank" rel="noreferrer">{short(t!.seeder)}</a></dd></>}
            </dl>
          </Reveal>
        )}
      </div>
    </div>
  );
}

function Cell({ k, v, sub, up }: { k: string; v: React.ReactNode | null; sub: React.ReactNode | null; up?: number | null }) {
  return (
    <div className="cell">
      <div className="k">{k}</div>
      <div className="v">{v ?? <Sk w="8ch" />}</div>
      <div className="s" style={up != null ? { color: up >= 0 ? "var(--success)" : "var(--danger)" } : undefined}>{sub ?? <Sk w="5ch" />}</div>
    </div>
  );
}
