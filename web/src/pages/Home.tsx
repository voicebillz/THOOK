import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { LogoTile } from "../components/Logo";
import { Reveal, Words } from "../components/Reveal";
import { Counter } from "../components/Counter";
import { Countdown } from "../components/Countdown";
import { Bars } from "../components/Bars";
import { Sk } from "../components/Skeleton";
import { useStats, useToken } from "../lib/api";
import { fmtEth, fmtUsd, short } from "../lib/format";
import { buyUrl } from "../lib/links";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { n: "01", t: "Trade $THOOK", p: "Buy or sell in the locked Uniswap v4 pool on Robinhood Chain." },
  { n: "02", t: "The hook takes 4%", p: "Every swap pays 4% in ETH straight into the fee vault." },
  { n: "03", t: "The biggest loser wins", p: "Each week the holder whose whole portfolio lost the most gets the pot." },
];

export default function Home() {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: stage, offset: ["start start", "end start"] });
  const sRotX = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const sScale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const sY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const sFade = useTransform(scrollYProgress, [0.4, 1], [1, 0]);
  // pointer tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 140, damping: 18 });
  const rotXp = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 140, damping: 18 });
  const rotX = useTransform(() => sRotX.get() + rotXp.get());

  const { data: s } = useStats();
  const { data: t } = useToken();
  const live = !!s?.live;
  const usd = (eth: number) => (s?.ethUsd ? eth * s.ethUsd : null);
  const last = s?.winners?.[0];

  return (
    <div className="home-ground">
      <div className="dcard-stage" ref={stage}
        onPointerMove={(e) => { if (reduce || e.pointerType !== "mouse") return; const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5); }}
        onPointerLeave={() => { mx.set(0); my.set(0); }}>
        <motion.div
          className="dcard"
          style={reduce ? undefined : { rotateX: rotX, rotateY: rotY, scale: sScale, y: sY, opacity: sFade }}
          initial={reduce ? false : { opacity: 0, y: 40, rotateX: 14 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1.1, ease, delay: 0.15 }}
        >
          <div className="dcard-top">
            <div className="dcard-brand"><span className="brand-mark"><LogoTile /></span>$THOOK</div>
            <a className="pill" href={buyUrl(t?.address)} target="_blank" rel="noreferrer">Buy</a>
          </div>

          <div className="dcard-hero">
            <div className="dk">This week's pot</div>
            <div className="big">{s ? (live ? fmtUsd(usd(s.potEth)) : "$0") : <Sk w="7ch" h="1em" />}</div>
            <div className="sub">{s ? (live ? <><Counter value={s.potEth} /> ETH</> : "launching soon") : <Sk w="9ch" />}</div>
          </div>

          <div className="dcard-row">
            <div>
              <div className="dk">Fees collected</div>
              <div className="v">{s ? (live ? fmtUsd(usd(s.totalFeesEth), true) : "$0") : <Sk w="5ch" />}</div>
              <div className="s">since launch</div>
            </div>
            <div className="r">
              <div className="dk">Tax</div>
              <div className="v">4%</div>
            </div>
          </div>

          {s ? (live && s.daily?.length ? <Bars series={s.daily} cumulative /> : <div className="bars-wrap"><div className="bars-grid" /></div>) : <span className="sk" style={{ width: "100%", height: 64, display: "block" }} />}

          <div className="dcard-list">
            <div className="dline">
              <span className="tag tag-green">Next airdrop</span>
              <span className="grow" />
              {s ? (live ? <span className="chip-green"><Countdown to={s.epochEnd} /></span> : <span className="muted">—</span>) : <Sk w="10ch" />}
            </div>
            <div className="dline">
              <span className="tag tag-violet">Last winner</span>
              <span className="grow">{s ? (last ? <>{short(last.winner)}<small>week {last.epoch + 1}</small></> : <span className="muted">first drop pending</span>) : <Sk w="12ch" />}</span>
              {last && <span className="chip-green">+{fmtEth(last.amountEth, 3)} ETH</span>}
            </div>
          </div>
        </motion.div>

        <motion.div className="home-tag" style={reduce ? undefined : { opacity: sFade }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.5, ease }}>
          <h1>Every trade pays the biggest loser.</h1>
          <div className="live"><span className="live-dot" style={{ marginRight: 0 }} />Live on Robinhood Chain</div>
        </motion.div>
      </div>

      <section className="home-steps">
        <div className="wrap">
          {STEPS.map((st, i) => (
            <Reveal key={st.n} delay={i * 0.06}>
              <div className="step">
                <div className="step-n">{st.n}</div>
                <h3>{st.t}</h3>
                <p>{st.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="cta-final">
        <div className="wrap">
          <h2 className="display"><Words text="Get hooked." italic={["hooked."]} /></h2>
          <Reveal delay={0.2}>
            <div className="hero-cta">
              <a className="btn btn-lime btn-lg" href={buyUrl(t?.address)} target="_blank" rel="noreferrer">Buy $THOOK</a>
              <Link className="btn btn-lg" to="/stats">Statistics</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
