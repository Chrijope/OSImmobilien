/**
 * Ein Kunde, mehrere Finanzierer (Christian, 27.10.2026).
 *
 * Je Investment und Finanzierer eine Einreichung mit eigenem Stand, eigener
 * Frist, eigenem Angebot und eigenen Zielbanken. Tabelle und Rechte stehen in
 * `supabase/migrations/20261027120000_finanzierung_einreichungen.sql`; dort ist
 * auch geregelt, dass ein Finanzierer nur seine eigene Einreichung sieht und
 * die Zielbanken nur admin, inhaber, backoffice und (seit 28.10.2026,
 * `20261028120000_finanzierung_chat_verlauf.sql`) die Vertriebsleitung.
 *
 * Diese Datei haelt die reinen Rechnungen (Vergleich, Bankenkollision,
 * Kennzahlen) und die wenigen Datenbankaufrufe.
 */
import { supabase } from "@/integrations/supabase/client";

export type EinreichungStatus =
  | "eingereicht" | "in_pruefung" | "rueckfrage" | "angebot"
  | "zuschlag" | "abgelehnt" | "abgesagt" | "zurueckgezogen";

/** Die Felder, an denen sich Angebote vergleichen lassen. Alle Pflicht. */
export interface EinreichungAngebot {
  bank: string;
  summe: number;
  sollzins: number;
  effektivzins: number;
  zinsbindungJahre: number;
  tilgung: number;
  bereitstellungszinsfreiMonate: number;
  sondertilgung: string;
  gueltigBis: string;
  anmerkungen?: string;
}

export interface Einreichung {
  id: string;
  investment_id: string;
  finanzierer_id: string;
  status: EinreichungStatus;
  frist_bis: string | null;
  banken: string[];
  angebot: EinreichungAngebot | null;
  angebot_datei: string | null;
  grund: string | null;
  eingereicht_am: string;
  gesichtet_am: string | null;
  angebot_am: string | null;
  entschieden_am: string | null;
}

export interface EinreichungNachricht {
  id: string;
  einreichung_id: string;
  von: string;
  text: string;
  nachforderung: boolean;
  erstellt_am: string;
}

export const STATUS_TEXT: Record<EinreichungStatus, string> = {
  eingereicht: "Eingereicht",
  in_pruefung: "In Prüfung",
  rueckfrage: "Rückfrage",
  angebot: "Angebot liegt vor",
  zuschlag: "Zuschlag",
  abgelehnt: "Abgelehnt",
  abgesagt: "Anderweitig vergeben",
  zurueckgezogen: "Zurückgezogen",
};

export const LAUFEND: readonly EinreichungStatus[] = ["eingereicht", "in_pruefung", "rueckfrage", "angebot"];

export function laeuft(e: Pick<Einreichung, "status">): boolean {
  return LAUFEND.includes(e.status);
}

/**
 * Wer den Zuschlag gibt und Einreichungen zurueckzieht. Gleiche Liste wie
 * `darf_finanzierung_steuern`. Einreichen darf zusaetzlich die Vertriebsleitung
 * (`FINANZIERUNG_MELDEN_ROLLEN`).
 */
export function darfFinanzierungSteuern(rolle: string | null | undefined): boolean {
  return rolle === "admin" || rolle === "inhaber" || rolle === "backoffice";
}

/**
 * Wer alle Einreichungen, Zielbanken und den Angebotsvergleich sieht. Gleiche
 * Liste wie `darf_finanzierung_einsehen`: die Steuernden und die
 * Vertriebsleitung (Christian, 28.10.2026).
 */
export function darfFinanzierungEinsehen(rolle: string | null | undefined): boolean {
  return darfFinanzierungSteuern(rolle) || rolle === "vertriebsleiter";
}

/** Monatsrate aus Summe, Sollzins und anfänglicher Tilgung, wie `monatsrateAusAngebot`. */
export function monatsrate(a: Pick<EinreichungAngebot, "summe" | "sollzins" | "tilgung">): number {
  const summe = Number(a.summe) || 0;
  return summe > 0 ? summe * ((Number(a.sollzins) || 0) + (Number(a.tilgung) || 0)) / 100 / 12 : 0;
}

