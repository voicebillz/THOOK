import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { motion } from "motion/react";
import { LogoTile } from "./Logo";
import { WalletButton } from "./WalletButton";
import { useConnection } from "wagmi";
import { useConfig } from "../lib/api";
import { X_URL } from "../lib/links";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/stats", label: "Stats" },
  { to: "/thook", label: "$THOOK" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  // Admin shortcut: only when the connected wallet is ADMIN_WALLET (from Railway).
  const { address } = useConnection();
  const cfg = useConfig();
  const isAdmin = !!address && !!cfg.data?.admin && address.toLowerCase() === cfg.data.admin.toLowerCase();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`hdr${scrolled ? " scrolled" : ""}`}>
      <div className="wrap hdr-in">
        <Link to="/" className="brand" aria-label="THOOK home">
          <span className="brand-mark"><LogoTile /></span>
          <span>THOOK</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && <motion.span layoutId="nav-dot" className="nav-dot" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <a className="xlink" href={X_URL} target="_blank" rel="noreferrer" aria-label="THOOK on X"><img src="/logos/x.svg" alt="" width="15" height="15" /></a>
        {isAdmin && <a className="wbtn admin-link" href="/admin">Admin</a>}
        <WalletButton />
      </div>
    </header>
  );
}
