import { motion, useReducedMotion } from "motion/react";

const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** gazz.fun bar chart: grey bars, the latest bar green, bars grow in on view. */
export function Bars({ series, cumulative = false, height }: { series: { day: string; eth: number }[]; cumulative?: boolean; height?: number }) {
  const reduce = useReducedMotion();
  let run = 0;
  const vals = series.map((p) => (cumulative ? (run += p.eth) : p.eth));
  const max = Math.max(...vals, 1e-18);
  const mid = series[Math.floor(series.length / 2)];
  return (
    <div>
      <div className="bars-wrap" style={height ? { height } : undefined}>
        <div className="bars-grid" />
        <div className="bars" role="img" aria-label={`${cumulative ? "Cumulative" : "Daily"} fees chart`}>
          {vals.map((v, i) => (
            <motion.i
              key={series[i].day}
              className={i === vals.length - 1 ? "last" : undefined}
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              initial={reduce ? false : { scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: Math.min(0.6, i * 0.012), ease: [0.22, 1, 0.36, 1] }}
              title={`${series[i].day}: ${v.toFixed(4)} ETH`}
            />
          ))}
        </div>
      </div>
      {series.length > 0 && (
        <div className="bars-axis">
          <span>{fmtDay(series[0].day)}</span>
          {series.length > 2 && <span>{fmtDay(mid.day)}</span>}
          <span>{fmtDay(series[series.length - 1].day)}</span>
        </div>
      )}
    </div>
  );
}
