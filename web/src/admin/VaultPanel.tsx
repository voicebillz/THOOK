// Fee-vault controls. The vault's owner is the Safe, so every owner action is
// prepared here as a Safe transaction (copy the data, or download a batch file
// for Safe → Apps → Transaction Builder → drag & drop). If the connected
// wallet itself is the owner, it can send directly.
import { useEffect, useState } from "react";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { encodeFunctionData, formatEther, isAddress, parseEther, type Abi, type Hex } from "viem";
import artifacts from "../abi/contracts.json";
import type { Config } from "../lib/api";
import { explorer, short } from "../lib/format";
import { robinhood } from "../lib/wallet";

const ABI = (artifacts as any).ThookFeeVault.abi as Abi;
const READS = ["owner", "pendingOwner", "keeper", "paused", "minHold", "maxWinners", "maxPayoutBps", "pot", "totalReceived", "totalPaid", "currentEpoch"] as const;
type Prepared = { label: string; to: string; data: Hex };

export default function VaultPanel({ cfg }: { cfg: Config }) {
  const { address } = useConnection();
  const pub = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient({ chainId: robinhood.id });
  const [v, setV] = useState<Record<string, any> | null>(null);
  const [queue, setQueue] = useState<Prepared[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [f, setF] = useState({ to: cfg.safe || "", amount: "", token: "", recipients: "", keeper: "", minHold: "", maxWinners: "", maxPayoutBps: "", newOwner: "" });
  const vault = cfg.vault as Hex | undefined;

  const load = async () => {
    if (!vault || !pub) return;
    const res = await Promise.all(READS.map((fn) => pub.readContract({ address: vault, abi: ABI, functionName: fn }).catch(() => null)));
    setV(Object.fromEntries(READS.map((k, i) => [k, res[i]])));
  };
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [vault, pub]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = !!v?.owner && !!address && v.owner.toLowerCase() === address.toLowerCase();

  const prepare = async (label: string, fn: string, args: unknown[]) => {
    if (!vault) return;
    const data = encodeFunctionData({ abi: ABI, functionName: fn, args });
    if (isOwner && wallet && pub) {
      try {
        setMsg({ kind: "", text: "Confirm in your wallet…" });
        const hash = await wallet.writeContract({ address: vault, abi: ABI, functionName: fn, args, account: wallet.account, chain: robinhood });
        await pub.waitForTransactionReceipt({ hash });
        setMsg({ kind: "success", text: `${label} confirmed (${short(hash)})` });
        load();
      } catch (e: any) { setMsg({ kind: "danger", text: e?.shortMessage || e?.message || String(e) }); }
      return;
    }
    setQueue((q) => [...q, { label, to: vault, data }]);
    setMsg({ kind: "success", text: `Added "${label}" to the Safe batch below.` });
  };
  const need = (ok: boolean, text: string) => { if (!ok) setMsg({ kind: "danger", text }); return ok; };

  const downloadBatch = () => {
    const safe = (cfg.safe || v?.owner || "") as string;
    const json = {
      version: "1.0",
      chainId: String(robinhood.id),
      createdAt: Date.now(),
      meta: { name: "THOOK vault", description: queue.map((q) => q.label).join(" · "), txBuilderVersion: "1.18.0", createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
      transactions: queue.map((q) => ({ to: q.to, value: "0", data: q.data, contractMethod: null, contractInputsValues: null })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
    a.download = `thook-safe-batch-${Date.now()}.json`;
    a.click();
  };

  if (!vault) return <div className="card"><h3>Fee vault</h3><p className="sub">Appears after the vault is deployed in Launch.</p></div>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats-head"><h1>Fee vault</h1><span className="stats-live"><a href={explorer("address", vault)} target="_blank" rel="noreferrer">{short(vault)} ↗</a></span></div>
      <div className="kpis">
        <div className="kpi"><div className="v">{v ? `${Number(formatEther(v.pot ?? 0n)).toFixed(4)} ETH` : <span className="sk" style={{ width: 80 }} />}</div><div className="l">Pot</div></div>
        <div className="kpi"><div className="v">{v ? `${Number(formatEther(v.totalReceived ?? 0n)).toFixed(4)}` : <span className="sk" style={{ width: 80 }} />}</div><div className="l">Total in (ETH)</div></div>
        <div className="kpi"><div className="v">{v ? `${Number(formatEther(v.totalPaid ?? 0n)).toFixed(4)}` : <span className="sk" style={{ width: 80 }} />}</div><div className="l">Total paid (ETH)</div></div>
        <div className="kpi"><div className="v">{v ? String((v.currentEpoch ?? 0n) + 1n) : "—"}</div><div className="l">Week</div></div>
        <div className="kpi"><div className="v" style={{ color: v?.paused ? "var(--danger)" : "var(--success)" }}>{v ? (v.paused ? "Paused" : "Running") : "—"}</div><div className="l">Payouts</div></div>
      </div>

      {v && !v.owner && <div className="note note-warning">Couldn't read the vault from Robinhood Chain — check the address or the RPC.</div>}
      {v && v.owner && (
        <dl className="kv">
          <dt>Owner</dt><dd>{v.owner}{cfg.safe && v.owner?.toLowerCase() === cfg.safe.toLowerCase() ? " (Safe)" : ""}{isOwner ? " — you" : ""}</dd>
          {v.pendingOwner && !/^0x0+$/.test(v.pendingOwner) && <><dt>Pending owner</dt><dd>{v.pendingOwner}</dd></>}
          <dt>Keeper</dt><dd>{v.keeper}</dd>
          <dt>Limits</dt><dd>min {Number(formatEther(v.minHold ?? 0n)).toLocaleString()} THOOK · {String(v.maxWinners)} winners max · {Number(v.maxPayoutBps) / 100}% of pot max</dd>
        </dl>
      )}

      <div className="admin-grid">
        <div className="card">
          <h3>Withdraw</h3>
          <p className="sub">ETH or tokens out of the vault, to any address.</p>
          <div className="field"><label>Recipient</label><input value={f.to} onChange={(e) => setF({ ...f, to: e.target.value.trim() })} placeholder="0x…" /></div>
          <div className="field"><label>Amount (blank = everything)</label><input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="ETH" inputMode="decimal" /></div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => need(isAddress(f.to), "recipient?") && (f.amount ? prepare(`withdraw ${f.amount} ETH`, "withdraw", [f.to, parseEther(f.amount)]) : prepare("withdraw all ETH", "withdrawAll", [f.to]))}>Withdraw ETH</button>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>Token address (for token withdraw, amount in token units)</label><input value={f.token} onChange={(e) => setF({ ...f, token: e.target.value.trim() })} placeholder="0x…" /></div>
          <button className="btn btn-sm" onClick={() => need(isAddress(f.to) && isAddress(f.token) && !!f.amount, "recipient, token and amount?") && prepare(`withdraw token ${short(f.token)}`, "withdrawToken", [f.token, f.to, parseEther(f.amount)])}>Withdraw token</button>
        </div>

        <div className="card">
          <h3>Manual airdrop</h3>
          <p className="sub">Any recipients, any time — one "address,ETH" per line.</p>
          <textarea rows={5} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} placeholder={"0xabc…,0.5\n0xdef…,0.25"} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => {
              const lines = f.recipients.split(/\n+/).map((l) => l.split(",").map((x) => x.trim())).filter((x) => x[0]);
              if (!need(lines.length > 0 && lines.every(([a, n]) => isAddress(a) && Number(n) > 0), "bad line — use address,ETH")) return;
              prepare(`airdrop to ${lines.length}`, "ownerAirdrop", [lines.map(([a]) => a), lines.map(([, n]) => parseEther(n))]);
            }}>Airdrop</button>
          </div>
        </div>

        <div className="card">
          <h3>Prize limits</h3>
          <p className="sub">Bounds the keeper can never exceed.</p>
          <div className="field"><label>Min THOOK to win</label><input value={f.minHold} onChange={(e) => setF({ ...f, minHold: e.target.value })} inputMode="numeric" /></div>
          <div className="field"><label>Max winners per week (1–50)</label><input value={f.maxWinners} onChange={(e) => setF({ ...f, maxWinners: e.target.value })} inputMode="numeric" /></div>
          <div className="field"><label>Max share of the pot per week (%)</label><input value={f.maxPayoutBps} onChange={(e) => setF({ ...f, maxPayoutBps: e.target.value })} inputMode="decimal" /></div>
          <button className="btn btn-sm" onClick={() => need(!!f.minHold && !!f.maxWinners && !!f.maxPayoutBps, "fill all three") && prepare("set limits", "setLimits", [parseEther(f.minHold), Number(f.maxWinners), Math.round(Number(f.maxPayoutBps) * 100)])}>Set limits</button>
        </div>

        <div className="card">
          <h3>Keeper & safety</h3>
          <p className="sub">Swap the keeper, pause payouts, or move ownership.</p>
          <div className="field"><label>New keeper</label><input value={f.keeper} onChange={(e) => setF({ ...f, keeper: e.target.value.trim() })} placeholder="0x…" /></div>
          <div className="row">
            <button className="btn btn-sm" onClick={() => need(isAddress(f.keeper), "keeper address?") && prepare("set keeper", "setKeeper", [f.keeper])}>Set keeper</button>
            <button className="btn btn-sm" onClick={() => prepare(v?.paused ? "unpause" : "pause payouts", "setPaused", [!v?.paused])}>{v?.paused ? "Unpause" : "Pause payouts"}</button>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>Transfer ownership (new owner must accept)</label><input value={f.newOwner} onChange={(e) => setF({ ...f, newOwner: e.target.value.trim() })} placeholder="0x…" /></div>
          <button className="btn btn-sm" onClick={() => need(isAddress(f.newOwner), "new owner?") && prepare("transfer ownership", "transferOwnership", [f.newOwner])}>Transfer ownership</button>
        </div>
      </div>

      {msg && <div className={`note ${msg.kind ? `note-${msg.kind}` : ""}`}>{msg.text}</div>}

      <div className="card">
        <h3>Safe batch {queue.length > 0 && <span className="tag tag-green" style={{ marginLeft: 6 }}>{queue.length}</span>}</h3>
        <p className="sub">Execute in your Safe: app.safe.global → Apps → Transaction Builder → drop the file → sign with the Safe owners.</p>
        {queue.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nothing queued — use the actions above.</div> : (
          <>
            <table className="ptable" style={{ marginBottom: 12 }}>
              <tbody>{queue.map((q, i) => (
                <tr key={i}>
                  <td>{q.label}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{q.data.slice(0, 26)}…</td>
                  <td><button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(q.data)}>Copy data</button> <button className="btn btn-sm" onClick={() => setQueue(queue.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
            <div className="row">
              <button className="btn btn-sm btn-lime" onClick={downloadBatch}>Download Safe batch</button>
              <a className="btn btn-sm" href="https://app.safe.global/" target="_blank" rel="noreferrer">Open Safe ↗</a>
              <span className="muted mono" style={{ fontSize: 12 }}>to {short(vault)} · value 0</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
