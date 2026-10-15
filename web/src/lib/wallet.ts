// WalletConnect (Reown AppKit) + wagmi on Robinhood Chain.
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

export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "";
if (!projectId) console.warn("VITE_REOWN_PROJECT_ID is not set — WalletConnect QR logins are disabled until it is.");

const siteUrl = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "https://thook.vip");

export const wagmiAdapter = new WagmiAdapter({ networks: [robinhood], projectId: projectId || "missing-project-id", ssr: false });

createAppKit({
  adapters: [wagmiAdapter],
  networks: [robinhood],
  defaultNetwork: robinhood,
  projectId: projectId || "missing-project-id",
  metadata: { name: "THOOK", description: "Tax Hook on Robinhood Chain", url: siteUrl, icons: [`${siteUrl}/logo.png`] },
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
  themeMode: "dark",
  themeVariables: { "--w3m-accent": "#c8f530", "--w3m-border-radius-master": "2px", "--w3m-font-family": "Geist, system-ui, sans-serif" },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
