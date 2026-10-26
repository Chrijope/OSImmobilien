import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/*
 * Kennzahlen je Partner im Strukturbaum (Christian, 22.10.2026): Jeder sieht
 * nach unten die Zahlen seiner Partner, keine Kundenakten. Gerechnet wird in
 * der Datenbank (struktur_kennzahlen, Migration 20261022121000); sie gibt
 * Vertriebspartnern nur die eigene Struktur und der Vertriebsleitung, Admin
 * und Inhaber alle Vertriebspartner.
 */

export interface PartnerKennzahlen {
  partner_id: string;
  kunden_gesamt: number;
  leads: number;
  beratung: number;
  kaufphase: number;
  abgeschlossen: number;
  verloren: number;
  termine: number;
  reservierungen: number;
  notartermine: number;
  letzte_aktivitaet: string | null;
  letzter_login: string | null;
}

export type Zeitraum = "30" | "90" | "365";
export const ZEITRAUM_LABEL: Record<Zeitraum, string> = { "30": "Letzte 30 Tage", "90": "Letzte 90 Tage", "365": "Letztes Jahr" };

export const StrukturKennzahlenKontext = createContext<Map<string, PartnerKennzahlen> | null>(null);

const isoTag = (d: Date) => d.toISOString().slice(0, 10);

/** Lädt die Kennzahlen für den Zeitraum. Fehlt die Funktion noch (Migration nicht eingespielt), bleibt die Karte ohne Zahlen. */
export function useStrukturKennzahlen(zeitraum: Zeitraum): Map<string, PartnerKennzahlen> | null {
  const [daten, setDaten] = useState<Map<string, PartnerKennzahlen> | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    const bis = new Date();
    const von = new Date(bis.getTime() - Number(zeitraum) * 86_400_000);
    (supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: PartnerKennzahlen[] | null; error: { message?: string } | null }>;
    })
      .rpc("struktur_kennzahlen", { _von: isoTag(von), _bis: isoTag(bis) })
      .then(({ data, error }) => {
        if (abgebrochen) return;
        if (error) {
          console.warn("Strukturkennzahlen nicht ladbar:", error.message);
          setDaten(null);
          return;
        }
        setDaten(new Map((data || []).map((z) => [z.partner_id, z])));
      });
    return () => { abgebrochen = true; };
  }, [zeitraum]);
  return daten;
}

/** „vor 3 Tagen“, „heute“, „–“ */
export function seit(iso: string | null, jetzt = new Date()): string {
  if (!iso) return "–";
  const tage = Math.floor((jetzt.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (tage <= 0) return "heute";
  if (tage === 1) return "gestern";
  if (tage < 60) return `vor ${tage} Tagen`;
  return `vor ${Math.round(tage / 30)} Monaten`;
}

/** Kompakte Zahlenzeile unter einer Karte im Strukturbaum. */
export function KennzahlenZeile({ partnerId }: { partnerId: string }) {
  const alle = useContext(StrukturKennzahlenKontext);
  const k = alle?.get(partnerId);
  if (!k) return null;
  const stufen: [string, number, string][] = [
    ["Leads", k.leads, "neuer Lead bis Follow-up"],
    ["Beratung", k.beratung, "Erstgespräch bis Objektauswahl"],
    ["Kauf", k.kaufphase, "Reservierung bis Notar"],
    ["Abschl.", k.abgeschlossen, "Fälligkeit bis Bestand"],
  ];
  return (
    <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px] leading-tight" data-testid="struktur-kennzahlen">
      <div className="grid grid-cols-4 gap-1 text-center">
        {stufen.map(([label, wert, titel]) => (
          <div key={label} title={`${label}: ${titel}`} className="rounded bg-muted/60 px-1 py-0.5">
            <div className="font-semibold tabular-nums">{wert}</div>
            <div className="text-bildunterschrift text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground" title="Im gewählten Zeitraum">
        {k.termine} Termine · {k.reservierungen} Reserv. · {k.notartermine} Notar
      </p>
      <p className="text-muted-foreground">
        Aktiv {seit(k.letzte_aktivitaet)} · Login {seit(k.letzter_login)}
      </p>
    </div>
  );
}
