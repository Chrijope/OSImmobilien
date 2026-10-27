/**
 * Verkaufsreport fuer Geschaeftspartner (Christian, 27.10.2026).
 *
 * Ersetzt die Excel „Verkaufsreport Eigentumswohnung Durchschnittskaufpreis“.
 * Admin oder Inhaber erstellt einen Stand aus den CRM-Daten, prueft ihn und
 * veroeffentlicht ihn; Geschaeftspartner sehen nur veroeffentlichte Staende
 * (Tabelle und Regeln: Migration 20261027150100_verkaufsreport.sql).
 *
 * Bewusst nicht im Report: Kundennamen, Bank, Berater, Provision,
 * Einkaufspreis. `berechneVerkaufsreport` bekommt deshalb nur Objekte,
 * Einheiten und Investments ohne Kontakt und gibt nur Zahlen zurueck.
 */
import { supabase } from "@/integrations/supabase/client";
import { istEndzustand, stufeErreicht } from "./pipelineStufen";

export const VERKAUFSREPORT_ROUTE = "/verkaufsreport";

export interface ReportEinheit {
  weNr: string;
  groesse: number;
  vkGesamt: number;
  status: "frei" | "reserviert" | "verkauft";
  /** Klartext aus Investagon (z. B. „Notartermin“), sonst leer. */
  statusText?: string;
}

export interface ReportObjekt {
  id: string;
  titel: string;
  wohnungen: ReportEinheit[];
}

export interface ReportInvestment {
  objektId?: string;
  pipelineStufe: string;
  finanzierungsStatus?: string;
  notarTermin?: string;
  /** `meta.reserviertAm`, gesetzt beim Wechsel in die Stufe Reservierung. */
  reserviertAm?: string;
}

export interface VerkaufsreportDaten {
  kacheln: {
    durchschnittKaufpreis: number | null;
    kaufpreisVon: number | null;
    kaufpreisBis: number | null;
    durchschnittQmPreis: number | null;
    reserviert: number;
    verkauft: number;
    /** Tage von der Reservierung bis zum Notartermin. */
    durchschnittVerkaufsdauerTage: number | null;
  };
  trichter: Array<{ stufe: string; anzahl: number }>;
  objekte: Array<{
    titel: string;
    gesamt: number;
    frei: number;
    reserviert: number;
    verkauft: number;
    durchschnittKaufpreis: number | null;
    durchschnittQmPreis: number | null;
    einheiten: Array<{ weNr: string; groesse: number; kaufpreis: number; qmPreis: number | null; stand: string }>;
  }>;
}

const STAND_TEXT = { frei: "Frei", reserviert: "Reserviert", verkauft: "Verkauft" } as const;

const mittel = (werte: number[]) => (werte.length ? werte.reduce((s, w) => s + w, 0) / werte.length : null);
const runde = (w: number | null) => (w === null ? null : Math.round(w));

/** Kalendertage zwischen zwei Datumsangaben (JJJJ-MM-TT am Anfang), sonst `null`. */
function tageZwischen(von?: string, bis?: string): number | null {
  if (!von || !bis || !/^\d{4}-\d{2}-\d{2}/.test(von) || !/^\d{4}-\d{2}-\d{2}/.test(bis)) return null;
  const tage = (Date.parse(bis.slice(0, 10)) - Date.parse(von.slice(0, 10))) / 86400000;
  return Number.isFinite(tage) && tage >= 0 ? tage : null;
}

