/**
 * Der Verlauf der Kennzahlen: heute im Vergleich zu vor einer Woche.
 *
 * WOZU DAS DA IST
 *
 * Bisher kennt das System nur den Jetztzustand. Ueberall steht, wie viele
 * offene Leads es gerade gibt, nirgends steht, wie viele es letzte Woche
 * waren. Eine Zahl ohne Vergleich beantwortet aber keine Frage: 42 offene
 * Leads sind eine Entwarnung, wenn es vor einer Woche 61 waren, und ein Alarm,
 * wenn es 20 waren.
 *
 * Geschrieben wird der Verlauf nachts von einer reinen Datenbankfunktion
 * (Migration 20260908180000_kennzahlen_tagesstand.sql), gelesen wird er hier.
 * Dieses Modul rechnet selbst nichts aus, es liest nur, was in der Nacht
 * festgehalten wurde. Das ist der ganze Sinn der Sache: Waere die Rechnung
 * hier, gaebe es sie zweimal, einmal in SQL und einmal in TypeScript, und die
 * beiden liefen auseinander.
 *
 * Bewusst ein direkter Aufruf und nicht `dataCache`, aus demselben Grund wie
 * in `investmentBerechnungenStore.ts`: Die Tabelle entsteht erst mit der
 * Migration, und eine fehlende Tabelle in der Ladeliste des Zwischenspeichers
 * reisst beim Start den Realtime-Kanal mit. Solange die Migration nicht
 * gelaufen ist, meldet dieses Modul ruhig `migrationFehlt` und gibt eine leere
 * Liste zurueck. Nichts stuerzt ab, die Oberflaeche zeigt einen Hinweis.
 *
 * Die Rechte stehen in der Datenbank, nicht hier: Lesen duerfen die internen
 * Rollen, erzwungen ueber die Zeilensicherheit auf `kennzahlen_tagesstand`.
 * Ein ausgeblendeter Knopf ist keine Zugriffskontrolle.
 */
import { supabase } from "@/integrations/supabase/client";
import { istTabelleUnbekannt } from "@/lib/abwesenheitStore";

export const KENNZAHLEN_MIGRATION = "20260908180000_kennzahlen_tagesstand.sql";

/** Der Hinweis, den die Oberflaeche zeigt, solange der Verlauf fehlt. */
export const KENNZAHLEN_MIGRATION_HINWEIS =
  `Migration ${KENNZAHLEN_MIGRATION} noch nicht ausgeführt. Der Verlauf wird erst ab der ersten Nacht danach mitgeschrieben.`;

/** Die elf Bereiche, genau die Kuerzel aus der Datenbank. */
export const KENNZAHLEN_BEREICHE = [
  "AGL", "OPS", "VL", "HR", "MKT", "OBJ", "BO", "FIN", "AS", "VA", "CTR",
] as const;

export type KennzahlenBereich = typeof KENNZAHLEN_BEREICHE[number];

/** Wie ein Bereich in der Oberflaeche heisst. */
export const BEREICH_LABEL: Record<KennzahlenBereich, string> = {
  AGL: "Assistenz der Geschäftsleitung",
  OPS: "Operative Leitung",
  VL: "Vertriebsleitung",
  HR: "HR und Bewerbermanagement",
  MKT: "Marketing",
  OBJ: "Objektmanagement",
  BO: "Backoffice und Support",
  FIN: "Finanzierung",
  AS: "Aftersales",
  VA: "Vertriebsakademie",
  CTR: "Controlling und Buchhaltung",
};

/**
 * Klartextnamen der Kennzahlen.
 *
 * Die Datenbank kennt nur Kurznamen wie `follow_ups_ueberfaellig`. Eine
 * unbekannte Kennung ist kein Fehler: Kommt in der Datenbank eine Kennzahl
 * dazu, bevor sie hier steht, zeigt die Oberflaeche eben den Kurznamen. Das
 * ist besser, als sie stillschweigend wegzulassen.
 */
