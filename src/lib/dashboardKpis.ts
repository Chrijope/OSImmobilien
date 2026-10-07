/**
 * Die Kennzahlen für die Leiste ganz oben auf dem Dashboard.
 *
 * Bisher musste man sich die wichtigsten Zahlen aus fünf Karten zusammensuchen,
 * und einige davon gab es nur auf der Statistiken-Seite. Vor allem fehlte
 * überall der Vergleich zwischen Umsatz und Ziel, obwohl beide Werte im System
 * stehen und nur nie zusammengebracht wurden.
 *
 * Die Funktion hier ist bewusst rein: Sie bekommt Daten und einen Zeitraum und
 * gibt Zahlen zurück. Damit ist sie prüfbar, ohne Datenbank.
 */

import { istUeberfaellig } from "./faelligkeit";

export { istUeberfaellig };

export type Zeitraum = "monat" | "quartal" | "jahr";
export type Sicht = "eigen" | "team" | "firma";

export interface KpiKontakt {
  id: string;
  pipelineStufe?: string;
  kaufpreis?: number;
  budget?: number;
  /** Anlagedatum, ISO oder TT.MM.JJJJ. */
  erstellt_am?: string;
  archiviert?: boolean;
}

export interface KpiInvestment {
  id: string;
  kontaktId?: string;
  kaufpreis?: number;
  /** Notartermin, ISO oder TT.MM.JJJJ. */
  notarTermin?: string;
  pipelineStufe?: string;
  status?: string;
}

export interface KpiAufgabe {
  faelligAm?: string;
  uhrzeit?: string;
  status?: string;
}

export interface DashboardKpis {
  /** Beurkundeter Umsatz im Zeitraum. */
  umsatz: number;
  /** Ziel für den Zeitraum, 0 wenn keins gepflegt ist. */
  ziel: number;
  /** Zielerreichung in Prozent, null ohne Ziel. */
  zielProzent: number | null;
  /** Kontakte in Reservierung oder Finanzierung, also unterschrieben aber nicht beurkundet. */
  offeneReservierungen: number;
  /** Notartermine im Zeitraum, getrennt nach beurkundet und geplant. */
  notarBeurkundet: number;
  notarGeplant: number;
  /** Kontakte, die weder gewonnen noch verloren noch archiviert sind. */
  /** Vorgaenge, an denen gerade gearbeitet wird. Frueher "aktiveLeads". */
  aktiveLeads: number;
  /** Leads, die noch niemand angefasst hat. Steht als Zusatz unter der Kachel. */
  unbearbeiteteLeads: number;
  /*
   * Die Datensätze hinter den vier großen Zahlen. Ohne sie bleibt eine Kachel
   * eine Behauptung: Man sieht "14 aktive Leads" und kann nicht nachsehen,
   * welche das sind.
   */
  umsatzEintraege: KpiEintrag[];
  reservierungEintraege: KpiEintrag[];
  notarEintraege: KpiEintrag[];
  leadEintraege: KpiEintrag[];
  /** Anteil der Erstgespräche, die es bis mindestens Reservierung geschafft haben. */
  conversionProzent: number | null;
  /** Aufgaben, deren Fälligkeit vorbei ist. */
  ueberfaelligeAufgaben: number;
}

const GEWONNEN = new Set([
  "notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung",
  // "abgeschlossen" fehlte hier. Ein Vorgang, der komplett durch war, zaehlte
  // dadurch weiter als aktiver Lead.
  "abgeschlossen",
  "kunde", "aftersales",
]);
const VERLOREN = new Set([
  "verloren",
  // Stand hier als "archiv" und griff deshalb nie: Die Stufe heisst
  // "archiviert". Aufgefangen wurde das nur ueber das Archiv-Kennzeichen am
  // Kontakt, und das ist nicht bei jedem gesetzt.
  "archiviert",
]);

