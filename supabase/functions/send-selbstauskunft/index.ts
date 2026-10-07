import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeVorlage } from '../_shared/transactional-versand.ts';

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

    const { to, subject, kundenName, pdfBase64, pdfFilename } = await req.json();

    if (!to || !subject || !pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Pflichtfelder fehlen: to, subject, pdfBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const idempotencyKey = `sa-pdf-${crypto.randomUUID()}`;

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
      templateName: "selbstauskunft-pdf",
      recipientEmail: to,
      idempotencyKey,
      // beraterUserId: send-transactional-email loest daraus den versendenden
      // Berater samt Profildaten auf, sonst steht der Platzhalter darunter.
      templateData: { kundenName, subject, beraterUserId: caller.id },
      metadata: { sent_by: caller.id },
      attachments: [
        {
          filename: pdfFilename || "Selbstauskunft.pdf",
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    });
    const sendError = versand.ok ? null : new Error(versand.grund || 'Versand fehlgeschlagen');

    if (sendError) {
      console.error("Failed to send selbstauskunft email:", sendError);
      return new Response(
        JSON.stringify({ success: true, emailSent: false, reason: versand.grund || "Versand fehlgeschlagen" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: true, queued: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
