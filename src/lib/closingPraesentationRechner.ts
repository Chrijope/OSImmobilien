/**
 * Rechenlogik der Closing-Präsentation (Folien Echter Fall, Dein Rechner,
 * Preis des Wartens, Zwei Wege).
 *
 * Bewusst reine Funktionen ohne React und ohne Store-Zugriff: Die Präsentation
 * zeigt diese Zahlen live vor einem Bewerber, deshalb müssen sie testbar sein,
 * bevor sie jemand im Termin sieht. Die Sätze kommen wahlweise aus den im
 * Closing hinterlegten Bewerberfeldern (satzIndividuell / satzLead / satzEigen,
 * dieselben Felder, die auch der Vertragsgenerator in vertragKlauseln.ts
 * liest) oder aus den Standardwerten des neuen Konditionsmodells:
 * einheitlich 4 Prozent, für MORE-Leads wie für eigene Kunden.
 */

/** Standardsätze des neuen Modells, falls für den Bewerber nichts hinterlegt ist. */
export const STANDARD_LEAD_SATZ = 4;
export const STANDARD_EIGEN_SATZ = 4;

/**
 * Die drei Satzfelder aus dem Bewerberprofil. Als eigene, schmale Schnittstelle
 * statt des kompletten Bewerber-Typs, damit die Tests keine Store-Attrappe
 * brauchen und die Präsentation auch ganz ohne Bewerber rechnen kann.
 */
export interface SatzQuellen {
  satzIndividuell?: string;
  satzLead?: string;
  satzEigen?: string;
}

export interface ClosingSaetze {
  /** Satz in Prozent für über MORE zugewiesene Leads. */
  leadSatz: number;
  /** Satz in Prozent für Kunden aus dem eigenen Netzwerk. */
  eigenSatz: number;
  /** true, wenn mindestens ein Satz individuell aus dem Bewerberprofil kommt. */
  verhandelt: boolean;
}

/**
 * Liest einen Prozentsatz aus einem Freitextfeld ("3", "3,5", "3.5 %").
 * Dasselbe tolerante Muster wie provisionsSaetze() in vertragKlauseln.ts,
 * damit Präsentation und Vertrag nie unterschiedliche Sätze zeigen.
 */
export function parseSatz(text: string | undefined | null): number | null {
  if (!text) return null;
  const n = parseFloat(String(text).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Leitet die in der Präsentation geltenden Sätze ab.
 *
 * Vorrang wie im Vertrag: Ein individueller Einheitssatz gilt für beide Wege.
 * Sonst gelten die getrennten Lead- und Eigen-Sätze, und wo nichts hinterlegt
 * ist, der einheitliche Standard von 4 Prozent.
 */
export function ermittleSaetze(quellen?: SatzQuellen | null): ClosingSaetze {
  const individuell = parseSatz(quellen?.satzIndividuell);
  if (individuell !== null) {
    return { leadSatz: individuell, eigenSatz: individuell, verhandelt: true };
  }
  const lead = parseSatz(quellen?.satzLead);
  const eigen = parseSatz(quellen?.satzEigen);
  return {
    leadSatz: lead ?? STANDARD_LEAD_SATZ,
    eigenSatz: eigen ?? STANDARD_EIGEN_SATZ,
    verhandelt: lead !== null || eigen !== null,
  };
}

/** Vergütung für einen einzelnen Abschluss, auf ganze Euro gerundet. */
export function verguetungProDeal(kaufpreis: number, satzProzent: number): number {
  if (!Number.isFinite(kaufpreis) || !Number.isFinite(satzProzent)) return 0;
  if (kaufpreis <= 0 || satzProzent <= 0) return 0;
  return Math.round((kaufpreis * satzProzent) / 100);
}

/**
 * Vergütung pro Jahr bei gleichbleibendem Tempo.
 *
 * Erst der Einzel-Deal wird gerundet, dann multipliziert. So stimmt die
 * Jahreszahl exakt mit "12 mal die Monatszahl" überein, die der Bewerber im
 * Kopf nachrechnet. Halbe Abschlüsse pro Monat (ein Abschluss alle zwei
 * Monate) sind ausdrücklich erlaubt, deshalb wird am Ende erneut gerundet.
 */
export function verguetungProJahr(
  abschluesseProMonat: number,
  kaufpreis: number,
  satzProzent: number,
): number {
  if (!Number.isFinite(abschluesseProMonat) || abschluesseProMonat <= 0) return 0;
  return Math.round(verguetungProDeal(kaufpreis, satzProzent) * abschluesseProMonat * 12);
}

/**
 * Was ein späterer Start kostet: die Vergütung der verpassten Monate.
 *
 * Keine Zinsen, keine Steigerung, bewusst die nüchternste Rechnung. Die Folie
 * soll rechnen, nicht drohen.
 */
export function warteKosten(
  abschluesseProMonat: number,
  kaufpreis: number,
  satzProzent: number,
  monate: number,
): number {
  if (!Number.isFinite(monate) || monate <= 0) return 0;
  if (!Number.isFinite(abschluesseProMonat) || abschluesseProMonat <= 0) return 0;
  return Math.round(verguetungProDeal(kaufpreis, satzProzent) * abschluesseProMonat * monate);
}
