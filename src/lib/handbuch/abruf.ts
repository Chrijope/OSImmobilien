/**
 * Abruf eines gespeicherten Handbuchs über das persönliche Token.
 *
 * Einzige Tür ist die Datenbankfunktion `handbuch_abrufen` (Migration
 * 20260926170000). Sie liefert nur, was die Ergebnisseite braucht: Vorname,
 * Nachname, Antworten, Ausgang, Kürzel des Partners, den offenen
 * Selbstauskunft-Link. Keine E-Mail, keine Telefonnummer.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  istHandbuchToken,
  pruefeAntworten,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

export type HandbuchAbruf =
  | { status: "ok"; vorname: string; nachname: string; antworten: HandbuchAntworten; erstelltAm: string | null; beraterSlug: string | null; saToken: string | null; saStatus: "offen" | "ausgefuellt" | "abgelaufen" | null }
  | { status: "abgelaufen"; vorname: string }
  | { status: "unbekannt" }
  | { status: "fehler" };

/** Wertet die Antwort der Datenbankfunktion aus. Eigene Funktion, damit ein Test sie ohne Netz prüfen kann. */
export function leseAbruf(daten: unknown): HandbuchAbruf {
  if (!daten || typeof daten !== "object") return { status: "unbekannt" };
  const d = daten as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  if (d.abgelaufen === true) return { status: "abgelaufen", vorname: text(d.vorname) };
  const antworten = pruefeAntworten(d.antworten);
  if (!antworten) return { status: "fehler" };
  const sa = text(d.saStatus);
  return {
    status: "ok",
    vorname: text(d.vorname),
    nachname: text(d.nachname),
    antworten,
    erstelltAm: text(d.erstelltAm) || null,
    beraterSlug: text(d.beraterSlug) || null,
    saToken: text(d.saToken) || null,
    saStatus: sa === "offen" || sa === "ausgefuellt" || sa === "abgelaufen" ? sa : null,
  };
}

export async function ladeHandbuch(token: string): Promise<HandbuchAbruf> {
  if (!istHandbuchToken(token)) return { status: "unbekannt" };
  try {
    const { data, error } = await supabase.rpc("handbuch_abrufen" as never, { _token: token } as never);
    if (error) return { status: "fehler" };
    return leseAbruf(data);
  } catch {
    return { status: "fehler" };
  }
}

/**
 * Vermerkt am gespeicherten Handbuch, dass das PDF geladen wurde (Stand
 * „PDF gespeichert“ in der Lead-Verwaltung). Über die Datenbankfunktion
 * `handbuch_pdf_gespeichert` (Migration 20260926180000), die nur mit dem
 * Token arbeitet. Fehlt sie noch, geschieht nichts.
 */
export async function merkePdfGespeichert(token: string): Promise<void> {
  if (!istHandbuchToken(token)) return;
  try {
    await supabase.rpc("handbuch_pdf_gespeichert" as never, { _token: token } as never);
  } catch {
    /* Ein Vermerk darf nie den Ablauf stören. */
  }
}
