/**
 * Zweisprachige Rechtstexte mit deutschem Vorrang.
 *
 * Entschieden am 25.09.2026 (Plan Kundensprache, Entscheidung 6): Ein
 * englischer Kunde bekommt Reservierung, Widerrufsbelehrung,
 * Datenschutz-Einwilligung und die Erklärungen der Selbstauskunft nicht als
 * getrennte Übersetzung, sondern zweisprachig in einem Dokument. Der deutsche
 * Wortlaut ist maßgeblich, und das steht in beiden Sprachen dabei. Christian
 * hat erklärt, dass die Rechtstexte vom Anwalt freigegeben sind.
 *
 * Warum nicht nur eine Übersetzung „for convenience only“: Der Kunde ist
 * Verbraucher. Eine Vorrangklausel, die nur im deutschen Text steht, kann er
 * nicht lesen und damit als überraschend angreifen (§§ 305c, 307 BGB).
 * Zweisprachig sieht er den verbindlichen Text und seine Übersetzung auf
 * demselben Blatt.
 *
 * Auf dem Bildschirm führt Englisch, der deutsche Wortlaut ist aufklappbar.
 * Im PDF stehen beide Fassungen untereinander, Deutsch zuerst. Zahlen und
 * Daten bleiben in zweisprachigen Rechtsdokumenten im deutschen Format
 * (Entscheidung 9).
 */
import type { Sprache } from "./kundenSprache";

/** Die Vorrangklausel, im Wortlaut der Freigabe vom 25.09.2026. */
export const VORRANGKLAUSEL: Record<Sprache, string> = {
  de: "Im Falle von Abweichungen ist die deutsche Fassung maßgeblich.",
  en: "In case of discrepancies, the German version shall prevail.",
};

/**
 * Der Satz, der ein zweisprachiges Dokument einleitet: Es ist in beiden
 * Sprachen abgefasst, und Deutsch geht vor.
 */
export const ZWEISPRACHIG_EINLEITUNG: Record<Sprache, string> = {
  de: `Dieses Dokument ist in deutscher und englischer Sprache abgefasst. ${VORRANGKLAUSEL.de}`,
  en: `This document has been drawn up in German and English. ${VORRANGKLAUSEL.en}`,
};

/** Der Knopf auf dem Bildschirm, der den deutschen Wortlaut aufklappt. */
export const DEUTSCHES_ORIGINAL_ZEIGEN = "Show German original (legally binding)";

/**
 * Eine Beschriftung in beiden Sprachen, etwa „Familienstand / Marital status“.
 *
 * Für PDFs, die an Bank oder Notar gehen: Die lesen Deutsch, der Kunde liest
 * Englisch. Ohne englische Fassung, oder wenn beide gleich lauten (IBAN,
 * E-Mail), bleibt es beim deutschen Wort.
 */
export function zweisprachigeBeschriftung(de: string, en: string | null | undefined): string {
  const e = (en ?? "").trim();
  if (!e || e.toLowerCase() === de.trim().toLowerCase()) return de;
  return `${de} / ${e}`;
}

/**
 * Wählt die Beschriftung für ein Dokument in dieser Sprache: Deutsch allein,
 * oder zweisprachig für englische Kunden.
 */
export function beschriftung(sprache: Sprache, de: string, en: string | null | undefined): string {
  return sprache === "en" ? zweisprachigeBeschriftung(de, en) : de;
}
