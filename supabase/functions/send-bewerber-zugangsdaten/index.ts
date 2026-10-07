/**
 * Versendet die Zugangsdaten der neuen persoenlichen @os-immobilien.com-Adresse an
 * die private Adresse eines Bewerbers. Aufgerufen aus dem Aktivierungs-Tab
 * des Bewerbungsmanagements (Block "Persoenliche E-Mail mitteilen").
 *
 * Ablauf nach dem Muster von send-anlage-v: Eingabe pruefen (Hilfsfunktion in
 * _shared/bewerber-zugangsdaten.ts, dort auch getestet), Rate-Limit, dann
 * ueber sendeVorlage an send-transactional-email (Vorlage
 * "bewerber-zugangsdaten"). Von dort laeuft die Mail durch die uebliche
 * Warteschlange (email_send_log, Wiederholungen).
 *
 * Bewusste Entscheidungen:
 *
 *   Rollenpruefung: Anders als send-anlage-v (Kunde verschickt eigene Daten)
 *   verschickt hier HR fremde Zugangsdaten. Deshalb duerfen nur admin und
 *   inhaber aufrufen, dieselben Rollen, die das Bewerbungsmanagement
 *   bearbeiten (canManage im Frontend, hier serverseitig erzwungen).
 *
 *   Passwort: wird nur durchgereicht und landet ausschliesslich in der Mail.
 *   Es wird weder gespeichert noch geloggt; in email_send_log.metadata stehen
 *   nur Absender, Zieladresse und die neue Adresse.
 *
 *   Pflichtmail: "bewerber-zugangsdaten" steht in send-transactional-email
 *   auf der PFLICHTMAILS-Liste, damit eine alte Sperrlisten-Eintragung den
 *   Start des Partners nicht stumm blockiert.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { pruefeZugangsdatenAuftrag } from "../_shared/bewerber-zugangsdaten.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // verify_jwt = true prueft den Token bereits am Gateway; hier wird der
    // Nutzer aufgeloest, weil zusaetzlich seine Rolle zaehlt.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Nur admin/inhaber: dieselben Rollen, die das Bewerbungsmanagement
    // bearbeiten. Ein ausgeblendeter Knopf ist keine Zugriffskontrolle.
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const darf = (callerRoles || []).some((r: { role: string }) =>
      r.role === "admin" || r.role === "inhaber"
    );
    if (!darf) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Ungültige Anfrage" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geprueft = pruefeZugangsdatenAuftrag(body);
    if (!geprueft.ok) {
      return new Response(JSON.stringify({ error: geprueft.fehler }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auftrag = geprueft.auftrag;

    // Hoechstens 20 Versendungen je Nutzer und Stunde; mehr Freischaltungen
    // gibt es an einem Tag realistisch nicht.
    const limit = await checkRateLimit(req, caller.id, {
      scope: "send-bewerber-zugangsdaten", perHour: 20,
    });
    if (!limit.ok) {
      return rateLimitErrorBody("send-bewerber-zugangsdaten", limit, corsHeaders);
    }

    const versand = await sendeVorlage(supabase, {
      templateName: "bewerber-zugangsdaten",
      recipientEmail: auftrag.empfaengerEmail,
      idempotencyKey: `bewerber-zugangsdaten-${crypto.randomUUID()}`,
      templateData: {
        vorname: auftrag.vorname,
        persoenlicheEmail: auftrag.persoenlicheEmail,
        passwort: auftrag.passwort,
        onboardingDatum: auftrag.onboardingDatum,
        onboardingUhrzeit: auftrag.onboardingUhrzeit,
      },
      // Bewusst OHNE Passwort: landet in email_send_log.metadata.
      metadata: {
        sent_by: caller.id,
        persoenliche_email: auftrag.persoenlicheEmail,
      },
    });

    if (!versand.ok) {
      console.error("Zugangsdaten-Versand fehlgeschlagen:", versand.grund);
      return new Response(
        JSON.stringify({ error: versand.grund || "Versand fehlgeschlagen" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, queued: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-bewerber-zugangsdaten:", error);
    return new Response(
      JSON.stringify({ error: "Unerwarteter Fehler beim Versand" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
