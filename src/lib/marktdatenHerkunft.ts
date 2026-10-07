/**
 * Woher stammt eine Zahl in der Marktanalyse?
 *
 * Die Seite zeigt für 351 Standorte je rund vierzig Kennzahlen an, und zwar
 * alle im selben Schriftschnitt, als wären sie gleichermassen erhoben. Das
 * sind sie nicht:
 *
 *   - 30 Standorte sind von Hand recherchierte Referenzwerte aus öffentlichen
 *     Quellen. Das steht so im Kopf von `marktanalyseSeed.ts`.
 *   - 321 Standorte sind rechnerisch erzeugt, aus Bundesland-Mittelwerten mit
 *     einer festen Streuung. Der Dateikopf von `marktanalyseSeedExtra.ts`
 *     sagt es selbst.
 *   - Sämtliche Kennzahlen aus `marktanalyseErweitert.ts` (Bodenrichtwert,
 *     Gewerbesteuerhebesatz, Breitbandausbau, Ladesäulen, Pendlersaldo,
 *     Neubauquote, Eigentumsquote, Zahl der Kitas und Ärzte ...) entstehen aus
 *     einem Zahlenwert, der aus dem Gemeindeschlüssel errechnet wird. Sie sind
 *     plausibel, aber niemand hat sie gemessen.
 *   - Nur ein kleiner Teil kommt tatsächlich aus einer Erhebung: was die
 *     Sync-Aufträge in `standort_kennzahlen` schreiben, mit Quelle und Stand.
 *
 * Ein Vertriebspartner, der einem Kunden einen Bodenrichtwert vorliest, muss
 * wissen, ob der aus dem Gutachterausschuss stammt oder aus einer Formel. Diese
 * Datei liefert dafür die Einstufung, die Beschriftung und den Erklärtext.
 */

import { STANDORTE_TOP } from "@/data/marktanalyseSeed";

export type Herkunft = "gemessen" | "kuratiert" | "modelliert";

export const HERKUNFT_LABEL: Record<Herkunft, string> = {
  gemessen: "Erhoben",
  kuratiert: "Kuratiert",
  modelliert: "Modelliert",
};

export const HERKUNFT_ERKLAERUNG: Record<Herkunft, string> = {
  gemessen:
    "Aus einer amtlichen Quelle übernommen. Quelle und Stand stehen an der Zahl.",
  kuratiert:
    "Von Hand recherchierter Referenzwert aus öffentlichen Quellen, gerundet. Für die Marktorientierung gedacht, nicht als Gutachten.",
  modelliert:
    "Rechnerisch aus Vergleichswerten abgeleitet, nicht für diesen Ort erhoben. Als Grössenordnung brauchbar, für eine Zusage nicht.",
};

/** Kurzfassung für enge Stellen wie eine Kachel. */
export const HERKUNFT_KURZ: Record<Herkunft, string> = {
  gemessen: "aus amtlicher Quelle",
  kuratiert: "recherchierter Referenzwert",
  modelliert: "rechnerisch abgeleitet",
};

const KURATIERTE_IDS = new Set(STANDORTE_TOP.map((s) => s.id));

/**
 * Grundeinstufung eines Standorts.
 *
 * Sie gilt für die Basisdaten des Seeds. Einzelne Kennzahlen können besser
 * dastehen, sobald ein Sync-Auftrag einen echten Wert geliefert hat; dafür
 * gibt es `kennzahlHerkunft`.
 */
export function standortHerkunft(standortId: string): Herkunft {
  return KURATIERTE_IDS.has(standortId) ? "kuratiert" : "modelliert";
}

/** Anzahl der von Hand gepflegten Standorte, für Hinweistexte. */
export const ANZAHL_KURATIERT = KURATIERTE_IDS.size;

/**
 * Belege zu einer einzelnen Kennzahl, so wie sie in `standort_kennzahlen`
 * stehen. Fehlt der Eintrag, ist die Zahl nicht erhoben.
 */
export interface KennzahlBeleg {
  wert: number;
  /** Quelle-Id aus `marktanalyse_quellen`, etwa "destatis" oder "boris". */
  quelleId: string;
  /** Stichtag der Erhebung, ISO-Datum. */
  stand: string | null;
  einheit?: string | null;
  /**
   * Zusatzangaben des Sync-Auftrags. `methode: "kaufpreis_x_0.35"` bedeutet
   * etwa, dass der Bodenrichtwert nicht beim Gutachterausschuss abgefragt,
   * sondern geschätzt wurde.
   */
  meta?: Record<string, unknown> | null;
}

/**
 * Quellen, die selbst nur schätzen. Was von hier kommt, ist trotz
 * Datenbankeintrag nicht erhoben.
 */
const SCHAETZENDE_QUELLEN = new Set(["bbsr_heuristik", "ai", "schaetzung"]);

export function kennzahlHerkunft(beleg?: KennzahlBeleg | null): Herkunft | null {
  if (!beleg) return null;
  if (SCHAETZENDE_QUELLEN.has(beleg.quelleId)) return "modelliert";
  if (beleg.meta && typeof beleg.meta === "object" && "methode" in beleg.meta) {
    const m = String((beleg.meta as any).methode || "");
    if (m && m !== "wfs" && m !== "api") return "modelliert";
  }
  return "gemessen";
}

/** "Erhoben · BORIS · 06/2026" für die Zeile unter einer Zahl. */
export function belegText(beleg?: KennzahlBeleg | null, fallback: Herkunft = "modelliert"): string {
  const herkunft = kennzahlHerkunft(beleg) ?? fallback;
  if (!beleg) return HERKUNFT_LABEL[herkunft];
  const teile = [HERKUNFT_LABEL[herkunft], beleg.quelleId.toUpperCase()];
  if (beleg.stand) {
    const d = new Date(beleg.stand);
    if (!isNaN(d.getTime())) {
      teile.push(`${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
    }
  }
  return teile.join(" · ");
}
