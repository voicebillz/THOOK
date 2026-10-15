import { useEffect, useState } from "react";
import { adminCall } from "../lib/api";
import { explorer, short } from "../lib/format";
import OwnershipCard from "./OwnershipCard";

type Check = { ok: boolean; label: string; value: string };
type Step = { id: string; title: string; detail: string };
type Launch = {
  checks: Check[]; ready: boolean; steps: Step[];
  state: { params: { startFdvEth: string; minHoldThook: string; safe: string } | null; steps: Record<string, any>; pending: Record<string, string>; log: { at: number; msg: string }[] };
  verify: { at: number; results: { name: string; address?: string; status: string; message?: string }[] } | null;
};

export default function LaunchPanel({ onChange }: { onChange: () => void }) {
  const [d, setD] = useState<Launch | null>(null);
  const [fdv, setFdv] = useState("3");
  const [minHold, setMinHold] = useState("100000");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => adminCall<Launch>("/api/admin/launch").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const next = d ? d.steps.find((s) => !d.state.steps[s.id]) : undefined;
  const done = d && !next;

  const run = async (step: Step) => {
    if (step.id === "seed" && !confirm("This opens trading for $THOOK. Continue?")) return;
    if (step.id === "token" && !confirm(`Launch with start FDV ${fdv} ETH and min ${minHold} THOOK to win? These can't be changed later (min hold can, via the Safe).`)) return;
    setErr(null); setBusy(step.id);
    try {
      await adminCall("/api/admin/launch", { step: step.id, params: { startFdvEth: fdv, minHoldThook: minHold } });
      onChange();
    } catch (e: any) { setErr(e.message); }
    setBusy(null); load();
  };
  const verify = async () => {
    setErr(null); setBusy("verify");
    try { await adminCall("/api/admin/verify", {}); } catch (e: any) { setErr(e.message); }
    setBusy(null); load();
  };

  if (!d) return <span className="sk" style={{ width: "100%", height: 320, display: "block" }} />;
  const s = d.state.steps;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats-head"><h1>Launch</h1><span className="stats-live">{done ? <><span className="live-dot" />Live</> : "Signed by the keeper wallet on Railway"}</span></div>

      <div className="card">
        <h3>Pre-flight</h3>
        <p className="sub">Everything must be green before step 1.</p>
        <div className="stepper">
          {d.checks.map((c) => (
            <div key={c.label} className={`st${c.ok ? " done" : ""}`}>
              <span className="i">{c.ok ? "✓" : "!"}</span>
              <div style={{ minWidth: 0 }}><div className="t">{c.label}</div><div className="d">{c.value}</div></div>
              <span />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Steps</h3>
        <p className="sub">One click per step, sent by the keeper. No ETH seeding — the whole launch only costs gas (~0.0005 ETH). Safe to retry.</p>
        {!s.token && (
          <div className="admin-grid" style={{ marginBottom: 12 }}>
            <div className="field"><label>Start FDV in ETH (launch price — fixed forever)</label><input value={fdv} onChange={(e) => setFdv(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></div>
            <div className="field"><label>Min THOOK to win (Safe can change later)</label><input value={minHold} onChange={(e) => setMinHold(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" /></div>
          </div>
        )}
        {d.state.params && <p className="sub mono">start FDV {d.state.params.startFdvEth} ETH · min {Number(d.state.params.minHoldThook).toLocaleString()} THOOK · vault owner {short(d.state.params.safe)}</p>}
        <div className="stepper">
          {d.steps.map((st, i) => {
            const r = s[st.id];
            const isNext = next?.id === st.id;
            const addr = r?.address;
            const tx = r?.tx;
            return (
              <div key={st.id} className={`st${r ? " done" : ""}${isNext ? " cur" : ""}`}>
                <span className="i">{r ? "✓" : i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{st.title}</div>
                  <div className="d">
                    {addr ? <a href={explorer("address", addr)} target="_blank" rel="noreferrer">{addr}</a> : busy === st.id ? "sending…" : d.state.pending[st.id] ? `pending ${short(d.state.pending[st.id])}` : st.detail}
                    {tx && !addr && <> · <a href={explorer("tx", tx)} target="_blank" rel="noreferrer">tx {short(tx)}</a></>}
                    {st.id === "seed" && r?.poolId && <> · pool {short(r.poolId)}</>}
                  </div>
                </div>
                {isNext && <button className={`btn btn-sm ${st.id === "seed" ? "btn-lime" : ""}`} disabled={!!busy || !d.ready} onClick={() => run(st)}>{busy === st.id ? "Working…" : st.id === "seed" ? "Open trading" : "Run"}</button>}
              </div>
            );
          })}
        </div>
        {!d.ready && !done && <div className="note note-warning" style={{ marginTop: 12 }}>Fix the red pre-flight checks first.</div>}
        {done && <div className="note note-success" style={{ marginTop: 12 }}>$THOOK is live. Verify the contracts below so screeners show them as open source.</div>}
      </div>

      <div className="card">
        <h3>Explorer verification</h3>
        <p className="sub">Runs automatically right after launch and retries every 10 minutes until all five are verified (Sourcify + Blockscout).</p>
        {d.verify?.results?.length ? (
          <table className="ptable" style={{ marginBottom: 12 }}>
            <tbody>
              {d.verify.results.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="mono muted">{r.address ? short(r.address) : "—"}</td>
                  <td style={{ color: r.status === "verified" ? "var(--success)" : r.status === "not deployed" ? "var(--ink-3)" : "var(--danger)" }}>{r.status}{r.message ? ` — ${r.message}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <button className="btn btn-sm" disabled={!s.token || !!busy} onClick={verify}>{busy === "verify" ? "Verifying… (up to a minute)" : "Verify all on Blockscout"}</button>
      </div>

      {err && <div className="note note-danger">{err}</div>}

      <OwnershipCard deployer={d.checks.find((c) => c.label.startsWith("KEEPER_KEY"))?.value?.startsWith("0x") ? d.checks.find((c) => c.label.startsWith("KEEPER_KEY"))!.value : null} token={s.token?.address} />

      {d.state.log.length > 0 && (
        <div className="card">
          <h3>Log</h3>
          <pre className="code">{[...d.state.log].reverse().map((l) => `${new Date(l.at).toLocaleString()}  ${l.msg}`).join("\n")}</pre>
        </div>
      )}
    </div>
  );
}
