/**
 * Vergleichslink: zwei bis drei gesendete Exposés in einem Link (25.10.2026).
 *
 * Angelegt wird nur über die Edge Function `kunden-vergleich`, die dieselben
 * Prüfungen macht wie der Exposé-Versand. Hier steht, welche Einträge sich
 * bündeln lassen, und der Aufruf.
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "./edgeFehler";
import { exposeLinkStatus, type GesendetesExpose } from "./objektExposeStore";

export const VERGLEICH_FUNCTION = "kunden-vergleich";
export const VERGLEICH_MIN = 2;
export const VERGLEICH_MAX = 3;

/** Nur aktive Exposés einzelner Einheiten lassen sich vergleichen. */
export function istVergleichbar(e: Pick<GesendetesExpose, "art" | "wohnung_id" | "gueltig_bis" | "zurueckgezogen_am">, jetzt = Date.now()): boolean {
  return e.art === "expose" && !!e.wohnung_id && exposeLinkStatus(e, jetzt) === "aktiv";
}

export interface VergleichErgebnis {
  ok: boolean;
  link: string | null;
  gueltigBis: string | null;
  fehler: string | null;
}

export async function erstelleVergleich(a: { kontaktId: string; investmentId: string; exposeIds: string[] }): Promise<VergleichErgebnis> {
  const { data, error } = await supabase.functions.invoke(VERGLEICH_FUNCTION, { body: a });
  if (error) {
    const mitGrund = (await edgeFehlerMitGrund(error, { functionName: VERGLEICH_FUNCTION })) as Error;
    return { ok: false, link: null, gueltigBis: null, fehler: mitGrund?.message || "Der Vergleich konnte nicht angelegt werden." };
  }
  const antwort = (data ?? {}) as { ok?: boolean; link?: unknown; gueltigBis?: unknown; error?: unknown };
  if (antwort.ok !== true || typeof antwort.link !== "string") {
    return { ok: false, link: null, gueltigBis: null, fehler: typeof antwort.error === "string" ? antwort.error : "Der Vergleich konnte nicht angelegt werden." };
  }
  return { ok: true, link: antwort.link, gueltigBis: typeof antwort.gueltigBis === "string" ? antwort.gueltigBis : null, fehler: null };
}
