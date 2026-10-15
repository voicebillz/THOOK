// Keeps <title>, description, canonical and social tags in sync on client-side
// navigation (the static per-route HTML from scripts/seo.mjs covers first load).
import seo from "../../seo.json";

type Meta = { title: string; description: string; og: string };
const routes = seo.routes as Record<string, Meta>;

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.content = value;
}

export function applySeo(pathname: string) {
  const m = routes[pathname] ?? routes["/"];
  const url = `${seo.site}${pathname === "/" || !routes[pathname] ? "/" : pathname}`;
  document.title = routes[pathname] ? m.title : `Page not found | $THOOK`;
  setMeta("name", "description", m.description);
  setMeta("property", "og:title", m.title);
  setMeta("property", "og:description", m.description);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", `${seo.site}${m.og}`);
  setMeta("name", "twitter:title", m.title);
  setMeta("name", "twitter:description", m.description);
  setMeta("name", "twitter:image", `${seo.site}${m.og}`);
  setMeta("name", "robots", routes[pathname] ? "index, follow, max-image-preview:large" : "noindex");
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
  link.href = url;
}
