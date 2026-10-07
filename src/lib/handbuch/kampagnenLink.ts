/**
 * Ein Werbelink der Handbuch-Seite mit Kampagnenkennung (UTM).
 *
 * Die Seite liest die Kennung beim Aufruf selbst aus der Adresse
 * (`kampagnenKennung.ts`, Cookie-Baustein vom 26.09.2026) und gibt sie beim
 * Absenden an den Kontakt weiter.
 */
/** Hängt die Kampagnenkennung an einen Link. Nur Buchstaben, Ziffern, Bindestrich und Unterstrich im Namen. */
export function mitKampagne(url: string, quelle: string, medium: string, kampagne: string): string {
  const name = kampagne.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  const p = new URLSearchParams({ utm_source: quelle, utm_medium: medium });
  if (name) p.set("utm_campaign", name);
  return `${url}?${p.toString()}`;
}
