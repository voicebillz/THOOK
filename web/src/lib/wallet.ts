// Wallet login = official WalletConnect (AppKit by Reown, the WalletConnect team)
// + wagmi on Robinhood Chain. The modal is themed to match thook.vip.
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";

export const RPC = "https://rpc.mainnet.chain.robinhood.com";

export const robinhood = defineChain({
  id: 4663,
  caipNetworkId: "eip155:4663",
  chainNamespace: "eip155",
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// WalletConnect project id (dashboard.reown.com — WalletConnect's official dashboard).
export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || import.meta.env.VITE_REOWN_PROJECT_ID || "";
if (!projectId) console.warn("VITE_WALLETCONNECT_PROJECT_ID is not set — WalletConnect QR / mobile logins are disabled.");

const siteUrl = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "https://thook.vip");

export const wagmiAdapter = new WagmiAdapter({ networks: [robinhood], projectId: projectId || "missing-project-id", ssr: false });

// Featured wallets (WalletConnect explorer ids): MetaMask, Coinbase, Rabby, Trust, Rainbow.
const FEATURED = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
  "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
  "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1",
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
];

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [robinhood],
  defaultNetwork: robinhood,
  projectId: projectId || "missing-project-id",
  metadata: { name: "THOOK", description: "Tax Hook — 4% ETH tax, weekly top-loser airdrop", url: siteUrl, icons: [`${siteUrl}/logo.png`] },
  featuredWalletIds: FEATURED,
  allWallets: "SHOW",
  enableWalletConnect: true,
  enableInjected: true,
  enableCoinbase: true,
  enableWalletGuide: false,
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, history: false },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#5ca856",
    "--w3m-color-mix": "#0b0b0b",
    "--w3m-color-mix-strength": 40,
    "--w3m-font-family": "Geist, system-ui, -apple-system, sans-serif",
    "--w3m-border-radius-master": "3px",
    "--w3m-z-index": 1000,
    "--w3m-qr-color": "#0b0b0b",
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
