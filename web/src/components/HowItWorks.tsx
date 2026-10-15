// "How it works" — scroll story. Desktop: a sticky stage on the left swaps
// between three live visuals while the steps on the right light up and a rail
// fills with scroll. Mobile: each step stacks with its own visual.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Words } from "./Reveal";
import { LogoTile } from "./Logo";

const ease = [0.22, 1, 0.36, 1] as const;

/** Real brand marks, served from /logos. */
const Logo = ({ src, alt, size = 18, round = true }: { src: string; alt: string; size?: number; round?: boolean }) => (
  <img src={`/logos/${src}`} alt={alt} width={size} height={size} className="v-logo" style={{ borderRadius: round ? "50%" : 4 }} loading="lazy" />
);

const STEPS = [
  { n: "01", t: "Trade $THOOK", p: "Buy or sell in the Uniswap v4 pool on Robinhood Chain. The liquidity is locked forever.", k: "Locked LP · 1B supply" },
  { n: "02", t: "The hook takes 4%", p: "Every buy and sell pays 4% in ETH, never in THOOK, straight into the fee vault.", k: "Paid in ETH · no sell pressure" },
  { n: "03", t: "The biggest loser wins", p: "Once a week, the holder whose whole portfolio lost the most gets the entire pot.", k: "Every 7 days · audited by Claude" },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 60%", "end 70%"] });
  const rail = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(v < 0.34 ? 0 : v < 0.67 ? 1 : 2));

  return (
    <section className="hiw">
      <div className="wrap">
        <div className="hiw-head">
          <motion.div className="eyebrow" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>How it works</motion.div>
          <h2 className="display"><Words text="A tax that pays the pain back." italic={["pain"]} /></h2>
        </div>

        <div className="hiw-grid" ref={ref}>
          <div className="hiw-stage">
            <div className="hiw-stage-in">
              <AnimatePresence mode="wait">
                <motion.div key={active} className="hiw-card"
                  initial={reduce ? false : { opacity: 0, y: 24, rotateX: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, y: -18, scale: 0.98 }}
                  transition={{ duration: 0.55, ease }}>
                  {active === 0 ? <SwapVisual /> : active === 1 ? <HookVisual /> : <LoserVisual />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="hiw-steps">
            <div className="hiw-rail" aria-hidden="true"><motion.i style={{ scaleY: reduce ? 1 : rail }} /></div>
            {STEPS.map((s, i) => (
              <motion.div key={s.n} className={`hiw-step${active === i ? " on" : ""}`}
                initial={reduce ? false : { opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, ease }}>
                <span className="hiw-dot">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.p}</p>
                <span className="hiw-k">{s.k}</span>
                <div className="hiw-mobile-visual">{i === 0 ? <SwapVisual /> : i === 1 ? <HookVisual /> : <LoserVisual />}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 01 · swap card ---------- */
export function SwapVisual() {
  const reduce = useReducedMotion();
  const [flip, setFlip] = useState(false);
  useEffect(() => { if (reduce) return; const t = setInterval(() => setFlip((f) => !f), 2600); return () => clearInterval(t); }, [reduce]);
  const rows = flip ? [["You sell", "2,410,000", "THOOK"], ["You get", "0.96", "ETH"]] : [["You pay", "1.00", "ETH"], ["You get", "2,410,000", "THOOK"]];
  return (
    <div className="v-swap">
      <div className="v-top"><span className="dk">Swap</span><span className="v-brand"><Logo src="uniswap.png" alt="Uniswap" />Uniswap v4</span></div>
      {rows.map(([l, v, u], i) => (
        <div className="v-row" key={i}>
          <span className="v-l">{l}</span>
          <AnimatePresence mode="popLayout">
            <motion.span key={v + u} className="v-amt" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.4, ease }}>{v}</motion.span>
          </AnimatePresence>
          <span className="v-unit">{u === "THOOK" ? <span className="v-tok"><LogoTile /></span> : <span className="v-tok"><Logo src="eth.png" alt="ETH" size={20} /></span>}{u}</span>
        </div>
      ))}
      <motion.div className="v-swapbtn" animate={{ rotate: flip ? 180 : 0 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>↓</motion.div>
      <svg className="v-spark" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true">
        <motion.path d="M0 40 L20 36 L40 38 L60 30 L80 32 L100 22 L120 26 L140 16 L160 18 L180 8 L200 10" fill="none" stroke="var(--lime)" strokeWidth="2"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease }} />
      </svg>
      <div className="v-foot"><span className="v-chain"><Logo src="robinhood.svg" alt="Robinhood" size={14} round={false} />Robinhood Chain</span><span>LP locked forever</span></div>
    </div>
  );
}

/* ---------- 02 · the 4% hook ---------- */
export function HookVisual() {
  const reduce = useReducedMotion();
  const [vault, setVault] = useState(0);
  useEffect(() => { if (reduce) return; const t = setInterval(() => setVault((v) => v + 0.04), 900); return () => clearInterval(t); }, [reduce]);
  return (
    <div className="v-hook">
      <div className="v-top"><span className="dk">Every swap</span><span className="v-brand"><Logo src="eth.png" alt="ETH" />Paid in ETH</span></div>
      <div className="v-big">4<span>%</span></div>
      <div className="v-split">
        <motion.i className="a" initial={{ width: 0 }} animate={{ width: "96%" }} transition={{ duration: 1, ease }} />
        <motion.i className="b" initial={{ width: 0 }} animate={{ width: "4%" }} transition={{ duration: 0.6, delay: 0.9, ease }} />
      </div>
      <div className="v-legend"><span>96% · your trade</span><span className="lime">4% · in ETH</span></div>
      <div className="v-drip" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <motion.span key={i} className="v-coin" initial={{ y: -10, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { y: [ -10, 56 ], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.8, delay: i * 0.45, repeat: Infinity, ease: "easeIn" }}><Logo src="eth.png" alt="" size={18} /></motion.span>
        ))}
      </div>
      <div className="v-vault">
        <span className="v-vault-ico"><LogoTile /></span>
        <div><div className="dk">Fee vault</div><div className="v-vault-n">+{vault.toFixed(2)} ETH</div></div>
        <span className="v-lock"><Logo src="safe.png" alt="Safe" size={16} />Safe-owned</span>
      </div>
    </div>
  );
}

