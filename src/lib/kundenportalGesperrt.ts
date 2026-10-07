/**
 * Ist das Kundenportal des angemeldeten Kunden gesperrt?
 *
 * Seit dem 23.09.2026 wirkt die Sperre auf dem Server (Edge Function
 * `kundenportal-sperre`, Migration `20260923180000_kundenportal_sperre.sql`).
 * Ein gesperrter Kunde darf danach seinen eigenen Kontakt nicht mehr lesen,
 * also auch nicht `meta.portalGesperrt`. Gefragt wird deshalb über die
 * Datenbankfunktion `kundenportal_gesperrt_fuer_mich`, die nur ja oder nein
 * sagt.
 *
 * Ist die Migration noch nicht gelaufen, fehlt die Funktion. Dann antwortet
 * `istMeinPortalGesperrt` mit `null`, und der Aufrufer fällt auf den alten
 * Weg über `meta.portalGesperrt` zurück.
 */

/*
 * Den Hinweis für gesperrte Kunden zeigen Portal und Anmeldeseite über die
 * Übersetzung (`portal.lock.text`, `auth.login.fehler.portal_gesperrt_text`),
 * deutsch und englisch.
 */

type RpcAufruf = (name: string) => PromiseLike<{ data: unknown; error: unknown }>;

const standardRpc: RpcAufruf = async (name) => {
  const { supabase } = await import("@/integrations/supabase/client");
  // Die Funktion steht noch nicht in den erzeugten Datenbanktypen.
  return (supabase as unknown as { rpc: (n: string) => PromiseLike<{ data: unknown; error: unknown }> }).rpc(name);
};

/**
 * `true` gesperrt, `false` offen, `null` unbekannt (Funktion fehlt oder
 * Fehler). Unbekannt heißt nicht offen: Der Aufrufer entscheidet, was dann gilt.
 */
export async function istMeinPortalGesperrt(rpc: RpcAufruf = standardRpc): Promise<boolean | null> {
  try {
    const { data, error } = await rpc("kundenportal_gesperrt_fuer_mich");
    if (error) {
      // Fehlt die Funktion, ist die Migration noch nicht gelaufen. Das ist
      // erwartet und kein Grund für einen Eintrag. Alles andere schon.
      const code = (error as { code?: unknown }).code;
      if (code !== "PGRST202" && code !== "42883") console.warn("Portalsperre nicht abfragbar:", error);
      return null;
    }
    if (data === true) return true;
    if (data === false) return false;
    return null;
  } catch (fehler) {
    console.warn("Portalsperre nicht abfragbar:", fehler);
    return null;
  }
}
