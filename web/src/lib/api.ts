import { useQuery } from "@tanstack/react-query";

export const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export type Stats = {
  live: boolean;
  ethUsd: number | null;
  potEth: number;
  totalFeesEth: number;
  totalDistributedEth: number;
  fees24hEth: number;
  epoch: number;
  epochEnd: number;
  holders: number;
  daily: { day: string; eth: number }[];
  winners: { epoch: number; winner: string; amountEth: number; rank: number; tx: string; t?: number }[];
  updatedAt: number;
};

export type Token = {
  live: boolean;
  name: string;
  symbol: string;
  address: string;
  vault: string | null;
  hook: string | null;
  seeder: string | null;
  safe: string | null;
  poolId: string | null;
  supply: number;
  taxBps: number;
  holders: number;
  minHoldThook: number;
  priceUsd?: number | null;
  fdvUsd?: number | null;
  mcapUsd?: number | null;
  volume24hUsd?: number | null;
  liquidityUsd?: number | null;
  change24h?: number | null;
};

export type Config = {
  chainId: number;
  poolManager: string;
  admin: string | null;
  keeper: string | null;
  minHoldThook: number;
  token?: string;
  vault?: string;
  seeder?: string;
  hook?: string;
  hookDeployer?: string;
  safe?: string | null;
  deployBlock?: number;
  poolId?: string;
};

export type EpochRow = { epoch: number; winners: { address: string; amountWei: string; lossUsd?: number }[]; txHash: string | null; summary: string | null; hash: string | null };

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: () => get<Stats>("/api/stats"), refetchInterval: 15_000 });
export const useToken = () => useQuery({ queryKey: ["token"], queryFn: () => get<Token>("/api/token"), refetchInterval: 60_000 });
export const useConfig = () => useQuery({ queryKey: ["config"], queryFn: () => get<Config>("/api/config"), staleTime: 30_000 });
export const useEpochs = () => useQuery({ queryKey: ["epochs"], queryFn: () => get<EpochRow[]>("/api/epochs"), refetchInterval: 60_000 });

// ---- admin (session signature from the admin wallet) ----
const SESSION_KEY = "thook-admin-session";

export function adminSession(): { message: string; signature: string } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!s) return null;
    const ts = Number(/ts: (\d+)/.exec(s.message)?.[1] || 0);
    if (Date.now() - ts > 3.9 * 3600_000) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveAdminSession(s: { message: string; signature: string } | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* private mode */ }
}

/** Domain-bound login message (the server rejects signatures made for other sites). */
export function sessionMessage() {
  return `THOOK admin\ndomain: ${window.location.host}\naction: session\nts: ${Date.now()}`;
}

export async function adminCall<T = unknown>(path: string, body?: unknown): Promise<T> {
  const s = adminSession();
  if (!s) throw new Error("Sign in as admin first");
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-message": s.message.replace(/\n/g, "\\n"),
      "x-admin-signature": s.signature,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}