export const KENNZAHL_LABEL: Record<string, string> = {
  // AGL
  kontakte_aktiv: "Aktive Kontakte",
  reservierungen_erstellt: "Reservierungen erstellt",
  abschluesse: "Abschlüsse",
  partner_aktiv: "Partner aktiv",
  investments_aktiv: "Aktive Investments",
  // OPS
  aufgaben_offen: "Offene Aufgaben",
  aufgaben_ueberfaellig: "Überfällige Aufgaben",
  follow_ups_offen: "Offene Follow-Ups",
  follow_ups_ueberfaellig: "Überfällige Follow-Ups",
  kontakte_ohne_zustaendigen: "Kontakte ohne Zuständigen",
  nachtpruefung_befunde_offen: "Befunde der Nachtprüfung",
  // VL
  neue_leads: "Neue Leads",
  in_kontakt: "In Kontakt",
  qualifiziert: "Qualifiziert",
  in_abwicklung: "In Abwicklung",
  bestandskunden: "Bestandskunden",
  verloren: "Verloren",
  // HR
  bewerber_gesamt: "Bewerber gesamt",
  bewerber_eingang: "Bewerber im Eingang",
  bewerber_im_prozess: "Bewerber im Prozess",
  bewerber_aktiv: "Bewerber aktiv",
  bewerber_abgelehnt: "Bewerber abgelehnt",
  bewerber_kein_interesse: "Bewerber ohne Interesse",
  // MKT
  leads_quelle_formular_manuell: "Leads aus Formular oder manuell",
  leads_quelle_plattform: "Leads von benannten Plattformen",
  leads_mit_kampagne: "Leads mit Kampagnenkennung",
  leads_mit_utm_campaign: "Leads mit Kampagnennamen",
  // OBJ
  objekte_gesamt: "Objekte gesamt",
  objekte_sichtbar: "Objekte sichtbar",
  wohneinheiten_gesamt: "Wohneinheiten gesamt",
  wohneinheiten_frei: "Wohneinheiten frei",
  wohneinheiten_reserviert: "Wohneinheiten reserviert",
  wohneinheiten_verkauft: "Wohneinheiten verkauft",
  // OBJ, FIN und AS: aus der Objektprüfung des Nachtwächters (Migration
  // 20260924170000), je Bereich dieselben beiden Kurznamen.
  objektdaten_unstimmig: "Objekte mit unstimmigen Daten",
  objektdaten_neu: "Neue Unstimmigkeiten in den Objektdaten",
  // BO
  tickets_gesamt: "Tickets gesamt",
  tickets_neu: "Tickets neu",
  tickets_offen: "Tickets offen",
  tickets_in_bearbeitung: "Tickets in Bearbeitung",
  tickets_erledigt: "Tickets erledigt",
  // FIN
  reservierungen_offen: "Offene Reservierungen",
  bonitaetsunterlagen: "In Bonitätsunterlagen",
  notar: "Beim Notar",
  signaturen_offen: "Offene Unterschriften",
  signaturen_abgelaufen: "Abgelaufene Unterschriften",
  // AS
  empfehlungen_gesamt: "Empfehlungen gesamt",
  empfehlungen_neu: "Empfehlungen neu",
  empfehlungen_abgeschlossen: "Empfehlungen abgeschlossen",
  tippgeber_gesamt: "Tippgeber gesamt",
  vp_bewertungen_gesamt: "Partnerbewertungen",
  kunden_bewertungen_gesamt: "Kundenbewertungen",
  // VA
  partner_mit_fortschritt: "Partner mit Fortschritt",
  kapitel_abgeschlossen: "Abgeschlossene Kapitel",
  aufgaben_geloest: "Gelöste Übungsaufgaben",
  // CTR
  abrechnungen_gesamt: "Abrechnungen gesamt",
  abrechnungen_offen: "Abrechnungen offen",
  abrechnungen_freigegeben: "Abrechnungen freigegeben",
  abrechnungen_ausgezahlt: "Abrechnungen ausgezahlt",
};

export interface KennzahlVerlauf {
  bereich: KennzahlenBereich;
  /** Kurzname aus der Datenbank, etwa "follow_ups_ueberfaellig". */
  kennzahl: string;
  /** Klartextname, oder der Kurzname, wenn es keinen gibt. */
  label: string;
  /** Der letzte festgehaltene Stand, als JJJJ-MM-TT. */
  stichtag: string;
  wert: number;
  /**
   * Der Stand vor sieben Tagen. `null`, solange der Verlauf noch keine Woche
   * alt ist. Dann gibt es nichts zu vergleichen, und das soll man sehen.
   */
  stichtagVorwoche: string | null;
  wertVorwoche: number | null;
  /** Heute minus Vorwoche. `null`, wenn es keinen Vorwochenwert gibt. */
  veraenderung: number | null;
  /**
   * Die Veraenderung in Prozent, gerundet. `null` ohne Vorwochenwert und
   * ebenso, wenn die Vorwoche null war: Von null auf zehn ist keine
   * Steigerung um unendlich Prozent, sondern schlicht ein Zuwachs um zehn.
   */
  veraenderungProzent: number | null;
}

export interface KennzahlenErgebnis {
  kennzahlen: KennzahlVerlauf[];
  /** Die Migration ist noch nicht gelaufen. Die Oberflaeche zeigt dann einen Hinweis. */
  migrationFehlt: boolean;
  fehler: string | null;
}

interface DbFehler {
  code?: string;
  message?: string;
}

/*
 * Die erzeugten Supabase-Typen kennen die neue Funktion noch nicht. Derselbe
 * Behelf wie in `analysetoolEreignisse.ts` und `abwesenheitStore.ts`, bis die
 * Typen neu erzeugt sind.
 */
const db = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbFehler | null }>;
};

