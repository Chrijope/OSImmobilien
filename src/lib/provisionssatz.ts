import { cacheGet } from "./dataCache";
import { kennungZuName, nameMehrdeutig } from "./beraterNamensabgleich";

/**
 * Provisionssätze der Vertriebspartner aus der Nutzerverwaltung.
 *
 * Karrierestufen gibt es bei OS Immobilien seit dem 15.10.2026 nicht mehr
 * (Christian: im Vertrieb gibt es nur Vertriebspartner, ohne Stufen). Die
 * gespeicherten Stufenwerte in den Nutzereinstellungen und die Tabelle
 * `karriere_stufen` bleiben in der Datenbank stehen, werden aber weder
 * gelesen noch geschrieben (bis 15.10.2026 hiess diese Datei
 * karriereStufeHelper.ts).
 */

/** Formatiert einen Satz deutsch fuer die Anzeige, z. B. 4.5 wird zu "4,5 %". */
export function formatSatzProzent(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}

/** Der allgemeine Satz (Altbestand), sonst null. */
export function getCustomProvisionRate(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** Returns the rate Michael (or any user) earns when a Setterin assigned the lead */
export function getCustomProvisionRateSetter(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate_setter;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** Returns the rate for self-acquired contacts */
export function getCustomProvisionRateEigen(userId?: string | null): number | null {
  if (!userId) return null;
  const allSettings = cacheGet<any>("user_settings");
  const rate = allSettings.find((row: any) => row.user_id === userId)?.einstellungen?.custom_provision_rate_eigen;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/**
 * Lead- und Eigen-Satz eines Partners aus der Nutzerverwaltung. Fehlt einer,
 * springt der allgemeine Satz ein (Altbestand vor der Trennung). Ohne
 * gepflegten Satz `null`: Bei OS Immobilien gibt es seit dem 15.10.2026
 * keine Karrierestufe mehr, die still einen Satz liefert.
 */
export function provisionssaetze(userId?: string | null): { lead: number | null; eigen: number | null } {
  const allgemein = getCustomProvisionRate(userId);
  return {
    lead: getCustomProvisionRateSetter(userId) ?? allgemein,
    eigen: getCustomProvisionRateEigen(userId) ?? allgemein,
  };
}

/**
 * Ein einzelner Satz für Anzeigen, die nicht nach Kontakt unterscheiden
 * (Prognosen, Zielplanung): der allgemeine, sonst der Lead-, sonst der
 * Eigen-Satz. Ohne Satz `null`, nie eine erfundene Zahl; eine Karrierestufe
 * zählt nicht mehr (Entscheidung Christian 15.10.2026).
 */
export function getEffectiveRate(userId?: string | null): number | null {
  const { lead, eigen } = provisionssaetze(userId);
  return getCustomProvisionRate(userId) ?? lead ?? eigen;
}

/**
 * Mischsatz für Planungen: Eigen- und Lead-Satz, gewichtet mit dem geplanten
 * Anteil eigener Kontakte (0 bis 100). Fehlt einer der beiden, gilt der
 * andere; fehlen beide, `null`.
 */
export function mischsatz(userId: string | null | undefined, anteilEigenPct: number): number | null {
  const { lead, eigen } = provisionssaetze(userId);
  if (lead === null && eigen === null) return null;
  const e = eigen ?? (lead as number);
  const l = lead ?? (eigen as number);
  const anteil = Math.max(0, Math.min(100, Number(anteilEigenPct) || 0));
  return (e * anteil + l * (100 - anteil)) / 100;
}

/** Hinweis, wenn kein Satz hinterlegt ist. Überall derselbe Wortlaut. */
export const KEIN_SATZ_TEXT = "Kein Provisionssatz hinterlegt";

/**
 * Liest einen Provisionssatz aus einer Eingabe, Komma oder Punkt: "10,5" wird
 * 10,5. Gültig ist größer 0 bis höchstens 100, sonst `null`.
 */
export function parseProvisionssatz(eingabe: string | number | null | undefined): number | null {
  if (eingabe === null || eingabe === undefined) return null;
  const text = String(eingabe).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const wert = Number(text);
  return wert > 0 && wert <= 100 ? wert : null;
}

export const SATZ_UNGUELTIG_TEXT = "Bitte trag einen Provisionssatz zwischen 0 und 100 Prozent ein.";

/**
 * Eigen oder zugewiesen: Davon hängt ab, ob der Eigen- oder der Lead-Satz
 * gilt (Reihenfolge siehe getEffectiveRateInfoForKontakt unten).
 *
 * Was ein eigener Kontakt ist, entschied bisher allein das Feld `setter`, also
 * der Name einer Setterin. Bei OS Immobilien gibt es aber keine Setterinnen: die
 * Leads werden den Vertriebspartnern zugewiesen, und die setten selbst im
 * Erstgespräch. Das Feld blieb deshalb praktisch immer leer, womit rechnerisch
 * jeder Kontakt als eigener galt und der Lead-Satz nie zur Anwendung kam.
 *
 * Massgeblich ist jetzt, wer den Kontakt angelegt hat:
 *
 *   eigen        der Vertriebspartner selbst, von Hand oder über einen
 *                CSV-Import, den er selbst hochgeladen hat. `addKontakt`
 *                trägt dabei automatisch `erstelltVonId` ein.
 *   zugewiesen   alles andere: vom Büro angelegt, über eine Kampagne
 *                eingegangen, aus einem fremden Import verteilt.
 *
 * Ein eingetragener Setter zählt weiterhin als zugewiesen. So bleiben alte
 * Datensätze richtig eingeordnet.
 */

// "stufe" und "nutzerverwaltung" entstehen nicht mehr, stehen aber noch in
// gespeicherten Bescheiden und bleiben deshalb lesbar.
export type Satzart = "eigen" | "zugewiesen" | "locked" | "stufe" | "nutzerverwaltung" | "fehlt";

export const SATZART_LABEL: Record<Satzart, string> = {
  eigen: "Eigen",
  zugewiesen: "Zugewiesen",
  locked: "Festgeschrieben",
  stufe: "Altbestand",
  nutzerverwaltung: "Nutzerverwaltung",
  fehlt: "Kein Satz hinterlegt",
};

export const SATZART_ERKLAERUNG: Record<Satzart, string> = {
  eigen: "Der Vertriebspartner hat diesen Kontakt selbst angelegt. Es gilt sein Eigen-Satz.",
  zugewiesen: "Dieser Lead wurde dem Vertriebspartner zugewiesen. Es gilt sein Lead-Satz.",
  locked:
    "Der Satz wurde bei der Reservierung festgeschrieben. Eine spätere Änderung in der Nutzerverwaltung wirkt sich auf diesen Vorgang nicht mehr aus.",
  stufe: "Alter Bescheid aus der Zeit vor dem 15.10.2026, als ohne eigenen Satz noch ein Standardsatz galt.",
  nutzerverwaltung:
    "Die Sätze dieses Partners waren in der Nutzerverwaltung festgeschrieben. Der dort hinterlegte Satz galt für diesen Vorgang.",
  fehlt: "Für diesen Partner ist in der Nutzerverwaltung kein Provisionssatz hinterlegt. Bis Admin oder Inhaber ihn eintragen, wird keine Provision gerechnet.",
};

/**
 * Hat der Vertriebspartner diesen Kontakt selbst angelegt?
 *
 * `erstelltVonId` wird von `addKontakt` automatisch gesetzt, auch beim
 * CSV-Import. Ältere Datensätze haben das Feld nicht; sie fallen dann über den
 * Namen zurück, und wenn auch der fehlt, gelten sie als zugewiesen. Das ist die
 * vorsichtigere Annahme, weil der Lead-Satz üblicherweise der niedrigere ist.
 */
export function istEigenKontakt(userId: string | null | undefined, kontakt: any): boolean {
  if (!kontakt) return false;
  // Ein eingetragener Setter bedeutet immer: nicht selbst gewonnen.
  if (kontakt.setter && String(kontakt.setter).trim().length > 0) return false;

  const erstellerId = kontakt.erstelltVonId ?? kontakt.meta?.erstelltVonId ?? null;
  if (erstellerId && userId) return String(erstellerId) === String(userId);

  // Kein Ersteller hinterlegt: über den Namen versuchen.
  const erstellerName = String(kontakt.erstelltVonName ?? kontakt.meta?.erstelltVonName ?? "").trim();
  const beraterName = String(kontakt.berater ?? "").trim();
  if (erstellerName && beraterName) {
    // Traegt ein zweiter Nutzer denselben Namen, ist nicht klar, wer gemeint
    // ist. Dann gilt die vorsichtigere Annahme "zugewiesen", wie ohne Namen.
    if (nameMehrdeutig(erstellerName)) return false;
    // Wie im Trigger `investments_provisionssatz_festschreiben`: Meint der
    // Name eindeutig jemand anderen als diesen Partner, ist es nicht eigen.
    const erstellerKennung = kennungZuName(erstellerName);
    if (userId && erstellerKennung && erstellerKennung !== userId) return false;
    return erstellerName.toLowerCase() === beraterName.toLowerCase();
  }
  return false;
}

export function getEffectiveRateForKontakt(
  userId: string | null | undefined,
  kontakt: any,
  lockedRate?: number | null,
): number | null {
  return getEffectiveRateInfoForKontakt(userId, kontakt, lockedRate).rate;
}

/**
 * Schalter fuer Abrechnungen und Provisionsabrechnung.
 *
 * 29.09.2026: Christian entscheidet, dass der festgeschriebene Satz gilt,
 * scharf geschaltet wurde noch nicht. 15.10.2026: eingeschaltet. Die Saetze
 * schreibt seit 20260929140000 nur noch der Trigger, ab Reservierung; der
 * Altbestand wurde mit 20260929150000 nachgezogen. Damit wirkt eine
 * Satzaenderung in der Nutzerverwaltung nur noch auf Vorgaenge vor der
 * Reservierung.
 */
export const FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG = true;

/**
 * Der am Investment festgeschriebene Satz (`meta.lockedProvisionRate`), sonst
 * `null`. Nur eine Zahl größer null zählt, alles andere ist kein Satz.
 *
 * Mit `partnerId`: Steht am Satz ein anderer Partner (Umhängung, bei der der
 * Trigger nicht nachziehen konnte), gilt er für diesen Partner nicht.
 */
export function festgeschriebenerSatz(
  meta: Record<string, unknown> | null | undefined,
  partnerId?: string | null,
): number | null {
  if (!FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG) return null;
  const satz = meta?.lockedProvisionRate;
  if (typeof satz !== "number" || satz <= 0) return null;
  const fuer = meta?.lockedProvisionRatePartner;
  if (partnerId && typeof fuer === "string" && fuer && fuer !== partnerId) return null;
  return satz;
}

/**
 * Liefert zusätzlich zum effektiven Satz die Satzart, damit in Abrechnung,
 * Auswertung und Zielplanung sichtbar wird, warum genau dieser Prozentsatz
 * gerechnet wurde.
 *
 * Reihenfolge (seit 15.10.2026, ohne Karrierestufe):
 *  1. Am Investment festgeschriebener Satz (ab Reservierung, nur der
 *     Trigger schreibt ihn). Er gilt auch dann, wenn sich der Satz in der
 *     Nutzerverwaltung später ändert, das ist der Zweck der Festschreibung.
 *     Früher schlug `provision_locked` ihn; das hätte eine Satzänderung
 *     rückwirkend auf reservierte Vorgänge durchschlagen lassen.
 *  2. Eigen- bzw. Lead-Satz aus der Nutzerverwaltung (fehlt er, der
 *     allgemeine Satz).
 *  3. Kein Satz: `rate` ist `null`, als "fehlt" gekennzeichnet. Es wird
 *     keine Provision gerechnet und keine Zahl erfunden.
 */
export function getEffectiveRateInfoForKontakt(
  userId: string | null | undefined,
  kontakt: any,
  lockedRate?: number | null,
): {
  /** `null`, wenn kein Satz hinterlegt ist: dann keine Provision. */
  rate: number | null;
  quelle: Satzart;
  setterName?: string;
  /** Der Satz, der heute gelten würde. Nur bei "locked" gefüllt und nur, wenn er abweicht. */
  heutigerSatz?: number;
} {
  const eigen = istEigenKontakt(userId, kontakt);
  const setterName = kontakt?.setter ? String(kontakt.setter).trim() || undefined : undefined;
  const saetze = provisionssaetze(userId);
  const aktuell = eigen ? saetze.eigen : saetze.lead;

  if (typeof lockedRate === "number" && lockedRate > 0) {
    return {
      rate: lockedRate,
      quelle: "locked",
      setterName,
      heutigerSatz: aktuell !== null && Math.abs(lockedRate - aktuell) > 0.001 ? aktuell : undefined,
    };
  }

  if (aktuell === null) return { rate: null, quelle: "fehlt", setterName };
  return { rate: aktuell, quelle: eigen ? "eigen" : "zugewiesen", setterName };
}
