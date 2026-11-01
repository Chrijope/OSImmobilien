import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";

/**
 * Öffnet die Anmeldung bei Google oder Microsoft und schließt sie im CRM ab
 * (01.11.2026). Das Anmeldefenster meldet nur Code und Status; getauscht wird
 * hier, mit der Anmeldung des Nutzers. So kann ein fremder Anmeldelink kein
 * Postfach oder Kalender in ein anderes Konto holen.
 */
export function oauthFensterOeffnen(url: string, nachher: () => void): void {
  const fenster = window.open(url, "anbieter-anmeldung", "width=520,height=700");
  const hoeren = async (e: MessageEvent) => {
    if (e.source !== fenster) return;
    const d = e.data as { type?: string; code?: string; state?: string; text?: string };
    if (d?.type === "kalender-fehler") {
      window.removeEventListener("message", hoeren);
      toast.error(d.text || "Anmeldung abgebrochen");
      return;
    }
    if (d?.type !== "oauth-code") return;
    window.removeEventListener("message", hoeren);
    const { data, error } = await supabase.functions.invoke("kalender-oauth", { body: { code: d.code, state: d.state } });
    if (error) {
      const f = await edgeFehlerMitGrund(error, { functionName: "kalender-oauth" });
      toast.error((f as Error)?.message || "Verbinden fehlgeschlagen");
    } else {
      toast.success(data?.text || "Verbunden");
    }
    nachher();
  };
  window.addEventListener("message", hoeren);
}