/** Fehlende Pflichtangaben eines Angebots, als Anzeigenamen. */
export function fehlendeAngaben(a: Partial<EinreichungAngebot>, mitDatei: boolean): string[] {
  const fehlt: string[] = [];
  const zahl = (v: unknown) => typeof v === "number" && isFinite(v) && v > 0;
  if (!a.bank?.trim()) fehlt.push("Bank");
  if (!zahl(a.summe)) fehlt.push("Darlehenssumme");
  if (!zahl(a.sollzins)) fehlt.push("Sollzins");
  if (!zahl(a.effektivzins)) fehlt.push("Effektivzins");
  if (!zahl(a.zinsbindungJahre)) fehlt.push("Sollzinsbindung");
  if (!zahl(a.tilgung)) fehlt.push("Tilgung");
  if (typeof a.bereitstellungszinsfreiMonate !== "number" || !(a.bereitstellungszinsfreiMonate >= 0)) fehlt.push("Bereitstellungszinsfreie Zeit");
  if (!a.sondertilgung?.trim()) fehlt.push("Sondertilgung");
  if (!a.gueltigBis) fehlt.push("Gültig bis");
  if (!mitDatei) fehlt.push("Angebot als PDF");
  return fehlt;
}

/** Angebote zum Vergleich, günstigster Effektivzins zuerst. */
export function angeboteImVergleich(liste: Einreichung[]): Einreichung[] {
  return liste
    .filter((e) => e.angebot && (e.status === "angebot" || e.status === "zuschlag"))
    .sort((a, b) => (a.angebot!.effektivzins || Infinity) - (b.angebot!.effektivzins || Infinity));
}

/**
 * Nach dem Zuschlag bleibt nur das gewonnene Angebot sichtbar, alle anderen
 * Angebote wandern in den Verlauf (Christian, 28.10.2026). Nichts wird
 * geloescht. Ohne Zuschlag stehen alle Angebote im Vergleich.
 */
export function angeboteNachZuschlag(liste: Einreichung[]): { sichtbar: Einreichung[]; verlauf: Einreichung[] } {
  const alle = liste
    .filter((e) => e.angebot)
    .sort((a, b) => (a.angebot!.effektivzins || Infinity) - (b.angebot!.effektivzins || Infinity));
  if (!liste.some((e) => e.status === "zuschlag")) {
    return { sichtbar: angeboteImVergleich(liste), verlauf: [] };
  }
  return {
    sichtbar: alle.filter((e) => e.status === "zuschlag"),
    verlauf: alle.filter((e) => e.status !== "zuschlag"),
  };
}

