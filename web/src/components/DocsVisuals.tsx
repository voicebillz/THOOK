// Animated explainer graphics for /docs.
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LogoTile } from "./Logo";

const ease = [0.22, 1, 0.36, 1] as const;
const inView = { once: true, margin: "-60px" } as const;

function useIsNarrow(bp = 640) {
  const [n, setN] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => { const on = () => setN(window.innerWidth < bp); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [bp]);
  return n;
}

const Img = ({ src, size = 22, round = true }: { src: string; size?: number; round?: boolean }) => (
  <img src={`/logos/${src}`} alt="" width={size} height={size} style={{ borderRadius: round ? "50%" : 5, display: "block", objectFit: "cover" }} />
);

/* ---------- 1 · the money flow ---------- */
const FLOW = [
  { k: "Trader", s: "buys or sells", icon: <span className="df-wallet">◎</span> },
  { k: "Uniswap v4 pool", s: "locked liquidity", icon: <Img src="uniswap.png" /> },
  { k: "4% hook", s: "takes ETH", icon: <span className="df-tile"><LogoTile /></span> },
  { k: "Fee vault", s: "Safe-owned pot", icon: <Img src="safe.png" /> },
  { k: "Biggest loser", s: "gets it weekly", icon: <span className="df-trophy">🏆</span> },
];
export function FlowDiagram() {
  const reduce = useReducedMotion();
  const narrow = useIsNarrow();
  return (
    <div className={`dv dv-flow${narrow ? " v" : ""}`}>
      {FLOW.map((n, i) => (
        <div className="df-cell" key={n.k}>
          <motion.div className="df-node" initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.5, delay: i * 0.12, ease }}>
            <span className="df-ico">{n.icon}</span>
            <b>{n.k}</b><small>{n.s}</small>
          </motion.div>
          {i < FLOW.length - 1 && (
            <div className="df-link" aria-hidden="true">
              {!reduce && (
                <motion.span className="df-coin" animate={narrow ? { top: ["0%", "100%"], opacity: [0, 1, 1, 0] } : { left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.1, delay: i * 0.55, repeat: Infinity, repeatDelay: (FLOW.length - 2) * 0.55, ease: "easeInOut" }}>
                  <Img src="eth.png" size={14} />
                </motion.span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- 2 · the week ---------- */
export function WeekTimeline() {
  const reduce = useReducedMotion();
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
  return (
    <div className="dv dv-week">
      <div className="dw-row">
        {days.map((d, i) => (
          <motion.div key={d} className="dw-day" initial={reduce ? false : { opacity: 0.25 }} whileInView={{ opacity: 1 }} viewport={inView} transition={{ duration: 0.35, delay: 0.2 + i * 0.22 }}>
            <motion.span className="dw-dot" initial={reduce ? false : { scale: 0.4, backgroundColor: "#2a2a2a" }} whileInView={{ scale: 1, backgroundColor: "#5ca856" }} viewport={inView} transition={{ duration: 0.35, delay: 0.2 + i * 0.22 }} />
            <span className="dw-l">{d}</span>
            <span className="dw-s">snapshot</span>
          </motion.div>
        ))}
        <motion.div className="dw-day dw-pay" initial={reduce ? false : { opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={inView} transition={{ duration: 0.5, delay: 0.2 + 7 * 0.22, ease }}>
          <span className="dw-eth"><Img src="eth.png" size={22} /></span>
          <span className="dw-l">Payout</span>
          <span className="dw-s">pot → winner</span>
        </motion.div>
      </div>
      <div className="dw-bar"><motion.i initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={inView} transition={{ duration: 0.22 * 8, delay: 0.2, ease: "linear" }} /></div>
    </div>
  );
}

/* ---------- 3 · lowest balance counts ---------- */
export function MinBalanceChart() {
  const reduce = useReducedMotion();
  const pts = [100, 100, 100, 35, 35, 100, 100, 100]; // sold mid-week, bought back
  const W = 560, H = 170, pad = 24;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / 110) * (H - pad * 2);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");
  return (
    <div className="dv dv-min">
      <div className="dm-head"><span className="dk">Your THOOK balance over the week</span><span className="chip-green">counted: lowest</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dm-svg" role="img" aria-label="Balance line with the lowest point highlighted">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="rgba(255,255,255,.06)" />)}
        <motion.path d={d} fill="none" stroke="#a7a5a0" strokeWidth="2.5" strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={inView} transition={{ duration: 1.4, ease }} />
        <motion.line x1={pad} x2={W - pad} y1={y(35)} y2={y(35)} stroke="#5ca856" strokeWidth="2" strokeDasharray="6 6"
          initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={inView} transition={{ delay: 1.3, duration: 0.5 }} />
        <motion.g initial={reduce ? false : { opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ delay: 1.5, duration: 0.5 }}>
          <circle cx={x(3)} cy={y(35)} r="6" fill="#5ca856" />
          <text x={x(3) + 12} y={y(35) + 22} fill="#7fd178" fontSize="14" fontFamily="JetBrains Mono, monospace">sold → only this counts</text>
        </motion.g>
      </svg>
      <div className="dm-axis"><span>start</span><span>mid-week</span><span>end</span></div>
    </div>
  );
}

/* ---------- 4 · supply ring ---------- */
export function SupplyRing() {
  const reduce = useReducedMotion();
  const R = 70, C = 2 * Math.PI * R;
  return (
    <div className="dv dv-ring">
      <svg viewBox="0 0 180 180" className="dr-svg" aria-hidden="true">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#222" strokeWidth="16" />
        <motion.circle cx="90" cy="90" r={R} fill="none" stroke="#5ca856" strokeWidth="16" strokeLinecap="round" transform="rotate(-90 90 90)"
          strokeDasharray={C} initial={reduce ? false : { strokeDashoffset: C }} whileInView={{ strokeDashoffset: 0.001 }} viewport={inView} transition={{ duration: 1.6, ease }} />
      </svg>
      <div className="dr-center"><b>1B</b><span>THOOK</span></div>
      <div className="dr-legend">
        <div><i style={{ background: "#5ca856" }} />Locked liquidity<b>100%</b></div>
        <div><i style={{ background: "#333" }} />Team / dev<b>0%</b></div>
        <div><i style={{ background: "#333" }} />Presale / VC<b>0%</b></div>
      </div>
    </div>
  );
}

/* ---------- 5 · contract map ---------- */
type N = { id: string; x: number; y: number; label: string; sub: string };
const NODES: N[] = [
  { id: "seeder", x: 95, y: 50, label: "LP lock", sub: "no withdraw" },
  { id: "pool", x: 360, y: 50, label: "Uniswap v4 pool", sub: "ETH / THOOK" },
  { id: "token", x: 625, y: 50, label: "$THOOK", sub: "no owner" },
  { id: "hook", x: 360, y: 170, label: "4% hook", sub: "immutable" },
  { id: "safe", x: 95, y: 290, label: "Safe", sub: "owner" },
  { id: "vault", x: 360, y: 290, label: "Fee vault", sub: "the pot" },
  { id: "keeper", x: 625, y: 290, label: "Keeper", sub: "payout only" },
];
const EDGES: [string, string, string][] = [
  ["seeder", "pool", "locked LP"], ["token", "pool", "traded in"], ["pool", "hook", "every swap"],
  ["hook", "vault", "4% in ETH"], ["safe", "vault", "full control"], ["keeper", "vault", "weekly payout"],
];
export function ContractMap() {
  const reduce = useReducedMotion();
  const narrow = useIsNarrow(700);
  const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));
  if (narrow) return <ContractStack />;
  return (
    <div className="dv dv-map">
      <svg viewBox="0 0 720 340" className="dmap-svg" role="img" aria-label="How the THOOK contracts connect">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#5ca856" /></marker></defs>
        {EDGES.map(([a, b, l], i) => {
          const A = pos[a], B = pos[b];
          const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
          const ox = (dx / len) * (Math.abs(dx) > Math.abs(dy) ? 84 : 26), oy = (dy / len) * (Math.abs(dx) > Math.abs(dy) ? 84 : 26);
          const x1 = A.x + ox, y1 = A.y + oy, x2 = B.x - ox, y2 = B.y - oy;
          return (
            <g key={a + b}>
              <motion.line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5ca856" strokeWidth="2" markerEnd="url(#arr)"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={inView} transition={{ duration: 0.6, delay: 0.3 + i * 0.18 }} />
              {!reduce && <motion.line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#88ea87" strokeWidth="2.5" strokeDasharray="6 120" animate={{ strokeDashoffset: [0, -126] }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: i * 0.2 }} />}
              <text x={(x1 + x2) / 2 + (Math.abs(dy) > Math.abs(dx) ? 10 : 0)} y={(y1 + y2) / 2 - 9} fill="#8d8c86" fontSize="12" textAnchor={Math.abs(dy) > Math.abs(dx) ? "start" : "middle"} fontFamily="JetBrains Mono, monospace">{l}</text>
            </g>
          );
        })}
        {NODES.map((n, i) => (
          <motion.g key={n.id} initial={reduce ? false : { opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={inView} transition={{ duration: 0.45, delay: i * 0.07, ease }} style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box" }}>
            <rect x={n.x - 80} y={n.y - 24} width="160" height="48" rx="10" fill="#161616" stroke={n.id === "vault" ? "rgba(92,168,86,.6)" : "rgba(255,255,255,.12)"} />
            <text x={n.x} y={n.y - 2} fill="#f3f2ef" fontSize="15" fontWeight="700" textAnchor="middle" fontFamily="Geist, sans-serif">{n.label}</text>
            <text x={n.x} y={n.y + 15} fill="#7fd178" fontSize="11.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{n.sub}</text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

/* ---------- 6 · security checklist ---------- */
export function CheckList({ items }: { items: [string, string][] }) {
  const reduce = useReducedMotion();
  return (
    <div className="dv dv-checks">
      {items.map(([t, d], i) => (
        <motion.div key={t} className="dc-check" initial={reduce ? false : { opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={inView} transition={{ duration: 0.45, delay: i * 0.08, ease }}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill="rgba(92,168,86,.15)" />
            <motion.path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#7fd178" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={inView} transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }} />
          </svg>
          <div><b>{t}</b><span>{d}</span></div>
        </motion.div>
      ))}
    </div>
  );
}

/* mobile: the same map as a vertical chain */
function ContractStack() {
  const reduce = useReducedMotion();
  const rows: { label: string; sub: string; side?: string; edge?: string; hi?: boolean }[] = [
    { label: "$THOOK", sub: "no owner", edge: "traded in" },
    { label: "Uniswap v4 pool", sub: "ETH / THOOK", side: "← LP lock: liquidity locked, no withdraw", edge: "every swap" },
    { label: "4% hook", sub: "immutable", edge: "4% in ETH" },
    { label: "Fee vault", sub: "the pot", side: "← Safe: full control · ← Keeper: weekly payout only", hi: true },
  ];
  return (
    <div className="dv dv-stack">
      {rows.map((r, i) => (
        <motion.div key={r.label} initial={reduce ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.45, delay: i * 0.12, ease }}>
          <div className={`ds-node${r.hi ? " hi" : ""}`}><b>{r.label}</b><small>{r.sub}</small></div>
          {r.side && <div className="ds-side">{r.side}</div>}
          {r.edge && <div className="ds-edge"><span>↓</span>{r.edge}</div>}
        </motion.div>
      ))}
    </div>
  );
}