export function berechneVerkaufsreport(objekte: ReportObjekt[], investments: ReportInvestment[]): VerkaufsreportDaten {
  // Nur Objekte, in denen sich etwas bewegt: verkaufte oder reservierte
  // Einheiten oder ein Investment ab Reservierung. Sonst staenden alle
  // importierten Fremdangebote im Report.
  const mitInvestment = new Set(
    investments.filter((i) => i.objektId && stufeErreicht(i.pipelineStufe, "reservierung")).map((i) => i.objektId!),
  );
  const relevant = objekte.filter((o) => mitInvestment.has(o.id) || o.wohnungen.some((w) => w.status !== "frei"));

  const vergeben = relevant.flatMap((o) => o.wohnungen).filter((w) => w.status !== "frei" && w.vkGesamt > 0);
  const preise = vergeben.map((w) => w.vkGesamt);
  const qmPreise = vergeben.filter((w) => w.groesse > 0).map((w) => w.vkGesamt / w.groesse);
  const dauer = investments
    .map((i) => tageZwischen(i.reserviertAm, i.notarTermin))
    .filter((t): t is number => t !== null);

  const zaehle = (bedingung: (i: ReportInvestment) => boolean) => investments.filter(bedingung).length;

  return {
    kacheln: {
      durchschnittKaufpreis: runde(mittel(preise)),
      kaufpreisVon: preise.length ? Math.min(...preise) : null,
      kaufpreisBis: preise.length ? Math.max(...preise) : null,
      durchschnittQmPreis: runde(mittel(qmPreise)),
      reserviert: relevant.flatMap((o) => o.wohnungen).filter((w) => w.status === "reserviert").length,
      verkauft: relevant.flatMap((o) => o.wohnungen).filter((w) => w.status === "verkauft").length,
      durchschnittVerkaufsdauerTage: dauer.length ? Math.round((mittel(dauer) as number) * 10) / 10 : null,
    },
    // Laufende Vorgaenge: Verlorene, archivierte und importierte zaehlen in
    // keiner Stufe, so bleibt der Trichter in sich stimmig.
    trichter: [
      { stufe: "Interessenten", anzahl: zaehle((i) => !istEndzustand(i.pipelineStufe)) },
      { stufe: "Erstberatung", anzahl: zaehle((i) => stufeErreicht(i.pipelineStufe, "erstgespraech_geplant")) },
      { stufe: "Reservierung", anzahl: zaehle((i) => stufeErreicht(i.pipelineStufe, "reservierung")) },
      { stufe: "Finanzierung eingereicht", anzahl: zaehle((i) => stufeErreicht(i.pipelineStufe, "finanzierung")) },
      { stufe: "Finanzierung bestätigt", anzahl: zaehle((i) => i.finanzierungsStatus === "bestaetigt") },
      { stufe: "Notar", anzahl: zaehle((i) => stufeErreicht(i.pipelineStufe, "notar")) },
    ],
    objekte: relevant
      .map((o) => {
        const vergebenHier = o.wohnungen.filter((w) => w.status !== "frei" && w.vkGesamt > 0);
        return {
          titel: o.titel,
          gesamt: o.wohnungen.length,
          frei: o.wohnungen.filter((w) => w.status === "frei").length,
          reserviert: o.wohnungen.filter((w) => w.status === "reserviert").length,
          verkauft: o.wohnungen.filter((w) => w.status === "verkauft").length,
          durchschnittKaufpreis: runde(mittel(vergebenHier.map((w) => w.vkGesamt))),
          durchschnittQmPreis: runde(mittel(vergebenHier.filter((w) => w.groesse > 0).map((w) => w.vkGesamt / w.groesse))),
          einheiten: [...o.wohnungen]
            .sort((a, b) => a.weNr.localeCompare(b.weNr, "de", { numeric: true }))
            .map((w) => ({
              weNr: w.weNr,
              groesse: w.groesse,
              kaufpreis: w.vkGesamt,
              qmPreis: w.groesse > 0 && w.vkGesamt > 0 ? Math.round(w.vkGesamt / w.groesse) : null,
              stand: w.statusText || STAND_TEXT[w.status],
            })),
        };
      })
      .sort((a, b) => a.titel.localeCompare(b.titel, "de")),
  };
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

export async function veroeffentliche(id: string, ja: boolean): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende")
    .update({ veroeffentlicht_am: ja ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function loescheStand(id: string): Promise<void> {
  const { error } = await db.from("verkaufsreport_staende").delete().eq("id", id);
  if (error) throw error;
}
