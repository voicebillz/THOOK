// gazz.fun-style chart. "fees": cumulative area line (green line, soft fill,
// end dot); "volume": bars (grey, latest bar green). Hourly buckets are used
// while the history is short, daily after that. Hover shows the value.
import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Stats } from "../lib/api";
import { fmtUsd } from "../lib/format";

type Pt = { t: number; v: number };
const TAX = 0.04; // fee = 4% of the ETH side → volume = fee / 0.04

export function pickSeries(s?: Stats): { pts: { t: number; eth: number }[]; hourly: boolean } {
  if (!s) return { pts: [], hourly: false };
  const daily = (s.daily || []).map((d) => ({ t: Date.parse(d.day + "T00:00:00Z"), eth: d.eth }));
  if (daily.length >= 4 || !s.hourly?.length) return { pts: daily, hourly: false };
  return { pts: s.hourly.map((h) => ({ t: h.t * 1000, eth: h.eth })), hourly: true };
}

const fmtT = (t: number, hourly: boolean) =>
  hourly
    ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" })
    : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function FeeChart({ stats, mode, height = 200, compact = false }: { stats?: Stats; mode: "fees" | "volume"; height?: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const usd = stats?.ethUsd ?? 0;
  const { pts: raw, hourly } = pickSeries(stats);

  const pts: Pt[] = useMemo(() => {
    let run = 0;
    return raw.map((p) => {
      const eth = mode === "fees" ? (run += p.eth) : p.eth / TAX;
      return { t: p.t, v: usd ? eth * usd : eth };
    });
  }, [raw, mode, usd]);

  if (!pts.length) return <div className="fc" style={{ height }}><div className="fc-grid" /></div>;
  const max = Math.max(...pts.map((p) => p.v), 1e-12);
  const n = pts.length;
  const W = 1000;
  const x = (i: number) => (n === 1 ? W : (i / (n - 1)) * W);
  const y = (v: number) => 100 - (v / max) * 92; // 8% headroom
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(2)}`).join(" ");
  const area = `${n === 1 ? `M0 ${y(pts[0].v)} ` : ""}${line} L${W} 100 L0 100 Z`;
  const lineFull = n === 1 ? `M0 ${y(pts[0].v)} L${W} ${y(pts[0].v)}` : line;
  const hp = hover != null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(f * (n - 1)));
  };
  const val = (v: number) => (usd ? fmtUsd(v, v >= 10_000) : `${v.toFixed(4)} ETH`);

  return (
    <div>
      <div className="fc" style={{ height }} ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <div className="fc-grid" />
        {mode === "fees" ? (
          <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="fc-svg" aria-label="Cumulative fees">
            <defs>
              <linearGradient id="fcfill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5ca856" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#5ca856" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <motion.path d={area} fill="url(#fcfill)" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
            <motion.path d={lineFull} fill="none" stroke="#5ca856" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
        ) : (
          <div className="fc-bars" aria-label="Volume">
            {pts.map((p, i) => (
              <motion.i key={p.t} className={i === n - 1 ? "last" : hover === i ? "hov" : undefined}
                style={{ height: `${Math.max(1.5, (p.v / max) * 92)}%` }}
                initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: Math.min(0.5, i * 0.008), ease: [0.22, 1, 0.36, 1] }} />
            ))}
          </div>
        )}
        {mode === "fees" && <span className="fc-dot" style={{ left: "100%", top: `${y(pts[n - 1].v)}%` }} />}
        {hp && (
          <>
            <span className="fc-cross" style={{ left: `${(x(hover!) / W) * 100}%` }} />
            {mode === "fees" && <span className="fc-dot hov" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${y(hp.v)}%` }} />}
            <span className="fc-tip" style={{ left: `${Math.min(88, Math.max(12, (x(hover!) / W) * 100))}%` }}>
              <b>{val(hp.v)}</b><small>{fmtT(hp.t, hourly)}</small>
            </span>
          </>
        )}
      </div>
      {!compact && n > 1 && (
        <div className="bars-axis">
          <span>{fmtT(pts[0].t, hourly)}</span>
          {n > 2 && <span>{fmtT(pts[Math.floor(n / 2)].t, hourly)}</span>}
          <span>{fmtT(pts[n - 1].t, hourly)}</span>
        </div>
      )}
    </div>
  );
}
