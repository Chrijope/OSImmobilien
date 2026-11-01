/** Gemeinsames für die Mail-Functions: CORS, Antworten, angemeldeter Nutzer, Dienst-Client. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function antwort(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function dienst() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Der angemeldete Nutzer aus dem Kopf der Anfrage, sonst null. */
export async function nutzerAus(req: Request): Promise<{ id: string } | null> {
  const kopf = req.headers.get("Authorization") ?? "";
  if (!kopf.startsWith("Bearer ")) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: kopf } },
  });
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}
