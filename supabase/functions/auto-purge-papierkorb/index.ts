// Auto-Purge: Hartlöscht soft-deleted Kontakte, die älter als 90 Tage sind.
// Wird täglich via pg_cron aufgerufen. DSGVO-konform.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETENTION_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Nur mit dem Geheimwort der Automatiken, ohne Uebergang (seit 04.10.2026).
  const abgewiesen = automatikSchutz(req, "auto-purge-papierkorb", corsHeaders, { streng: true });
  if (abgewiesen) return abgewiesen;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Kandidaten holen
    const { data: candidates, error: selErr } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, geloescht_am")
      .eq("geloescht", true)
      .lt("geloescht_am", cutoff);

    if (selErr) throw selErr;

    const ids = (candidates || []).map((c) => c.id);
    let deleted = 0;
    const errors: { id: string; error: string }[] = [];

    if (ids.length > 0) {
      // Cascade-Delete (investments-Trigger ist bereits aktiv via cascade_delete_investments_on_kontakt)
      for (const id of ids) {
        const { error: delErr } = await supabase.from("kontakte").delete().eq("id", id);
        if (delErr) {
          errors.push({ id, error: delErr.message });
        } else {
          deleted++;
        }
      }
    }

    const result = {
      ran_at: new Date().toISOString(),
      cutoff_date: cutoff,
      retention_days: RETENTION_DAYS,
      candidates: ids.length,
      deleted,
      errors,
    };

    console.log("auto-purge-papierkorb result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-purge-papierkorb error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
