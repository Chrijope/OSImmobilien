import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NICHT_GEFUNDEN, vorstellungsAntwort, type LeseClient } from "./antwort.ts";

/*
 * Die interaktive Objektvorstellung ist seit dem 23.09.2026 abgeschaltet.
 * Diese Function beantwortet nur noch bereits verschickte Links: zu einem
 * gültigen Token die vier Angaben des Partners, sonst 404. Was sie liest und
 * warum sonst nichts mehr hinausgeht, steht in `antwort.ts`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = new URL(req.url).searchParams.get("token");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { status, body } = await vorstellungsAntwort(supabase as unknown as LeseClient, token);
    return json(body, status);
  } catch (e) {
    // Kein Fehlertext nach draußen, nur ins Protokoll.
    console.error("get-objektvorstellung:", e);
    return json(NICHT_GEFUNDEN.body, NICHT_GEFUNDEN.status);
  }
});
