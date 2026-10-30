/**
 * Vorankündigung eines Objekts (Christian, 30.10.2026).
 *
 * Drei Stufen statt zwei:
 *   - Entwurf: nur Admin, Inhaber und der eigene Objektpartner sehen es
 *     (`sichtbar = false`, wie bisher).
 *   - Vorankündigung: Vertriebspartner sehen Objektseite und
 *     Einheitenübersicht, Einheiten öffnen sich aber noch nicht. Nichts ist
 *     reservierbar, nichts wird Kunden empfohlen. Das Objekt kommt erst in
 *     den Vertrieb.
 *   - Sichtbar: im Vertrieb.
 *
 * Gespeichert als `sichtbar = true` plus `meta.vorankuendigung = true`, damit
 * alles, was heute nach `sichtbar` fragt, unverändert bleibt. Die Sperre ist
 * eine Vertriebsregel, keine Geheimhaltung: Die Einheitenübersicht samt
 * Preisen sehen die Partner ohnehin.
 */

export type ObjektSichtStufe = "sichtbar" | "vorankuendigung" | "entwurf";

interface MitSicht {
  sichtbar?: boolean;
  meta?: Record<string, unknown> | null;
}

/** Wer Einheiten auch in der Vorankündigung öffnet, um das Objekt vorzubereiten. */
export const VORANKUENDIGUNG_VOLLZUGRIFF: readonly string[] = ["admin", "inhaber", "objektpartner", "backoffice", "vertriebsleiter"];

export function istVorankuendigung(o: MitSicht | null | undefined): boolean {
  return !!o?.sichtbar && o.meta?.vorankuendigung === true;
}

export function objektSichtStufe(o: MitSicht | null | undefined): ObjektSichtStufe {
  if (!o?.sichtbar) return "entwurf";
  return istVorankuendigung(o) ? "vorankuendigung" : "sichtbar";
}

/** Darf diese Rolle die Einheiten des Objekts öffnen? Nur in der Vorankündigung eingeschränkt. */
export function einheitenGesperrt(o: MitSicht | null | undefined, rolle: string | null | undefined): boolean {
  return istVorankuendigung(o) && !VORANKUENDIGUNG_VOLLZUGRIFF.includes(String(rolle ?? ""));
}

export const SICHT_STUFEN: ReadonlyArray<{ stufe: ObjektSichtStufe; text: string; farbe: string; erklaerung: string }> = [
  { stufe: "sichtbar", text: "Sichtbar", farbe: "hsl(142 76% 42%)", erklaerung: "Im Vertrieb: Vertriebspartner sehen alles und reservieren." },
  { stufe: "vorankuendigung", text: "Vorankündigung", farbe: "hsl(270 70% 58%)", erklaerung: "Vertriebspartner sehen Objekt und Einheitenübersicht, Einheiten öffnen sich noch nicht." },
  { stufe: "entwurf", text: "Entwurf", farbe: "hsl(30 95% 55%)", erklaerung: "Nur Admin, Inhaber und der eigene Objektpartner sehen es." },
];

export const VORANKUENDIGUNG_HINWEIS = "Vorankündigung: Dieses Objekt kommt bald in den Vertrieb. Die Einheiten lassen sich ab dem Vertriebsstart öffnen und reservieren.";
