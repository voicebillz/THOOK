import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAppKit } from "@reown/appkit/react";
import { useConnection } from "wagmi";
import { LogoTile } from "./Logo";
import { short } from "../lib/format";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/stats", label: "Stats" },
  { to: "/thook", label: "$THOOK" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { open } = useAppKit();
  const { address, isConnected } = useConnection();
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
        <button className={`btn btn-sm ${isConnected ? "" : "btn-lime"}`} onClick={() => open()}>
          {isConnected ? short(address) : "Connect"}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <span>$THOOK · Tax Hook · Robinhood Chain</span>
        <span className="mono">4% ETH tax → weekly top-loser airdrop</span>
      </div>
    </footer>
  );
}
