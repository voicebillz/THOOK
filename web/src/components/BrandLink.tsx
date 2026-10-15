// Outbound link button with the service's real logo.
const LOGOS = {
  uniswap: "uniswap.png",
  x: "x.svg",
  dexscreener: "dexscreener.png",
  geckoterminal: "geckoterminal.jpg",
  explorer: "blockscout.png",
} as const;

export function BrandLink({ brand, href, children, primary = false }: { brand: keyof typeof LOGOS; href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <a className={`btn blink${primary ? " btn-lime" : ""}`} href={href} target="_blank" rel="noreferrer">
      <img src={`/logos/${LOGOS[brand]}`} alt="" width={18} height={18} className={brand === "x" ? "blink-x" : undefined} />
      {children}
    </a>
  );
}
