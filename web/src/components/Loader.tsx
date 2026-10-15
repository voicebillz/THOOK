import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LogoTile } from "./Logo";

// First-visit intro: the hook assembles, a lime panel wipes the page in.
// Shown once per session; skipped entirely with reduced motion.
export function Loader() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem("thook-intro"); } catch { return true; }
  });
  useEffect(() => {
    if (!show) return;
    if (reduce) { setShow(false); return; }
    const t = setTimeout(() => {
      setShow(false);
      try { sessionStorage.setItem("thook-intro", "1"); } catch { /* ignore */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [show, reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div key="loader" className="loader" exit={{ clipPath: "inset(0 0 100% 0)" }} transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }} style={{ clipPath: "inset(0 0 0% 0)" }}>
          <motion.div className="loader-mark" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 1.15, opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
            <LogoTile build />
          </motion.div>
          <motion.div className="loader-bar" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