/**
 * Stufen, in denen tatsaechlich gearbeitet wird.
 *
 * Frueher zaehlte die Kachel "Aktive Leads" alles, was weder gewonnen noch
 * verloren war. Damit steckten der unbearbeitete Lead von vorgestern und der
 * importierte Bestandskunde in derselben Zahl wie der Kunde, der morgen
 * reserviert. Eine solche Zahl beantwortet keine Frage.
 *
 * Diese Menge ist die Summe der drei mittleren Gruppen der Kundenuebersicht in
 * den Statistiken: Kontakt, Qualifiziert und Abwicklung. Dashboard und
 * Statistik zeigen damit dieselben Kunden, und die Zahl laesst sich nachrechnen.
 */
const IN_BEARBEITUNG = new Set([
  "nicht_erreicht", "erreicht", "follow_up", "kontaktversuche", "vermoegensaufbau",
  "erstgespraech_geplant", "erstgespraech", "eg_noshow",
  "beratungsgespraech", "bg_noshow", "selbstauskunft",
  "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt",
  "reservierung", "finanzierung",
]);

/** Noch von niemandem angefasst. */
const UNBEARBEITET = new Set(["neuer_lead", "zugewiesen"]);
const AB_RESERVIERUNG = new Set([
  "reservierung", "finanzierung", "notar", "notar_ohne_gs", "notar_mit_gs",
  "faelligkeit", "abrechnung", "kunde", "aftersales",
]);
const OFFENE_RESERVIERUNG = new Set(["reservierung", "finanzierung"]);
/** Stufen, die belegen, dass ein Erstgespräch stattgefunden hat. */
const NACH_ERSTGESPRAECH = new Set([
  "erstgespraech_geplant", "erstgespraech", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt", ...AB_RESERVIERUNG,
]);

