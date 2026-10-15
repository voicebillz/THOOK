// Next-airdrop block for the home card: rolling digit tiles + week progress.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const WEEK = 7 * 86400;

function Tile({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const v = String(value).padStart(2, "0");
  return (
    <div className="ac-tile">
      <div className="ac-num" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={v} initial={reduce ? false : { y: "-100%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }} exit={reduce ? undefined : { y: "100%", opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {v}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="ac-l">{label}</span>
    </div>
  );
}

export function AirdropCountdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t); }, []);
  let s = Math.max(0, Math.floor(to - now));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const progress = Math.min(1, Math.max(0, 1 - (to - now) / WEEK));
  return (
    <div className="ac" role="timer" aria-label={`Next airdrop in ${d} days ${h} hours ${m} minutes`}>
      <div className="ac-head">
        <span className="ac-title"><img src="/logos/eth.png" alt="" width={16} height={16} />Next airdrop</span>
        <span className="ac-sub">pot → biggest loser</span>
      </div>
      <div className="ac-tiles">
        <Tile value={d} label="days" /><span className="ac-sep">:</span>
        <Tile value={h} label="hrs" /><span className="ac-sep">:</span>
        <Tile value={m} label="min" /><span className="ac-sep">:</span>
        <Tile value={s} label="sec" />
      </div>
      <div className="ac-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} /></div>
      <div className="ac-foot"><span>Week {Math.round(progress * 100)}% done</span><span>every 7 days</span></div>
    </div>
  );
}
