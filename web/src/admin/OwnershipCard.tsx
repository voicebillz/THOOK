// Prove token ownership to Dexscreener / GeckoTerminal / CoinGecko. They trust
// the contract DEPLOYER, which is the keeper wallet — the server signs the
// platform's text message with it (personal_sign only; can't move funds).
import { useState } from "react";
import { adminCall } from "../lib/api";
import { explorer, short } from "../lib/format";

export default function OwnershipCard({ deployer, token }: { deployer?: string | null; token?: string | null }) {
  const [msg, setMsg] = useState("");
  const [out, setOut] = useState<{ address: string; signature: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sign = async () => {
    setErr(null); setOut(null); setBusy(true);
    try { setOut(await adminCall("/api/admin/sign", { message: msg })); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).catch(() => {});
  return (
    <div className="card">
      <h3>Prove ownership (Dexscreener · GeckoTerminal · CoinGecko)</h3>
      <p className="sub">These sites trust the token's deployer. Paste the message they ask you to sign — the deployer key on Railway signs it.</p>
      <dl className="kv" style={{ marginBottom: 12 }}>
        <dt>Deployer</dt><dd>{deployer ? <a href={explorer("address", deployer)} target="_blank" rel="noreferrer">{deployer}</a> : "KEEPER_KEY not set"}</dd>
        {token && <><dt>Token</dt><dd><a href={explorer("token", token)} target="_blank" rel="noreferrer">{token}</a></dd></>}
      </dl>
      <div className="field"><label>Message to sign (exactly as the site shows it)</label>
        <textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. I am the owner of 0x… on robinhood. Nonce: …" />
      </div>
      <button className="btn btn-sm btn-lime" disabled={!msg.trim() || busy || !deployer} onClick={sign}>{busy ? "Signing…" : "Sign as deployer"}</button>
      {err && <div className="note note-danger" style={{ marginTop: 10 }}>{err}</div>}
      {out && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div className="note note-success">Signed by {short(out.address)} — paste the signature (and address, if asked) into the site.</div>
          <pre className="code" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{out.signature}</pre>
          <div className="row">
            <button className="btn btn-sm" onClick={() => copy(out.signature)}>Copy signature</button>
            <button className="btn btn-sm" onClick={() => copy(out.address)}>Copy address</button>
          </div>
        </div>
      )}
      <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>If a site insists on a connected wallet instead of a pasted signature, import the keeper's private key into a wallet just for that step.</p>
    </div>
  );
}