/** Liest ISO und deutsches Datum. Alles andere ergibt null. */
export function leseDatum(roh?: string | null): Date | null {
  const s = (roh || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const [, dd, mm, yyyy] = de;
    const d = new Date(+yyyy, +mm - 1, +dd);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Start und Ende des gewählten Zeitraums, Ende exklusiv. */
export function zeitraumGrenzen(z: Zeitraum, heute: Date = new Date()): { von: Date; bis: Date } {
  const jahr = heute.getFullYear();
  if (z === "jahr") {
    return { von: new Date(jahr, 0, 1), bis: new Date(jahr + 1, 0, 1) };
  }
  if (z === "quartal") {
    const q = Math.floor(heute.getMonth() / 3);
    return { von: new Date(jahr, q * 3, 1), bis: new Date(jahr, q * 3 + 3, 1) };
  }
  return { von: new Date(jahr, heute.getMonth(), 1), bis: new Date(jahr, heute.getMonth() + 1, 1) };
}

/**
 * Ziel für den gewählten Zeitraum aus der Monatsplanung.
 *
 * Die Zielplanung liegt als Liste mit zwölf Monatswerten vor. Ein Jahresziel
 * durch zwölf zu teilen wäre falsch, weil die Monate unterschiedlich geplant
 * sind. Deshalb wird genau über die betroffenen Monate summiert.
 */
export function zielFuerZeitraum(
  monatswerte: number[] | undefined,
  z: Zeitraum,
  heute: Date = new Date(),
): number {
  const werte = Array.isArray(monatswerte) ? monatswerte : [];
  if (werte.length === 0) return 0;
  const summe = (von: number, bis: number) =>
    werte.slice(von, bis).reduce((s, v) => s + (Number(v) || 0), 0);

  if (z === "jahr") return summe(0, 12);
  if (z === "quartal") {
    const q = Math.floor(heute.getMonth() / 3);
    return summe(q * 3, q * 3 + 3);
  }
  return Number(werte[heute.getMonth()]) || 0;
}

/**
 * Ein einzelner Datensatz hinter einer Kennzahl.
 *
 * Bewusst ohne Namen: Die Kennzahlen kennen nur Kennungen, den Namen schlägt
 * die Oberfläche nach. Sonst müsste diese Datei wissen, wie ein Kunde
 * angezeigt wird, und das ist nicht ihre Aufgabe.
 */
export interface KpiEintrag {
  /** Kontakt, auf den die Zeile zeigt. */
  kontaktId: string;
  investmentId?: string;
  betrag?: number;
  /** Für Notartermine: der Termin selbst. */
  datum?: string;
}

export interface KpiEingabe {
  kontakte: KpiKontakt[];
  investments: KpiInvestment[];
  aufgaben?: KpiAufgabe[];
  von: Date;
  bis: Date;
  /** Ziel für genau diesen Zeitraum, bereits anteilig gerechnet. */
  ziel?: number;
  jetzt?: Date;
}

export function berechneDashboardKpis(e: KpiEingabe): DashboardKpis {
  const jetzt = e.jetzt ?? new Date();
  const stufe = (s?: string) => (s || "").toLowerCase();

  let umsatz = 0;
  let notarBeurkundet = 0;
  let notarGeplant = 0;

  const umsatzEintraege: KpiEintrag[] = [];
  const reservierungEintraege: KpiEintrag[] = [];
  const notarEintraege: KpiEintrag[] = [];
  const leadEintraege: KpiEintrag[] = [];

  for (const inv of e.investments) {
    if (inv.status === "storniert" || inv.status === "geloescht") continue;
    const termin = leseDatum(inv.notarTermin);
    if (!termin) continue;
    if (termin < e.von || termin >= e.bis) continue;
    const eintrag: KpiEintrag = {
      kontaktId: inv.kontaktId || "",
      investmentId: inv.id,
      betrag: Number(inv.kaufpreis) || 0,
      datum: inv.notarTermin,
    };
    notarEintraege.push(eintrag);
    if (termin <= jetzt) {
      notarBeurkundet += 1;
      umsatz += Number(inv.kaufpreis) || 0;
      umsatzEintraege.push(eintrag);
    } else {
      notarGeplant += 1;
    }
  }

  let offeneReservierungen = 0;
  let aktiveLeads = 0;
  let unbearbeiteteLeads = 0;
  let erstgespraecheGesamt = 0;
  let davonAbReservierung = 0;

  for (const k of e.kontakte) {
    const s = stufe(k.pipelineStufe);
    if (k.archiviert) continue;

    if (OFFENE_RESERVIERUNG.has(s)) {
      offeneReservierungen += 1;
      reservierungEintraege.push({ kontaktId: k.id, betrag: Number(k.kaufpreis) || 0 });
    }
    if (IN_BEARBEITUNG.has(s)) {
      aktiveLeads += 1;
      leadEintraege.push({ kontaktId: k.id, betrag: Number(k.kaufpreis) || 0 });
    }
    if (UNBEARBEITET.has(s)) unbearbeiteteLeads += 1;

    // Für die Conversion zählen nur Kontakte, die im Zeitraum angelegt wurden.
    // Sonst verzerrt der Altbestand jede Quote.
    const angelegt = leseDatum(k.erstellt_am);
    if (angelegt && angelegt >= e.von && angelegt < e.bis) {
      if (NACH_ERSTGESPRAECH.has(s)) erstgespraecheGesamt += 1;
      if (AB_RESERVIERUNG.has(s)) davonAbReservierung += 1;
    }
  }

  let ueberfaelligeAufgaben = 0;
  for (const a of e.aufgaben || []) {
    if (a.status === "erledigt" || a.status === "abgesagt") continue;
    if (istUeberfaellig(a.faelligAm, a.uhrzeit, jetzt)) ueberfaelligeAufgaben += 1;
  }

  const ziel = e.ziel && e.ziel > 0 ? e.ziel : 0;

  return {
    unbearbeiteteLeads,
    umsatzEintraege,
    reservierungEintraege,
    notarEintraege,
    leadEintraege,
    umsatz,
    ziel,
    zielProzent: ziel > 0 ? Math.round((umsatz / ziel) * 100) : null,
    offeneReservierungen,
    notarBeurkundet,
    notarGeplant,
    aktiveLeads,
    conversionProzent:
      erstgespraecheGesamt > 0
        ? Math.round((davonAbReservierung / erstgespraecheGesamt) * 100)
        : null,
    ueberfaelligeAufgaben,
  };
}
