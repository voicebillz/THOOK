import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wallet";
import AdminApp from "./AdminApp";
import "../styles.css";

// Never run inside a frame (clickjacking guard on top of the CSP header).
if (window.top !== window.self) {
  document.body.innerHTML = "";
  throw new Error("framed");
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <AdminApp />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
