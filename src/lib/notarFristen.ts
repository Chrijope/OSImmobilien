/**
 * Notartermin erst 14 Tage nach dem Kaufvertragsentwurf (Vorgabe Christian, 27.10.2026).
 *
 * „Bevor ein Notartermin gesetzt werden kann, muss 14 Tage zuvor der
 * Kaufvertragsentwurf an den Kunden gesendet worden sein. Das bedeutet auch,
 * dass spätestens 14 Tage vor Notartermin die Finanzierung stehen muss."
 *
 * Als Versand gilt die Freigabe des Dokuments in der Kundenordner-Kategorie
 * „Kaufvertragsentwurf": Erst dann sieht der Kunde es im Portal und bekommt
 * die Meldung (`notifyKundeKundenordnerDokument`). Der Zeitpunkt steht seit
 * dem 27.10.2026 in `freigegebenAm`; aeltere Freigaben haben nur
 * `uploadedAt`, das dann ersatzweise zaehlt. Liegen mehrere Fassungen vor,
 * zaehlt die neueste: Der Kunde soll den Text, der beurkundet wird, 14 Tage
 * vorher haben.
 *
 * Gerechnet wird in Kalendertagen auf dem Berliner Datum, ohne Uhrzeit.
 * Dieselbe Regel prueft die Datenbank beim Speichern (Migration
 * 20261027130000_notartermin_kve_frist.sql).
 */
import { heuteBerlinIso } from "./datumsformate";

export const KVE_KATEGORIE = "Kaufvertragsentwurf";
export const KVE_FRIST_TAGE = 14;

/** Das Datum `iso` (JJJJ-MM-TT) um `tage` Kalendertage verschoben. */
function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

/** JJJJ-MM-TT oder TT.MM.JJJJ als JJJJ-MM-TT, sonst `null`. */
export function notarDatumIso(wert: string | null | undefined): string | null {
  const w = (wert || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(w)) return w.slice(0, 10);
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(w);
  return de ? `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` : null;
}

/** JJJJ-MM-TT als TT.MM.JJJJ. */
export function tagDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/**
 * Der Versandzeitpunkt des Kaufvertragsentwurfs aus den Dokumenten des
 * Kundenordners, oder `null`, solange keiner freigegeben ist.
 */
export function kveVersandAm(
  dokumente: ReadonlyArray<{ kategorie: string; freigegeben?: boolean; freigegebenAm?: string; uploadedAt?: string }>,
): string | null {
  const zeiten = dokumente
    .filter((d) => d.kategorie === KVE_KATEGORIE && d.freigegeben)
    .map((d) => d.freigegebenAm || d.uploadedAt || "")
    .filter((z) => !Number.isNaN(new Date(z).getTime()))
    .sort();
  return zeiten.length ? zeiten[zeiten.length - 1] : null;
}

/** Der frueheste erlaubte Notartermin (JJJJ-MM-TT): Versandtag in Berlin plus 14 Tage. */
export function fruehesterNotartermin(kveVersandIso: string): string {
  return plusTage(heuteBerlinIso(new Date(kveVersandIso)), KVE_FRIST_TAGE);
}

/** Bis wann die Finanzierung stehen muss (JJJJ-MM-TT): Notartermin minus 14 Tage. */
export function finanzierungSpaetestensBis(notarIso: string): string {
  return plusTage(notarIso, -KVE_FRIST_TAGE);
}

/**
 * Die Meldung, warum dieser Notartermin nicht gesetzt werden darf, oder
 * `null`, wenn er passt.
 *
 * Nicht geprueft werden ein leeres Datum (Termin entfernen) und Tage vor
 * heute: Das ist ein Nachtrag fuer einen schon gelaufenen Verkauf, etwa in
 * der Einheitenliste, kein neu vereinbarter Termin.
 */
export function notarterminPruefen(
  notarDatum: string | null | undefined,
  kveVersandIso: string | null,
  jetzt: Date = new Date(),
): string | null {
  const notar = notarDatumIso(notarDatum);
  if (!notar || notar < heuteBerlinIso(jetzt)) return null;
  if (!kveVersandIso) return "Der Kaufvertragsentwurf ist noch nicht beim Kunden. Bitte zuerst im Kundenordner unter „Kaufvertragsentwurf“ hochladen und freigeben.";
  const fruehestens = fruehesterNotartermin(kveVersandIso);
  if (notar >= fruehestens) return null;
  return `Frühestmöglicher Notartermin: ${tagDe(fruehestens)} (14 Tage nach Versand des Kaufvertragsentwurfs am ${tagDe(heuteBerlinIso(new Date(kveVersandIso)))}).`;
}

/**
 * Hinweis „Finanzierung muss bis … stehen" zum Notartermin, oder `null` ohne
 * lesbaren Termin. `ueberfaellig`, sobald der Tag erreicht ist und die
 * Finanzierung noch nicht bestaetigt.
 */
export function finanzierungsFrist(
  notarDatum: string | null | undefined,
  finanzierungsStatus: string | null | undefined,
  jetzt: Date = new Date(),
): { bis: string; text: string; ueberfaellig: boolean } | null {
  const notar = notarDatumIso(notarDatum);
  if (!notar) return null;
  const bis = finanzierungSpaetestensBis(notar);
  return {
    bis,
    text: `Finanzierung muss bis ${tagDe(bis)} stehen`,
    ueberfaellig: heuteBerlinIso(jetzt) >= bis && finanzierungsStatus !== "bestaetigt",
  };
}
