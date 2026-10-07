import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DocResult {
  name: string;
  status: "approved" | "rejected";
  reason?: string;
}

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

    const { to, kundenName, bonitaetDocs, bankDocs, kontaktId, sprache } = await req.json() as {
      to: string;
      kundenName: string;
      bonitaetDocs: DocResult[];
      bankDocs: DocResult[];
      /** Der Kontakt, dessen Kundensprache gilt (Etappe 2). Ohne ihn: ueber die Adresse, sonst Deutsch. */
      kontaktId?: string;
      sprache?: string;
    };

    if (!to || !kundenName) {
      return new Response(
        JSON.stringify({ error: "Pflichtfelder fehlen: to, kundenName" }),
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error: sendError } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "unterlagen-pruefung-ergebnis",
        recipientEmail: to,
        idempotencyKey: `review-${caller.id}-${to}-${Date.now()}`,
        ...(typeof kontaktId === "string" && kontaktId ? { kontaktId } : {}),
        ...(typeof sprache === "string" && sprache ? { sprache } : {}),
        templateData: {
          kundeName: kundenName,
          bonitaetDocs: bonitaetDocs || [],
          bankDocs: bankDocs || [],
          // beraterUserId: send-transactional-email loest daraus den pruefenden
          // Nutzer samt Profildaten auf, sonst steht der Platzhalter darunter.
          beraterUserId: caller.id,
        },
        metadata: {
          kundenName,
          bonitaetDocsCount: (bonitaetDocs || []).length,
          bankDocsCount: (bankDocs || []).length,
          sent_by: caller.id,
        },
      },
    });

    if (sendError) {
      console.error("Failed to send review result email:", sendError);
      return new Response(
        JSON.stringify({ success: true, emailSent: false, reason: sendError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: true }),
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
