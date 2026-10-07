import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from '../_shared/transactional-versand.ts';
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { darfBewerberbereich } from "../_shared/bewerber-rollen.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Den Partnervertrag verschicken duerfen seit dem 27.09.2026 nur HR,
    // Admin, Inhaber und Backoffice (`_shared/bewerber-rollen.ts`). Bis dahin
    // genuegte jede Anmeldung.
    const rollenLeser = createClient(supabaseUrl, serviceRoleKey);
    if (!(await darfBewerberbereich(rollenLeser, caller.id))) {
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate-Limit: 10/h, 50/Tag pro Nutzer
    const rl = await checkRateLimit(req, caller.id, { scope: "send-vertrag-signature", perHour: 10, perDay: 50 });
    if (!rl.ok) return rateLimitErrorBody("send-vertrag-signature", rl, corsHeaders);

    const { bewerberId, email, name, documents, pdfUrl, paketTitel, bewerberData, paketId, zahlungsweise, testRecipient } = await req.json();

    if (!bewerberId || !email || !name || !documents || documents.length === 0 || !pdfUrl) {
      return new Response(
        JSON.stringify({ error: "bewerberId, email, name, documents, pdfUrl sind Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isTest = !!testRecipient;
    const effectiveEmail: string = isTest ? String(testRecipient) : email;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = crypto.randomUUID();
    // Vertrags-Signaturlinks sind 30 Tage (1 Monat) gültig
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const saData = {
      docType: "vertrag",
      bewerberId,
      bewerberName: name,
      pdfUrl,
      paketTitel: paketTitel || "",
      documents, // [{ key, name }]
      // Für Einzel-PDF-Vorschau auf der Signaturseite
      bewerberData: bewerberData || null,
      paketId: paketId || "",
      zahlungsweise: zahlungsweise || "einmal",
      // Ein Testversand ueberholt keine echte Anfrage (finalize-vertrag).
      ...(isTest ? { testversand: true } : {}),
    };

    // Eine neue Anfrage ueberholt alle offenen aelteren samt offener
    // Gegenzeichnung (Codex-Pruefung 27.09.2026, A4-05): Sonst liesse sich
    // ein alter Vertrag neben dem neuen unterschreiben oder gegenzeichnen.
    // Scheitert das, wird nicht verschickt.
    if (!isTest) {
      const { error: ueberholtFehler } = await supabase
        .from("signature_requests")
        .update({ status: "ueberholt" })
        .eq("kontakt_id", bewerberId)
        .in("person_type", ["vertrag", "vertrag_kurz"])
        .eq("status", "pending");
      if (ueberholtFehler) {
        console.error("Aeltere Vertragsanfragen nicht geschlossen:", ueberholtFehler);
        return new Response(
          JSON.stringify({ error: "Aeltere Vertragsanfragen konnten nicht geschlossen werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { error: insertError } = await supabase
      .from("signature_requests")
      .insert({
        token,
        kontakt_id: bewerberId, // Bewerber-ID als kontakt_id wiederverwendet
        investment_id: null,
        name,
        email: effectiveEmail,
        person_type: "vertrag",
        sa_data: saData,
        status: "pending",
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Failed to create vertrag signature request:", insertError);
      return new Response(
        JSON.stringify({ error: "Signaturanfrage konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const signatureLink = `${SIGNATURE_BASE_URL}?token=${token}&type=vertrag`;

    // Unter der Mail steht die HR-Managerin, wie unter allen anderen
    // Bewerbermails (Kennenlernen, Termin, Nachfass). Sie kommt ueber die
    // Rolle `hr` aus dem Profil, siehe hr-ansprechpartner.ts. Der Versand
    // laeuft mit dem Service-Schluessel, deshalb kann send-transactional-email
    // den Absender nicht aus dem JWT ableiten; ohne diese Angabe stand
    // "OS Immobilien Team, os@os-immobilien.com" darunter.
    const hrKontakt = await hrAnsprechpartner(supabase as never);

    // Rueckfall, falls niemand die HR-Rolle traegt: der Closing-Berater aus
    // der Bewerbung. send-transactional-email loest den Namen zentral zum
    // vollstaendigen Ansprechpartner auf.
    let beraterName = "";
    if (!hrKontakt) {
      try {
        const { data: bewerbung } = await supabase
          .from("bewerbungen").select("meta").eq("id", bewerberId).maybeSingle();
        const m = (bewerbung?.meta as Record<string, any>) || {};
        beraterName = m.erstgespraechBerater || m.erstgespraechSkript?.durchgefuehrtVon || "";
      } catch {
        // Die Unterschrift ist Beiwerk, der Versand geht auch ohne sie hinaus.
      }
    }

    // Versand erfolgt über die zentrale App-Email-Pipeline mit registriertem
    // Template "vertrag-signatur" – so erscheint die gerenderte Vorschau
    // automatisch in Cloud → App Emails.
    /*
     * Ueber sendeVorlage statt direkt ueber functions.invoke.
     *
     * `invoke` meldet nur einen Fehler ab Status 400.
     * send-transactional-email antwortet aber mit Status 200 und
     * `{ success: false, reason: 'email_suppressed' }`, wenn die Adresse auf
     * der Sperrliste steht. Der Fehlschlag sah dadurch wie Erfolg aus.
     * Gefunden ueber den Fall Kai Laube in send-signature-request.
     */
    const versand = await sendeVorlage(supabase, {
      templateName: "vertrag-signatur",
      recipientEmail: effectiveEmail,
      idempotencyKey: `vertrag-sig-${token}`,
      templateData: {
        name,
        signatureUrl: signatureLink,
        paketTitel: paketTitel || "",
        documents,
        ...(hrKontakt ? { hrKontakt } : beraterName ? { beraterName } : {}),
      },
      metadata: isTest
        ? { testSend: true, originalRecipient: email, bewerberId }
        : undefined,
    });
    const sendError = versand.ok ? null : new Error(versand.grund || 'Versand fehlgeschlagen');

    if (sendError) {
      console.error("Failed to enqueue vertrag signature email:", sendError);
      return new Response(
        // Der Grund gehoert mit: "Adresse steht auf der Sperrliste" ist eine
        // Handlungsanweisung, "konnte nicht versendet werden" ist ein Raetsel.
        JSON.stringify({ error: `E-Mail konnte nicht versendet werden: ${versand.grund}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      // Ohne `token`, der Link steht in der Mail an den Bewerber (29.09.2026).
      JSON.stringify({ success: true, sentAt: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in send-vertrag-signature:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});