// Post-build SEO: one static HTML per route with its own title, description,
// canonical, Open Graph / X card and JSON-LD (crawlers and link-preview bots
// don't run JS), plus robots.txt, sitemap.xml and the web manifest.
//   runs automatically after `vite build` (see package.json "build")
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist");
const seo = JSON.parse(fs.readFileSync(path.join(root, "seo.json"), "utf8"));
const SITE = seo.site;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const today = new Date().toISOString().slice(0, 10);
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const ldBase = [
  { "@context": "https://schema.org", "@type": "WebSite", name: "$THOOK", alternateName: "Tax Hook", url: `${SITE}/` },
  { "@context": "https://schema.org", "@type": "Organization", name: "$THOOK (Tax Hook)", url: `${SITE}/`, logo: `${SITE}/icon-512.png`, sameAs: ["https://x.com/usetaxtech"] },
];

for (const [route, m] of Object.entries(seo.routes)) {
  const url = `${SITE}${route === "/" ? "/" : route}`;
  const img = `${SITE}${m.og}`;
  const ld = [...ldBase];
  if (route === "/docs") {
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: seo.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
  }
  if (route !== "/") {
    ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: m.title.split(" — ")[0].split(" | ")[0], item: url },
    ] });
  }
  const head = `
    <title>${esc(m.title)}</title>
    <meta name="description" content="${esc(m.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="$THOOK" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(m.title)}" />
    <meta property="og:description" content="${esc(m.description)}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(m.title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${seo.twitter}" />
    <meta name="twitter:title" content="${esc(m.title)}" />
    <meta name="twitter:description" content="${esc(m.description)}" />
    <meta name="twitter:image" content="${img}" />
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
    `;
  const noscript = `<noscript><main style="font-family:system-ui;color:#eee;padding:24px"><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p><p><a href="/">Home</a> · <a href="/stats">Statistics</a> · <a href="/thook">$THOOK</a> · <a href="/docs">Docs</a> · <a href="https://x.com/usetaxtech">X</a></p></main></noscript>`;
  const html = template
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, head)
    .replace('<div id="root"></div>', `<div id="root"></div>${noscript}`);
  fs.writeFileSync(path.join(dist, m.file), html);
}

fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(seo.routes).map((r) => `  <url><loc>${SITE}${r === "/" ? "/" : r}</loc><lastmod>${today}</lastmod><changefreq>${r === "/stats" ? "hourly" : "weekly"}</changefreq><priority>${r === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(dist, "site.webmanifest"), JSON.stringify({
  name: "$THOOK — Tax Hook", short_name: "$THOOK", start_url: "/", display: "standalone",
  background_color: "#0b0b0b", theme_color: "#1a0f09",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
}, null, 2));
console.log("seo: wrote", Object.values(seo.routes).map((m) => m.file).join(", "), "+ robots.txt, sitemap.xml, site.webmanifest");
