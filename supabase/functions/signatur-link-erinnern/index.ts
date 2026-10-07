import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";

/**
 * Einen offenen Unterschriftslink erneut verschicken, ohne dass der Browser
 * den Token je zu sehen bekommt.
 *
 * Seit Migration 20260929200000 liest kein angemeldeter Nutzer mehr die
 * Spalte `signature_requests.token`. Mit dem Token laesst sich ueber die
 * oeffentliche Unterschriftsseite im Namen des Kunden unterschreiben, und ein
 * Partner darf nichts an den Ablaeufen vorbei veraendern (Christians
 * Entscheidung vom 29.09.2026). Die beiden Stellen im CRM, die den Token nur
 * zum Versenden brauchten, rufen deshalb diese Function:
 *
 *   art "aftersales_kunde"  Aftersales-Karte, Link erneut an den Kunden.
 *                           Darf, wer das Investment sehen darf (dieselbe
 *                           Regel wie auf `investments`: eigene Kunden oder
 *                           Rollen mit Blick auf alle Kunden). Empfaenger ist
 *                           immer die Adresse aus dem Kontakt.
 *   art "vertrag_kurz"      Bewerberakte, Erinnerung an die Gegenzeichnung.
 *                           Darf nur der Bewerberbereich. Empfaenger ist fest
 *                           das Postfach der Geschaeftsfuehrung.
 *
 * Empfaenger und Token kommen nie aus dem Aufruf.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PORTAL_URL = "https://portal.more.immo";
const CHRISTIAN_KURZ_EMAIL = "office@more.immo";

function antwort(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Nur Anzeigetext in einer internen Mail, deshalb gekuerzt statt geprueft. */
function kurz(wert: unknown): string {
  return String(wert ?? "").slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    // Der oeffentliche Schluessel allein gehoert zu keinem Nutzer.
    if (!jwt || (anonKey && jwt === anonKey)) return antwort(401, { error: "Nicht autorisiert" });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return antwort(401, { error: "Nicht autorisiert" });

    const rl = await checkRateLimit(req, uid, { scope: "signatur-link-erinnern", perHour: 20, perDay: 60 });
    if (!rl.ok) return rateLimitErrorBody("signatur-link-erinnern", rl, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const art = String(body?.art ?? "");

    if (art === "aftersales_kunde") {
      const investmentId = String(body?.investmentId ?? "");
      // Sichtbarkeit mit den Rechten des Aufrufers: Die Zeilenregel auf
      // `investments` ist genau die Frage "eigener Kunde oder alle Kunden".
      const { data: rolle } = await admin.rpc("is_internal_role", { _user_id: uid });
      const { data: inv } = rolle === true && investmentId
        ? await userClient.from("investments").select("id, kunde_id").eq("id", investmentId).maybeSingle()
        : { data: null };
      if (!inv?.kunde_id) return antwort(403, { error: "Für dieses Investment darfst du keinen Link verschicken." });

      const { data: sig } = await admin
        .from("signature_requests")
        .select("token")
        .eq("investment_id", investmentId)
        .eq("kontakt_id", inv.kunde_id)
        .eq("person_type", "aftersales_kunde")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sig?.token) return antwort(404, { error: "Keine offene Aftersales-Anfrage gefunden." });

      const { data: kontakt } = await admin
        .from("kontakte").select("vorname, nachname, email").eq("id", inv.kunde_id).maybeSingle();
      if (!kontakt?.email) return antwort(400, { error: "Am Kontakt ist keine E-Mail-Adresse hinterlegt." });

      const berater = await zustaendigerAnsprechpartner(admin, inv.kunde_id);
      const versand = await sendeVorlage(admin, {
        templateName: "aftersales-beratung-signatur",
        recipientEmail: kontakt.email,
        idempotencyKey: `aftersales-kunde-resend-${investmentId}-${Date.now()}`,
        // Die Sprache ermittelt send-transactional-email aus dem Kontakt.
        kontaktId: inv.kunde_id,
        templateData: {
          name: `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim() || "Kunde",
          vpName: kurz(body?.vpName) || undefined,
          // Die Vorlage heisst dieses Feld signUrl.
          signUrl: `${PORTAL_URL}/signatur?token=${sig.token}&type=aftersales_kunde`,
          ...(berater ? { berater } : {}),
        },
        metadata: { kontakt_id: inv.kunde_id, person_type: "aftersales_kunde", ausgeloest_von: uid },
      });
      return versand.ok ? antwort(200, { ok: true }) : antwort(502, { error: versand.grund });
    }

    if (art === "vertrag_kurz") {
      const bewerberId = String(body?.bewerberId ?? "");
      const { data: darf } = await admin.rpc("darf_bewerberbereich", { _uid: uid });
      if (darf !== true || !bewerberId) return antwort(403, { error: "Das darf nur der Bewerberbereich." });

      // Frisch lesen: Migration 20260927080000 erneuert die Tokens offener
      // Gegenzeichnungen, ein frueher gelesener waere tot.
      const { data: sig } = await admin
        .from("signature_requests")
        .select("token")
        .eq("kontakt_id", bewerberId)
        .eq("person_type", "vertrag_kurz")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sig?.token) return antwort(404, { error: "Keine offene Gegenzeichnungs-Anfrage gefunden." });

      const versand = await sendeVorlage(admin, {
        templateName: "vertrag-gegenzeichnung-kurz",
        recipientEmail: CHRISTIAN_KURZ_EMAIL,
        idempotencyKey: `vertrag-kurz-reminder-${bewerberId}-${Date.now()}`,
        templateData: {
          bewerberName: kurz(body?.bewerberName),
          paketTitel: kurz(body?.paketTitel),
          signatureUrl: `${PORTAL_URL}/signatur?token=${sig.token}&type=vertrag_kurz`,
          signedAt: new Date().toLocaleString("de-DE"),
        },
        metadata: { kontakt_id: bewerberId, person_type: "vertrag_kurz", ausgeloest_von: uid },
      });
      return versand.ok ? antwort(200, { ok: true }) : antwort(502, { error: versand.grund });
    }

    return antwort(400, { error: "Unbekannte Art" });
  } catch (err) {
    console.error("signatur-link-erinnern:", err);
    return antwort(500, { error: "Versand fehlgeschlagen" });
  }
});
