import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

// Tweens between real values from the API (never invents numbers).
export function Counter({ value, digits = 4, duration = 1.6 }: { value: number; digits?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const c = animate(from.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [value, reduce, duration]);
  return <>{shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</>;
}
