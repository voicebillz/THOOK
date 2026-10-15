// gazz.fun-style chart with depth.
// "fees":   cumulative area — glowing line on an extruded ribbon, soft gradient fill.
// "volume": 3D columns (front + top + side faces), latest column green.
// Hover (mouse) or tap / drag (touch) shows the value; on touch it stays a moment.
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

/** Smooth monotone-ish path through points (Catmull-Rom → Bézier, clamped). */
function smoothPath(xy: [number, number][]) {
  if (xy.length < 2) return "";
  let d = `M${xy[0][0]} ${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[Math.max(0, i - 1)], p1 = xy[i], p2 = xy[i + 1], p3 = xy[Math.min(xy.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6;
    let c1y = p1[1] + (p2[1] - p0[1]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    c1y = Math.min(hi, Math.max(lo, c1y)); c2y = Math.min(hi, Math.max(lo, c2y)); // no overshoot
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(2)} ${c2x.toFixed(1)} ${c2y.toFixed(2)} ${p2[0].toFixed(1)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

export function FeeChart({ stats, mode, height = 200, compact = false }: { stats?: Stats; mode: "fees" | "volume"; height?: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hideT = useRef<number | undefined>(undefined);
  const usd = stats?.ethUsd ?? 0;
  const { pts: raw, hourly } = pickSeries(stats);
  useEffect(() => () => window.clearTimeout(hideT.current), []);

  const pts: Pt[] = useMemo(() => {
    let run = 0;
    return raw.map((p) => {
      const eth = mode === "fees" ? (run += p.eth) : p.eth / TAX;
      return { t: p.t, v: usd ? eth * usd : eth };
    });
  }, [raw, mode, usd]);

  if (!pts.length) return <div className="fc" style={{ height }}><div className="fc-grid" /></div>;
  const n = pts.length;
  const max = Math.max(...pts.map((p) => p.v), 1e-12);
  const W = 1000, TOP = 10, BOT = 96; // y in % units of a 0–100 box
  const xAt = (i: number) => (n === 1 ? W : (i / (n - 1)) * W);
  const yAt = (v: number) => BOT - (v / max) * (BOT - TOP);
  const xy: [number, number][] = n === 1 ? [[0, yAt(pts[0].v)], [W, yAt(pts[0].v)]] : pts.map((p, i) => [xAt(i), yAt(p.v)]);
  const line = smoothPath(xy);
  const area = `${line} L${W} 100 L0 100 Z`;
  const ribbonOffset = 3.2; // extruded depth under the line

  const idxFromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return mode === "volume" ? Math.min(n - 1, Math.floor(f * n)) : Math.round(f * (n - 1));
  };
  const show = (e: React.PointerEvent) => { window.clearTimeout(hideT.current); const i = idxFromX(e.clientX); if (i != null) setHover(i); };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHover(null);
    else { window.clearTimeout(hideT.current); hideT.current = window.setTimeout(() => setHover(null), 2200); }
  };

  const hp = hover != null ? pts[hover] : null;
  const hx = hover != null ? (mode === "volume" ? ((hover + 0.5) / n) * 100 : (xAt(hover) / W) * 100) : 0;
  const hy = hp ? (mode === "volume" ? 100 - (hp.v / max) * 86 : yAt(hp.v)) : 0;
  const val = (v: number) => (usd ? fmtUsd(v, v >= 10_000) : `${v.toFixed(4)} ETH`);
  const tipBelow = hy < 28;
  // volume: when the column is tall, put the bubble beside it instead of over it
  const tipSide = mode === "volume" && tipBelow;
  const tipStyle: React.CSSProperties = tipSide
    ? { left: `${hx}%`, top: `${Math.max(hy, 10)}%`, transform: hx > 60 ? "translate(calc(-100% - 18px), 0)" : "translate(18px, 0)" }
    : { left: `${Math.min(86, Math.max(14, hx))}%`, top: `${tipBelow ? hy + 6 : hy - 4}%` };

  return (
    <div className="fc-wrap">
      <div className={`fc fc-${mode}`} style={{ height }} ref={ref}
        onPointerDown={show} onPointerMove={show} onPointerUp={leave} onPointerLeave={leave} onPointerCancel={leave}>
        <div className="fc-grid" />
        {mode === "fees" ? (
          <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="fc-svg" aria-label="Cumulative fees">
            <defs>
              <linearGradient id={`f${uid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5ca856" stopOpacity="0.38" />
                <stop offset="55%" stopColor="#5ca856" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#5ca856" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`l${uid}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#3f8a3b" />
                <stop offset="100%" stopColor="#9cf094" />
              </linearGradient>
              <filter id={`g${uid}`} x="-5%" y="-40%" width="110%" height="180%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
            </defs>
            <motion.path d={area} fill={`url(#f${uid})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.4 }} />
            {/* depth: a darker copy of the line, offset down = extruded ribbon */}
            <motion.path d={line} transform={`translate(0 ${ribbonOffset})`} fill="none" stroke="#244a22" strokeWidth="5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
            {/* glow */}
            <motion.path d={line} fill="none" stroke="#7fd178" strokeWidth="7" vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity="0.35" filter={`url(#g${uid})`}
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
            <motion.path d={line} fill="none" stroke={`url(#l${uid})`} strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
        ) : (
          <div className="fc-bars3d" aria-label="Volume">
            {pts.map((p, i) => (
              <div key={p.t} className="b3-slot">
                <motion.div className={`b3${i === n - 1 ? " last" : ""}${hover === i ? " hov" : ""}`}
                  style={{ height: `${Math.max(2, (p.v / max) * 86)}%` }}
                  initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                  transition={{ duration: 0.7, delay: Math.min(0.5, i * 0.01), ease: [0.22, 1, 0.36, 1] }} />
              </div>
            ))}
          </div>
        )}
        {mode === "fees" && <span className="fc-dot live" style={{ left: "100%", top: `${yAt(pts[n - 1].v)}%` }} />}
        {hp && (
          <>
            <span className="fc-cross" style={{ left: `${hx}%` }} />
            {mode === "fees" && <span className="fc-dot hov" style={{ left: `${hx}%`, top: `${hy}%` }} />}
            <span className={`fc-tip${tipBelow ? " below" : ""}`} style={tipStyle}>
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
