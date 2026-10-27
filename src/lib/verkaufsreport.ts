/**
 * Verkaufsreport fuer Geschaeftspartner (Christian, 27.10.2026).
 *
 * Aufbau wie die Excel „Verkaufsreport Eigentumswohnung Durchschnittskaufpreis“:
 * eine Zeile je Vorgang mit den Prozessdaten, darueber der Trichter mit
 * Quoten, Ø Salescycle und Ø Kaufpreis. Was das CRM kennt, wird beim
 * Erstellen eines Stands vorbefuellt (`crm`), alles andere tragen Admin oder
 * Inhaber von Hand ein (`manuell`, geht vor). Handeintraege wandern beim
 * naechsten Stand mit, ebenso Zeilen, die es nur von Hand gibt (Fremdvertrieb).
 *
 * Geschaeftspartner sehen nur veroeffentlichte Staende (Tabelle und Regeln:
 * Migration 20261027150100_verkaufsreport.sql). Bewusst nicht im Report,
 * anders als in der Excel: der Name des Kaufinteressenten.
 */
import { supabase } from "@/integrations/supabase/client";
import { stufeErreicht } from "./pipelineStufen";
import { kveVersandAm, notarDatumIso } from "./notarFristen";

export const VERKAUFSREPORT_ROUTE = "/verkaufsreport";

export const SPALTEN = [
  { key: "weNr", label: "Whg.-Nr." },
  { key: "objekt", label: "Objekt" },
  { key: "stellplatz", label: "Garage/ SP" },
  { key: "erstberatung", label: "Erstberatung am" },
  { key: "zweitberatung", label: "Zweitberatung / Closing am" },
  { key: "reserviert", label: "Reserviert am" },
  { key: "besichtigt", label: "Besichtigt am" },
  { key: "finanzierungEingereicht", label: "Finanzierung eingereicht am" },
  { key: "bank", label: "Wo eingereicht (Bank)" },
  { key: "finanzierungGenehmigt", label: "Finanzierung genehmigt am" },
  { key: "gutachterTermin", label: "Termin Bank-Gutachter" },
  { key: "gutachterBesichtigt", label: "Gutachter besichtigt am" },
  { key: "kve", label: "KVE beantragt / versendet" },
  { key: "beurkundungGeplant", label: "geplante Beurkundung" },
  { key: "notartermin", label: "Terminierter Notartermin" },
  { key: "maengel", label: "Mängel JA / NEIN" },
  { key: "mangelArt", label: "Art des Mangels (Gutachter)" },
  { key: "kaufpreis", label: "Kaufpreis" },
] as const;

export type SpaltenKey = (typeof SPALTEN)[number]["key"];

/** Spalten, die das CRM befuellen kann. Die uebrigen sind reine Eingabefelder. */
export const CRM_SPALTEN: ReadonlySet<SpaltenKey> = new Set<SpaltenKey>([
  "weNr", "objekt", "erstberatung", "zweitberatung", "reserviert", "finanzierungEingereicht", "bank",
  "finanzierungGenehmigt", "gutachterBesichtigt", "kve", "notartermin", "kaufpreis",
]);

export interface ReportZeile {
  /** Investment-ID, bei Handzeilen eine eigene. */
  id: string;
  quelle: "crm" | "manuell";
  crm: Partial<Record<SpaltenKey, string>>;
  manuell: Partial<Record<SpaltenKey, string>>;
}

export interface VerkaufsreportDaten {
  version: 2;
  zeilen: ReportZeile[];
}

/** Angezeigter Wert: Handeintrag vor CRM, auch ein bewusst geleerter. */
export function wert(z: ReportZeile, k: SpaltenKey): string {
  return z.manuell[k] !== undefined ? (z.manuell[k] as string) : (z.crm[k] ?? "");
}

/** Wie DATEVALUE in der Excel: JJJJ-MM-TT oder TT.MM.JJJJ, sonst `null`. */
export const datumIso = (w: string) => notarDatumIso(w);

/**
 * Zaehlt die Zelle als erledigt? Wie in der Excel ein Datum; dazu „Ja“ und
 * „bestätigt“, weil das CRM eine bestaetigte Finanzierung ohne Datum kennt.
 */
export function erledigt(w: string): boolean {
  return datumIso(w) !== null || /^(ja|bestätigt)$/i.test(w.trim());
}

