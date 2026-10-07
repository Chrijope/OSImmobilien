import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";

/**
 * Aftersales-Beratung: Unterschriftsanfragen anlegen und die Unterschrift des
 * Partners festhalten.
 *
 * Seit Migration 20260929200000 darf kein angemeldeter Nutzer mehr direkt in
 * `signature_requests` schreiben (Christians Entscheidung vom 29.09.2026).
 * Angelegt wird ueber `aftersales_signatur_anlegen` (prueft, ob der Kunde zum
 * Nutzer gehoert, und holt Name und Adresse aus dem Kontakt), unterschrieben
 * ueber das vorhandene `sign_signature_request`.
 */

export const AFTERSALES_SIGNATUR_MIGRATION = "20260929200000_signaturanfragen_nur_serverseitig";

/** Fehlt die Datenbankfunktion? PostgREST meldet das mit `PGRST202`, Postgres mit `42883`. */
function funktionFehlt(fehler: { code?: unknown; message?: unknown }): boolean {
  if (fehler.code === "PGRST202" || fehler.code === "42883") return true;
  return typeof fehler.message === "string" && /could not find the function|function .* does not exist/i.test(fehler.message);
}

/**
 * Legt die Anfragen fuer Partner und Kunde an und gibt den Token der
 * Partner-Anfrage zurueck. Wirft bei jedem Fehler.
 */
export async function aftersalesSignaturAnlegen(params: {
  investmentId: string;
  kontaktId: string;
  vpName: string;
  kundeName: string;
  kundeEmail?: string;
  formular: Record<string, unknown>;
}): Promise<string> {
  // Die Funktion steht noch nicht in den erzeugten Typen, sie kommt mit der Migration.
  const { data, error } = await supabase.rpc("aftersales_signatur_anlegen" as never, {
    _investment_id: params.investmentId,
    _formular: params.formular,
    _vp_name: params.vpName,
  } as never);
  if (!error && typeof data === "string" && data) return data;
  if (error && !funktionFehlt(error)) throw error;
  if (!error) throw new Error("aftersales_signatur_anlegen lieferte keinen Token");

  // ponytail: Rueckfall nur bis die Migration laeuft. Danach gibt es die
  // Funktion, und dieser Weg waere ohnehin gesperrt. Mit der Migration
  // entfernen.
  console.warn(`[aftersales] ${AFTERSALES_SIGNATUR_MIGRATION} fehlt, lege Anfragen direkt an`);
  const vpToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const gemeinsam = {
    kontakt_id: params.kontaktId,
    investment_id: params.investmentId,
    status: "pending",
    expires_at: expiresAt,
    sa_data: { aftersalesBeratung: params.formular },
  };
  const { error: vpErr } = await supabase.from("signature_requests").insert([
    { ...gemeinsam, token: vpToken, person_type: "aftersales_vp", name: params.vpName, email: params.kundeEmail || "vp@internal.local" },
    { ...gemeinsam, token: crypto.randomUUID(), person_type: "aftersales_kunde", name: params.kundeName, email: params.kundeEmail || "kunde@unknown.local" },
  ] as never);
  if (vpErr) throw vpErr;
  return vpToken;
}

/**
 * Haelt die Unterschrift des Partners an seiner Anfrage fest. Wirft nicht:
 * Massgeblich fuer den Stand ist `investments.meta.aftersalesBeratung`, das
 * `finalize-aftersales-beratung` schreibt. Ein zweiter Versuch nach einem
 * Fehlschlag trifft eine schon unterschriebene Anfrage und darf den Versand
 * nicht blockieren.
 */
export async function aftersalesVpUnterschreiben(token: string, signatur: string): Promise<void> {
  const { error } = await supabase.rpc("sign_signature_request", {
    _token: token,
    _signature_data: signatur,
    _consent_text: "Aftersales-Beratungsdokument durch den Vertriebspartner unterzeichnet",
    _user_agent: typeof navigator !== "undefined" ? navigator.userAgent || null : null,
  } as never);
  if (error) console.error("[aftersales] Partner-Unterschrift nicht gespeichert:", error.message);
}

/**
 * Einen offenen Unterschriftslink erneut verschicken. Den Token liest nur der
 * Server (Function `signatur-link-erinnern`), der Browser sieht ihn nie.
 * Gibt null bei Erfolg zurueck, sonst einen Satz fuer die Meldung. Wirft nie.
 */
export type LinkErinnerung =
  | { art: "aftersales_kunde"; investmentId: string; vpName?: string }
  | { art: "vertrag_kurz"; bewerberId: string; bewerberName: string; paketTitel: string };

export async function signaturLinkErinnern(auftrag: LinkErinnerung): Promise<string | null> {
  try {
    const { error } = await supabase.functions.invoke("signatur-link-erinnern", { body: auftrag });
    if (!error) return null;
    const mitGrund = await edgeFehlerMitGrund(error, { functionName: "signatur-link-erinnern" });
    return mitGrund instanceof Error ? mitGrund.message : "Der Link konnte nicht verschickt werden.";
  } catch (e) {
    return e instanceof Error ? e.message : "Der Link konnte nicht verschickt werden.";
  }
}
