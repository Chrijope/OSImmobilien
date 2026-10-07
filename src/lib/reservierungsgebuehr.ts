/**
 * Die Reservierungsgebühr, eingeführt am 14.09.2026.
 *
 * Gestaffelt nach Kaufpreis, zahlbar innerhalb von sieben Tagen nach
 * Unterzeichnung. Am Tag der notariellen Beurkundung fließt sie vollständig
 * zurück; einbehalten wird sie nur, wenn der Käufer selbst vor dem Notartermin
 * abspringt. Scheitert der Kauf aus Gründen, die nicht bei ihm liegen, bekommt
 * er sie ebenfalls vollständig zurück.
 *
 * **Die Rückzahlungsregel gehört zu jeder Nennung des Betrags.** Das ist keine
 * Formulierungsvorliebe: Der Bundesgerichtshof hat mit Urteil vom 20.04.2023
 * (I ZR 113/22) eine Reservierungsgebühr für unwirksam erklärt, und der erste
 * Grund dafür war, dass die Rückzahlung dort ausnahmslos ausgeschlossen war.
 * Wer nur die Zahl nennt, beschreibt etwas anderes als das, was in unserer
 * Vereinbarung steht. Dieselbe Regel steht im Schulungsmaterial, siehe
 * `reservierungsgebuehr.test.ts` im selben Ordner.
 *
 * Offen und ausdrücklich nicht hier entschieden: die Formfrage aus demselben
 * Urteilsabsatz, also die Beurkundungspflicht nach § 311b Absatz 1 BGB bei
 * mittelbarem Kaufzwang. Das ist eine anwaltliche Frage.
 */

/** Ab diesem Kaufpreis gilt der höhere Betrag. Die Grenze zählt zur oberen Stufe. */
export const GEBUEHR_GRENZE = 300000;

/** Kaufpreis unter der Grenze. */
export const GEBUEHR_KLEIN = 1000;

/** Kaufpreis ab der Grenze. */
export const GEBUEHR_GROSS = 1500;

/**
 * Die Reservierungsgebühr für ein Globalobjekt, also ein ganzes Haus.
 *
 * Ein fester Betrag ohne Staffel, Christians Entscheidung vom 23.09.2026
 * (Variante A des Entwurfs `Reservierung_Globalobjekt_Entwurf_2026-09-23.md`).
 * Das rechtliche Risiko hängt am Betrag, nicht am Kaufpreis, und ein fester
 * Betrag lässt keine Auslegungsfrage offen. Die Staffel darunter gilt beim
 * Globalobjekt ausdrücklich nicht; stünde sie im Dokument, gälte für ein Haus
 * über 300.000 EUR dem Wortlaut nach 1.500 EUR (§ 305c Abs. 2 BGB).
 *
 * Offen bleibt die Formfrage nach § 311b Abs. 1 BGB, beim Haus mit höherem
 * Betrag erst recht (Frage 1 an den Anwalt).
 */
export const GEBUEHR_GESAMTOBJEKT = 3000;

/** Die eine Zeile, die beim Globalobjekt an die Stelle der Staffel tritt. */
export const GEBUEHR_GESAMTOBJEKT_LABEL = "Reservierungsgebühr für ein Gesamtobjekt";

/** Wie lange nach Unterzeichnung gezahlt werden muss. */
export const GEBUEHR_FRIST_TAGE = 7;

/** Die Bankverbindung, auf die die Gebühr geht. */
export const GEBUEHR_KONTOINHABER = "MOREImmo";
export const GEBUEHR_IBAN = "DE89 2022 0800 0059 3599 49";
/*
 * BIC und Bankname sind seit dem Rechtsentwurf vom 15.09.2026 vorgesehen,
 * standen aber nirgends im System. Sie bleiben leer, bis Christian sie
 * einträgt; die Zeilen erscheinen erst dann. Ein erfundener Wert wäre
 * schlimmer als eine fehlende Zeile.
 */
export const GEBUEHR_BIC = "";
export const GEBUEHR_BANK = "";

/**
 * Einen Kaufpreis aus dem lesen, was im Formular steht.
 *
 * Das Feld ist ein Textfeld, und die Werte kommen in jeder denkbaren
 * Schreibweise: „300000", „300.000", „300.000,00 €", „EUR 300000". Punkt ist
 * der Tausenderpunkt, Komma das Dezimalzeichen.
 *
 * Gibt `null` zurück, wenn sich keine sinnvolle Zahl ergibt. Das ist wichtig:
 * Eine unlesbare Eingabe darf keine Gebühr erzeugen, sondern muss auffallen.
 */
