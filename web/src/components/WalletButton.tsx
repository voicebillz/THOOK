import { useAppKit } from "@reown/appkit/react";
import { useBalance, useConnection, useSwitchChain } from "wagmi";
import { AnimatePresence, motion } from "motion/react";
import { formatEther } from "viem";
import { robinhood } from "../lib/wallet";
import { short } from "../lib/format";

const ava = (a: string) => {
  const h = parseInt(a.slice(2, 8), 16) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 70) % 360} 70% 45%))`;
};

/** Header wallet control: Connect → (wrong network) Switch → account pill. */
export function WalletButton({ size = "sm", label = "Connect" }: { size?: "sm" | "lg"; label?: string }) {
  const { open } = useAppKit();
  const { address, isConnected, isConnecting, isReconnecting, chainId } = useConnection();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const bal = useBalance({ address, chainId: robinhood.id, query: { enabled: !!address } });
  const wrong = isConnected && chainId !== robinhood.id;
  const busy = isConnecting || isReconnecting;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!isConnected ? (
        <motion.button key="c" className={`wbtn wbtn-connect ${size === "lg" ? "wbtn-lg" : ""}`} onClick={() => open({ view: "Connect" })} disabled={busy}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          <WcIcon /><span className="wtxt">{busy ? "Connecting…" : label}</span>
        </motion.button>
      ) : wrong ? (
        <motion.button key="w" className="wbtn wbtn-warn" onClick={() => switchChain({ chainId: robinhood.id })} disabled={switching}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          <span className="wdot warn" />{switching ? "Switching…" : "Switch to Robinhood"}
        </motion.button>
      ) : (
        <motion.button key="a" className="wbtn wbtn-acct" onClick={() => open({ view: "Account" })} aria-label={`Wallet ${address}`}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {bal.data && <span className="wbal">{Number(formatEther(bal.data.value)).toFixed(4)} ETH</span>}
          <span className="wava" style={{ background: ava(address!) }} />
          <span className="waddr">{short(address)}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function WcIcon() {
  // WalletConnect mark
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
      <path fill="currentColor" d="M6.1 8.6c3.3-3.2 8.5-3.2 11.8 0l.4.4c.2.2.2.4 0 .6l-1.3 1.3c-.1.1-.2.1-.3 0l-.5-.5c-2.3-2.2-6-2.2-8.3 0l-.6.5c-.1.1-.2.1-.3 0L5.7 9.6c-.2-.2-.2-.4 0-.6l.4-.4Zm14.5 2.7 1.2 1.1c.2.2.2.4 0 .6l-5.3 5.2c-.2.2-.4.2-.6 0l-3.8-3.7c0-.1-.1-.1-.2 0l-3.7 3.7c-.2.2-.4.2-.6 0L2.2 13c-.2-.2-.2-.4 0-.6l1.2-1.1c.2-.2.4-.2.6 0l3.7 3.7c.1.1.2.1.2 0l3.7-3.7c.2-.2.4-.2.6 0l3.8 3.7c.1.1.2.1.2 0l3.7-3.7c.2-.2.5-.2.7 0Z" />
    </svg>
  );
}
