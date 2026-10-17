import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveVersion } from "@/hooks/useLiveData";

/*
 * Ist-Kaltmiete, Mietbeginn und Befristung je Einheit, ohne Personenbezug
 * (17.10.2026). Für Objekt- und Einheitenseite: Dort sehen auch
 * Vertriebspartner Mietgarantie und Ist-Miete, aber nie den Mieter. Die
 * Datenbankfunktion `mietkennzahlen_je_einheit` gibt nur diese drei Werte
 * heraus; die Tabelle `mieter` bleibt für Vertriebspartner gesperrt.
 */

export interface MietKennzahl {
  kaltmiete: number;
  mietbeginn: string;
  befristetBis: string;
}

type Zeile = { wohnung_id: string; kaltmiete: number | string | null; mietbeginn: string | null; befristet_bis: string | null };

export async function ladeMietkennzahlen(objektId: string): Promise<Map<string, MietKennzahl>> {
  const { data, error } = await (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: Zeile[] | null; error: unknown }>;
  }).rpc("mietkennzahlen_je_einheit", { _objekt_id: objektId });
  if (error) throw error;
  return new Map((data || []).map((z) => [z.wohnung_id, {
    kaltmiete: Number(z.kaltmiete) || 0, mietbeginn: z.mietbeginn || "", befristetBis: z.befristet_bis || "",
  }]));
}

/** Kennzahlen eines Objekts; null, solange sie laden oder wenn sie nicht lesbar sind. */
export function useMietkennzahlen(objektId: string | undefined): Map<string, MietKennzahl> | null {
  const [werte, setWerte] = useState<Map<string, MietKennzahl> | null>(null);
  // Nach Änderungen an Mietern neu laden (nur wer Mieter sieht, bekommt dieses Signal).
  const stand = useLiveVersion(["mieter"]);
  useEffect(() => {
    if (!objektId) return;
    let aktiv = true;
    ladeMietkennzahlen(objektId)
      .then((m) => { if (aktiv) setWerte(m); })
      .catch((e) => { console.warn("Mietkennzahlen nicht lesbar", e); if (aktiv) setWerte(null); });
    return () => { aktiv = false; };
  }, [objektId, stand]);
  return werte;
}