function bankSchluessel(bank: string): string {
  return bank.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Banken, bei denen mehr als ein Finanzierer desselben Kunden anfragt. Die
 * Bank saehe sonst zwei Anfragen fuer denselben Kunden. Nur laufende
 * Einreichungen zaehlen.
 */
export function bankenKollisionen(liste: Einreichung[]): Map<string, string[]> {
  const jeBank = new Map<string, { name: string; finanzierer: Set<string> }>();
  for (const e of liste) {
    if (!laeuft(e) && e.status !== "zuschlag") continue;
    for (const bank of e.banken || []) {
      const s = bankSchluessel(bank);
      if (!s) continue;
      const eintrag = jeBank.get(s) || { name: bank.trim(), finanzierer: new Set<string>() };
      eintrag.finanzierer.add(e.finanzierer_id);
      jeBank.set(s, eintrag);
    }
  }
  const ergebnis = new Map<string, string[]>();
  for (const { name, finanzierer } of jeBank.values()) {
    if (finanzierer.size > 1) ergebnis.set(name, [...finanzierer]);
  }
  return ergebnis;
}

/** Ampel zur Frist: rot überfällig, gelb heute oder morgen, sonst grün. */
export function fristAmpel(e: Pick<Einreichung, "status" | "frist_bis">, heute = new Date()): "rot" | "gelb" | "gruen" | null {
  if (!e.frist_bis || !["eingereicht", "in_pruefung", "rueckfrage"].includes(e.status)) return null;
  const tag = heute.toISOString().slice(0, 10);
  const morgen = new Date(heute.getTime() + 86400000).toISOString().slice(0, 10);
  if (e.frist_bis < tag) return "rot";
  if (e.frist_bis <= morgen) return "gelb";
  return "gruen";
}

export interface FinanziererKennzahlen {
  finanziererId: string;
  eingereicht: number;
  /** Mittlere Stunden bis zur ersten Reaktion (gesichtet oder Stand gesetzt). */
  reaktionStunden: number | null;
  /** Anteil der Einreichungen mit Angebot, 0 bis 1. */
  angebotsquote: number | null;
  /** Anteil der Angebote mit Zuschlag, 0 bis 1. */
  zusagequote: number | null;
  besterEffektivzins: number | null;
  /** Summe der Darlehen mit Zuschlag. */
  volumen: number;
  laufend: number;
}

export function kennzahlenJeFinanzierer(liste: Einreichung[]): FinanziererKennzahlen[] {
  const gruppen = new Map<string, Einreichung[]>();
  for (const e of liste) gruppen.set(e.finanzierer_id, [...(gruppen.get(e.finanzierer_id) || []), e]);
  return [...gruppen.entries()].map(([finanziererId, eigene]) => {
    const reaktionen = eigene
      .map((e) => {
        const erste = e.gesichtet_am || e.angebot_am || e.entschieden_am;
        return erste ? (new Date(erste).getTime() - new Date(e.eingereicht_am).getTime()) / 3600000 : null;
      })
      .filter((h): h is number => h !== null && h >= 0);
    // Zurueckgezogene zaehlen nicht gegen den Finanzierer.
    const gewertet = eigene.filter((e) => e.status !== "zurueckgezogen");
    const mitAngebot = eigene.filter((e) => e.angebot_am || e.status === "zuschlag");
    const zuschlaege = eigene.filter((e) => e.status === "zuschlag");
    const zinsen = mitAngebot.map((e) => e.angebot?.effektivzins).filter((z): z is number => typeof z === "number" && z > 0);
    return {
      finanziererId,
      eingereicht: eigene.length,
      reaktionStunden: reaktionen.length ? reaktionen.reduce((s, h) => s + h, 0) / reaktionen.length : null,
      angebotsquote: gewertet.length ? mitAngebot.length / gewertet.length : null,
      zusagequote: mitAngebot.length ? zuschlaege.length / mitAngebot.length : null,
      besterEffektivzins: zinsen.length ? Math.min(...zinsen) : null,
      volumen: zuschlaege.reduce((s, e) => s + (Number(e.angebot?.summe) || 0), 0),
      laufend: eigene.filter(laeuft).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------

/*
 * Die Tabellen sind neuer als die erzeugten Supabase-Typen. Statt die ganze
 * Typdatei neu zu erzeugen, gehen die Aufrufe hier ohne Tabellentyp.
 */
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

export async function ladeEinreichungen(investmentId?: string): Promise<Einreichung[]> {
  let q = db.from("finanzierung_einreichungen").select("*").order("eingereicht_am", { ascending: true });
  if (investmentId) q = q.eq("investment_id", investmentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Einreichung[];
}

export async function aendereEinreichung(id: string, aenderung: Partial<Einreichung>): Promise<void> {
  const { error } = await db.from("finanzierung_einreichungen").update(aenderung).eq("id", id);
  if (error) throw error;
}

export async function gibZuschlag(id: string): Promise<void> {
  const { error } = await db.rpc("finanzierung_zuschlag", { _einreichung_id: id });
  if (error) throw error;
}

export async function ladeNachrichten(einreichungId: string): Promise<EinreichungNachricht[]> {
  const { data, error } = await db.from("finanzierung_nachrichten").select("*")
    .eq("einreichung_id", einreichungId).order("erstellt_am", { ascending: true });
  if (error) throw error;
  return (data || []) as EinreichungNachricht[];
}

export async function schreibeNachricht(einreichungId: string, text: string, nachforderung: boolean): Promise<void> {
  const { error } = await db.from("finanzierung_nachrichten").insert({ einreichung_id: einreichungId, text, nachforderung });
  if (error) throw error;
}

/** Ein Angebot, das beim Zuschlag aus der Finanzierung in den Verlauf kam. */
export interface VerlaufAngebot {
  id: string;
  investment_id: string;
  angebot: { label?: string; bank?: string; summe?: number; zins?: string; tilgung?: string; laufzeit?: string; anmerkungen?: string };
  archiviert_am: string;
}

/** Angebote im Verlauf. Der Finanzierer bekommt von der Datenbank keine Zeile. */
export async function ladeAngebotsVerlauf(investmentId: string): Promise<VerlaufAngebot[]> {
  const { data, error } = await db.from("finanzierung_angebote_verlauf").select("id, investment_id, angebot, archiviert_am")
    .eq("investment_id", investmentId).order("archiviert_am", { ascending: true });
  if (error) throw error;
  return (data || []) as VerlaufAngebot[];
}

/** Wer welche Unterlagen geladen hat. Fehler hier halten den Download nicht auf. */
export function protokolliereZugriff(investmentId: string, aktion: string): void {
  void db.from("finanzierung_zugriffe").insert({ investment_id: investmentId, aktion }).then(
    ({ error }: { error: unknown }) => { if (error) console.warn("[Finanzierung] Zugriff nicht protokolliert", error); },
  );
}

export async function ladeZugriffe(investmentId: string): Promise<Array<{ user_id: string; aktion: string; am: string }>> {
  const { data, error } = await db.from("finanzierung_zugriffe").select("user_id, aktion, am")
    .eq("investment_id", investmentId).order("am", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}
