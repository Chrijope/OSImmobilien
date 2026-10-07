/**
 * Der Einstieg in die Selbstauskunft über das Handbuch-Token
 * (`/handbuch/ergebnis/:token/selbstauskunft`, seit dem 28.09.2026).
 *
 * Die Datenbankfunktion `handbuch_sa_starten` (Migration 20260928200000) legt
 * einen frischen Ausfüll-Link für den Lead dieses Handbuchs an und gibt nur
 * dessen Token zurück. Vorbelegt sind Name und zwei Antworten aus dem
 * Konfigurator, nie etwas Gespeichertes. So darf der Link ins PDF.
 *
 * Fehlt die Funktion noch, bleibt es beim bisherigen Weg: der gespeicherte
 * Link aus `handbuch_abrufen`, ohne ihn die offene Selbstauskunft.
 */
import { supabase } from "@/integrations/supabase/client";
import { ladeHandbuch } from "./abruf";
import { istHandbuchToken } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

export type SaStart =
  | { status: "ok"; saToken: string }
  | { status: "liegtVor" | "abgelaufen" | "unbekannt" | "zuOft" | "fehler" };

/** Ausfüll-Links entstehen mit `encode(gen_random_bytes(32), 'hex')`. */
const SA_TOKEN = /^[0-9a-f]{64}$/;

/** Wertet die Antwort von `handbuch_sa_starten` aus. Eigene Funktion, damit ein Test sie ohne Netz prüft. */
export function leseSaStart(daten: unknown): SaStart {
  const d = daten && typeof daten === "object" ? (daten as Record<string, unknown>) : {};
  switch (d.status) {
    case "ok":
      return typeof d.saToken === "string" && SA_TOKEN.test(d.saToken) ? { status: "ok", saToken: d.saToken } : { status: "fehler" };
    case "liegt_vor":
      return { status: "liegtVor" };
    case "abgelaufen":
      return { status: "abgelaufen" };
    case "zu_oft":
      return { status: "zuOft" };
    case "unbekannt":
      return { status: "unbekannt" };
    default:
      return { status: "fehler" };
  }
}

/** Die Funktion gibt es noch nicht (Migration nicht gelaufen). Nur dann gilt der alte Weg. */
function funktionFehlt(fehler: unknown): boolean {
  const f = (fehler ?? {}) as { code?: unknown; message?: unknown };
  return f.code === "PGRST202" || f.code === "42883" || /could not find the function/i.test(String(f.message ?? ""));
}

export async function starteHandbuchSelbstauskunft(token: string): Promise<SaStart> {
  if (!istHandbuchToken(token)) return { status: "unbekannt" };
  try {
    const { data, error } = await supabase.rpc("handbuch_sa_starten" as never, { _token: token } as never);
    if (!error) return leseSaStart(data);
    if (!funktionFehlt(error)) return { status: "fehler" };
  } catch {
    return { status: "fehler" };
  }
  // Ohne Migration 20260928200000: der bisherige Weg.
  const abruf = await ladeHandbuch(token);
  if (abruf.status === "abgelaufen") return { status: "abgelaufen" };
  if (abruf.status === "fehler") return { status: "fehler" };
  if (abruf.status !== "ok") return { status: "unbekannt" };
  if (abruf.saToken) return { status: "ok", saToken: abruf.saToken };
  if (abruf.saStatus === "ausgefuellt") return { status: "liegtVor" };
  return { status: "unbekannt" };
}
