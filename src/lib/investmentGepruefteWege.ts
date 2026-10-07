/**
 * Die geprüften Wege für geschützte Investment-Felder (seit 30.09.2026).
 *
 * Christians Grundsatz: Nur Admin und Inhaber schreiben Unterschrift,
 * Geldeingang und Abwicklung direkt, alle anderen über eine Datenbankfunktion,
 * die selbst prüft. Die Migration 20260930110000_absicherung_geld_vertraege
 * legt diese Funktionen an und verwirft danach direkte Schreibversuche still.
 *
 * Solange die Migration nicht gelaufen ist, gibt es die Funktionen nicht.
 * Dann meldet der Aufruf `alterWeg`, und der Aufrufer schreibt wie bisher.
 * Jeder andere Fehler ist ein echter und wird geworfen.
 */
import { supabase } from "@/integrations/supabase/client";
import { funktionFehlt } from "./buchungStore";

/** Die Datenbank hat die Aktion abgelehnt; die Meldung ist für Nutzer gedacht. */
export class AktionVerweigert extends Error {}

export type WegErgebnis = "ok" | "alterWeg";

async function aufrufenMitRueckgabe(funktion: string, argumente: Record<string, unknown>): Promise<{ weg: WegErgebnis; daten: unknown }> {
  const { data, error } = await supabase.rpc(funktion as never, argumente as never);
  if (!error) return { weg: "ok", daten: data };
  if (funktionFehlt(error)) return { weg: "alterWeg", daten: null };
  // 42501 setzen die Funktionen bei jeder Ablehnung, mit einem Satz für Nutzer.
  if ((error as { code?: string }).code === "42501") throw new AktionVerweigert(error.message);
  throw error;
}

async function aufrufen(funktion: string, argumente: Record<string, unknown>): Promise<WegErgebnis> {
  return (await aufrufenMitRueckgabe(funktion, argumente)).weg;
}

/** Selbstauskunft auf Papier hochgeladen (mit Pfad) oder freigegeben (ohne). */
export function saPdfVermerken(investmentId: string, dateiname: string, papierPfad?: string): Promise<WegErgebnis> {
  return aufrufen("investment_sa_pdf_vermerken", {
    _investment_id: investmentId,
    _dateiname: dateiname,
    _papier_pfad: papierPfad || null,
  });
}

/** Kaufpreiseingang, Grundbuch, Provisionsrechnung, Auszahlung. */
export function abwicklungSpeichern(investmentId: string, daten: Record<string, unknown>): Promise<WegErgebnis> {
  return aufrufen("investment_abwicklung_speichern", { _investment_id: investmentId, _daten: daten });
}

/**
 * Wie `abwicklungSpeichern`, mit dem meta, das die Datenbank zurückgibt.
 * Die Funktion verwirft Geldfelder still, wenn der Aufrufer sie nicht setzen
 * darf; nur die Rückgabe zeigt, was wirklich gespeichert ist.
 */
export async function abwicklungSpeichernMitStand(
  investmentId: string,
  daten: Record<string, unknown>,
): Promise<{ weg: WegErgebnis; meta: Record<string, unknown> | null }> {
  const { weg, daten: rueckgabe } = await aufrufenMitRueckgabe("investment_abwicklung_speichern", { _investment_id: investmentId, _daten: daten });
  const meta = rueckgabe && typeof rueckgabe === "object" && !Array.isArray(rueckgabe) ? (rueckgabe as Record<string, unknown>) : null;
  return { weg, meta };
}

/** Investment löschen; Partner nur vor der Reservierung. */
export function investmentLoeschen(investmentId: string): Promise<WegErgebnis> {
  return aufrufen("investment_loeschen", { _investment_id: investmentId });
}
