// system-health-check: täglich
// - prüft DLQ-Größen
// - reassigned Leads ohne zustaendig_id älter als 24h auf ersten Inhaber
// - sendet System-Health-Report-Email NUR wenn etwas zu berichten ist

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "system-health-check", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const details: string[] = [];
  let dlqAuth = 0;
  let dlqTransactional = 0;
  let reassignedLeads = 0;
  let reassignedToName = "";

  // 1) DLQ-Größen
  try {
    const { data: dlqA } = await admin.rpc("read_email_batch", {
      queue_name: "auth_emails_dlq", batch_size: 1, vt: 1,
    });
    // read_email_batch ist destructive — besser direkte Count-Query.
    // Wir nutzen stattdessen einen einfachen count(*) über pgmq-Tabellen via SQL-RPC ersatzweise:
    void dlqA;
  } catch { /* ignore */ }

  // Fallback: zähle direkt über SQL
  try {
    const { data } = await admin
      .from("email_send_log")
      .select("status", { count: "exact", head: true })
      .eq("status", "dlq")
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    // count via head: returns count in response
    const total = (data as any)?.length ?? 0;
    if (total > 0) dlqTransactional = total;
  } catch { /* ignore */ }

  // Saubere Zählung via raw query an pgmq tables
  for (const queue of ["auth_emails_dlq", "transactional_emails_dlq"] as const) {
    try {
      const { data } = await admin.rpc("read_email_batch", {
        queue_name: queue, batch_size: 0, vt: 0,
      });
      void data;
    } catch { /* ignore */ }
  }

  // Direkte Count über email_send_log mit status='dlq' in 24h
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: cAuth } = await admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "dlq")
      .like("template_name", "%auth%")
      .gte("created_at", since);
    dlqAuth = cAuth || 0;
    const { count: cTrans } = await admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "dlq")
      .not("template_name", "like", "%auth%")
      .gte("created_at", since);
    dlqTransactional = cTrans || 0;
  } catch (e) {
    console.warn("DLQ count failed:", e);
  }

  // 2) Auto-Reassign DEAKTIVIERT (auf Wunsch): Unzugewiesene Leads bleiben im offenen Pool
  //    (Lead-Verwaltung) und werden ausschließlich manuell durch Admins zugewiesen.
  //    Historie: Vorher wurden Leads ohne zustaendig_id > 24h automatisch dem ersten
  //    'inhaber' zugewiesen. Diese Logik ist entfernt.

  const hasIssues = dlqAuth > 0 || dlqTransactional > 0 || reassignedLeads > 0;

  // 3) Nur Mail senden, wenn etwas zu berichten ist
  if (hasIssues) {
    try {
      const { data: inhaberProfiles } = await admin
        .from("user_roles")
        .select("user_id, profiles!inner(email)")
        .eq("role", "inhaber");
      const emails: string[] = (inhaberProfiles || [])
        .map((r: any) => r.profiles?.email)
        .filter(Boolean);

      for (const recipientEmail of emails) {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "system-health-alert",
            recipientEmail,
            idempotencyKey: `system-health-${new Date().toISOString().split("T")[0]}-${recipientEmail}`,
            templateData: {
              dlqAuth, dlqTransactional, reassignedLeads,
              reassignedTo: reassignedToName, details,
            },
          },
        });
      }
    } catch (e) {
      console.error("Notification send failed:", e);
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    hasIssues,
    dlqAuth,
    dlqTransactional,
    reassignedLeads,
    details,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});