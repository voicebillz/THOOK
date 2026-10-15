import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { LogoTile } from "../components/Logo";
import { Reveal, Words } from "../components/Reveal";
import { AirdropCountdown } from "../components/AirdropCountdown";
import { FeeChart } from "../components/FeeChart";
import { HowItWorks } from "../components/HowItWorks";
import { Sk } from "../components/Skeleton";
import { useStats, useToken } from "../lib/api";
import { fmtEth, fmtUsd, short } from "../lib/format";
import { buyUrl } from "../lib/links";

const ease = [0.22, 1, 0.36, 1] as const;


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

  const cta = useRef<HTMLElement>(null);
  const { scrollYProgress: ctaP } = useScroll({ target: cta, offset: ["start end", "end start"] });
  const ctaRot = useTransform(ctaP, [0, 1], [-18, 12]);
  const ctaScale = useTransform(ctaP, [0, 1], [0.8, 1.1]);

  const { data: s, isError: statsErr } = useStats();
  const { data: t } = useToken();
  const live = !!s?.live;
  const usd = (eth: number) => (s?.ethUsd ? eth * s.ethUsd : null);

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
            <a className="pill blink" href={buyUrl(t?.address)} target="_blank" rel="noreferrer"><img src="/logos/uniswap.png" alt="" width={14} height={14} />Buy</a>
          </div>

          <div className="dcard-hero">
            <div className="dk">This week's pot</div>
            <div className="big">{s ? (live ? fmtUsd(usd(s.potEth)) : "$0") : <Sk w="7ch" h="1em" />}</div>
          </div>

          <div className="dcard-row">
            <div>
              <div className="dk">Fees collected</div>
              <div className="v">{s ? (live ? fmtUsd(usd(s.totalFeesEth), true) : "$0") : <Sk w="5ch" />}</div>
            </div>
            <div className="r">
              <div className="dk">Tax</div>
              <div className="v">4%</div>
            </div>
          </div>

          <div className="dcard-chart">
            {s ? <FeeChart stats={live ? s : undefined} mode="fees" height={72} /> : <span className="sk" style={{ width: "100%", height: 72, display: "block" }} />}
          </div>

          {s ? (live ? <AirdropCountdown to={s.epochEnd} /> : null) : <span className="sk" style={{ width: "100%", height: 120, display: "block", marginTop: 10 }} />}
        </motion.div>

        {statsErr && !s && <div className="note note-danger" style={{ marginTop: 16 }}>Can't reach the THOOK server right now — retrying.</div>}
        <motion.div className="home-tag" style={reduce ? undefined : { opacity: sFade }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.5, ease }}>
          <h1>Every trade pays the biggest loser.</h1>
          <div className="live"><span className="live-dot" style={{ marginRight: 0 }} />Live on Robinhood Chain</div>
        </motion.div>
      </div>

      <HowItWorks />

      <section className="cta-final" ref={cta}>
        <motion.div className="cta-mark" aria-hidden="true" style={reduce ? undefined : { rotate: ctaRot, scale: ctaScale }}><LogoTile /></motion.div>
        <div className="wrap">
          <h2 className="display"><Words text="Get hooked." italic={["hooked."]} /></h2>
          <Reveal delay={0.2}>
            <div className="hero-cta">
              <a className="btn btn-lime btn-lg blink" href={buyUrl(t?.address)} target="_blank" rel="noreferrer"><img src="/logos/uniswap.png" alt="" width={20} height={20} />Buy $THOOK</a>
              <Link className="btn btn-lg" to="/stats">Statistics</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
