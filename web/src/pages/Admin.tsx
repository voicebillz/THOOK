// Admin portal (not linked in the header). The admin wallet signs every
// on-chain step itself — no owner key ever touches the server.
import { useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient, useWalletClient, useSignMessage, useSwitchChain } from "wagmi";
import { encodeAbiParameters, encodeFunctionData, formatEther, getAddress, isAddress, parseEther, type Abi, type Hex } from "viem";
import artifacts from "../abi/contracts.json";
import { adminCall, adminSession, saveAdminSession, sessionMessage, useConfig, type Config } from "../lib/api";
import { mineHookSalt } from "../lib/mineHook";
import { explorer, short } from "../lib/format";
import { robinhood } from "../lib/wallet";
import { WalletButton } from "../components/WalletButton";

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
type Art = { abi: Abi; bytecode: Hex };
const A = artifacts as unknown as Record<"ThookToken" | "ThookFeeVault" | "ThookSeeder" | "ThookFeeHook" | "HookDeployer", Art>;

type DeployState = {
  token?: string; deployBlock?: number; vault?: string; seeder?: string; hookDeployer?: string; hook?: string;
  hookSet?: boolean; funded?: boolean; seeded?: boolean; saved?: boolean; poolId?: string;
};
const LS = "thook-deploy-v1";
const loadState = (): DeployState => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };

