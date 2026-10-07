import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Tables to back up
const TABLES = [
  "kontakte",
  "anrufe",
  "aufgaben",
  "benachrichtigungen",
  "chat_gruppen",
  "chat_nachrichten",
  "chat_teilnehmer",
  "emails",
  "lexikon",
  "news",
  "pipeline",
  "unterlagen_dokumente",
  "unterlagen_highlights",
  "unterlagen_kategorien",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Nur mit dem Geheimwort der Automatiken, ohne Uebergang (seit 04.10.2026).
  const abgewiesen = automatikSchutz(req, "daily-backup", corsHeaders, { streng: true });
  if (abgewiesen) return abgewiesen;

  try {
    // Use service role key for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // e.g. 2026-03-12
    const timestamp = now.toISOString().replace(/[:.]/g, "-");

    const results: Record<string, { rows: number; error?: string }> = {};

    for (const table of TABLES) {
      try {
        // Fetch all rows (paginate if >1000)
        let allRows: Record<string, unknown>[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .range(from, from + pageSize - 1);

          if (error) {
            results[table] = { rows: 0, error: error.message };
            hasMore = false;
            continue;
          }

          if (data && data.length > 0) {
            allRows = allRows.concat(data);
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        if (results[table]?.error) continue;

        // Upload as JSON to storage
        const filePath = `${dateStr}/${table}_${timestamp}.json`;
        const jsonContent = JSON.stringify(allRows, null, 2);

        const { error: uploadError } = await supabase.storage
          .from("backups")
          .upload(filePath, new Blob([jsonContent], { type: "application/json" }), {
            contentType: "application/json",
            upsert: true,
          });

        if (uploadError) {
          results[table] = { rows: allRows.length, error: uploadError.message };
        } else {
          results[table] = { rows: allRows.length };
        }
      } catch (e) {
        results[table] = { rows: 0, error: String(e) };
      }
    }

    // Create a summary file
    const summary = {
      backup_date: now.toISOString(),
      tables: results,
      total_rows: Object.values(results).reduce((s, r) => s + r.rows, 0),
      errors: Object.entries(results)
        .filter(([, r]) => r.error)
        .map(([t, r]) => `${t}: ${r.error}`),
    };

    await supabase.storage
      .from("backups")
      .upload(`${dateStr}/summary_${timestamp}.json`, new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });

    // Clean up old backups (keep last 30 days)
    try {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { data: folders } = await supabase.storage.from("backups").list("", { limit: 100 });

      if (folders) {
        for (const folder of folders) {
          if (folder.name < thirtyDaysAgo.toISOString().split("T")[0]) {
            const { data: files } = await supabase.storage.from("backups").list(folder.name);
            if (files && files.length > 0) {
              const paths = files.map((f) => `${folder.name}/${f.name}`);
              await supabase.storage.from("backups").remove(paths);
            }
          }
        }
      }
    } catch {
      // Cleanup errors are non-critical
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
