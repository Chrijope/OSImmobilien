/**
 * Lädt für die Seite „Partner werden“ die Zahl der Objekte je Standort aus
 * der öffentlichen Edge Function `partner-standorte`.
 *
 * Scheitert der Abruf, ist die Function noch nicht ausgerollt oder kommt
 * etwas Unerwartetes zurück, heißt das Ergebnis `null`. Die Seite zeigt dann
 * die Standorte ohne Zahl, ohne Platzhalter und ohne Fehlermeldung.
 */
import { projektUrl } from "@/lib/handbuch/leadAbsenden";
import { leseStandortZahlen, type PartnerStandort } from "../../../supabase/functions/_shared/partner-standorte.ts";

export type StandortZahlen = Partial<Record<PartnerStandort, number>>;

export async function ladeStandortZahlen(signal?: AbortSignal): Promise<StandortZahlen | null> {
  try {
    const res = await fetch(`${projektUrl()}/partner-standorte`, { signal });
    if (!res.ok) return null;
    return leseStandortZahlen(await res.json());
  } catch {
    return null;
  }
}

/** „12 Objekte im Angebot“, „1 Objekt im Angebot“; ohne Zahl oder bei 0 nichts. */
export function objekteSatz(anzahl: number | undefined, eins: string, viele: string): string | null {
  if (typeof anzahl !== "number" || anzahl <= 0) return null;
  return `${anzahl} ${anzahl === 1 ? eins : viele}`;
}
