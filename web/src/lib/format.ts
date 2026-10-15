export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function fmtEth(v: number, digits = 4) {
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtUsd(v?: number | null, compact = false) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (compact) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(v);
  if (v !== 0 && Math.abs(v) < 0.01) return `$${v.toPrecision(3)}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

export function fmtNum(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const explorer = (kind: "address" | "tx" | "token", v: string) => `https://robinhoodchain.blockscout.com/${kind}/${v}`;
