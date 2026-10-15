import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fade + rise when scrolled into view (once). */
export function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, delay, ease }}>
      {children}
    </motion.div>
  );
}

/** Headline that rises word by word from a mask. The observed element is
 *  the (unclipped) wrapper — observing the masked word itself never fires. */
export function Words({ text, delay = 0, className, italic = [] as string[] }: { text: string; delay?: number; className?: string; italic?: string[] }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      aria-label={text}
      style={{ display: "inline" }}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true }}
      transition={{ staggerChildren: 0.07, delayChildren: delay }}
    >
      {words.map((w, i) => (
        <span className="word" key={i} aria-hidden="true">
          <motion.span
            className={italic.includes(w) ? "ital" : undefined}
            variants={{ hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 1, ease } } }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </motion.span>
  );
}
