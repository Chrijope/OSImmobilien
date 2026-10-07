/**
 * Shared-Helper für Edge Functions – schreibt Einträge in das zentrale
 * activity_log. Nutzung:
 *
 *   import { createServiceClient } from ...;
 *   import { logActivityFromEdge } from "../_shared/activity-log.ts";
 *
 *   await logActivityFromEdge(supabase, {
 *     kontaktId,
 *     action: "email_sent",
 *     meta: { subject, empfaenger, template },
 *     source: "edge:send-sa-invitation",
 *   });
 *
 * Fehler werden nur geloggt, nie geworfen – Kommunikation darf nie
 * scheitern, nur weil das Audit-Log kurz nicht schreibbar ist.
 */
/**
 * Nur der Teil des Clients, der hier gebraucht wird. Ein fester Client-Typ
 * aus einer bestimmten Fassung von supabase-js passte nicht zu Functions, die
 * eine andere Fassung laden (deno check schlug in submit-lead fehl).
 */
// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (tabelle: string) => any };

export interface EdgeActivityLogInput {
  kontaktId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  source?: string;
}

export async function logActivityFromEdge(
  supabase: SupabaseClient,
  input: EdgeActivityLogInput,
): Promise<void> {
  if (!input.kontaktId) return;
  try {
    const { error } = await supabase.from("activity_log").insert({
      kontakt_id: input.kontaktId,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? "System",
      actor_role: input.actorRole ?? "system",
      action: input.action,
      entity_type: input.entityType || "kontakt",
      entity_id: input.entityId || null,
      meta: input.meta || {},
      changes: input.changes || {},
      source: input.source || "edge",
    });
    if (error) console.warn("[activity-log] insert failed:", error.message);
  } catch (err) {
    console.warn("[activity-log] threw:", err);
  }
}