/**
 * Die kleine Übersicht der Verwaltungsseite: Trichter und Anforderungen.
 *
 * Über die Datenbankfunktion `handbuch_kennzahlen` (Migration
 * 20260926170000). Sie entscheidet selbst, was jemand sehen darf: Admin und
 * Inhaber alles oder je Partner, alle anderen nur die eigenen Zahlen.
 */
import { supabase } from "@/integrations/supabase/client";

export interface HandbuchKennzahlen {
  tage: number;
  aufrufe: number;
  gestartet: number;
  sechsFragen: number;
  erhalten: number;
  passt: number;
  vielleicht: number;
  nochNicht: number;
  geoeffnet: number;
  pdf: number;
  saGestartet: number;
  saAbgeschickt: number;
  ueberPartner: number;
  ueberFirma: number;
}

export type KennzahlenStand =
  | { status: "ok"; zahlen: HandbuchKennzahlen }
  | { status: "migration" }
  /** Die Übersicht selbst geht, nur „Nur Firmenlink“ braucht Migration 20260926180000. */
  | { status: "migration_firma" }
  | { status: "fehler" };

const zahl = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** Wertet die Antwort aus. Eigene Funktion, damit ein Test sie ohne Netz prüfen kann. */
export function leseKennzahlen(daten: unknown): HandbuchKennzahlen | null {
  if (!daten || typeof daten !== "object") return null;
  const d = daten as Record<string, unknown>;
  const e = (d.ereignisse ?? {}) as Record<string, unknown>;
  const a = (d.anforderungen ?? {}) as Record<string, unknown>;
  return {
    tage: zahl(d.tage),
    aufrufe: zahl(e.hb_seite_geoeffnet),
    gestartet: zahl(e.hb_konfigurator_gestartet),
    sechsFragen: zahl(e.hb_frage_6),
    // Die Anforderungen in der Tabelle sind verlässlicher als der Zähler im
    // Browser (Werbeblocker, abgebrochene Seiten). Der größere Wert zählt.
    erhalten: Math.max(zahl(a.gesamt), zahl(e.hb_handbuch_erhalten)),
    passt: zahl(a.passt),
    vielleicht: zahl(a.vielleicht),
    nochNicht: zahl(a.nochNicht),
    geoeffnet: zahl(a.geoeffnet),
    // Der Vermerk am Handbuch (ab Migration 20260926180000) ist verlässlicher
    // als der Zähler im Browser. Der größere Wert zählt.
    pdf: Math.max(zahl(a.pdfGespeichert), zahl(e.hb_pdf_geladen)),
    saGestartet: zahl(e.hb_sa_gestartet),
    saAbgeschickt: Math.max(zahl(a.saAusgefuellt), zahl(e.hb_sa_abgeschickt)),
    ueberPartner: zahl(a.ueberPartner),
    ueberFirma: zahl(a.ueberFirma),
  };
}

/**
 * `nurFirma`: nur Anfragen und Ereignisse ohne Partner (Firmenlink). Den
 * Parameter kennt die Funktion erst ab Migration 20260926180000; ohne ihn
 * bleibt der Aufruf wie bisher, damit die Übersicht vorher weiter geht.
 */
export async function ladeHandbuchKennzahlen(tage: number, beraterId: string | null, nurFirma = false): Promise<KennzahlenStand> {
  try {
    const parameter: Record<string, unknown> = { p_tage: tage, p_berater_id: beraterId };
    if (nurFirma) parameter.p_nur_firma = true;
    const { data, error } = await supabase.rpc("handbuch_kennzahlen" as never, parameter as never);
    if (error) {
      const msg = String((error as { message?: string }).message || "");
      const code = (error as { code?: string }).code;
      const fehlt = code === "PGRST202" || code === "42883" || code === "42P01" || msg.includes("Could not find the function") || msg.includes("does not exist");
      if (fehlt) return nurFirma ? { status: "migration_firma" } : { status: "migration" };
      return { status: "fehler" };
    }
    const zahlen = leseKennzahlen(data);
    return zahlen ? { status: "ok", zahlen } : { status: "fehler" };
  } catch {
    return { status: "fehler" };
  }
}
