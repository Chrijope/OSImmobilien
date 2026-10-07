/**
 * Das frische Handbuch-Ergebnis für die Dauer der Sitzung.
 *
 * Direkt nach dem Konfigurator öffnet `/handbuch/ergebnis/neu`, die Antworten
 * und Tokens kommen nur im Zustand der Navigation mit (kein Token in der
 * Adresse, Begründung in HandbuchLanding: Meta Pixel). Dieser Zustand geht
 * beim Neuladen verloren, und die Seite zeigte dann „ungültiger Link“.
 * Deshalb merkt sich die Ergebnisseite das Ergebnis hier, nur in diesem Tab
 * (`sessionStorage`) und nur, was sie zum Anzeigen braucht: Antworten,
 * Vorname und Nachname für die Anrede im Handbuch, die beiden Tokens und das
 * Partnerkürzel. Keine E-Mail, keine Telefonnummer.
 *
 * Speicher gesperrt oder voll (privates Fenster, Einstellungen): Dann bleibt
 * es beim bisherigen Verhalten, nichts bricht.
 */
import { pruefeAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { HandbuchErgebnisZustand } from "@/pages/HandbuchLanding";

export const ERGEBNIS_SITZUNG_SCHLUESSEL = "hb_ergebnis_frisch";

const text = (w: unknown): string => (typeof w === "string" ? w : "");
const textOderNull = (w: unknown): string | null => (typeof w === "string" && w ? w : null);

export function merkeFrischesErgebnis(z: HandbuchErgebnisZustand): void {
  const gemerkt: HandbuchErgebnisZustand = {
    antworten: z.antworten,
    vorname: z.vorname,
    nachname: z.nachname,
    handbuchToken: z.handbuchToken,
    saToken: z.saToken,
    beraterSlug: z.beraterSlug,
  };
  try {
    sessionStorage.setItem(ERGEBNIS_SITZUNG_SCHLUESSEL, JSON.stringify(gemerkt));
  } catch {
    // Kein Speicher: Neuladen zeigt dann wie bisher den Hinweis.
  }
}

export function leseFrischesErgebnis(): HandbuchErgebnisZustand | null {
  try {
    const roh = sessionStorage.getItem(ERGEBNIS_SITZUNG_SCHLUESSEL);
    if (!roh) return null;
    const o = JSON.parse(roh) as Record<string, unknown>;
    const antworten = pruefeAntworten(o?.antworten);
    if (!antworten) return null;
    return {
      antworten,
      vorname: text(o.vorname),
      nachname: text(o.nachname),
      handbuchToken: textOderNull(o.handbuchToken),
      saToken: textOderNull(o.saToken),
      beraterSlug: textOderNull(o.beraterSlug),
    };
  } catch {
    return null;
  }
}
