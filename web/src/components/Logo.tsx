import { motion, useReducedMotion } from "motion/react";

// Vector rebuild of the THOOK mark (lime tile, ink hook). `build` animates
// the pieces in: eye → shank → bend → barb → bait.
const VB = "452 398 1060 1060";

export function LogoTile({ build = false, className, tile = true }: { build?: boolean; className?: string; tile?: boolean }) {
  const reduce = useReducedMotion();
  const anim = build && !reduce;
  const piece = (delay: number, from: Record<string, number | string>) =>
    anim
      ? { initial: { opacity: 0, ...from }, animate: { opacity: 1, scale: 1, x: 0, y: 0, scaleY: 1, rotate: 0 }, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const } }
      : {};
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="THOOK logo" style={{ display: "block", width: "100%", height: "100%" }}>
      {tile && <rect x="452" y="398" width="1060" height="1060" fill="#c8f530" />}
      <g fill="#0b0b0f">
        <motion.path
          fillRule="evenodd"
          d="M1174 444a162 162 0 1 1 0 324a162 162 0 1 1 0-324zm0 104a58 58 0 1 0 0 116a58 58 0 1 0 0-116z"
          style={{ transformOrigin: "1174px 606px", transformBox: "view-box" }}
          {...piece(0.05, { scale: 0.2 })}
        />
        <motion.path
          d="M1122 740H1226V1115A295.5 295.5 0 0 1 635 1115V995H740V1115A190.5 190.5 0 0 0 1122 1115Z"
          style={{ transformOrigin: "930px 740px", transformBox: "view-box" }}
          {...piece(0.18, { scaleY: 0.1 })}
        />
        <motion.path
          d="M629 728L843 1002L835 1011L745 958V995H629Z"
          style={{ transformOrigin: "690px 995px", transformBox: "view-box" }}
          {...piece(0.42, { y: 80, rotate: -12 })}
        />
        <motion.circle cx="930" cy="1128" r="110" style={{ transformOrigin: "930px 1128px", transformBox: "view-box" }} {...piece(0.58, { scale: 0 })} />
      </g>
    </svg>
  );
}
