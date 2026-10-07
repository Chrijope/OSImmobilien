import { PIPELINE_STUFEN, type BewerberStatus } from "./bewerbungStore";

/**
 * Welche Spalte der Bewerberliste in welcher Stufe etwas beiträgt.
 *
 * ## Warum es diese Datei gibt
 *
 * Bis zum 10.09.2026 hatte die Liste **eine feste Spaltenfolge für jede
 * Stufe**, dreizehn Spalten breit. Im Eingang standen damit der Zahlstand
 * einer Rechnung, ein Persönlichkeitstyp, eine Sternebewertung und ein
 * Gesprächstermin, den es dort noch gar nicht geben kann. Vier Spalten
 * Rauschen vor der einen Frage, die im Eingang zählt: Wen rufe ich als
 * Nächstes an?
 *
 * Die Zuordnung folgt dem, was in der Stufe tatsächlich getan wird. Sie steht
 * hier und nicht in der Seite, damit ein Test sie lesen kann: Kopfzeile und
 * Zellen sind zwei getrennte Stellen im JSX, und wenn eine von beiden eine
 * Spalte anders behandelt, verrutscht jede Zeile der Tabelle um ein Feld.
 */

/** Die Spalten der Bewerberliste, in der Reihenfolge der Anzeige. */
export const BEWERBER_SPALTEN = [
  "Erstellt",
  "Name",
  "Kontakt",
  "Telefon",
  "Quelle",
  "Anrufe",
  "Vorab-Score",
  "WhatsApp",
  "Termin",
  "Stelle",
  "Rechnung",
  "Unterschrieben",
  "Bewertung",
  "Typ",
] as const;

export type BewerberSpalte = (typeof BEWERBER_SPALTEN)[number];

/**
 * Stufen, in denen jemand aktiv hinterhertelefoniert.
 *
 * Dort sagen Quelle, Zahl der Kontaktversuche und der WhatsApp-Stand etwas
 * über den nächsten Schritt. Steht der Vertrag, ist das erledigte Vergangenheit.
 */
const ANSPRACHE: readonly string[] = ["Eingang", "Erstgespraech", "Closing", "FollowUp", "Bedenkzeit"];

/**
 * Stufen, in denen ein Termin das Arbeitsobjekt ist.
 *
 * Im Eingang gibt es keinen, ab der Paketwahl ist er gelaufen. Beides würde
 * nur einen Gedankenstrich anzeigen oder eine alte Zeile, die niemand mehr
 * braucht.
 */
const MIT_TERMIN: readonly string[] = ["Erstgespraech", "Closing", "FollowUp", "Bedenkzeit"];

/** Erst ab der Rechnungsstellung sagt der Zahlstand etwas. */
const MIT_RECHNUNG: readonly string[] = ["Rechnung", "Nutzer_anlegen", "Aktiv"];

/**
 * In der Stufe Vertrag zaehlt ein Datum, keine Sterne.
 *
 * Wer hier steht, ist laengst beurteilt; die Sternebewertung sagt nichts mehr
 * ueber den naechsten Schritt. Die eine Frage lautet: Hat er schon
 * unterschrieben, und wenn ja, wann? Deshalb tritt die Spalte
 * "Unterschrieben" in dieser Stufe an die Stelle der Bewertung.
 *
 * Seit dem 19.09.2026 stehen in dieser Stufe beide Zustaende nebeneinander:
 * Bewerber hat unterschrieben und wartet auf die Gegenzeichnung, und Vertrag
 * beidseitig unterschrieben, aber ohne Lead-Paket und damit ohne Rechnung.
 * Die Spalte muss deshalb beides unterscheiden koennen.
 */
const MIT_UNTERSCHRIFT: readonly string[] = ["Vertrag"];

/**
 * Trägt diese Spalte in dieser Stufe etwas bei?
 *
 * `stufe` kommt als Zeichenkette herein und nicht als `BewerberStatus`, weil
 * die Liste auch abgeleitete Abschnitte kennt. Ein unbekannter Wert zeigt
 * bewusst die volle Fassung: lieber eine Spalte zu viel als eine fehlende
 * Angabe.
 */
export function bewerberSpalteSichtbar(spalte: BewerberSpalte | string, stufe: BewerberStatus | string): boolean {
  // Ein Abschnitt, den die Pipeline nicht kennt, bekommt die volle Fassung.
  // Eine Spalte zu viel ist harmlos, eine fehlende Angabe nicht.
  if (!(PIPELINE_STUFEN as readonly string[]).includes(stufe)) return true;
  switch (spalte) {
    case "Quelle":
    case "Anrufe":
    case "WhatsApp":
      return ANSPRACHE.includes(stufe);
    case "Termin":
      return MIT_TERMIN.includes(stufe);
    case "Unterschrieben":
      return MIT_UNTERSCHRIFT.includes(stufe);
    case "Bewertung":
      // Vor dem ersten Gespräch gibt es nichts zu beurteilen, und in der Stufe
      // Vertrag steht an ihrer Stelle das Unterschriftsdatum.
      return stufe !== "Eingang" && !MIT_UNTERSCHRIFT.includes(stufe);
    case "Typ":
      // Vor dem ersten Gespräch gibt es nichts zu beurteilen.
      return stufe !== "Eingang";
    case "Rechnung":
      return MIT_RECHNUNG.includes(stufe);
    default:
      // Erstellt, Name, Kontakt, Telefon, Vorab-Score und Stelle stehen
      // überall: Sie beantworten "wer ist das" und "worauf hat er sich
      // beworben", und das gilt in jeder Stufe.
      return true;
  }
}

/** Die sichtbaren Spalten einer Stufe, in der Reihenfolge der Anzeige. */
export function bewerberSpaltenFuer(stufe: BewerberStatus | string): BewerberSpalte[] {
  return BEWERBER_SPALTEN.filter((s) => bewerberSpalteSichtbar(s, stufe));
}
