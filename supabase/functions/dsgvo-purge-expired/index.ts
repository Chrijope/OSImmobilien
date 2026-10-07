// DSGVO Purge Expired: täglich
// - Findet alle kontakte mit meta.deletionRequest.status='confirmed' und scheduledDeletionAt <= now()
// - Ruft dsgvo-hard-delete für jeden
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const nowIso = new Date().toISOString();
  const processed: string[] = [];
  const errors: any[] = [];

  try {
    const { data: candidates, error } = await admin
      .from("kontakte")
      .select("id, meta")
      .eq("meta->deletionRequest->>status", "confirmed");

    if (error) throw error;

    for (const c of candidates || []) {
      const scheduled = (c.meta as any)?.deletionRequest?.scheduledDeletionAt;
      if (!scheduled || scheduled > nowIso) continue;

      try {
        const { data, error: invErr } = await admin.functions.invoke("dsgvo-hard-delete", {
          body: { kontaktId: c.id, reason: "7-Tage-Frist abgelaufen", triggeredBy: "cron" },
          headers: { "x-internal-secret": Deno.env.get("INGEST_SHARED_SECRET") || "" },
        });
        if (invErr) throw invErr;
        processed.push(c.id);
      } catch (e) {
        errors.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } catch (e) {
    errors.push({ error: e instanceof Error ? e.message : String(e) });
  }

  return new Response(JSON.stringify({
    ran_at: nowIso,
    processed,
    errors,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});