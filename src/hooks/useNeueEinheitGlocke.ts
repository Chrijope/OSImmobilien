import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { wennTabellenGeladen } from "@/lib/dataCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { getObjekteImAngebot } from "@/lib/objekteStore";
import { passendeKundenFuerObjekt } from "@/lib/objektScoreDaten";
import { neueEinheitGlocken } from "@/lib/neueEinheitGlocke";

/**
 * Prüft einmal nach dem Laden, ob ein neu importiertes Objekt zu den eigenen
 * suchenden Kunden passt, und legt dann eine Glocke an (seit 24.10.2026).
 * Regeln und Begründung in `neueEinheitGlocke.ts`.
 *
 * Nur für Vertriebspartner: Sie sind die Zuständigen ihrer Kunden. Die
 * Leitung sieht passende Kunden weiter auf der Einheitenseite.
 */
export function useNeueEinheitGlocke(rolle: string | undefined, benutzerId: string | undefined) {
  useEffect(() => {
    if (rolle !== "vertriebspartner" || !benutzerId || isTestAccount()) return;
    let abgebrochen = false;
    const pruefen = () => {
      if (abgebrochen) return;
      let glocken: ReturnType<typeof neueEinheitGlocken> = [];
      try {
        glocken = neueEinheitGlocken(getObjekteImAngebot(), (objekt) => {
          const passend = passendeKundenFuerObjekt(objekt, { benutzerId, nurEigene: true });
          return [...passend.jeEinheit.values()].flat().map((t) => t.name);
        });
      } catch (fehler) {
        // Unvollständige Daten dürfen das Layout nicht stören.
        console.error("Neue-Einheit-Glocke: Prüfung fehlgeschlagen", fehler);
        return;
      }
      for (const g of glocken) {
        void (async () => {
          const { error } = await supabase.from("benachrichtigungen").insert({
            benutzer_id: benutzerId,
            titel: g.titel,
            nachricht: g.nachricht,
            link: g.link,
            gelesen: false,
            meta: { sperre: g.sperre, notif_type: "neue_einheit", objektId: g.objektId },
          });
          // 23505: Diese Glocke gibt es schon (Sperrindex), etwa von einem zweiten Gerät.
          if (error && error.code !== "23505") console.error("Neue-Einheit-Glocke nicht angelegt", error);
        })();
      }
    };
    // Etwas später als die übrigen Prüfungen, damit der Start nicht leidet.
    let abmelden = () => {};
    const t = setTimeout(() => {
      abmelden = wennTabellenGeladen(["objekte", "wohnungen", "kontakte", "investments"], pruefen);
    }, 8_000);
    return () => { abgebrochen = true; clearTimeout(t); abmelden(); };
  }, [rolle, benutzerId]);
}
