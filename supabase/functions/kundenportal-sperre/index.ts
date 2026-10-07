/**
 * Kundenportal sperren oder entsperren, auf dem Server.
 *
 * Bis zum 23.09.2026 schrieb „Portal sperren“ nur `meta.portalGesperrt` an den
 * Kontakt, und nur der Browser des Kunden hat darauf geachtet. Die Anmeldung
 * blieb gueltig, ueber die Schnittstelle kam der Kunde weiter an seine Daten.
 * Ausserdem konnte jeder interne Nutzer den Wert ueber `merge_kontakt_meta`
 * setzen oder zuruecknehmen.
 *
 * Jetzt:
 *   - Nur Admin, Inhaber und der zustaendige Vertriebspartner (siehe
 *     `../_shared/kundenportal-recht.ts`).
 *   - Das Anmeldekonto wird gesperrt (`ban_duration`), eine neue Anmeldung und
 *     das Verlaengern einer bestehenden Sitzung scheitern.
 *   - In der Datenbank greift ab der Migration
 *     `20260923180000_kundenportal_sperre.sql` sofort eine Sperrregel auf allen
 *     Tabellen. Sie deckt auch den Zugriffsschluessel ab, den der Kunde noch in
 *     der Hand hat, bis er abläuft.
 *
 * Aufruf: POST { kontaktId: uuid, gesperrt: boolean } mit der Anmeldung des
 * Nutzers im Authorization-Kopf. Der Ablauf selbst steht in `ablauf.ts`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0"
import { portalSperreSetzen, type SperrDienst } from "./ablauf.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
}

function antwort(status: number, rumpf: Record<string, unknown>): Response {
  return new Response(JSON.stringify(rumpf), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return antwort(405, { error: "Nur POST ist erlaubt." })

  try {
    const authHeader = req.headers.get("Authorization") || ""
    if (!/^Bearer\s+\S+/i.test(authHeader)) return antwort(401, { error: "Nicht angemeldet." })

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Wer ruft? Mit der Anmeldung des Aufrufers, nicht mit dem Dienstschluessel.
    const aufruferClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await aufruferClient.auth.getUser()
    if (userError || !user) return antwort(401, { error: "Nicht angemeldet." })

    const rumpf = await req.json().catch(() => null) as { kontaktId?: unknown; gesperrt?: unknown } | null
    if (!rumpf) return antwort(400, { error: "Die Anfrage ist leer oder kein JSON." })

    const dienst = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const ergebnis = await portalSperreSetzen(
      dienst as unknown as SperrDienst,
      user.id,
      rumpf.kontaktId,
      rumpf.gesperrt,
    )
    return antwort(ergebnis.status, ergebnis.rumpf)
  } catch (e) {
    console.error("kundenportal-sperre: unerwarteter Fehler", e)
    return antwort(500, { error: "Die Sperre konnte nicht geändert werden. Bitte versuche es gleich noch einmal." })
  }
})