/** Kaufpreis aus „176000“, „176.000“ oder „176.000 €“, sonst `null`. */
export function betrag(w: string): number | null {
  const s = w.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Tage von der Erstberatung bis zum Notartermin, sonst `null`. */
export function salescycle(z: ReportZeile): number | null {
  const von = datumIso(wert(z, "erstberatung"));
  const bis = datumIso(wert(z, "notartermin"));
  if (!von || !bis) return null;
  const tage = (Date.parse(bis) - Date.parse(von)) / 86400000;
  return tage >= 0 ? tage : null;
}

export const TRICHTER: ReadonlyArray<{ label: string; spalte: SpaltenKey | null }> = [
  { label: "Interessenten", spalte: null },
  { label: "Erstberatungen erledigt", spalte: "erstberatung" },
  { label: "Zweitberatungen erledigt", spalte: "zweitberatung" },
  { label: "Reservierungen", spalte: "reserviert" },
  { label: "Besichtigungen erledigt", spalte: "besichtigt" },
  { label: "Finanzierungen eingereicht", spalte: "finanzierungEingereicht" },
  { label: "Finanzierungen bestätigt", spalte: "finanzierungGenehmigt" },
  { label: "Gutachtertermine vereinbart", spalte: "gutachterTermin" },
  { label: "Gutachter besichtigt", spalte: "gutachterBesichtigt" },
  { label: "Notartermine terminiert", spalte: "notartermin" },
];

export interface Kennzahlen {
  trichter: Array<{ label: string; anzahl: number; anteilAller: number | null; anteilVorstufe: number | null }>;
  salescycleTage: number | null;
  kaufpreis: number | null;
  ausgewertet: number;
}

export function kennzahlen(zeilen: ReportZeile[]): Kennzahlen {
  const anzahlen = TRICHTER.map((t) => (t.spalte ? zeilen.filter((z) => erledigt(wert(z, t.spalte!))).length : zeilen.length));
  const quote = (a: number, b: number) => (b > 0 ? a / b : null);
  const zyklen = zeilen.map(salescycle).filter((t): t is number => t !== null);
  const preise = zeilen.map((z) => betrag(wert(z, "kaufpreis"))).filter((p): p is number => p !== null);
  const mittel = (w: number[]) => (w.length ? w.reduce((s, x) => s + x, 0) / w.length : null);
  return {
    trichter: TRICHTER.map((t, i) => ({
      label: t.label,
      anzahl: anzahlen[i],
      anteilAller: i === 0 ? null : quote(anzahlen[i], anzahlen[0]),
      anteilVorstufe: i === 0 ? null : quote(anzahlen[i], anzahlen[i - 1]),
    })),
    salescycleTage: zyklen.length ? Math.round(mittel(zyklen)! * 10) / 10 : null,
    kaufpreis: preise.length ? Math.round(mittel(preise)!) : null,
    ausgewertet: zyklen.length,
  };
}

// ---------------------------------------------------------------------------
// Vorbefuellung aus dem CRM
// ---------------------------------------------------------------------------

export interface ReportVorgang {
  id: string;
  pipelineStufe: string;
  objektTitel?: string;
  weNr?: string;
  kaufpreis?: number;
  /** Beratungspraesentation (frueher Beratungsgespraech), Datum. */
  beratungAm?: string;
  /** Stempel beim Wechsel in „Objektpräsentation / Closing“. */
  closingAm?: string;
  reserviertAm?: string;
  finanzierungSeit?: string;
  finanzierungsStatus?: string;
  finanzierungsBank?: string;
  bankgutachterSeit?: string;
  besichtigungSeit?: string;
  kundenordner?: ReadonlyArray<{ kategorie: string; freigegeben?: boolean; freigegebenAm?: string; uploadedAt?: string }>;
  notarTermin?: string;
  einreichungen?: ReadonlyArray<{ eingereicht_am: string; banken: string[]; status: string; entschieden_am: string | null; angebot: { bank: string } | null }>;
}

const tagIso = (w?: string | null) => (w ? notarDatumIso(w) ?? "" : "");

/** Eine Zeile aus einem Investment; nur Felder, die das CRM sicher kennt. */
export function crmWerte(v: ReportVorgang, heute: string): Partial<Record<SpaltenKey, string>> {
  const e = v.einreichungen || [];
  const zuschlag = e.find((x) => x.status === "zuschlag");
  const eingereicht = e.map((x) => tagIso(x.eingereicht_am)).filter(Boolean).sort()[0] || tagIso(v.finanzierungSeit);
  const banken = zuschlag?.angebot?.bank || [...new Set(e.flatMap((x) => x.banken))].join(" / ") || v.finanzierungsBank || "";
  const beratung = tagIso(v.beratungAm);
  const kve = kveVersandAm(v.kundenordner || []);
  const w: Partial<Record<SpaltenKey, string>> = {
    weNr: v.weNr || "",
    objekt: v.objektTitel || "",
    // Nur eine Beratung, die schon war, zaehlt als erledigt.
    erstberatung: beratung && beratung <= heute ? beratung : "",
    zweitberatung: tagIso(v.closingAm),
    reserviert: tagIso(v.reserviertAm),
    finanzierungEingereicht: eingereicht,
    bank: banken,
    finanzierungGenehmigt: zuschlag?.entschieden_am ? tagIso(zuschlag.entschieden_am)
      : v.finanzierungsStatus === "bestaetigt" ? "bestätigt" : "",
    // „Stattgefunden“ beim Gutachtertermin rueckt auf Besichtigung; ohne
    // vorherige Gutachterstufe ist der Stempel kein Gutachterbesuch.
    gutachterBesichtigt: v.bankgutachterSeit ? tagIso(v.besichtigungSeit) : "",
    kve: kve ? tagIso(kve) : "",
    notartermin: tagIso(v.notarTermin),
    kaufpreis: v.kaufpreis && v.kaufpreis > 0 ? String(Math.round(v.kaufpreis)) : "",
  };
  for (const k of Object.keys(w) as SpaltenKey[]) if (!w[k]) delete w[k];
  return w;
}

/**
 * Neuer Stand: alle Vorgaenge ab der Beratungspraesentation (ohne verlorene,
 * archivierte und den Beispielkunden), Handeintraege und Handzeilen aus dem
 * letzten Stand uebernommen.
 */
export function baueStand(vorgaenge: ReportVorgang[], vorher: VerkaufsreportDaten | null, heute: string): VerkaufsreportDaten {
  const alt = new Map((vorher?.zeilen || []).map((z) => [z.id, z]));
  const crmZeilen: ReportZeile[] = vorgaenge
    .filter((v) => stufeErreicht(v.pipelineStufe, "beratungsgespraech"))
    .map((v) => ({ id: v.id, quelle: "crm", crm: crmWerte(v, heute), manuell: alt.get(v.id)?.manuell || {} }));
  const handZeilen = (vorher?.zeilen || []).filter((z) => z.quelle === "manuell");
  const zeilen = [...crmZeilen, ...handZeilen].sort((a, b) =>
    wert(a, "objekt").localeCompare(wert(b, "objekt"), "de")
    || wert(a, "weNr").localeCompare(wert(b, "weNr"), "de", { numeric: true }));
  return { version: 2, zeilen };
}

/** Staende vor dem Excel-Aufbau hatten ein anderes Format. */
export function istAktuellesFormat(d: unknown): d is VerkaufsreportDaten {
  return !!d && (d as VerkaufsreportDaten).version === 2 && Array.isArray((d as VerkaufsreportDaten).zeilen);
}

// ---------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------

export interface VerkaufsreportStand {
  id: string;
  stand_am: string;
  daten: VerkaufsreportDaten;
  erstellt_am: string;
  veroeffentlicht_am: string | null;
}

// Die Tabelle ist neuer als die erzeugten Supabase-Typen, wie in finanzierungEinreichung.ts.
const db = supabase as unknown as { from: (t: string) => any };

/** Admin und Inhaber bekommen alle Staende, Geschaeftspartner nur veroeffentlichte (Datenbankregel). */
export async function ladeStaende(): Promise<VerkaufsreportStand[]> {
  const { data, error } = await db.from("verkaufsreport_staende").select("*").order("erstellt_am", { ascending: false });
  if (error) throw error;
  return (data || []) as VerkaufsreportStand[];
}

export async function legeStandAn(daten: VerkaufsreportDaten): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende").insert({ daten });
  if (error) throw error;
}

export async function speichereDaten(id: string, daten: VerkaufsreportDaten): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende").update({ daten }).eq("id", id);
  if (error) throw error;
}

export async function veroeffentliche(id: string, ja: boolean): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende")
    .update({ veroeffentlicht_am: ja ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function loescheStand(id: string): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende").delete().eq("id", id);
  if (error) throw error;
}
