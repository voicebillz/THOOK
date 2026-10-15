import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Counter } from "../components/Counter";
import { Countdown } from "../components/Countdown";
import { FeeChart, pickSeries } from "../components/FeeChart";
import { Reveal } from "../components/Reveal";
import { Sk } from "../components/Skeleton";
import { useEpochs, useStats } from "../lib/api";
import { explorer, fmtEth, fmtNum, fmtUsd, short } from "../lib/format";

/** Deterministic little avatar colour per address (gazz leaderboard style). */
const ava = (a: string) => {
  const h = parseInt(a.slice(2, 8), 16) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 60) % 360} 70% 45%))`;
};

function Ago({ at }: { at: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return <>{Math.max(0, Math.round((Date.now() - at) / 1000))}s ago</>;
}

export default function Stats() {
  const reduce = useReducedMotion();
  const { data: s, isError } = useStats();
  const epochs = useEpochs();
  const [mode, setMode] = useState<"fees" | "volume">("fees");
  const live = !!s?.live;
  const usd = (eth?: number) => (s?.ethUsd != null && eth != null ? eth * s.ethUsd : null);
  const first = pickSeries(s).pts[0]?.t;
  const total = s?.totalFeesEth ?? 0;
  const parts = live ? [
    { k: "Airdropped to losers", eth: s!.totalDistributedEth, c: "var(--lime)" },
    { k: "In this week's pot", eth: s!.potEth, c: "var(--violet)" },
  ] : [];

  return (
    <div className="page">
      <div className="wrap stats-col">
        <Reveal>
          <div className="stats-head">
            <h1>Statistics</h1>
            <span className="stats-live">
              {s ? <><span className="live-dot" />Live · <Ago at={s.updatedAt || Date.now()} />{s.ethUsd ? ` · ETH ${fmtUsd(s.ethUsd)}` : ""}</> : <Sk w="18ch" />}
            </span>
          </div>
        </Reveal>

        {isError && <div className="note note-danger" style={{ marginBottom: 16 }}>Couldn't reach the stats server — retrying.</div>}
        {s && !live && <div className="note note-warning" style={{ marginBottom: 16 }}>Stats go live the moment $THOOK launches.</div>}

        <Reveal delay={0.05}>
          <div className="kpis">
            <Kpi v={s ? (live ? fmtUsd(usd(total), true) : "$0") : null} l="Fees collected" />
            <Kpi v={s ? (live ? fmtUsd(usd(s.totalDistributedEth), true) : "$0") : null} l="Paid to losers" />
            <Kpi v={s ? (live ? fmtUsd(usd(s.potEth), true) : "$0") : null} l="Current pot" />
            <Kpi v={s ? fmtNum(live ? s.holders : 0) : null} l="Holders" />
            <Kpi v={s ? (live ? <Countdown to={s.epochEnd} mono={false} /> : "—") : null} l="Next airdrop" />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="bignum">
            <div>
              <div className="v mono-num" aria-live="polite">
                {s ? (live ? fmtUsd(usd(mode === "fees" ? total : total / 0.04) ?? 0, (usd(total) ?? 0) >= 100_000) : "$0") : <Sk w="7ch" />}
              </div>
              <div className="l">{s ? <>{mode === "fees" ? "Total fees collected" : "Total volume"}{first ? ` · ${new Date(first).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – today` : ""}</> : <Sk w="14ch" />}</div>
            </div>
            <div className="seg" role="group" aria-label="Chart mode">
              <button className={mode === "fees" ? "on" : ""} onClick={() => setMode("fees")}>Fees collected</button>
              <button className={mode === "volume" ? "on" : ""} onClick={() => setMode("volume")}>Volume</button>
            </div>
          </div>
          {s ? <FeeChart key={mode} stats={s} mode={mode} height={210} /> : <span className="sk" style={{ width: "100%", height: 210, display: "block" }} />}
        </Reveal>

        <h2 className="stats-section">Winners</h2>
        <Reveal>
          <div style={{ overflowX: "auto" }}>
            <table className="ptable">
              <thead><tr><th>Winner</th><th>Week</th><th>Rank</th><th>Airdrop</th><th>USD now</th><th>Tx</th></tr></thead>
              <tbody>
                {!s && [0, 1, 2].map((i) => <tr key={i}>{[14, 4, 3, 10, 8, 8].map((w, j) => <td key={j}><Sk w={`${w}ch`} /></td>)}</tr>)}
                {live && s!.winners.map((w) => (
                  <tr key={w.tx + w.winner}>
                    <td><a className="who" href={explorer("address", w.winner)} target="_blank" rel="noreferrer"><span className="ava" style={{ background: ava(w.winner) }} />{short(w.winner)}</a></td>
                    <td>{w.epoch > 1e9 ? "Bonus" : w.epoch + 1}</td>
                    <td>#{w.rank}</td>
                    <td><b>{fmtEth(w.amountEth)} ETH</b></td>
                    <td className="muted">{fmtUsd(usd(w.amountEth))}</td>
                    <td><a className="muted mono" href={explorer("tx", w.tx)} target="_blank" rel="noreferrer">{short(w.tx)} ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s && (!live || !s.winners.length) && <div className="empty">No airdrops yet — the first one lands at the end of week 1.</div>}
          </div>
        </Reveal>

        <Reveal>
          <div style={{ marginTop: 52 }}>
            <div className="dk">Where every fee goes</div>
            <div className="bignum" style={{ margin: "6px 0 0" }}><div><div className="v">{s ? fmtUsd(usd(total) ?? 0) : <Sk w="7ch" />}</div><div className="l">All fees ever</div></div></div>
            <div className="split">
              {live && total > 0 ? parts.map((p) => (
                <motion.i key={p.k} style={{ background: p.c, width: `${(p.eth / Math.max(total, 1e-18)) * 100}%` }} initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
              )) : <i style={{ background: "var(--line-2)", width: "100%" }} />}
            </div>
            <div className="legend">
              {(parts.length ? parts : [{ k: "Airdropped to losers", eth: 0, c: "var(--lime)" }, { k: "In this week's pot", eth: 0, c: "var(--violet)" }]).map((p) => (
                <div key={p.k}>
                  <span className="sw" style={{ background: p.c }} />{p.k}
                  <span className="amt">{s ? fmtUsd(usd(p.eth) ?? 0) : <Sk w="5ch" />}</span>
                  <span className="pct">{total > 0 ? `${((p.eth / total) * 100).toFixed(1)}%` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {(epochs.data?.length ?? 0) > 0 && (
          <>
            <h2 className="stats-section">Agent reports</h2>
            <table className="ptable">
              <tbody>
                {epochs.data!.slice(0, 8).map((e) => (
                  <tr key={e.epoch}>
                    <td style={{ width: 70 }}><span className="tag tag-green">Week {e.epoch + 1}</span></td>
                    <td style={{ textAlign: "left", color: "var(--ink-2)" }}>{e.summary || "Report published."}</td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{e.hash ? short(e.hash) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ v, l }: { v: React.ReactNode | null; l: string }) {
  return (
    <div className="kpi">
      <div className="v">{v ?? <Sk w="6ch" />}</div>
      <div className="l">{l}</div>
    </div>
  );
}