export default function Admin() {
  const { address, isConnected, chainId } = useConnection();
  const { mutate: switchChain } = useSwitchChain();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const cfg = useConfig();
  const [session, setSession] = useState(adminSession());
  const isAdmin = !!address && !!cfg.data?.admin && address.toLowerCase() === cfg.data.admin.toLowerCase();

  const signIn = async () => {
    const message = sessionMessage();
    const signature = await signMessageAsync({ message });
    const s = { message, signature };
    saveAdminSession(s);
    setSession(s);
  };

  return (
    <div className="page">
      <div className="wrap">
        <div className="eyebrow">Admin</div>
        <h1 className="page-title">Control room.</h1>
        <p className="page-intro">Deploy, wire and run THOOK — every on-chain action is signed by your wallet.</p>

        {!isConnected && <WalletButton size="lg" label="Connect admin wallet" />}
        {isConnected && cfg.isLoading && <span className="sk" style={{ width: 260, height: 20 }} />}
        {isConnected && cfg.isError && <div className="note note-danger">Can't reach the server (VITE_API_URL). Check Railway.</div>}
        {isConnected && cfg.data && !cfg.data.admin && <div className="note note-warning">Set ADMIN_WALLET={address} on Railway, then reload.</div>}
        {isConnected && cfg.data?.admin && !isAdmin && <div className="note note-danger">{short(address)} is not the admin wallet ({short(cfg.data.admin)}).</div>}
        {isAdmin && chainId !== robinhood.id && (
          <div className="note note-warning row" style={{ marginBottom: 16 }}>
            Switch to Robinhood Chain to sign transactions.
            <button className="btn btn-sm" onClick={() => switchChain({ chainId: robinhood.id })}>Switch</button>
          </div>
        )}
        {isAdmin && !session && (
          <div className="card" style={{ maxWidth: 520 }}>
            <h3>Sign in</h3>
            <p className="sub">One free signature (no gas) unlocks the server controls for 12 hours.</p>
            <button className="btn btn-lime" onClick={() => signIn().catch((e) => alert(e.shortMessage || e.message))}>Sign in as admin</button>
          </div>
        )}
        {isAdmin && session && cfg.data && (
          <div style={{ display: "grid", gap: 16 }}>
            <DeployWizard cfg={cfg.data} onSaved={() => cfg.refetch()} />
            <div className="admin-grid">
              <VaultPanel cfg={cfg.data} />
              <KeeperPanel onSignOut={() => { saveAdminSession(null); setSession(null); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- deploy

function DeployWizard({ cfg, onSaved }: { cfg: Config; onSaved: () => void }) {
  const { address } = useConnection();
  const pub = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient({ chainId: robinhood.id });
  const [st, setSt] = useState<DeployState>(() => ({ ...loadState(), ...(cfg.token ? { token: cfg.token, vault: cfg.vault, seeder: cfg.seeder, hook: cfg.hook, hookDeployer: cfg.hookDeployer, deployBlock: cfg.deployBlock, poolId: cfg.poolId, saved: true, seeded: !!cfg.poolId, hookSet: !!cfg.poolId, funded: !!cfg.poolId } : {}) }));
  const [keeper, setKeeper] = useState(cfg.keeper || "");
  const [minHold, setMinHold] = useState(String(cfg.minHoldThook || 100000));
  const [fdv, setFdv] = useState("3");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* ignore */ } }, [st]);
  const patch = (p: Partial<DeployState>) => setSt((s) => ({ ...s, ...p }));

  const deploy = async (art: Art, args: unknown[]) => {
    if (!wallet || !pub) throw new Error("wallet not ready");
    const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args, account: wallet.account, chain: robinhood });
    setProgress(`waiting for ${short(hash)}…`);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error("deploy reverted");
    return { address: getAddress(r.contractAddress), block: Number(r.blockNumber) };
  };
  const call = async (to: string, art: Art, fn: string, args: unknown[]) => {
    if (!wallet || !pub) throw new Error("wallet not ready");
    const hash = await wallet.writeContract({ address: to as Hex, abi: art.abi, functionName: fn, args, account: wallet.account, chain: robinhood });
    setProgress(`waiting for ${short(hash)}…`);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted`);
  };

  const steps: { key: string; title: string; detail: string; done: boolean; run: () => Promise<void> }[] = [
    { key: "token", title: "Deploy $THOOK token", detail: st.token ? st.token : "1,000,000,000 THOOK minted to your wallet", done: !!st.token,
      run: async () => { const r = await deploy(A.ThookToken, []); patch({ token: r.address, deployBlock: r.block }); } },
    { key: "vault", title: "Deploy fee vault", detail: st.vault ? st.vault : "owner = you (hand over to the Safe below), keeper = Railway wallet", done: !!st.vault,
      run: async () => {
        if (!isAddress(keeper)) throw new Error("keeper address missing — set KEEPER_KEY on Railway or paste the keeper address");
        const r = await deploy(A.ThookFeeVault, [address, keeper, st.token, parseEther(minHold || "0")]);
        patch({ vault: r.address });
      } },
    { key: "seeder", title: "Deploy LP seeder (lock)", detail: st.seeder ? st.seeder : `start FDV ${fdv} ETH · LP fee 0 · liquidity locked forever`, done: !!st.seeder,
      run: async () => { const r = await deploy(A.ThookSeeder, [POOL_MANAGER, st.token, parseEther(fdv)]); patch({ seeder: r.address }); } },
    { key: "hd", title: "Deploy hook deployer", detail: st.hookDeployer ? st.hookDeployer : "CREATE2 helper for the hook address", done: !!st.hookDeployer,
      run: async () => { const r = await deploy(A.HookDeployer, []); patch({ hookDeployer: r.address }); } },
    { key: "hook", title: "Mine + deploy 4% fee hook", detail: st.hook ? st.hook : "finds an address with the v4 permission bits, then deploys", done: !!st.hook,
      run: async () => {
        const ctor = (A.ThookFeeHook.abi as any[]).find((x) => x.type === "constructor");
        const initCode = (A.ThookFeeHook.bytecode + encodeAbiParameters(ctor.inputs, [POOL_MANAGER, st.token, st.vault, st.seeder]).slice(2)) as Hex;
        const { salt, address: hook } = await mineHookSalt(st.hookDeployer!, initCode, (n) => setProgress(`mining… ${n.toLocaleString()} tries`));
        await call(st.hookDeployer!, A.HookDeployer, "deploy", [salt, initCode]);
        const code = await pub!.getCode({ address: hook });
        if (!code || code === "0x") throw new Error("hook not found at mined address");
        patch({ hook });
      } },
    { key: "setHook", title: "Bind hook to seeder", detail: "seeder.setHook(hook) — one time", done: !!st.hookSet,
      run: async () => { await call(st.seeder!, A.ThookSeeder, "setHook", [st.hook]); patch({ hookSet: true }); } },
    { key: "fund", title: "Move full supply to seeder", detail: "transfers all your THOOK into the LP seeder", done: !!st.funded,
      run: async () => {
        const bal = (await pub!.readContract({ address: st.token as Hex, abi: A.ThookToken.abi, functionName: "balanceOf", args: [address] })) as bigint;
        if (bal === 0n) throw new Error("you hold no THOOK");
        await call(st.token!, A.ThookToken, "transfer", [st.seeder, bal]);
        patch({ funded: true });
      } },
    { key: "seed", title: "Launch: seed locked pool", detail: st.poolId ? `pool ${short(st.poolId)}` : "creates the ETH/THOOK v4 pool — trading opens", done: !!st.seeded,
      run: async () => {
        await call(st.seeder!, A.ThookSeeder, "seed", []);
        const poolId = (await pub!.readContract({ address: st.seeder as Hex, abi: A.ThookSeeder.abi, functionName: "poolId" })) as string;
        patch({ seeded: true, poolId });
      } },
    { key: "save", title: "Save addresses to the server", detail: "the site + keeper go live", done: !!st.saved,
      run: async () => {
        await adminCall("/api/admin/config", { token: st.token, vault: st.vault, seeder: st.seeder, hook: st.hook, hookDeployer: st.hookDeployer, deployBlock: st.deployBlock, poolId: st.poolId, startFdvEth: fdv });
        patch({ saved: true });
        onSaved();
      } },
  ];
  const cur = steps.findIndex((s) => !s.done);

  const run = async (i: number) => {
    setErr(null); setBusy(steps[i].key); setProgress("confirm in your wallet…");
    try { await steps[i].run(); } catch (e: any) { setErr(e?.shortMessage || e?.message || String(e)); }
    setBusy(null); setProgress("");
  };

  return (
    <div className="card">
      <h3>Launch</h3>
      <p className="sub">Nine signatures from your wallet; progress is saved if you leave mid-way.</p>
      {cur === 0 && (
        <div className="admin-grid" style={{ marginBottom: 12 }}>
          <div className="field"><label>Keeper address (Railway)</label><input value={keeper} onChange={(e) => setKeeper(e.target.value.trim())} placeholder="0x…" /></div>
          <div className="field"><label>Min THOOK to win</label><input value={minHold} onChange={(e) => setMinHold(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></div>
          <div className="field"><label>Start FDV (ETH) — launch price</label><input value={fdv} onChange={(e) => setFdv(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></div>
        </div>
      )}
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s.key} className={`st${s.done ? " done" : ""}${i === cur ? " cur" : ""}`}>
            <span className="i">{s.done ? "✓" : i + 1}</span>
            <div style={{ minWidth: 0 }}><div className="t">{s.title}</div><div className="d">{busy === s.key && progress ? progress : s.detail}</div></div>
            {i === cur && <button className="btn btn-sm btn-lime" disabled={!!busy} onClick={() => run(i)}>{busy === s.key ? "Working…" : "Run"}</button>}
          </div>
        ))}
      </div>
      {err && <div className="note note-danger" style={{ marginTop: 12 }}>{err}</div>}
      {cur === -1 && <div className="note note-success" style={{ marginTop: 12 }}>THOOK is live. Next: hand the vault to your Safe below.</div>}
      {cur > 0 && cur !== -1 && (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => { if (confirm("Forget local deploy progress? (on-chain contracts stay)")) setSt({}); }}>Reset progress</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- vault

const VAULT_READS = ["owner", "pendingOwner", "keeper", "paused", "minHold", "maxWinners", "maxPayoutBps", "pot", "totalReceived", "totalPaid", "currentEpoch"] as const;

function VaultPanel({ cfg }: { cfg: Config }) {
  const { address } = useConnection();
  const pub = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient({ chainId: robinhood.id });
  const [v, setV] = useState<Record<string, any> | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string; data?: string } | null>(null);
  const [f, setF] = useState({ to: "", amount: "", token: "", recipients: "", keeper: "", safe: cfg.safe || "", minHold: "", maxWinners: "", maxPayoutBps: "" });
  const vault = cfg.vault as Hex | undefined;

  const load = async () => {
    if (!vault || !pub) return;
    const res = await Promise.all(VAULT_READS.map((fn) => pub.readContract({ address: vault, abi: A.ThookFeeVault.abi, functionName: fn }).catch(() => null)));
    setV(Object.fromEntries(VAULT_READS.map((k, i) => [k, res[i]])));
  };
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [vault, pub]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = !!v?.owner && !!address && v.owner.toLowerCase() === address.toLowerCase();

  // Owner wallet → send directly. Otherwise (owner = Safe) → show the Safe tx.
  const exec = async (fn: string, args: unknown[]) => {
    if (!vault) return;
    const data = encodeFunctionData({ abi: A.ThookFeeVault.abi, functionName: fn, args });
    if (!isOwner) {
      setMsg({ kind: "warning", text: `Owner is ${short(v?.owner)} (your Safe). Create this transaction in the Safe app → Transaction Builder: to ${vault}, value 0, data below.`, data });
      return;
    }
    try {
      setMsg({ kind: "info", text: "Confirm in your wallet…" });
      const hash = await wallet!.writeContract({ address: vault, abi: A.ThookFeeVault.abi, functionName: fn, args, account: wallet!.account, chain: robinhood });
      await pub!.waitForTransactionReceipt({ hash });
      setMsg({ kind: "success", text: `${fn} confirmed (${short(hash)})` });
      load();
    } catch (e: any) {
      setMsg({ kind: "danger", text: e?.shortMessage || e?.message || String(e) });
    }
  };
  const need = (ok: boolean, text: string) => { if (!ok) setMsg({ kind: "danger", text }); return ok; };

  if (!vault) return <div className="card"><h3>Fee vault</h3><p className="sub">Appears after launch.</p></div>;
  return (
    <div className="card">
      <h3>Fee vault</h3>
      <p className="sub"><a href={explorer("address", vault)} target="_blank" rel="noreferrer">{vault}</a></p>
      {!v ? <span className="sk" style={{ width: "100%", height: 120 }} /> : (
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Pot</dt><dd className="lime">{formatEther(v.pot ?? 0n)} ETH</dd>
          <dt>Total in / out</dt><dd>{formatEther(v.totalReceived ?? 0n)} / {formatEther(v.totalPaid ?? 0n)} ETH</dd>
          <dt>Owner</dt><dd>{v.owner}{isOwner ? " (you)" : ""}</dd>
          {v.pendingOwner && v.pendingOwner !== "0x0000000000000000000000000000000000000000" && <><dt>Pending owner</dt><dd>{v.pendingOwner} — must acceptOwnership()</dd></>}
          <dt>Keeper</dt><dd>{v.keeper}</dd>
          <dt>Limits</dt><dd>min {formatEther(v.minHold ?? 0n)} THOOK · {String(v.maxWinners)} winners · {Number(v.maxPayoutBps) / 100}%</dd>
          <dt>Week / paused</dt><dd>{String((v.currentEpoch ?? 0n) + 1n)} · {v.paused ? "PAUSED" : "running"}</dd>
        </dl>
      )}

      <div className="field"><label>Withdraw ETH — to · amount (blank = all)</label>
        <div className="row"><input placeholder="0x… recipient" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value.trim() })} style={{ flex: 2 }} /><input placeholder="ETH" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ flex: 1 }} /></div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => need(isAddress(f.to), "recipient?") && (f.amount ? exec("withdraw", [f.to, parseEther(f.amount)]) : exec("withdrawAll", [f.to]))}>Withdraw</button>
          <button className="btn btn-sm" onClick={() => need(isAddress(f.to) && isAddress(f.token), "recipient + token address?") && exec("withdrawToken", [f.token, f.to, parseEther(f.amount || "0")])}>Withdraw token</button>
          <input placeholder="token address (for token withdraw)" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value.trim() })} style={{ flex: 1, minWidth: 200 }} />
        </div>
      </div>

      <div className="field"><label>Manual airdrop — one "address,ETH" per line</label>
        <textarea rows={3} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} placeholder={"0xabc…,0.5\n0xdef…,0.25"} />
        <div className="row"><button className="btn btn-sm" onClick={() => {
          const lines = f.recipients.split(/\n+/).map((l) => l.split(",").map((x) => x.trim())).filter((x) => x[0]);
          if (!need(lines.every(([a, n]) => isAddress(a) && Number(n) > 0), "bad line — use address,ETH")) return;
          exec("ownerAirdrop", [lines.map(([a]) => a), lines.map(([, n]) => parseEther(n))]);
        }}>Airdrop</button></div>
      </div>

      <div className="field"><label>Limits — min THOOK · max winners · max payout %</label>
        <div className="row">
          <input placeholder="min THOOK" value={f.minHold} onChange={(e) => setF({ ...f, minHold: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="winners (1–50)" value={f.maxWinners} onChange={(e) => setF({ ...f, maxWinners: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="% (1–100)" value={f.maxPayoutBps} onChange={(e) => setF({ ...f, maxPayoutBps: e.target.value })} style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => need(!!f.minHold && !!f.maxWinners && !!f.maxPayoutBps, "fill all three") && exec("setLimits", [parseEther(f.minHold), Number(f.maxWinners), Math.round(Number(f.maxPayoutBps) * 100)])}>Set</button>
        </div>
      </div>

      <div className="field"><label>Keeper</label>
        <div className="row"><input placeholder="0x… new keeper" value={f.keeper} onChange={(e) => setF({ ...f, keeper: e.target.value.trim() })} style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => need(isAddress(f.keeper), "keeper address?") && exec("setKeeper", [f.keeper])}>Set keeper</button>
          <button className="btn btn-sm" onClick={() => exec("setPaused", [!v?.paused])}>{v?.paused ? "Unpause" : "Pause payouts"}</button>
        </div>
      </div>

      <div className="field"><label>Hand over to Safe (safe.global)</label>
        <div className="row"><input placeholder="0x… Safe address" value={f.safe} onChange={(e) => setF({ ...f, safe: e.target.value.trim() })} style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={async () => {
            if (!need(isAddress(f.safe), "Safe address?")) return;
            await exec("transferOwnership", [f.safe]);
            await adminCall("/api/admin/config", { safe: f.safe }).catch(() => {});
          }}>Transfer ownership</button>
        </div>
        <span className="d mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>Then in the Safe: call acceptOwnership() on the vault (data 0x79ba5097).</span>
      </div>

      {msg && (
        <div className={`note note-${msg.kind === "info" ? "" : msg.kind}`} style={{ marginTop: 8 }}>
          {msg.text}
          {msg.data && <pre className="code" style={{ marginTop: 8 }}>{msg.data}</pre>}
          {msg.data && <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(msg.data!)}>Copy data</button>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- keeper

function KeeperPanel({ onSignOut }: { onSignOut: () => void }) {
  const [status, setStatus] = useState<any>(null);
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const load = () => adminCall("/api/admin/status").then(setStatus).catch((e) => setOut(e.message));
  useEffect(() => { load(); }, []);
  const run = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setOut("");
    try { setOut(JSON.stringify(await adminCall("/api/admin/run", body), null, 2)); load(); }
    catch (e: any) { setOut(e.message); }
    setBusy(false);
  };
  const prevEpoch = useMemo(() => (status?.clock ? Math.max(0, status.clock.epoch - 1) : 0), [status]);

  return (
    <div className="card">
      <h3>Keeper & Claude agent</h3>
      <p className="sub">Runs on Railway: indexes holders, snapshots portfolios daily, pays the top loser weekly.</p>
      {!status ? <span className="sk" style={{ width: "100%", height: 120 }} /> : (
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Keeper</dt><dd>{status.keeper || "KEEPER_KEY not set"}{status.keeperBalanceEth != null ? ` · ${status.keeperBalanceEth.toFixed(5)} ETH gas` : ""}</dd>
          <dt>Auto payouts</dt><dd>{status.keeperEnabled ? "ON" : "OFF (KEEPER_ENABLED=false)"}</dd>
          <dt>Holders indexed</dt><dd>{status.holders?.indexed ?? 0}</dd>
          <dt>Week</dt><dd>{status.clock ? `${status.clock.epoch + 1} · day ${status.clock.day + 1}/7 · ${status.week?.snapshots ?? 0} snapshots` : "—"}</dd>
          <dt>Last error</dt><dd>{status.runs?.lastError?.message || "none"}</dd>
        </dl>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "sync" })}>Sync holders</button>
        <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "snapshot", force: true })}>Snapshot now</button>
        <button className="btn btn-sm" disabled={busy} onClick={() => run({ task: "preview", epoch: prevEpoch })}>Preview week {prevEpoch + 1}</button>
        <button className="btn btn-sm btn-lime" disabled={busy} onClick={() => run({ task: "settle", epoch: prevEpoch }, `Pay week ${prevEpoch + 1} on-chain now?`)}>Pay week {prevEpoch + 1}</button>
        <button className="btn btn-sm" onClick={onSignOut}>Sign out</button>
      </div>
      {out && <pre className="code">{out}</pre>}
    </div>
  );
}
