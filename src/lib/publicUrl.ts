/**
 * Liefert die öffentliche Basis-URL für teilbare Links.
 * Wichtig: Vorschau, Link kopieren und Dashboard müssen immer denselben Host nutzen.
 * Teilbare Tippgeber-/VP-Links nutzen IMMER die Produktiv-Domain, damit Vorschau-/
 * Preview-Hosts nicht versehentlich an Endkunden rausgehen.
 */
const PRIMARY_DOMAIN = "https://osimmobilien.netlify.app";

export function getPublicBaseUrl(): string {
  if (typeof window === "undefined") return PRIMARY_DOMAIN;
  return window.location.origin.replace(/\/$/, "");
}

export function buildVpUrl(slug: string): string {
  // Bewusst PRIMARY_DOMAIN: VP-Landingpage-Links müssen auch aus dem
  // Preview heraus immer auf die Live-Domain zeigen.
  return `${PRIMARY_DOMAIN}/vp/${slug}`;
}

/**
 * Der öffentliche Link der Handbuch-Seite. Mit Kürzel die Seite eines
 * Partners, ohne Kürzel die des Hauses (für Werbung). Wie bei den
 * Partnerseiten immer die Live-Adresse, damit aus der Vorschau heraus kein
 * Vorschau-Host an Interessenten geht.
 */
export function buildHandbuchUrl(slug?: string | null): string {
  const kuerzel = (slug || "").trim();
  return `${PRIMARY_DOMAIN}/handbuch${kuerzel ? `/${encodeURIComponent(kuerzel)}` : ""}`;
}

/**
 * Derselbe Pfad auf der Adresse, auf der man gerade ist. Für den Knopf
 * „Vorschau“ der Handbuch-Seite: In der Lovable-Vorschau zeigt er den Stand,
 * den man gerade prüft, und nicht den veröffentlichten, auf dem es die Seite
 * vor dem Publish noch gar nicht gibt.
 */
export function handbuchVorschauUrl(slug?: string | null): string {
  const kuerzel = (slug || "").trim();
  return `${getPublicBaseUrl()}/handbuch${kuerzel ? `/${encodeURIComponent(kuerzel)}` : ""}`;
}
