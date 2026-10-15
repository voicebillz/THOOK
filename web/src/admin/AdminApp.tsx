// THOOK admin portal — its own page (/admin), locked behind the owner wallet.
// Nothing below the login gate renders until the SERVER has verified a
// domain-bound signature from ADMIN_WALLET. Launch transactions are sent by
// the keeper key on Railway; the owner wallet never sends a transaction here.
import { useEffect, useState } from "react";
import { useConnection, useDisconnect, useSignMessage } from "wagmi";
import { LogoTile } from "../components/Logo";
import { WalletButton } from "../components/WalletButton";
import { adminCall, adminSession, saveAdminSession, sessionMessage, useConfig } from "../lib/api";
import { short } from "../lib/format";
import LaunchPanel from "./LaunchPanel";
import VaultPanel from "./VaultPanel";
import KeeperPanel from "./KeeperPanel";

type Tab = "launch" | "vault" | "keeper";

export default function AdminApp() {
  const { address, isConnected } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: signMessageAsync, isPending: signing } = useSignMessage();
  const cfg = useConfig();
  const [authed, setAuthed] = useState<"checking" | "yes" | "no">("checking");
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => { const t = localStorage.getItem("thook-admin-tab"); return t === "vault" || t === "keeper" ? t : "launch"; });
  const admin = cfg.data?.admin?.toLowerCase();
  const isAdmin = !!address && !!admin && address.toLowerCase() === admin;

  // Re-check the stored session with the server whenever the wallet changes.
  useEffect(() => {
    if (!isAdmin || !adminSession()) { setAuthed("no"); return; }
    setAuthed("checking");
    adminCall("/api/admin/session").then(() => setAuthed("yes")).catch(() => { saveAdminSession(null); setAuthed("no"); });
  }, [isAdmin, address]);

  // Wallet switched away from the admin → drop the session immediately.
  useEffect(() => { if (isConnected && admin && !isAdmin) { saveAdminSession(null); setAuthed("no"); } }, [isConnected, isAdmin, admin]);
  useEffect(() => { try { localStorage.setItem("thook-admin-tab", tab); } catch { /* ignore */ } }, [tab]);

  const signIn = async () => {
    setErr(null);
    try {
      const message = sessionMessage();
      const signature = await signMessageAsync({ message });
      saveAdminSession({ message, signature });
      await adminCall("/api/admin/session");
      setAuthed("yes");
    } catch (e: any) {
      saveAdminSession(null);
      setErr(e?.shortMessage || e?.message || String(e));
    }
  };
  const signOut = () => { saveAdminSession(null); setAuthed("no"); disconnect(); };

  return (
    <>
      <header className="hdr scrolled">
        <div className="wrap hdr-in">
          <a href="/" className="brand" aria-label="Back to thook.vip">
            <span className="brand-mark"><LogoTile /></span>
            <span>THOOK <span className="muted" style={{ fontWeight: 500 }}>Admin</span></span>
          </a>
          {authed === "yes" && (
            <nav className="nav" aria-label="Admin">
              {(["launch", "vault", "keeper"] as Tab[]).map((t) => (
                <a key={t} href={`#${t}`} className={tab === t ? "active" : ""} onClick={(e) => { e.preventDefault(); setTab(t); }}>
                  {t === "launch" ? "Launch" : t === "vault" ? "Vault" : "Keeper"}
                  {tab === t && <span className="nav-dot" />}
                </a>
              ))}
            </nav>
          )}
          <div style={{ marginLeft: authed === "yes" ? 0 : "auto", display: "flex", gap: 8 }}>
            {authed === "yes" && <button className="wbtn" onClick={signOut}>Sign out</button>}
            <WalletButton />
          </div>
        </div>
      </header>

      <main id="main" className="page">
        <div className="wrap stats-col">
          {authed !== "yes" ? (
            <div className="gate">
              <div className="gate-card">
                <div className="gate-mark"><LogoTile /></div>
                <h1>Admin login</h1>
                {!isConnected && <><p>Connect the owner wallet to continue.</p><WalletButton size="lg" label="Connect wallet" /></>}
                {isConnected && cfg.isLoading && <span className="sk" style={{ width: 220, height: 18 }} />}
                {isConnected && cfg.isError && <div className="note note-danger">Can't reach api.thook.vip.</div>}
                {isConnected && cfg.data && !admin && <div className="note note-warning">ADMIN_WALLET isn't set on Railway.</div>}
                {isConnected && admin && !isAdmin && (
                  <>
                    <div className="note note-danger">{short(address)} is not the admin wallet.</div>
                    <button className="btn btn-sm" onClick={() => disconnect()}>Disconnect</button>
                  </>
                )}
                {isAdmin && authed === "checking" && <span className="sk" style={{ width: 220, height: 18 }} />}
                {isAdmin && authed === "no" && (
                  <>
                    <p>Sign a free message (no gas) to unlock the portal for 4 hours.</p>
                    <button className="wbtn wbtn-connect wbtn-lg" onClick={signIn} disabled={signing}>{signing ? "Check your wallet…" : "Sign in"}</button>
                  </>
                )}
                {err && <div className="note note-danger" style={{ marginTop: 12 }}>{err}</div>}
              </div>
            </div>
          ) : (
            <>
              {tab === "launch" && <LaunchPanel onChange={() => cfg.refetch()} />}
              {tab === "vault" && cfg.data && <VaultPanel cfg={cfg.data} />}
              {tab === "keeper" && <KeeperPanel />}
            </>
          )}
        </div>
      </main>
    </>
  );
}
