import { useEffect, useMemo, useState } from "react";
import { adminCall } from "../lib/api";

export default function KeeperPanel() {
  const [status, setStatus] = useState<any>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => adminCall("/api/admin/status").then(setStatus).catch((e) => setOut(e.message));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  const run = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setOut("");
    try { setOut(JSON.stringify(await adminCall("/api/admin/run", body), null, 2)); load(); }
    catch (e: any) { setOut(e.message); }
    setBusy(false);
  };
  const prev = useMemo(() => (status?.clock ? Math.max(0, status.clock.epoch - 1) : 0), [status]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats-head"><h1>Keeper</h1><span className="stats-live">{status ? <><span className="live-dot" />store {status.store}</> : null}</span></div>
      <div className="kpis">
        <div className="kpi"><div className="v">{status ? (status.keeperBalanceEth?.toFixed(4) ?? "—") : <span className="sk" style={{ width: 60 }} />}</div><div className="l">Keeper gas (ETH)</div></div>
        <div className="kpi"><div className="v" style={{ color: status?.keeperEnabled ? "var(--success)" : "var(--ink-2)" }}>{status ? (status.keeperEnabled ? "ON" : "OFF") : "—"}</div><div className="l">Auto payouts</div></div>
        <div className="kpi"><div className="v">{status?.holders?.indexed ?? "—"}</div><div className="l">Holders indexed</div></div>
        <div className="kpi"><div className="v">{status?.clock ? `${status.clock.epoch + 1} · d${status.clock.day + 1}` : "—"}</div><div className="l">Week · day</div></div>
        <div className="kpi"><div className="v">{status?.week?.snapshots ?? "—"}</div><div className="l">Snapshots this week</div></div>
      </div>
      {status?.runs?.lastError && <div className="note note-danger">Last error: {status.runs.lastError.message}</div>}
      <div className="card">
        <h3>Actions</h3>
        <p className="sub">Preview shows exactly who would win and why (Claude's audit included) without paying.</p>
        <div className="row">
          <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "sync" })}>Sync holders</button>
          <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "snapshot", force: true })}>Snapshot now</button>
          <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "preview", epoch: prev })}>Preview week {prev + 1}</button>
          <button className="btn btn-sm btn-lime" disabled={busy} onClick={() => run({ task: "settle", epoch: prev }, `Pay week ${prev + 1} on-chain now?`)}>Pay week {prev + 1}</button>
        </div>
      </div>
      {out && <pre className="code">{out}</pre>}
    </div>
  );
}
