import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { BEWERBER_ANZAHL_FRAGEN } from "../_shared/bewerber-eingangsmail.ts";
import { darfBewerberbereich } from "../_shared/bewerber-rollen.ts";

/**
 * Legt für einen Bewerber ein Formular-Token an und verschickt die Einladung.
 *
 * Wird aus `submit-bewerbung` und aus dem Zapier-Webhook aufgerufen, also nach
 * jeder eingehenden Bewerbung, und zusätzlich von Hand aus dem Bewerberprofil,
 * wenn die Mail im Spam gelandet ist.
 *
 * Ein erneuter Versand erzeugt ein neues Token und setzt das alte auf
 * "ersetzt". So ist immer nur ein Link gültig.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FORMULAR_BASIS_URL = "https://portal.more.immo/bewerberfragen";
const GUELTIG_TAGE = 14;

/**
 * Die HR-Managerin fuer den Ansprechpartner-Kasten. Einmal je Lauf geladen,
 * nicht je Mail: Der Kasten ist fuer alle Empfaenger derselbe.
 */
let hrKontaktCache: Awaited<ReturnType<typeof hrAnsprechpartner>> | undefined;
let hrKontaktGeladen = false;
async function holeHrKontakt(db: any) {
  if (!hrKontaktGeladen) {
    hrKontaktCache = await hrAnsprechpartner(db);
    hrKontaktGeladen = true;
  }
  return hrKontaktCache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    /*
     * Wer darf die Einladung ausloesen? Seit dem 27.09.2026 nur HR, Admin,
     * Inhaber und Backoffice (`_shared/bewerber-rollen.ts`). Bis dahin genuegte
     * jede Anmeldung, auch die eines Kunden. Ein Aufruf mit der Service-Rolle
     * (aus einer anderen Function) geht weiter durch.
     */
    const authHeader = req.headers.get("Authorization") || "";
    const ausweis = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!ausweis || ausweis !== SERVICE_ROLE) {
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await darfBewerberbereich(admin, caller.id))) {
        return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const bewerbungId = String(body.bewerbungId || "").trim();
    if (!bewerbungId) {
      return new Response(JSON.stringify({ error: "bewerbungId fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: bewerber, error: leseFehler } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, email, meta")
      .eq("id", bewerbungId)
      .maybeSingle();

    if (leseFehler || !bewerber) {
      return new Response(JSON.stringify({ error: "Bewerber nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!bewerber.email) {
      return new Response(JSON.stringify({ ok: false, grund: "keine E-Mail-Adresse" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bereits eingereicht? Dann nicht erneut einladen, das wäre eine Zumutung.
    const { data: vorhanden } = await admin
      .from("bewerber_formular")
      .select("id, status")
      .eq("bewerbung_id", bewerbungId);

    if ((vorhanden || []).some((f) => f.status === "eingereicht")) {
      return new Response(JSON.stringify({ ok: false, grund: "bereits ausgefuellt" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Offene Token dieses Bewerbers zurückziehen, es soll immer nur einer gelten.
    await admin
      .from("bewerber_formular")
      .update({ status: "ersetzt" })
      .eq("bewerbung_id", bewerbungId)
      .eq("status", "offen");

    const ablauf = new Date(Date.now() + GUELTIG_TAGE * 24 * 3600 * 1000);
    const { data: neu, error: anlegeFehler } = await admin
      .from("bewerber_formular")
      .insert({
        bewerbung_id: bewerbungId,
        vorname: bewerber.vorname || "",
        expires_at: ablauf.toISOString(),
      })
      .select("id, token")
      .single();

    if (anlegeFehler || !neu) {
      console.error("[send-bewerber-formular] Anlegen fehlgeschlagen", anlegeFehler);
      return new Response(JSON.stringify({ error: "Anlegen fehlgeschlagen" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hrKontakt = await holeHrKontakt(admin);

    const versand = await sendeVorlage(admin, {
      templateName: "bewerber-formular-einladung",
      recipientEmail: bewerber.email,
      idempotencyKey: `bewerber-formular-einladung-${neu.id}`,
      templateData: {
          ...(hrKontakt ? { hrKontakt } : {}),
        bewerberName: `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim(),
        formularLink: `${FORMULAR_BASIS_URL}/${neu.token}`,
        gueltigTage: GUELTIG_TAGE,
        anzahlFragen: BEWERBER_ANZAHL_FRAGEN,
      },
    });

    if (!versand.ok) {
      console.error("[send-bewerber-formular] Versand fehlgeschlagen", versand.grund);
    }

    return new Response(JSON.stringify({ ok: true, id: neu.id, versandt: versand.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-bewerber-formular] Fehler", e);
    return new Response(JSON.stringify({ error: "Unerwarteter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