/**
 * Fehlt die Funktion selbst, ist die Migration noch nicht gelaufen.
 *
 * Postgres meldet eine unbekannte Funktion als 42883, PostgREST als PGRST202,
 * und wenn nur der Text ankommt, steht dort "Could not find the function".
 * Die fehlende Tabelle deckt `istTabelleUnbekannt` ab, das ist derselbe Fall
 * aus einer anderen Richtung.
 */
export function istMigrationFehlend(fehler: DbFehler | null | undefined): boolean {
  if (!fehler) return false;
  if (fehler.code === "42883" || fehler.code === "PGRST202") return true;
  if (/could not find the function|function .* does not exist/i.test(fehler.message || "")) return true;
  return istTabelleUnbekannt(fehler);
}

function istBereich(wert: unknown): wert is KennzahlenBereich {
  return typeof wert === "string" && (KENNZAHLEN_BEREICHE as readonly string[]).includes(wert);
}

/** Eine Zahl aus der Datenbank. Numeric kann als Text ankommen. */
function zahl(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

function zeileLesen(roh: Record<string, unknown>): KennzahlVerlauf | null {
  const bereich = roh.bereich;
  const kennzahl = roh.kennzahl;
  if (!istBereich(bereich) || typeof kennzahl !== "string" || !kennzahl) return null;

  const wert = zahl(roh.wert_heute);
  if (wert === null) return null;

  const wertVorwoche = zahl(roh.wert_vorwoche);
  const veraenderung = wertVorwoche === null ? null : wert - wertVorwoche;

  return {
    bereich,
    kennzahl,
    label: KENNZAHL_LABEL[kennzahl] || kennzahl,
    stichtag: String(roh.stichtag_heute || ""),
    wert,
    stichtagVorwoche: roh.stichtag_vorwoche ? String(roh.stichtag_vorwoche) : null,
    wertVorwoche,
    veraenderung,
    veraenderungProzent:
      wertVorwoche === null || wertVorwoche === 0 || veraenderung === null
        ? null
        : Math.round((veraenderung / wertVorwoche) * 100),
  };
}

/**
 * Der Verlauf, wahlweise fuer einen Bereich oder fuer alle.
 *
 * Ohne Parameter kommen alle elf Bereiche in einem Aufruf zurueck. Das ist
 * Absicht: Der Lagebericht braucht sie ohnehin alle, und elf einzelne Abfragen
 * waeren elf Runden zum Server.
 */
export async function ladeKennzahlenVerlauf(
  bereich?: KennzahlenBereich,
): Promise<KennzahlenErgebnis> {
  try {
    const { data, error } = await db.rpc("kennzahlen_verlauf", {
      p_bereich: bereich ?? null,
    });

    if (error) {
      if (istMigrationFehlend(error)) {
        return { kennzahlen: [], migrationFehlt: true, fehler: null };
      }
      return { kennzahlen: [], migrationFehlt: false, fehler: error.message || "Unbekannter Fehler" };
    }

    if (!Array.isArray(data)) {
      return { kennzahlen: [], migrationFehlt: false, fehler: null };
    }

    const kennzahlen = (data as Record<string, unknown>[])
      .map(zeileLesen)
      .filter((z): z is KennzahlVerlauf => z !== null);

    return { kennzahlen, migrationFehlt: false, fehler: null };
  } catch (e) {
    // Ein Verlauf ist nie wichtig genug, um eine Seite abzureissen.
    return {
      kennzahlen: [],
      migrationFehlt: false,
      fehler: e instanceof Error ? e.message : "Unbekannter Fehler",
    };
  }
}

/**
 * Derselbe Verlauf, aber nach Bereich sortiert abgelegt.
 *
 * Jeder der elf Bereiche kommt vor, auch wenn er leer ist. Sonst muesste jede
 * Aufrufstelle selbst pruefen, ob der Schluessel existiert, und genau dort
 * entstehen die stillen Luecken.
 */
export function gruppiereNachBereich(
  kennzahlen: KennzahlVerlauf[],
): Record<KennzahlenBereich, KennzahlVerlauf[]> {
  const gruppen = {} as Record<KennzahlenBereich, KennzahlVerlauf[]>;
  for (const bereich of KENNZAHLEN_BEREICHE) gruppen[bereich] = [];
  for (const eintrag of kennzahlen) gruppen[eintrag.bereich].push(eintrag);
  return gruppen;
}

/**
 * Ein Satz, den man vorlesen kann: "42 offene Leads, vor einer Woche 61".
 *
 * Ohne Vorwochenwert bleibt der Vergleich weg, statt eine Null zu behaupten.
 * Gedankenstriche kommen bewusst nicht vor, das gilt im ganzen Projekt fuer
 * Texte, die jemand zu sehen bekommt.
 */
export function verlaufSatz(eintrag: KennzahlVerlauf): string {
  const kopf = `${eintrag.wert} ${eintrag.label}`;
  if (eintrag.wertVorwoche === null) return `${kopf}, kein Vergleichswert von vor einer Woche`;
  return `${kopf}, vor einer Woche ${eintrag.wertVorwoche}`;
}
