// Quick buy / sell of $THOOK straight against its Uniswap v4 pool, with the
// connected admin wallet (used to kick off trading so screeners index the pool).
import { useEffect, useState } from "react";
import { useConnection, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import type { Config } from "../lib/api";
import { buyThook, sellThook, ERC20_ABI } from "../lib/v4swap";
import { explorer, short } from "../lib/format";
import { robinhood } from "../lib/wallet";

export default function TradePanel({ cfg }: { cfg: Config }) {
  const { address, chainId } = useConnection();
  const pub = usePublicClient({ chainId: robinhood.id });
  const { data: wallet } = useWalletClient({ chainId: robinhood.id });
  const { mutate: switchChain } = useSwitchChain();
  const [eth, setEth] = useState<bigint | null>(null);
  const [thook, setThook] = useState<bigint | null>(null);
  const [buyAmt, setBuyAmt] = useState("0.001");
  const [sellPct, setSellPct] = useState(50);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string; tx?: string } | null>(null);
  const token = cfg.token as Address | undefined;
  const hook = cfg.hook as Address | undefined;

  const load = async () => {
    if (!pub || !address || !token) return;
    const [e, t] = await Promise.all([
      pub.getBalance({ address }),
      pub.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
    ]);
    setEth(e); setThook(t);
  };
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [address, token, pub]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token || !hook || !cfg.poolId) return <div className="card"><h3>Trade</h3><p className="sub">Appears once the pool is live.</p></div>;
  const wrong = chainId !== robinhood.id;
  const sellAmount = thook != null ? (thook * BigInt(sellPct)) / 100n : 0n;

  const run = async (kind: "buy" | "sell") => {
    if (!wallet || !pub || !address) return;
    setMsg(null); setBusy(kind);
    try {
      if (kind === "buy") {
        const v = parseEther(buyAmt || "0");
        if (v <= 0n) throw new Error("enter an ETH amount");
        if (eth != null && v > eth) throw new Error("not enough ETH");
        setMsg({ kind: "", text: "Confirm the buy in your wallet…" });
        const r = await buyThook(wallet, pub, address, token, hook, v);
        setMsg({ kind: "success", text: `Bought with ${buyAmt} ETH`, tx: r.transactionHash });
      } else {
        if (sellAmount <= 0n) throw new Error("no THOOK to sell");
        const r = await sellThook(wallet, pub, address, token, hook, sellAmount, (s) => setMsg({ kind: "", text: `${s} — confirm in your wallet` }));
        setMsg({ kind: "success", text: `Sold ${Number(formatEther(sellAmount)).toLocaleString()} THOOK`, tx: r.transactionHash });
      }
    } catch (e: any) {
      setMsg({ kind: "danger", text: e?.shortMessage || e?.message || String(e) });
    }
    setBusy(null); load();
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats-head"><h1>Trade</h1><span className="stats-live">Uniswap v4 pool · 4% tax each way</span></div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><div className="v">{eth != null ? Number(formatEther(eth)).toFixed(5) : <span className="sk" style={{ width: 80 }} />}</div><div className="l">Your ETH</div></div>
        <div className="kpi"><div className="v">{thook != null ? Number(formatEther(thook)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : <span className="sk" style={{ width: 80 }} />}</div><div className="l">Your THOOK</div></div>
        <div className="kpi"><div className="v" style={{ fontSize: 16 }}>{short(address)}</div><div className="l">Trading wallet (connected)</div></div>
      </div>
      {wrong && <div className="note note-warning row">Switch your wallet to Robinhood Chain. <button className="btn btn-sm" onClick={() => switchChain({ chainId: robinhood.id })}>Switch</button></div>}

      <div className="admin-grid">
        <div className="card">
          <h3>Buy</h3>
          <p className="sub">Pay ETH, receive THOOK. One transaction.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            {["0.001", "0.005", "0.01", "0.05"].map((v) => (
              <button key={v} className={`btn btn-sm${buyAmt === v ? " btn-light" : ""}`} onClick={() => setBuyAmt(v)}>{v} ETH</button>
            ))}
          </div>
          <div className="field"><label>Amount in ETH</label><input value={buyAmt} onChange={(e) => setBuyAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></div>
          <button className="btn btn-lime" style={{ width: "100%" }} disabled={!!busy || wrong} onClick={() => run("buy")}>{busy === "buy" ? "Buying…" : `Buy THOOK for ${buyAmt || 0} ETH`}</button>
        </div>
        <div className="card">
          <h3>Sell</h3>
          <p className="sub">Sell THOOK for ETH. First sell needs two one-time approvals.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            {[25, 50, 75, 100].map((p) => (
              <button key={p} className={`btn btn-sm${sellPct === p ? " btn-light" : ""}`} onClick={() => setSellPct(p)}>{p}%</button>
            ))}
          </div>
          <div className="field"><label>Amount</label><input readOnly value={`${Number(formatEther(sellAmount)).toLocaleString(undefined, { maximumFractionDigits: 0 })} THOOK`} /></div>
          <button className="btn" style={{ width: "100%", borderColor: "var(--danger)", color: "var(--danger)" }} disabled={!!busy || wrong || sellAmount === 0n} onClick={() => run("sell")}>{busy === "sell" ? "Selling…" : `Sell ${sellPct}% of THOOK`}</button>
        </div>
      </div>

      {msg && (
        <div className={`note ${msg.kind ? `note-${msg.kind}` : ""}`}>
          {msg.text}{msg.tx && <> · <a href={explorer("tx", msg.tx)} target="_blank" rel="noreferrer">view tx ↗</a></>}
        </div>
      )}
    </div>
  );
}
