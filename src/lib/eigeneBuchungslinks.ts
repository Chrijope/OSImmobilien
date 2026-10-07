import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Die vier eigenen Buchungskalender des angemeldeten Nutzers.
 *
 * Sie liegen als vier Spalten in `profiles` und werden an mehreren Stellen im
 * Kundenprofil gebraucht: in den Meeting-Dialogen und an den Knöpfen
 * in den Investment-Karten. Vorher stand die Abfrage dreimal da, und zweimal
 * davon nur für zwei der vier Kalender.
 *
 * Zwei getrennte Abfragen sind Absicht. Objekt- und Finanzierungskalender sind
 * erst am 21.09.2026 dazugekommen. Fehlen die beiden Spalten in der Datenbank,
 * weil die Migration noch nicht gelaufen ist, kostet das nur sie und nicht auch
 * die beiden alten.
 */

/**
 * Feste Dauer von Erstgespräch und Beratungsgespräch, Christian am 29.09.2026.
 *
 * Sie gilt unabhängig von eigenen Terminarten im Buchungskalender
 * (`buchung_terminarten`), die sie vorher übersteuerten: Dort stand etwa ein
 * Beratungsgespräch mit 15 Minuten. Gespeichert werden 20 und 45 Minuten,
 * siehe Migration 20260930140000. Objekt- und Finanzierungsgespräch bleiben
 * bei der Dauer aus der Datenbank.
 */
export const FESTE_GESPRAECHSDAUER = {
  erstgespraech: { de: "15 bis 20 Minuten", en: "15 to 20 minutes" },
  beratung: { de: "45 Minuten", en: "45 minutes" },
} as const;

/** Die Anlässe, in der Reihenfolge des Kundenwegs. */
export const BUCHUNG_ANLAESSE = [
  { anlass: "erstgespraech", name: "Erstgespräch", dauer: `${FESTE_GESPRAECHSDAUER.erstgespraech.de}, telefonisch` },
  { anlass: "beratung", name: "Beratungsgespräch", dauer: FESTE_GESPRAECHSDAUER.beratung.de },
  { anlass: "objektvorstellung", name: "Objektgespräch", dauer: "60 Minuten" },
  { anlass: "finanzierungsgespraech", name: "Finanzierungsgespräch", dauer: "60 Minuten" },
] as const;

export type BuchungAnlassSchluessel = (typeof BUCHUNG_ANLAESSE)[number]["anlass"];

export type EigeneBuchungslinks = Record<BuchungAnlassSchluessel, string>;

export interface EigeneBuchungslinksStand {
  links: EigeneBuchungslinks;
  /**
   * Solange wahr, steht noch nicht fest, welche Kalender es gibt.
   *
   * Ohne dieses Feld zeigte die Liste im Meeting-Dialog fuer den Bruchteil
   * einer Sekunde bei allen vier "Noch kein Kalender hinterlegt" samt Knopf
   * "Hinterlegen" und sprang dann um. Gemeldet von Christian am 21.09.2026.
   * Ein Zustand, der sofort widerrufen wird, ist schlimmer als gar keiner: Wer
   * ihn erwischt, glaubt, etwas sei kaputt.
   */
  laedt: boolean;
}

const LEER: EigeneBuchungslinks = {
  erstgespraech: "",
  beratung: "",
  objektvorstellung: "",
  finanzierungsgespraech: "",
};

/**
 * Lädt die vier Links, sobald `aktiv` wahr ist.
 *
 * `aktiv` gibt es, damit ein geschlossener Dialog nicht bei jedem Rendern der
 * Seite die Datenbank fragt. Ohne Anmeldung oder bei einem Fehler bleiben alle
 * vier leer, nichts wirft.
 */
export function useEigeneBuchungslinks(aktiv = true): EigeneBuchungslinksStand {
  const [links, setLinks] = useState<EigeneBuchungslinks>(LEER);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    if (!aktiv) return;
    let abgebrochen = false;
    setLaedt(true);
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const id = auth?.user?.id;
        if (!id) return;

        const { data } = await supabase
          .from("profiles")
          .select("buchungslink, beratungslink")
          .eq("id", id)
          .maybeSingle();
        if (abgebrochen) return;
        const alt = (data || {}) as { buchungslink?: string; beratungslink?: string };
        setLinks((v) => ({
          ...v,
          erstgespraech: alt.buchungslink || "",
          beratung: alt.beratungslink || "",
        }));

        const { data: weitere } = await supabase
          .from("profiles")
          .select("objektlink, finanzierungslink")
          .eq("id", id)
          .maybeSingle();
        if (abgebrochen) return;
        const neu = (weitere || {}) as { objektlink?: string; finanzierungslink?: string };
        setLinks((v) => ({
          ...v,
          objektvorstellung: neu.objektlink || "",
          finanzierungsgespraech: neu.finanzierungslink || "",
        }));
      } catch (e) {
        console.warn("Buchungslinks konnten nicht geladen werden", e);
      } finally {
        // Auch nach einem Fehlschlag: Sonst haengt die Liste fuer immer im
        // Ladezustand und zeigt gar nichts.
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [aktiv]);

  return { links, laedt };
}