export function kaufpreisAusText(text: string | null | undefined): number | null {
  const eingabe = (text || "").trim();
  /*
   * Ein Minuszeichen muss erkannt werden, BEVOR die Zeichen weggeworfen
   * werden. Sonst wird aus "-5000" die Zahl 5000, und ein offensichtlicher
   * Tippfehler erzeugt klaglos eine Gebühr.
   */
  if (eingabe.startsWith("-")) return null;
  const roh = eingabe.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const wert = parseFloat(roh);
  return Number.isFinite(wert) && wert > 0 ? wert : null;
}

/**
 * Der Gebührenbetrag zu einem Kaufpreis.
 *
 * `null` heißt: Der Kaufpreis steht noch nicht fest, also auch die Gebühr
 * nicht. Lieber nichts ausweisen als einen Betrag, der auf einer Annahme
 * beruht.
 */
export function gebuehrZuKaufpreis(kaufpreis: number | null): number | null {
  if (kaufpreis === null || kaufpreis <= 0) return null;
  return kaufpreis >= GEBUEHR_GRENZE ? GEBUEHR_GROSS : GEBUEHR_KLEIN;
}

/** Aus dem Formularfeld direkt zum Betrag. */
export function gebuehrAusText(text: string | null | undefined): number | null {
  return gebuehrZuKaufpreis(kaufpreisAusText(text));
}

/** „1.500,00 EUR". Im PDF und auf dem Schirm dieselbe Schreibweise. */
export function euroText(betrag: number): string {
  return `${betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

/**
 * Die beiden Stufen als Text, für die Darstellung der Staffel.
 *
 * Die Schreibweise ist die des Papierformulars, also „300.000,00 EUR" mit
 * Nachkommastellen. In einem Dokument, in dem alle anderen Beträge zwei
 * Stellen tragen, fiele eine Zahl ohne sie als Ungenauigkeit auf.
 */
export function staffelZeilen(): { bereich: string; betrag: string }[] {
  const grenze = euroText(GEBUEHR_GRENZE);
  return [
    { bereich: `Kaufpreis unter ${grenze}`, betrag: euroText(GEBUEHR_KLEIN) },
    { bereich: `Kaufpreis ab ${grenze}`, betrag: euroText(GEBUEHR_GROSS) },
  ];
}

/**
 * Der Verwendungszweck für die Überweisung.
 *
 * Er ist die Stelle, an der eine Zahlung in der Buchhaltung zuzuordnen ist.
 * Bis zum 15.09.2026 standen hier nur die Namen der Käufer. Das versagt in
 * zwei Fällen: wenn ein Dritter zahlt (Eltern, Firma) und wenn derselbe Kunde
 * zwei Einheiten reserviert. Das Objekt allein versagt, wenn zwei
 * Interessenten nacheinander dieselbe Einheit reservieren. Deshalb beides,
 * kurz gehalten, damit es in die 140 Zeichen einer SEPA-Überweisung passt
 * (Rechtsentwurf vom 15.09.2026, Abschnitt 4):
 *
 *   Reservierungsgebühr [Objektstraße] WE [Nr.], [Nachname 1]
 *
 * Fehlende Teile fallen weg, statt eine leere Klammer zu hinterlassen. Fehlt
 * alles, bleibt der Zweck leer und die Zeile weg.
 */
export function verwendungszweck(
  objStrasse: string | null | undefined,
  weNr: string | null | undefined,
  nachname1: string | null | undefined,
): string {
  const strasse = (objStrasse || "").trim();
  const nr = (weNr || "").trim();
  const objekt = [strasse, nr ? `WE ${nr}` : ""].filter(Boolean).join(" ");
  const teile = [objekt, (nachname1 || "").trim()].filter(Boolean).join(", ");
  return teile ? `Reservierungsgebühr ${teile}` : "";
}

/**
 * Der Verwendungszweck beim Globalobjekt:
 *
 *   Reservierungsgebühr [Objektstraße] Gesamtobjekt, [Nachname oder Firma]
 *
 * „Gesamtobjekt“ steht dort, wo sonst die Wohneinheit steht, damit die
 * Buchhaltung eine Hauszahlung sofort erkennt. Fehlen Straße und Name, bleibt
 * „Gesamtobjekt“ allein trotzdem stehen, denn es sagt schon etwas.
 */
export function verwendungszweckGesamtobjekt(
  objStrasse: string | null | undefined,
  nameOderFirma: string | null | undefined,
): string {
  const objekt = [(objStrasse || "").trim(), "Gesamtobjekt"].filter(Boolean).join(" ");
  const teile = [objekt, (nameOderFirma || "").trim()].filter(Boolean).join(", ");
  return `Reservierungsgebühr ${teile}`;
}
