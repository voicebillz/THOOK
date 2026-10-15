import { useEffect, useState } from "react";

export function Countdown({ to, mono = true }: { to: number; mono?: boolean }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  let s = Math.max(0, to - now);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return <span className={mono ? "mono" : undefined} style={{ fontVariantNumeric: "tabular-nums" }}>{d}d {p(h)}:{p(m)}:{p(s)}</span>;
}