/* ---------- 03 · biggest loser ---------- */
const LOSERS = [
  { a: "0x9a1f…2233", l: 41210 }, { a: "0x77c0…a91e", l: 18904 }, { a: "0x3be2…0c44", l: 9032 }, { a: "0xe190…77b1", l: 4410 },
];
export function LoserVisual() {
  const reduce = useReducedMotion();
  const [sorted, setSorted] = useState(reduce);
  useEffect(() => { if (reduce) return; const t = setTimeout(() => setSorted(true), 700); return () => clearTimeout(t); }, [reduce]);
  const rows = sorted ? LOSERS : [LOSERS[2], LOSERS[0], LOSERS[3], LOSERS[1]];
  return (
    <div className="v-loser">
      <div className="v-top"><span className="dk">Biggest losers · 7d</span><span className="v-brand"><Logo src="claude.svg" alt="Claude" size={14} round={false} />Audited by Claude</span></div>
      <div className="v-list">
        {rows.map((r, i) => (
          <motion.div layout key={r.a} className={`v-lrow${sorted && i === 0 ? " win" : ""}`} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <span className="v-rank">{i + 1}</span>
            <span className="ava" style={{ background: `linear-gradient(135deg, hsl(${(r.l / 97) % 360} 70% 60%), hsl(${(r.l / 61) % 360} 70% 45%))` }} />
            <span className="v-addr">{r.a}</span>
            <span className="v-loss">−${r.l.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {sorted && (
          <motion.div className="v-prize" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.5, duration: 0.5, ease }}>
            <span className="tag tag-green">Winner</span><span className="grow">0x9a1f…2233 wins</span><span className="chip-green v-eth-chip"><Logo src="eth.png" alt="" size={14} />+3.41 ETH</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
