export function buyUrl(token?: string | null) {
  const custom = import.meta.env.VITE_BUY_URL as string | undefined;
  if (custom) return custom.replace("{token}", token || "");
  return token ? `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=NATIVE&outputCurrency=${token}` : "https://app.uniswap.org/swap";
}
export const gecko = (t: string) => `https://www.geckoterminal.com/robinhood/tokens/${t}`;
export const dexscreener = (t: string) => `https://dexscreener.com/robinhood/${t}`;

export const X_URL = "https://x.com/usetaxtech";
